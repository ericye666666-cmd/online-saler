import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { ProductBatchStatus, ProductStatus, ReviewResult, prisma } from "@online-saler/database";
import { OperationsProductBatchService } from "./operations-product-batch.service";
import { activeBatchProducts, batchItemsAccountedFor } from "./product-batch-active-items";

const saved = {
  productFindUnique: prisma.product.findUnique,
  productFindMany: prisma.product.findMany,
  productCount: prisma.product.count,
  batchFindUnique: prisma.productBatch.findUnique,
  selection: prisma.productMainImageSelection.findUnique,
  asset: prisma.productImageVariantAsset.findFirst
};

afterEach(() => {
  prisma.product.findUnique = saved.productFindUnique;
  prisma.product.findMany = saved.productFindMany;
  prisma.product.count = saved.productCount;
  prisma.productBatch.findUnique = saved.batchFindUnique;
  prisma.productMainImageSelection.findUnique = saved.selection;
  prisma.productImageVariantAsset.findFirst = saved.asset;
});

const access = { requirePermission: async () => ({ adminUser: { id: "admin-1" } }) };

test("a rejected item still counts towards the batch but takes no further part in it", () => {
  const products = [{ status: ProductStatus.CALIBRATED }, { status: ProductStatus.ARCHIVED }, { status: ProductStatus.CALIBRATED }];
  assert.equal(activeBatchProducts(products).length, 2);
  assert.equal(batchItemsAccountedFor({ targetCount: 3 }, products), true);
  // A missing item still blocks the batch, as before.
  assert.equal(batchItemsAccountedFor({ targetCount: 4 }, products), false);
  // A batch with nothing left going ahead is not "ready" for the next step.
  assert.equal(batchItemsAccountedFor({ targetCount: 1 }, [{ status: ProductStatus.ARCHIVED }]), false);
});

test("rejecting one item on the image review page archives only that item, with a REJECTED review", async () => {
  const transitions: Array<Record<string, unknown>> = [];
  prisma.product.findUnique = (async () => ({
    id: "p-10",
    status: ProductStatus.CALIBRATED,
    batchId: "batch-1",
    batch: { id: "batch-1", batchCode: "BATCH-1790840438119", status: ProductBatchStatus.OPEN }
  })) as never;
  prisma.product.count = (async () => 9) as never;
  const products = { transitionProduct: async (command: Record<string, unknown>) => { transitions.push(command); return {}; } };
  const service = new OperationsProductBatchService(access as never, {} as never, {} as never, products as never, {} as never, {} as never, {} as never);

  await service.rejectAtDisplayReview("p-10", { adminUserId: "admin-1", employeeId: "emp-1", reason: "OpenAI refused the print" });

  assert.equal(transitions.length, 1);
  assert.equal(transitions[0]?.toStatus, ProductStatus.ARCHIVED);
  assert.match(String(transitions[0]?.reason), /BATCH-1790840438119/);
  assert.match(String(transitions[0]?.reason), /OpenAI refused the print/);
  assert.deepEqual(transitions[0]?.review, { result: ReviewResult.REJECTED, reviewerEmployeeId: "emp-1", reason: "OpenAI refused the print" });
});

test("rejecting at image review needs a reason and an item still waiting for that review", async () => {
  const service = new OperationsProductBatchService(access as never, {} as never, {} as never, {
    transitionProduct: async () => { throw new Error("must not transition"); }
  } as never, {} as never, {} as never, {} as never);
  await assert.rejects(service.rejectAtDisplayReview("p", { reason: "  " }), /reason is required/);

  prisma.product.findUnique = (async () => ({
    id: "p", status: ProductStatus.BARCODE_ASSIGNED, batchId: "batch-1",
    batch: { id: "batch-1", batchCode: "B", status: ProductBatchStatus.OPEN }
  })) as never;
  await assert.rejects(service.rejectAtDisplayReview("p", { reason: "x" }), /review decision instead/);

  prisma.product.findUnique = (async () => ({
    id: "p", status: ProductStatus.CALIBRATED, batchId: "batch-1",
    batch: { id: "batch-1", batchCode: "B", status: ProductBatchStatus.CANCELLED }
  })) as never;
  await assert.rejects(service.rejectAtDisplayReview("p", { reason: "x" }), /no longer open/);
});

test("with one item rejected, the rest of the batch gets barcodes and a shelf", async () => {
  prisma.productBatch.findUnique = (async () => ({ id: "batch-1", batchCode: "B", targetCount: 3, status: ProductBatchStatus.OPEN })) as never;
  prisma.product.findMany = (async () => [
    { id: "p-1", productCode: "P-1", status: ProductStatus.CALIBRATED, barcode: null },
    { id: "p-2", productCode: "P-2", status: ProductStatus.ARCHIVED, barcode: null },
    { id: "p-3", productCode: "P-3", status: ProductStatus.CALIBRATED, barcode: null }
  ]) as never;
  prisma.productMainImageSelection.findUnique = (async ({ where }: { where: { productId: string } }) => {
    // The rejected item never got a confirmed display image.
    if (where.productId === "p-2") return null;
    return { productId: where.productId, selectedImageId: `img-${where.productId}`, variant: "AI_DISPLAY_MAIN", confirmedAt: new Date() };
  }) as never;
  prisma.productImageVariantAsset.findFirst = (async () => ({ id: "img", sourceImageId: "front" })) as never;
  prisma.product.findUnique = (async () => ({ category: "TSHIRTS", subcategory: null })) as never;

  const generated: string[] = [];
  const shelved: string[][] = [];
  const service = new OperationsProductBatchService(
    access as never,
    {} as never,
    { generate: async (productId: string) => { generated.push(productId); return { id: productId }; } } as never,
    {} as never,
    { assignBatchLocations: async (ids: string[]) => { shelved.push(ids); return []; } } as never,
    {} as never,
    {} as never
  );

  await service.generateBatchBarcodes("batch-1", { adminUserId: "admin-1", employeeId: "emp-1", locationId: "shelf-1" });

  assert.deepEqual(generated, ["p-1", "p-3"]);
  assert.deepEqual(shelved, [["p-1", "p-3"]]);
});
