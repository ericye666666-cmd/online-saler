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
  transaction: prisma.$transaction
};

afterEach(() => {
  prisma.productBatch.findUnique = originals.batchFindUnique;
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
    assert.equal(summary.pending, 1);
    assert.equal(summary.succeeded, 1);
    assert.equal(summary.failed, 1);
    assert.equal(summary.approved, 1);
    assert.equal(summary.products[1]?.profileId, "profile-2");
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
    assert.equal(profileInputs[0]?.bodyChestMaxCm, 103);
    assert.match(String(profileInputs[0]?.sizeDisclaimer), /Height and weight are reference only/);
    assert.match(String(profileInputs[0]?.sizeDisclaimer), /身高和体重仅供参考/);
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
});

function detailSummaryProduct(index: number, status: ProductDetailStatus) {
  return {
    id: `product-${index}`,
    productCode: `P-${index}`,
    batchItemNumber: index,
    status: ProductStatus.CALIBRATED,
    detailProfiles: [{
      id: `profile-${index}`,
      status,
      sourceDataVersion: 1,
      updatedAt: new Date("2026-08-01T00:00:00Z")
    }]
  };
}
