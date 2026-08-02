import assert from "node:assert/strict";
import test from "node:test";
import {
  detailGenerationButtonLabel,
  detailProductStage,
  PRODUCT_DETAIL_PAGE_PLAN
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
