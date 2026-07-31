import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MAX_IMAGE_PROCESSING_RETRIES,
  canRetryImageProcessing,
  isSelectableMainVariant,
  targetVariantForOperation
} from "./product-image-processing.rules";

describe("Product image processing rules", () => {
  it("maps each processing operation to one deterministic output variant", () => {
    assert.equal(targetVariantForOperation("REMOVE_BACKGROUND"), "CUTOUT_TRANSPARENT");
    assert.equal(targetVariantForOperation("COMPOSE_WHITE_BACKGROUND"), "CUTOUT_WHITE");
    assert.equal(targetVariantForOperation("OPTIMIZE_MAIN_IMAGE"), "OPTIMIZED_MAIN");
  });

  it("allows only customer-displayable variants to be selected as main", () => {
    assert.equal(isSelectableMainVariant("ORIGINAL"), true);
    assert.equal(isSelectableMainVariant("CUTOUT_WHITE"), true);
    assert.equal(isSelectableMainVariant("OPTIMIZED_MAIN"), true);
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
});
