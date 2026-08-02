import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ImageProcessingJobRecord } from "@online-saler/shared-types";
import { cutoutQualityWarning, lightweightCutoutWarning } from "./image-processing-quality";

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
});
