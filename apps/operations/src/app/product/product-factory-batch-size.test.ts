import assert from "node:assert/strict";
import {
  PRODUCTION_PRODUCT_BATCH_SIZE,
  STAGING_PILOT_PRODUCT_BATCH_SIZE,
  productBatchSizeOptions
} from "./product-factory-batch-size";

assert.deepEqual(productBatchSizeOptions(false), [PRODUCTION_PRODUCT_BATCH_SIZE]);
assert.deepEqual(productBatchSizeOptions(true), [
  STAGING_PILOT_PRODUCT_BATCH_SIZE,
  PRODUCTION_PRODUCT_BATCH_SIZE
]);
