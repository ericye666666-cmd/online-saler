import assert from "node:assert/strict";
import {
  DEFAULT_MANAGED_PRODUCT_STATUS,
  MANAGED_PRODUCT_STATUS_OPTIONS,
  PRODUCT_STATUS_LABELS,
  imageIssueLabel,
  productStatusLabel
} from "./product-factory-display";

assert.equal(productStatusLabel("DRAFT"), "待上传");
assert.equal(productStatusLabel("CALIBRATION_PENDING"), "待人工校准");
assert.equal(productStatusLabel("AI_PROCESSED"), "AI 识别完成");
assert.equal(productStatusLabel("PUBLISHED"), "上架中");
assert.equal(productStatusLabel("FUTURE_STATE"), "FUTURE_STATE");

// Two statuses sharing one label made the row badge (and any list of statuses) ambiguous.
const labels = Object.values(PRODUCT_STATUS_LABELS);
assert.equal(new Set(labels).size, labels.length, "Two product statuses share the same label.");

// 商品管理 offers only live and taken-down products, live first and by default, and no 全部.
assert.deepEqual(MANAGED_PRODUCT_STATUS_OPTIONS.map(([status]) => status), ["PUBLISHED", "UNPUBLISHED"]);
assert.deepEqual(MANAGED_PRODUCT_STATUS_OPTIONS.map(([, label]) => label), ["上架中", "已下架"]);
assert.equal(DEFAULT_MANAGED_PRODUCT_STATUS, "PUBLISHED");

assert.equal(imageIssueLabel("SUBJECT_TOUCHES_FRAME"), "主体触碰边缘");
assert.equal(imageIssueLabel("BOARD_RESIDUE_SUSPECTED"), "疑似保留测量板");
assert.equal(imageIssueLabel("MULTIPLE_FOREGROUND_COMPONENTS"), "保留了多个非商品区域");

assert.equal(imageIssueLabel("SUBJECT_OFF_CENTER"), "主体丢失或严重偏离");

console.log("Product factory display tests passed");
