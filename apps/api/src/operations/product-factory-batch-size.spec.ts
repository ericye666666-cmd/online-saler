import assert from "node:assert/strict";
import test from "node:test";
import {
  PRODUCTION_PRODUCT_BATCH_SIZE,
  STAGING_PILOT_PRODUCT_BATCH_SIZE,
  isAllowedProductBatchSize,
  stagingPilotBatchEnabled
} from "./product-factory-batch-size";

test("keeps production batches fixed at ten products", () => {
  assert.equal(isAllowedProductBatchSize(PRODUCTION_PRODUCT_BATCH_SIZE, false), true);
  assert.equal(isAllowedProductBatchSize(STAGING_PILOT_PRODUCT_BATCH_SIZE, false), false);
  assert.equal(isAllowedProductBatchSize(5, false), false);
  assert.equal(isAllowedProductBatchSize(10.5, false), false);
});

test("allows a three-product pilot only when the staging flag is enabled", () => {
  assert.equal(isAllowedProductBatchSize(STAGING_PILOT_PRODUCT_BATCH_SIZE, true), true);
  assert.equal(isAllowedProductBatchSize(PRODUCTION_PRODUCT_BATCH_SIZE, true), true);
  assert.equal(isAllowedProductBatchSize(1, true), false);
});

test("requires an explicit staging pilot flag", () => {
  assert.equal(stagingPilotBatchEnabled({ NODE_ENV: "staging", STAGING_PILOT_BATCH_ENABLED: "true" }), true);
  assert.equal(stagingPilotBatchEnabled({ NODE_ENV: "production", STAGING_PILOT_BATCH_ENABLED: "true" }), false);
  assert.equal(stagingPilotBatchEnabled({ NODE_ENV: "staging", STAGING_PILOT_BATCH_ENABLED: "false" }), false);
  assert.equal(stagingPilotBatchEnabled({}), false);
});
