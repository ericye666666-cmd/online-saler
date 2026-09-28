import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { InventoryItemStatus, ProductStatus } from "@online-saler/database";
import { planCancelledBatchCleanup, type CleanupCandidate } from "./cancelled-batch-cleanup";

// One-off cleanup spec; remove together with cancelled-batch-cleanup.ts.

function candidate(id: string, extra: Partial<CleanupCandidate> = {}): CleanupCandidate {
  return {
    id,
    productCode: `BATCH-1-${id}`,
    title: null,
    status: ProductStatus.ARCHIVED,
    batchCode: "BATCH-1",
    orderItemCount: 0,
    inventoryStatus: null,
    ...extra
  };
}

describe("planCancelledBatchCleanup", () => {
  it("deletes items a cancellation archived that have no order and no customer stock", () => {
    const plan = planCancelledBatchCleanup([
      candidate("01"),
      candidate("02", { inventoryStatus: InventoryItemStatus.PENDING_STOCK_IN }),
      candidate("03", { inventoryStatus: InventoryItemStatus.AVAILABLE })
    ]);
    assert.deepEqual(plan.delete.map((item) => item.id), ["01", "02", "03"]);
    assert.deepEqual(plan.skipped, []);
  });

  it("skips anything a customer order touched", () => {
    const plan = planCancelledBatchCleanup([
      candidate("01", { orderItemCount: 1 }),
      candidate("02", { inventoryStatus: InventoryItemStatus.PAID })
    ]);
    assert.deepEqual(plan.delete, []);
    assert.deepEqual(plan.skipped.map((item) => item.productCode), ["BATCH-1-01", "BATCH-1-02"]);
  });

  it("leaves an item that was restored since the cancellation", () => {
    const plan = planCancelledBatchCleanup([candidate("01", { status: ProductStatus.CALIBRATED })]);
    assert.deepEqual(plan.delete, []);
    assert.deepEqual(plan.skipped, []);
  });
});
