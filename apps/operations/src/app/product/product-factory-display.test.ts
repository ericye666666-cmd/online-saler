import assert from "node:assert/strict";
import { imageIssueLabel, productStatusLabel } from "./product-factory-display";

assert.equal(productStatusLabel("DRAFT"), "待上传");
assert.equal(productStatusLabel("CALIBRATION_PENDING"), "待人工校准");
assert.equal(productStatusLabel("PUBLISHED"), "已发布");
assert.equal(productStatusLabel("FUTURE_STATE"), "FUTURE_STATE");
assert.equal(imageIssueLabel("SUBJECT_TOUCHES_FRAME"), "主体触碰边缘");

console.log("Product factory display tests passed");
