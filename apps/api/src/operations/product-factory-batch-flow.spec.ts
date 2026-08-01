import assert from "node:assert/strict";
import test from "node:test";
import {
  PRODUCT_FACTORY_BATCH_STAGES,
  deriveProductFactoryBatchFlow,
  startOfDayAtUtcOffset,
  type BatchFlowProduct
} from "./product-factory-batch-flow";

function products(status: string, count = 10, extra: Partial<BatchFlowProduct> = {}): BatchFlowProduct[] {
  return Array.from({ length: count }, () => ({ status, ...extra }));
}

test("derives the eight legal stages in order", () => {
  const fixtures: Array<[BatchFlowProduct[], string, string]> = [
    [products("DRAFT"), "UPLOAD", "CONTINUE_UPLOAD"],
    [products("PHOTOGRAPHED"), "AI_IMAGE", "START_AI_IMAGE"],
    [products("AI_PROCESSED"), "CALIBRATION", "CONTINUE_CALIBRATION"],
    [products("CALIBRATED"), "BARCODE", "GENERATE_BARCODES"],
    [products("BARCODE_ASSIGNED"), "LABEL_APPLY", "PRINT_AND_APPLY_LABELS"],
    [products("BARCODE_ASSIGNED", 10, { labelPrintedAt: new Date() }), "LABEL_APPLY", "PRINT_AND_APPLY_LABELS"],
    [products("BARCODE_ASSIGNED", 10, { labelPrintedAt: new Date(), labelAppliedAt: new Date() }), "REVIEW", "CONTINUE_REVIEW"],
    [products("READY_FOR_STORAGE"), "STORAGE", "SCAN_INTO_STORAGE"],
    [products("READY_FOR_STORAGE", 10, { inventoryItem: { locationId: "loc", checkedInAt: new Date() } }), "PUBLISH", "PUBLISH_PRODUCTS"]
  ];

  for (const [input, stage, action] of fixtures) {
    const flow = deriveProductFactoryBatchFlow(input);
    assert.equal(flow.stage, stage);
    assert.equal(flow.nextAction, action);
  }
  assert.equal(PRODUCT_FACTORY_BATCH_STAGES.length, 8);
});

test("keeps a mixed batch at its earliest incomplete stage", () => {
  const flow = deriveProductFactoryBatchFlow([
    ...products("CALIBRATED", 9),
    { status: "AI_PROCESSED" }
  ]);
  assert.equal(flow.stage, "CALIBRATION");
  assert.equal(flow.stageCompletedCount, 9);
  assert.equal(flow.nextActionLabel, "继续人工校准（已完成 9/10）");
});

test("uses an explicit start action before the first product is calibrated", () => {
  const flow = deriveProductFactoryBatchFlow(products("AI_PROCESSED"));
  assert.equal(flow.nextActionLabel, "开始人工校准");
});

test("prioritizes open exceptions and recognizes terminal batches", () => {
  assert.equal(deriveProductFactoryBatchFlow(products("REWORK_REQUIRED", 1)).stage, "EXCEPTION");
  assert.equal(
    deriveProductFactoryBatchFlow(products("PHOTOGRAPHED", 1, { aiExtractions: [{ status: "FAILED" }] })).stage,
    "EXCEPTION"
  );
  assert.equal(deriveProductFactoryBatchFlow([...products("PUBLISHED", 9), { status: "ARCHIVED" }]).stage, "COMPLETE");
});

test("calculates the Nairobi business day independently of server timezone", () => {
  const now = new Date("2026-08-01T22:30:00.000Z");
  assert.equal(startOfDayAtUtcOffset(now, 180).toISOString(), "2026-08-01T21:00:00.000Z");
});
