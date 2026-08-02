import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ImageProcessingJobRecord } from "@online-saler/shared-types";
import { lightweightCutoutWarning } from "./image-processing-quality";

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

  it("allows a passing lightweight cutout and all BiRefNet results", () => {
    assert.equal(lightweightCutoutWarning(job()), null);
    assert.equal(
      lightweightCutoutWarning(job({ provider: "rembg-birefnet", qualityScore: 0.4 })),
      null
    );
  });
});
