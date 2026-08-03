import assert from "node:assert/strict";
import test from "node:test";
import {
  detailBatchStageLabel,
  detailGenerationButtonLabel,
  detailProductStage,
  PRODUCT_DETAIL_PAGE_PLAN,
  sortDetailBatches
} from "./product-detail-page-plan";

test("keeps the six storefront detail pages in a fixed order", () => {
  assert.deepEqual(
    PRODUCT_DETAIL_PAGE_PLAN.map((page) => page.type),
    ["FRONT_MAIN", "BACK_MAIN", "MEASUREMENT_GUIDE", "FIT_GUIDE", "CONDITION_GUIDE", "SHARE_CARD"]
  );
});

test("blocks detail generation until the complete batch is calibrated", () => {
  assert.equal(
    detailGenerationButtonLabel({ generationReady: false, calibrated: 1, targetCount: 10, pending: 0 }),
    "等待校准（1/10）"
  );
  assert.equal(detailProductStage({ productStatus: "CALIBRATION_PENDING" }, false), "AWAITING_CALIBRATION");
  assert.equal(detailProductStage({ productStatus: "CALIBRATED" }, false), "AWAITING_BATCH");
});

test("reports the exact number of detail drafts to generate", () => {
  assert.equal(
    detailGenerationButtonLabel({ generationReady: true, calibrated: 10, targetCount: 10, pending: 8 }),
    "生成 8 件详情草稿"
  );
});

test("orders active detail batches ahead of completed batches", () => {
  const base = {
    targetCount: 10,
    calibrated: 10,
    generationReady: true,
    pending: 0,
    generating: 0,
    succeeded: 10,
    failed: 0,
    outdated: 0,
    approved: 10
  };
  const ordered = sortDetailBatches([
    { ...base, id: "done", batchCode: "DONE", createdAt: "2026-08-03T10:00:00Z" },
    { ...base, id: "pending", batchCode: "PENDING", createdAt: "2026-08-02T10:00:00Z", pending: 10, succeeded: 0, approved: 0 },
    { ...base, id: "running", batchCode: "RUNNING", createdAt: "2026-08-01T10:00:00Z", generating: 3, succeeded: 0, approved: 0 }
  ]);
  assert.deepEqual(ordered.map((batch) => batch.id), ["running", "pending", "done"]);
});

test("summarizes the selected batch state for employees", () => {
  assert.equal(detailBatchStageLabel({
    id: "batch",
    batchCode: "BATCH-1",
    createdAt: "2026-08-03T10:00:00Z",
    targetCount: 10,
    calibrated: 10,
    generationReady: true,
    pending: 8,
    generating: 0,
    succeeded: 2,
    failed: 0,
    outdated: 0,
    approved: 0
  }), "待生成 8 件");
});
