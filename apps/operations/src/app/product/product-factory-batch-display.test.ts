import assert from "node:assert/strict";
import {
  PRODUCT_FACTORY_STAGE_ORDER,
  batchNextActionHref
} from "./product-factory-batch-display";

assert.equal(PRODUCT_FACTORY_STAGE_ORDER.length, 8);
assert.equal(batchNextActionHref("batch/1", "CONTINUE_UPLOAD"), "/product/waiting-upload?batchId=batch%2F1");
assert.equal(batchNextActionHref("batch-1", "CONTINUE_CALIBRATION"), "/product/calibration?batchId=batch-1");
assert.equal(batchNextActionHref("batch-1", "VIEW_COMPLETED"), "/product/completed");
