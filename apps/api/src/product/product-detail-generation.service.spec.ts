import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  ProductDetailStatus,
  ProductFabricWeight,
  ProductFitType,
  ProductStatus,
  ProductStretchLevel,
  prisma
} from "@online-saler/database";
import {
  isBatchReadyForDetailGeneration,
  ProductDetailGenerationService,
  summarizeDetailBatch
} from "./product-detail-generation.service";

const originals = {
  batchFindUnique: prisma.productBatch.findUnique,
  profileFindUnique: prisma.productDetailProfile.findUnique,
  profileUpdate: prisma.productDetailProfile.update,
  transaction: prisma.$transaction
};

afterEach(() => {
  prisma.productBatch.findUnique = originals.batchFindUnique;
  prisma.productDetailProfile.findUnique = originals.profileFindUnique;
  prisma.productDetailProfile.update = originals.profileUpdate;
  prisma.$transaction = originals.transaction;
});

describe("ProductDetailGenerationService", () => {
  it("summarizes the latest detail state for a calibrated batch", () => {
    const summary = summarizeDetailBatch({
      id: "batch-1",
      batchCode: "BATCH-1",
      targetCount: 4,
      createdAt: new Date("2026-08-01T00:00:00Z"),
      products: [
        detailSummaryProduct(1, ProductDetailStatus.PENDING),
        detailSummaryProduct(2, ProductDetailStatus.READY),
        detailSummaryProduct(3, ProductDetailStatus.FAILED),
        detailSummaryProduct(4, ProductDetailStatus.APPROVED)
      ]
    });

    assert.equal(summary.calibrated, 4);
    assert.equal(summary.generationReady, true);
    assert.equal(summary.awaitingCalibration, 0);
    assert.equal(summary.pending, 1);
    assert.equal(summary.succeeded, 1);
    assert.equal(summary.failed, 1);
    assert.equal(summary.approved, 1);
    assert.equal(summary.products[1]?.profileId, "profile-2");
  });

  it("does not report uncalibrated products as pending detail generation", () => {
    const summary = summarizeDetailBatch({
      id: "batch-partial",
      batchCode: "BATCH-PARTIAL",
      targetCount: 10,
      createdAt: new Date("2026-08-02T00:00:00Z"),
      products: Array.from({ length: 10 }, (_, index) => detailSummaryProduct(
        index + 1,
        null,
        index === 0 ? ProductStatus.CALIBRATED : ProductStatus.CALIBRATION_PENDING
      ))
    });

    assert.equal(summary.calibrated, 1);
    assert.equal(summary.generationReady, false);
    assert.equal(summary.awaitingCalibration, 9);
    assert.equal(summary.pending, 0);
  });

  it("requires every item in the complete batch to be calibrated", () => {
    assert.equal(
      isBatchReadyForDetailGeneration(
        Array.from({ length: 10 }, () => ({ status: ProductStatus.CALIBRATED })),
        10
      ),
      true
    );
    assert.equal(
      isBatchReadyForDetailGeneration(
        [
          ...Array.from({ length: 9 }, () => ({ status: ProductStatus.CALIBRATED })),
          { status: ProductStatus.CALIBRATION_PENDING }
        ],
        10
      ),
      false
    );
  });

  it("creates one versioned profile and job for every calibrated batch item", async () => {
    const products = Array.from({ length: 10 }, (_, index) => ({
      id: `product-${index + 1}`,
      status: ProductStatus.CALIBRATED,
      detailSourceVersion: index + 1,
      category: "TSHIRTS",
      subcategory: "TSHIRT",
      gender: "UNISEX",
      finalSizeLabel: "L",
      fitType: ProductFitType.REGULAR,
      stretchLevel: ProductStretchLevel.LOW,
      fabricWeight: ProductFabricWeight.REGULAR,
      measurements: [
        { measurementType: "CHEST_WIDTH", finalValueCm: 55 },
        { measurementType: "LENGTH", finalValueCm: 72 },
        { measurementType: "SLEEVE_LENGTH", finalValueCm: 62 }
      ]
    }));
    prisma.productBatch.findUnique = (async () => ({
      id: "batch-1",
      targetCount: 10,
      products
    })) as never;

    const profileInputs: Array<Record<string, unknown>> = [];
    const jobInputs: Array<Record<string, unknown>> = [];
    prisma.$transaction = (async (callback: (transaction: unknown) => Promise<unknown>) =>
      callback({
        productDetailProfile: {
          upsert: async ({ create }: { create: Record<string, unknown> }) => {
            profileInputs.push(create);
            return { id: `profile-${profileInputs.length}`, ...create };
          }
        },
        productDetailGenerationJob: {
          upsert: async ({ create }: { create: Record<string, unknown> }) => {
            jobInputs.push(create);
            return { id: `job-${jobInputs.length}`, ...create };
          }
        }
      })) as never;

    const result = await new ProductDetailGenerationService().ensureBatchGenerationJobs("batch-1");

    assert.equal(result.ready, true);
    assert.equal(result.jobs.length, 10);
    assert.equal(profileInputs.length, 10);
    assert.equal(jobInputs.length, 10);
    assert.equal(profileInputs[0]?.sourceDataVersion, 1);
    assert.equal(profileInputs[0]?.bodyChestMaxCm, undefined);
    assert.equal(profileInputs[0]?.sizeDisclaimer, undefined);
    assert.equal(jobInputs[9]?.sourceDataVersion, 10);
    assert.ok(jobInputs.every((input) => input.status === ProductDetailStatus.PENDING));
  });

  it("increments the source version and marks every existing detail output outdated", async () => {
    const updates: Array<{ target: string; data: Record<string, unknown> }> = [];
    prisma.$transaction = (async (callback: (transaction: unknown) => Promise<unknown>) =>
      callback({
        product: {
          update: async ({ data }: { data: Record<string, unknown> }) => {
            updates.push({ target: "product", data });
            return { id: "product-1", detailSourceVersion: 3 };
          }
        },
        productDetailProfile: {
          updateMany: async ({ data }: { data: Record<string, unknown> }) => {
            updates.push({ target: "profile", data });
            return { count: 1 };
          }
        },
        productDetailAsset: {
          updateMany: async ({ data }: { data: Record<string, unknown> }) => {
            updates.push({ target: "asset", data });
            return { count: 4 };
          }
        },
        productDetailGenerationJob: {
          updateMany: async ({ data }: { data: Record<string, unknown> }) => {
            updates.push({ target: "job", data });
            return { count: 1 };
          }
        }
      })) as never;

    const result = await new ProductDetailGenerationService().recordSourceChange("product-1", "BACK_IMAGE_CHANGED");

    assert.equal(result.detailSourceVersion, 3);
    assert.deepEqual((updates.find((item) => item.target === "product")?.data.detailSourceVersion), { increment: 1 });
    for (const target of ["profile", "asset", "job"]) {
      const update = updates.find((item) => item.target === target);
      assert.equal(update?.data.status, ProductDetailStatus.OUTDATED);
      assert.equal(update?.data.outdatedReason, "BACK_IMAGE_CHANGED");
      assert.ok(update?.data.outdatedAt instanceof Date);
    }
  });

  it("publishes the approved detail description to the product record", async () => {
    prisma.productDetailProfile.findUnique = (async () => ({
      id: "profile-1",
      productId: "product-1",
      status: ProductDetailStatus.READY,
      sourceDataVersion: 2,
      customerDescription: "  Approved storefront description.  ",
      product: { id: "product-1", detailSourceVersion: 2, measurements: [] },
      assets: []
    })) as never;

    const updates: Array<{ target: string; data: Record<string, unknown> }> = [];
    prisma.$transaction = (async (callback: (transaction: unknown) => Promise<unknown>) =>
      callback({
        productDetailProfile: {
          update: async ({ data }: { data: Record<string, unknown> }) => {
            updates.push({ target: "profile", data });
            return { id: "profile-1", ...data };
          }
        },
        product: {
          update: async ({ data }: { data: Record<string, unknown> }) => {
            updates.push({ target: "product", data });
            return { id: "product-1", ...data };
          }
        }
      })) as never;

    await new ProductDetailGenerationService().approveProfile("profile-1", "employee-1");

    assert.equal(updates.find((item) => item.target === "profile")?.data.status, ProductDetailStatus.APPROVED);
    assert.equal(updates.find((item) => item.target === "product")?.data.description, "Approved storefront description.");
  });

  it("approves an incomplete detail without a description or selected main image", async () => {
    prisma.productDetailProfile.findUnique = (async () => ({
      id: "profile-1",
      productId: "product-1",
      status: ProductDetailStatus.READY,
      sourceDataVersion: 2,
      customerDescription: null,
      product: { id: "product-1", detailSourceVersion: 2, measurements: [] },
      assets: []
    })) as never;
    const updates: string[] = [];
    prisma.$transaction = (async (callback: (transaction: unknown) => Promise<unknown>) =>
      callback({
        productDetailProfile: {
          update: async () => {
            updates.push("profile");
            return { id: "profile-1", status: ProductDetailStatus.APPROVED };
          }
        },
        product: {
          update: async () => {
            updates.push("product");
            return { id: "product-1" };
          }
        }
      })) as never;

    await new ProductDetailGenerationService().approveProfile("profile-1", "employee-1");

    assert.deepEqual(updates, ["profile"]);
  });

  it("unapproves the current detail before changing its storefront main image", async () => {
    prisma.productDetailProfile.findUnique = (async () => ({
      id: "profile-1",
      productId: "product-1",
      status: ProductDetailStatus.APPROVED,
      sourceDataVersion: 2,
      product: { id: "product-1", detailSourceVersion: 2, measurements: [] },
      assets: []
    })) as never;
    let updateData: Record<string, unknown> | undefined;
    prisma.productDetailProfile.update = (async ({ data }: { data: Record<string, unknown> }) => {
      updateData = data;
      return { id: "profile-1", productId: "product-1" };
    }) as never;

    const result = await new ProductDetailGenerationService().prepareMainImageChange("profile-1");

    assert.deepEqual(result, { id: "profile-1", productId: "product-1" });
    assert.equal(updateData?.status, ProductDetailStatus.READY);
    assert.deepEqual(updateData?.contentVersion, { increment: 1 });
    assert.equal(updateData?.approvedAt, null);
    assert.equal(updateData?.approvedByEmployeeId, null);
  });

  it("publishes every approved batch description to its product", async () => {
    prisma.productBatch.findUnique = (async () => ({
      id: "batch-1",
      batchCode: "BATCH-1",
      targetCount: 2,
      createdAt: new Date("2026-08-02T00:00:00Z"),
      products: [1, 2].map((index) => ({
        id: `product-${index}`,
        productCode: `P-${index}`,
        batchItemNumber: index,
        status: ProductStatus.CALIBRATED,
        detailSourceVersion: 1,
        detailProfiles: [{
          id: `profile-${index}`,
          productId: `product-${index}`,
          status: ProductDetailStatus.READY,
          sourceDataVersion: 1,
          updatedAt: new Date("2026-08-02T00:00:00Z"),
          customerDescription: ` Description ${index}. `,
          assets: []
        }]
      }))
    })) as never;

    const productDescriptions: string[] = [];
    prisma.$transaction = (async (callback: (transaction: unknown) => Promise<unknown>) =>
      callback({
        productDetailProfile: { updateMany: async () => ({ count: 2 }) },
        product: {
          update: async ({ data }: { data: { description: string } }) => {
            productDescriptions.push(data.description);
            return data;
          }
        }
      })) as never;

    await new ProductDetailGenerationService().approveBatch("batch-1", "employee-1");

    assert.deepEqual(productDescriptions, ["Description 1.", "Description 2."]);
  });
});

function detailSummaryProduct(
  index: number,
  detailStatus: ProductDetailStatus | null,
  productStatus: ProductStatus = ProductStatus.CALIBRATED
) {
  return {
    id: `product-${index}`,
    productCode: `P-${index}`,
    batchItemNumber: index,
    status: productStatus,
    title: `Product ${index}`,
    category: "TOPS",
    finalSizeLabel: "M",
    images: [{ id: `front-${index}`, publicUrl: null }],
    detailProfiles: detailStatus ? [{
      id: `profile-${index}`,
      status: detailStatus,
      sourceDataVersion: 1,
      updatedAt: new Date("2026-08-01T00:00:00Z"),
      assets: []
    }] : []
  };
}
