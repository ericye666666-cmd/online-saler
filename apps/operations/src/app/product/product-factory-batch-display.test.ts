import assert from "node:assert/strict";
import {
  PRODUCT_FACTORY_STAGE_ORDER,
  batchFollowingStageLabel,
  batchNextActionHref,
  batchProductCalibrationHref,
  resolveCalibrationProductIndex
} from "./product-factory-batch-display";

assert.equal(PRODUCT_FACTORY_STAGE_ORDER.length, 8);
assert.equal(batchNextActionHref("batch/1", "CONTINUE_UPLOAD"), "/product/batches/batch%2F1/upload");
assert.equal(batchNextActionHref("batch/1", "START_AI_IMAGE"), "/product/batches/batch%2F1/processing");
assert.equal(batchNextActionHref("batch-1", "CONTINUE_CALIBRATION"), "/product/calibration?batchId=batch-1");
assert.equal(batchNextActionHref("batch-1", "GENERATE_BARCODES"), "/product/barcode?batchId=batch-1");
assert.equal(batchNextActionHref("batch/1", "REVIEW_PRODUCT_DETAILS"), "/product/details?batchId=batch%2F1");
assert.equal(batchNextActionHref("batch-1", "VIEW_COMPLETED"), "/product/completed");
assert.equal(
  batchProductCalibrationHref("batch/1", "product?1"),
  "/product/calibration?batchId=batch%2F1&productId=product%3F1"
);
const calibrationProducts = [
  { id: "first", pending: false },
  { id: "second", pending: true }
];
assert.equal(resolveCalibrationProductIndex(calibrationProducts, "first", (product) => product.pending), 0);
assert.equal(resolveCalibrationProductIndex(calibrationProducts, "", (product) => product.pending), 1);
assert.equal(batchFollowingStageLabel("AI_IMAGE"), "人工校准");
assert.equal(batchFollowingStageLabel("CALIBRATION"), "生成 Barcode");
assert.equal(batchFollowingStageLabel("PUBLISH"), "完成批次");
