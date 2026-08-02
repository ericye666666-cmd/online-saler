import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MAX_IMAGE_PROCESSING_RETRIES,
  canRetryImageProcessing,
  evaluateLightweightImageQuality,
  isSelectableMainVariant,
  sourceVariantForOperation,
  targetVariantForOperation
} from "./product-image-processing.rules";

describe("Product image processing rules", () => {
  it("maps each operation to one deterministic source and output variant", () => {
    assert.equal(sourceVariantForOperation("REMOVE_BACKGROUND"), "ORIGINAL");
    assert.equal(targetVariantForOperation("REMOVE_BACKGROUND"), "CUTOUT_TRANSPARENT");

    assert.equal(sourceVariantForOperation("COMPOSE_WHITE_BACKGROUND"), "CUTOUT_TRANSPARENT");
    assert.equal(targetVariantForOperation("COMPOSE_WHITE_BACKGROUND"), "CUTOUT_WHITE");

    assert.equal(sourceVariantForOperation("OPTIMIZE_MAIN_IMAGE"), "CUTOUT_WHITE");
    assert.equal(targetVariantForOperation("OPTIMIZE_MAIN_IMAGE"), "OPTIMIZED_MAIN");

    assert.equal(sourceVariantForOperation("OPTIMIZE_BALANCED_MAIN_IMAGE"), "CUTOUT_TRANSPARENT");
    assert.equal(targetVariantForOperation("OPTIMIZE_BALANCED_MAIN_IMAGE"), "OPTIMIZED_BALANCED_MAIN");
  });

  it("allows only customer-displayable variants to be selected as main", () => {
    assert.equal(isSelectableMainVariant("ORIGINAL"), true);
    assert.equal(isSelectableMainVariant("CUTOUT_WHITE"), true);
    assert.equal(isSelectableMainVariant("OPTIMIZED_MAIN"), true);
    assert.equal(isSelectableMainVariant("OPTIMIZED_BALANCED_MAIN"), true);
    assert.equal(isSelectableMainVariant("CUTOUT_TRANSPARENT"), false);
  });

  it("allows retry only for failed jobs below the retry limit", () => {
    assert.equal(canRetryImageProcessing("FAILED", 0), true);
    assert.equal(canRetryImageProcessing("FAILED", MAX_IMAGE_PROCESSING_RETRIES - 1), true);
    assert.equal(canRetryImageProcessing("FAILED", MAX_IMAGE_PROCESSING_RETRIES), false);
    assert.equal(canRetryImageProcessing("PENDING", 0), false);
    assert.equal(canRetryImageProcessing("RUNNING", 0), false);
    assert.equal(canRetryImageProcessing("SUCCEEDED", 0), false);
  });

  it("blocks low quality lightweight output from storefront selection", () => {
    assert.deepEqual(evaluateLightweightImageQuality({ qualityScore: 0.54, qualityIssues: [] }), {
      pass: false,
      reason: "QUALITY_SCORE_BELOW_THRESHOLD:0.54<0.75"
    });
    assert.deepEqual(
      evaluateLightweightImageQuality({ qualityScore: 0.9, qualityIssues: ["SUBJECT_TOUCHES_EDGE"] }),
      { pass: false, reason: "QUALITY_ISSUE:SUBJECT_TOUCHES_EDGE" }
    );
  });

  it("allows a lightweight output that passes the storefront threshold", () => {
    assert.deepEqual(evaluateLightweightImageQuality({ qualityScore: 0.9, qualityIssues: [] }), {
      pass: true,
      reason: null
    });
  });
});
