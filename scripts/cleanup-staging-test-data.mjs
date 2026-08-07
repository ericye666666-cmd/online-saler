import { PrismaClient } from "@prisma/client";
import {
  cleanupMode,
  parseBatchCodes,
  productCleanupWhere,
  storageObjectsFromUrls,
  summarizeProducts,
  unauthorizedBatchedProducts
} from "./staging-test-data-cleanup-lib.mjs";

const prisma = new PrismaClient();
const batchCodes = parseBatchCodes(process.env.STAGING_TEST_BATCH_CODES);
const mode = cleanupMode({
  nodeEnv: process.env.NODE_ENV,
  confirmation: process.env.STAGING_TEST_DATA_CONFIRMATION
});
const expectedBucket = process.env.PRODUCT_IMAGE_BUCKET?.trim();
const where = productCleanupWhere(batchCodes);

async function metadataAccessToken() {
  const response = await fetch(
    "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token",
    { headers: { "Metadata-Flavor": "Google" } }
  );

  if (!response.ok) {
    throw new Error(`Could not obtain Google Cloud access token: ${response.status}`);
  }

  const payload = await response.json();
  if (!payload.access_token) throw new Error("Google Cloud metadata response did not include an access token.");
  return payload.access_token;
}

async function deleteStorageObjects(objects) {
  if (objects.length === 0) return;

  const token = await metadataAccessToken();
  for (const value of objects) {
    const separator = value.indexOf("/");
    const bucket = value.slice(0, separator);
    const objectName = value.slice(separator + 1);
    const response = await fetch(
      `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(objectName)}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }
    );

    if (!response.ok && response.status !== 404) {
      const body = await response.text();
      throw new Error(`Could not delete gs://${value}: ${response.status} ${body}`);
    }
  }
}

async function inventory() {
  const products = await prisma.product.findMany({
    where,
    select: {
      id: true,
      productCode: true,
      status: true,
      batch: { select: { id: true, batchCode: true } },
      images: { select: { originalUrl: true, publicUrl: true } },
      detailAssets: { select: { storageUrl: true, publicUrl: true } }
    },
    orderBy: { createdAt: "asc" }
  });

  const unsafeBatchedProducts = unauthorizedBatchedProducts(products, batchCodes);
  if (unsafeBatchedProducts.length > 0) {
    throw new Error(
      `Refusing to delete prefix-matched products in non-allowlisted batches: ${unsafeBatchedProducts
        .map((product) => `${product.productCode}:${product.batch.batchCode}`)
        .join(", ")}`
    );
  }

  const productIds = products.map((product) => product.id);
  const [batches, orderItems, variantAssets, processingJobs, mainImageSelections] = await Promise.all([
    batchCodes.length === 0
      ? []
      : prisma.productBatch.findMany({
          where: { batchCode: { in: batchCodes } },
          select: { id: true, batchCode: true, status: true }
        }),
    productIds.length === 0
      ? []
      : prisma.orderItem.findMany({
          where: { productId: { in: productIds } },
          select: { id: true, orderId: true, productId: true },
          take: 20
        }),
    productIds.length === 0
      ? []
      : prisma.productImageVariantAsset.findMany({
          where: { productId: { in: productIds } },
          select: { storageUrl: true, publicUrl: true }
        }),
    productIds.length === 0
      ? 0
      : prisma.productImageProcessingJob.count({ where: { productId: { in: productIds } } }),
    productIds.length === 0
      ? 0
      : prisma.productMainImageSelection.count({ where: { productId: { in: productIds } } })
  ]);

  const storageUrls = [
    ...products.flatMap((product) =>
      product.images.flatMap((image) => [image.originalUrl, image.publicUrl])
    ),
    ...products.flatMap((product) =>
      product.detailAssets.flatMap((asset) => [asset.storageUrl, asset.publicUrl])
    ),
    ...variantAssets.flatMap((asset) => [asset.storageUrl, asset.publicUrl])
  ];
  const storageObjects = storageObjectsFromUrls(storageUrls, expectedBucket);

  return {
    products,
    productIds,
    batches,
    orderItems,
    storageObjects,
    counts: {
      ...summarizeProducts(products),
      batches: batches.length,
      storageObjects: storageObjects.length,
      variantAssets: variantAssets.length,
      processingJobs,
      mainImageSelections
    }
  };
}

async function main() {
  const state = await inventory();
  const report = {
    mode,
    batchCodes,
    counts: state.counts,
    sampleProductCodes: state.products.slice(0, 20).map((product) => product.productCode),
    batchSummaries: state.batches
  };

  console.log(JSON.stringify(report, null, 2));

  if (state.orderItems.length > 0) {
    throw new Error(
      `Refusing to delete products linked to orders: ${state.orderItems
        .map((item) => `${item.productId}:${item.orderId}`)
        .join(", ")}`
    );
  }

  if (mode === "dry-run") {
    console.log("Dry run complete. No database rows or storage objects were deleted.");
    return;
  }

  if (state.storageObjects.length > 0 && !expectedBucket) {
    throw new Error("PRODUCT_IMAGE_BUCKET is required before deleting storage objects.");
  }

  await deleteStorageObjects(state.storageObjects);

  if (state.productIds.length > 0 || batchCodes.length > 0) {
    await prisma.$transaction(async (transaction) => {
      if (state.productIds.length > 0) {
        const ids = { in: state.productIds };
        await transaction.auditLog.deleteMany({
          where: { entityType: "Product", entityId: ids }
        });
        await transaction.affiliateClick.deleteMany({ where: { productId: ids } });
        await transaction.affiliateLink.deleteMany({ where: { productId: ids } });
        await transaction.productMainImageSelection.deleteMany({ where: { productId: ids } });
        await transaction.productImageProcessingJob.deleteMany({ where: { productId: ids } });
        await transaction.productImageVariantAsset.deleteMany({ where: { productId: ids } });
        await transaction.product.deleteMany({ where: { id: ids } });
      }

      if (batchCodes.length > 0) {
        await transaction.productBatch.deleteMany({
          where: { batchCode: { in: batchCodes }, products: { none: {} } }
        });
      }
    });
  }

  const [remainingProducts, remainingBatches] = await Promise.all([
    prisma.product.count({ where }),
    batchCodes.length === 0
      ? 0
      : prisma.productBatch.count({ where: { batchCode: { in: batchCodes } } })
  ]);

  if (remainingProducts !== 0 || remainingBatches !== 0) {
    throw new Error(
      `Cleanup verification failed: ${remainingProducts} products and ${remainingBatches} batches remain.`
    );
  }

  console.log(
    JSON.stringify(
      {
        deletedProducts: state.productIds.length,
        deletedBatches: state.batches.length,
        deletedStorageObjects: state.storageObjects.length,
        verified: true
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
