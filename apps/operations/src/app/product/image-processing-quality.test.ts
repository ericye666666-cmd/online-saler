import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ImageProcessingJobRecord, ProductImageComparisonResponse, ProductImageVariantRecord } from "@online-saler/shared-types";
import { cutoutQualityWarning, lightweightCutoutWarning, persistedFrontCutoutWarning } from "./image-processing-quality";

function job(overrides: Partial<ImageProcessingJobRecord> = {}): ImageProcessingJobRecord {
  return {
    id: "job-1",
    productId: "product-1",
    sourceImageId: "original-1",
    operation: "REMOVE_BACKGROUND",
    targetVariant: "CUTOUT_TRANSPARENT",
    status: "SUCCEEDED",
    provider: "lightweight-opencv",
    processorVersion: "test",
    qualityScore: 0.9,
    qualityIssues: [],
    fallbackFrom: null,
    fallbackReason: null,
    outputImageId: "cutout-1",
    retryCount: 0,
    failureCode: null,
    errorMessage: null,
    startedAt: null,
    completedAt: null,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    ...overrides
  };
}

function variant(imageId: string, sourceImageId: string | null = null): ProductImageVariantRecord {
  return {
    imageId,
    productId: "product-1",
    sourceImageId,
    variant: sourceImageId ? "CUTOUT_TRANSPARENT" : "ORIGINAL",
    originalUrl: `/images/${imageId}`,
    publicUrl: `/images/${imageId}`,
    widthPx: 100,
    heightPx: 100,
    mimeType: "image/jpeg",
    selectedAsMain: false,
    createdAt: new Date(0).toISOString()
  };
}

function comparison(jobs: ImageProcessingJobRecord[]): ProductImageComparisonResponse {
  return {
    productId: "product-1",
    original: variant("original-1"),
    cutoutTransparent: variant("cutout-1", "original-1"),
    cutoutWhite: null,
    optimizedMain: null,
    optimizedBalancedMain: null,
    aiDisplayMain: null,
    backOriginal: null,
    backCutoutTransparent: null,
    backCutoutWhite: null,
    selectedMainImageId: null,
    selectedMainImageConfirmedAt: null,
    jobs
  };
}

describe("lightweight cutout storefront quality", () => {
  it("blocks a low quality lightweight cutout", () => {
    assert.match(lightweightCutoutWarning(job({ qualityScore: 0.54 })) ?? "", /54.*BiRefNet/);
  });

  it("blocks a lightweight cutout with a known edge issue", () => {
    assert.match(
      lightweightCutoutWarning(job({ qualityIssues: ["SUBJECT_TOUCHES_EDGE"] })) ?? "",
      /SUBJECT_TOUCHES_EDGE.*BiRefNet/
    );
  });

  it("blocks a high-scoring automatic result that still contains measurement-board residue", () => {
    assert.match(
      cutoutQualityWarning(job({ provider: "rembg-birefnet", qualityScore: 0.97, qualityIssues: ["BOARD_RESIDUE_SUSPECTED"] })) ?? "",
      /BOARD_RESIDUE_SUSPECTED.*手工修边/
    );
  });

  it("allows a passing lightweight cutout", () => {
    assert.equal(lightweightCutoutWarning(job()), null);
  });

  it("blocks a low quality BiRefNet result and directs staff to manual correction", () => {
    assert.match(
      cutoutQualityWarning(job({ provider: "rembg-birefnet", qualityScore: 0.47, qualityIssues: ["SUBJECT_TOUCHES_EDGE"] })) ?? "",
      /手工修边.*重拍/
    );
  });

  it("accepts a manually corrected cutout", () => {
    assert.equal(cutoutQualityWarning(job({ provider: "manual-cutout-editor", qualityScore: 0.4 })), null);
  });

  it("keeps a persisted low-quality front cutout blocked after reload", () => {
    assert.match(
      persistedFrontCutoutWarning(comparison([job({ provider: "rembg-birefnet", qualityScore: 0.49 })])) ?? "",
      /49.*手工修边/
    );
  });

  it("does not apply a removal job from another source image", () => {
    assert.equal(
      persistedFrontCutoutWarning(comparison([job({ sourceImageId: "old-original", qualityScore: 0.49 })])),
      null
    );
  });
});
