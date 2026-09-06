import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { ProductStatus, prisma } from "@online-saler/database";
import sharp from "sharp";
import {
  analyzeManualCutout,
  ProductImageProcessingService,
  validateGuidedCutoutPoints
} from "./product-image-processing.service";

async function pngWithMask(width: number, height: number, left: number, top: number, right: number, bottom: number) {
  const pixels = Buffer.alloc(width * height * 4);
  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      const offset = (y * width + x) * 4;
      pixels[offset] = 120;
      pixels[offset + 1] = 120;
      pixels[offset + 2] = 120;
      pixels[offset + 3] = 255;
    }
  }
  return sharp(pixels, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

describe("manual cutout quality", () => {
  it("accepts a centered transparent garment mask", async () => {
    const result = await analyzeManualCutout(await pngWithMask(100, 100, 20, 15, 80, 85));
    assert.deepEqual(result.qualityIssues, []);
    assert.ok(result.qualityScore >= 0.75);
    assert.equal(result.widthPx, 100);
    assert.equal(result.heightPx, 100);
  });

  it("detects a retained board frame touching the image edges", async () => {
    const result = await analyzeManualCutout(await pngWithMask(100, 100, 0, 0, 100, 100));
    assert.ok(result.qualityIssues.includes("SUBJECT_TOO_LARGE"));
    assert.ok(result.qualityIssues.includes("SUBJECT_TOUCHES_EDGE"));
    assert.ok(result.qualityScore < 0.75);
  });
});

describe("guided cutout outline", () => {
  it("accepts a normalized garment polygon", () => {
    const points = validateGuidedCutoutPoints([
      { x: 0.35, y: 0.15 },
      { x: 0.65, y: 0.15 },
      { x: 0.85, y: 0.35 },
      { x: 0.7, y: 0.85 },
      { x: 0.3, y: 0.85 },
      { x: 0.15, y: 0.35 }
    ]);
    assert.equal(points.length, 6);
  });

  it("rejects missing, out-of-range and tiny outlines", () => {
    assert.throws(() => validateGuidedCutoutPoints([]), /between 6 and 60/);
    assert.throws(
      () => validateGuidedCutoutPoints(Array.from({ length: 6 }, (_, index) => ({ x: index === 5 ? 2 : 0.5, y: 0.5 }))),
      /between 0 and 1/
    );
    assert.throws(
      () => validateGuidedCutoutPoints(Array.from({ length: 6 }, (_, index) => ({ x: 0.4 + index * 0.001, y: 0.4 + index * 0.001 }))),
      /too small or crosses itself/
    );
  });
});

describe("published product main-image protection", () => {
  const originals = {
    productFind: prisma.product.findUnique,
    imageFind: prisma.productImage.findFirst,
    assetFind: prisma.productImageVariantAsset.findFirst,
    jobFind: prisma.productImageProcessingJob.findUnique,
    previousJob: prisma.productImageProcessingJob.findFirst,
    transaction: prisma.$transaction
  };
  const now = new Date("2026-09-06T12:00:00Z");
  let status: ProductStatus;
  let selection: { selectedImageId: string; variant: string; confirmedAt: Date | null };
  let writes: string[];
  let service: ProductImageProcessingService;
  let rowLocked: boolean;
  let category: string;
  let displaySourceImageId: string;
  let latestFrontImageId: string;

  beforeEach(() => {
    category = "TSHIRTS";
    displaySourceImageId = "front-1";
    latestFrontImageId = "front-1";
    prisma.product.findUnique = (async () => ({ category })) as never;
    status = ProductStatus.PUBLISHED;
    selection = { selectedImageId: "ai-live", variant: "AI_DISPLAY_MAIN", confirmedAt: now };
    writes = [];
    rowLocked = false;
    prisma.productImage.findFirst = (async ({ where }: { where: { id: string } }) => where.id === "front-1" ? { id: "front-1" } : null) as never;
    prisma.productImageVariantAsset.findFirst = (async ({ where }: { where: { id: string } }) => where.id.startsWith("ai-")
      ? { id: where.id, variant: "AI_DISPLAY_MAIN", sourceImageId: displaySourceImageId }
      : where.id === "old-white-cutout" ? { id: where.id, variant: "CUTOUT_WHITE", sourceImageId: "front-1" } : null) as never;
    prisma.productImageProcessingJob.findUnique = (async () => null) as never;
    prisma.productImageProcessingJob.findFirst = (async () => null) as never;
    prisma.$transaction = (async (callback: (client: unknown) => Promise<unknown>) => callback({
      $queryRaw: async () => { rowLocked = true; return []; },
      product: { findUnique: async () => { assert.equal(rowLocked, true); return { status, category, subcategory: category === "KIDS" ? "KIDS_SHOES" : null }; } },
      productImage: {
        findFirst: async ({ where, orderBy }: { where: Record<string, unknown>; orderBy: Record<string, unknown> }) => {
          assert.equal(rowLocked, true);
          assert.deepEqual(where, { productId: "product-1", type: "FRONT" });
          assert.deepEqual(orderBy, { createdAt: "desc" });
          return { id: latestFrontImageId };
        }
      },
      productMainImageSelection: {
        findUnique: async () => selection,
        upsert: async ({ update }: { update: typeof selection }) => { selection = update; writes.push("selection"); },
        delete: async () => { writes.push("delete-selection"); }
      },
      productImageVariantAsset: {
        findFirst: async (args: never) => { assert.equal(rowLocked, true); return prisma.productImageVariantAsset.findFirst(args); },
        create: async ({ data }: { data: { id: string } }) => { writes.push("candidate-asset"); return data; }
      },
      productImageProcessingJob: { create: async ({ data }: { data: Record<string, unknown> }) => ({
        ...data, id: "job-1", createdAt: now, updatedAt: now, retryCount: 0
      }) }
    })) as never;
    service = new ProductImageProcessingService({
      recordSourceChange: async () => { writes.push("source-change"); }
    } as never, {
      validate: () => {}, derivedObjectName: () => "candidate.png", upload: async () => {}, bucket: "test-bucket"
    } as never, {} as never);
    service.getComparison = (async () => ({ selectedMainImageId: selection.selectedImageId,
      selectedMainImageConfirmedAt: selection.confirmedAt?.toISOString() ?? null,
      aiDisplayMain: { imageId: "ai-new", selectedAsMain: selection.selectedImageId === "ai-new" }
    })) as never;
  });

  afterEach(() => {
    prisma.product.findUnique = originals.productFind;
    prisma.productImage.findFirst = originals.imageFind;
    prisma.productImageVariantAsset.findFirst = originals.assetFind;
    prisma.productImageProcessingJob.findUnique = originals.jobFind;
    prisma.productImageProcessingJob.findFirst = originals.previousJob;
    prisma.$transaction = originals.transaction;
  });

  it("blocks changing a live main image or withdrawing its human confirmation", async () => {
    await assert.rejects(service.selectMainImage({ productId: "product-1", imageId: "ai-new" }), /Unpublish the product/);
    await assert.rejects(service.selectMainImage({ productId: "product-1", imageId: "front-1" }), /Unpublish the product/);
    await assert.rejects(service.selectMainImage({ productId: "product-1", imageId: "ai-live" }, { humanConfirmed: false }), /Unpublish the product/);
    assert.deepEqual(writes, []);
    assert.equal(selection.selectedImageId, "ai-live");
    assert.equal(selection.confirmedAt, now);
  });

  it("returns a repeated confirmation without rewriting the live selection", async () => {
    await service.selectMainImage({ productId: "product-1", imageId: "ai-live" });
    assert.deepEqual(writes, []);
    assert.equal(selection.confirmedAt, now);
  });

  it("leaves generated candidates unselected while preserving the published confirmed image", async () => {
    const result = await service.selectMainImage({ productId: "product-1", imageId: "ai-new" }, {
      humanConfirmed: false, recordDetailSourceChange: false, preservePublishedSelection: true
    });
    assert.equal(result.selectedMainImageId, "ai-live");
    assert.equal(result.aiDisplayMain?.selectedAsMain, false);
    assert.deepEqual(writes, []);
  });

  it("rechecks product status after image preparation when publication wins the race", async () => {
    status = ProductStatus.UNPUBLISHED;
    prisma.productImageVariantAsset.findFirst = (async ({ where }: { where: { id: string } }) => {
      status = ProductStatus.PUBLISHED;
      return where.id.startsWith("ai-") ? { id: where.id, variant: "AI_DISPLAY_MAIN", sourceImageId: "front-1" } : null;
    }) as never;
    await assert.rejects(service.selectMainImage({ productId: "product-1", imageId: "ai-new" }), /Unpublish the product/);
    assert.equal(rowLocked, true);
    assert.deepEqual(writes, []);
  });

  it("still auto-selects an unconfirmed candidate after the product has been unpublished", async () => {
    status = ProductStatus.UNPUBLISHED;
    await service.selectMainImage({ productId: "product-1", imageId: "ai-new" }, {
      humanConfirmed: false, recordDetailSourceChange: false, preservePublishedSelection: true
    });
    assert.equal(selection.selectedImageId, "ai-new");
    assert.equal(selection.confirmedAt, null);
    assert.deepEqual(writes, ["selection"]);
  });

  it("saving a corrected cutout for a published product cannot delete the live main selection", async () => {
    await service.saveManualCutout({
      productId: "product-1", sourceImageId: "front-1", body: await pngWithMask(100, 100, 20, 15, 80, 85)
    });
    assert.deepEqual(writes, ["candidate-asset"]);
    assert.equal(selection.selectedImageId, "ai-live");
    assert.equal(selection.confirmedAt, now);
  });

  it("rejects a legacy garment cutout display for shoes without changing the selection", async () => {
    category = "SHOES";
    status = ProductStatus.CALIBRATED;
    displaySourceImageId = "old-white-cutout";
    await assert.rejects(service.selectMainImage({ productId: "product-1", imageId: "ai-new" }), /latest original FRONT pair photo/);
    assert.deepEqual(writes, []);
    assert.equal(selection.selectedImageId, "ai-live");
  });

  it("rejects a replaced pair original and accepts the current pair display for legacy kids shoes", async () => {
    category = "KIDS";
    status = ProductStatus.CALIBRATED;
    latestFrontImageId = "front-replacement";
    await assert.rejects(service.selectMainImage({ productId: "product-1", imageId: "ai-new" }), /latest original FRONT pair photo/);
    await assert.rejects(service.selectMainImage({ productId: "product-1", imageId: "front-1" }), /latest original FRONT pair photo/);
    assert.deepEqual(writes, []);
    latestFrontImageId = "front-1";
    await service.selectMainImage({ productId: "product-1", imageId: "ai-new" });
    assert.deepEqual(writes, ["selection", "source-change"]);
    assert.equal(selection.selectedImageId, "ai-new");
    assert.ok(selection.confirmedAt);
  });
});


describe("shoe image source validation", () => {
  const productFind = prisma.product.findUnique;
  const imageFind = prisma.productImage.findFirst;
  afterEach(() => { prisma.product.findUnique = productFind; prisma.productImage.findFirst = imageFind; });
  it("accepts only original FRONT for shoe display and rejects garment cutout operations", async () => {
    prisma.product.findUnique = (async () => ({ category: "SHOES" })) as never;
    prisma.productImage.findFirst = (async ({ where }: { where: { id: string; type: string } }) =>
      where.id === "pair-original" && where.type === "FRONT" ? { id: where.id } : null) as never;
    const service = new ProductImageProcessingService({} as never, {} as never, {} as never);
    const validate = (service as unknown as { requireOperationSource: (productId: string, imageId: string, operation: string) => Promise<void> }).requireOperationSource.bind(service);
    await validate("shoe", "pair-original", "GENERATE_AI_DISPLAY_MAIN_IMAGE");
    await assert.rejects(validate("shoe", "old-cutout", "GENERATE_AI_DISPLAY_MAIN_IMAGE"), /original FRONT pair photo/);
    await assert.rejects(validate("shoe", "pair-original", "REMOVE_BACKGROUND"), /garment cutout and balancing/);
    await assert.rejects(validate("shoe", "pair-original", "OPTIMIZE_BALANCED_MAIN_IMAGE"), /garment cutout and balancing/);
  });
});
