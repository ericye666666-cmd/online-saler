import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { InventoryItemStatus, ProductStatus } from "@online-saler/database";
import { emptiedCancelledBatchIds, planProductPurge, type PurgeCandidate } from "./product-purge";

function candidate(id: string, extra: Partial<PurgeCandidate> = {}): PurgeCandidate {
  return {
    id,
    productCode: `BATCH-1-${id}`,
    title: null,
    status: ProductStatus.ARCHIVED,
    batchId: "batch-1",
    batchCode: "BATCH-1",
    orderItemCount: 0,
    inventoryStatus: null,
    ...extra
  };
}

describe("planProductPurge", () => {
  it("deletes rejected products with no stock or only pre-sale stock", () => {
    const plan = planProductPurge([
      candidate("01"),
      candidate("02", { inventoryStatus: InventoryItemStatus.PENDING_STOCK_IN }),
      candidate("03", { inventoryStatus: InventoryItemStatus.AVAILABLE })
    ]);
    assert.deepEqual(plan.purge.map((item) => item.id), ["01", "02", "03"]);
    assert.deepEqual(plan.kept, []);
  });

  it("never deletes anything a customer order touched", () => {
    const plan = planProductPurge([
      candidate("01", { orderItemCount: 1 }),
      candidate("02", { inventoryStatus: InventoryItemStatus.PAID }),
      candidate("03", { inventoryStatus: InventoryItemStatus.RETURNED })
    ]);
    assert.deepEqual(plan.purge, []);
    assert.deepEqual(plan.kept.map((item) => item.productCode), ["BATCH-1-01", "BATCH-1-02", "BATCH-1-03"]);
  });

  it("never deletes a product that is not rejected", () => {
    const plan = planProductPurge([candidate("01", { status: ProductStatus.PUBLISHED })]);
    assert.deepEqual(plan.purge, []);
    assert.equal(plan.kept.length, 1);
  });
});

describe("emptiedCancelledBatchIds", () => {
  it("removes a cancelled batch only when every product in it is deleted", () => {
    const purged = new Set(["a1", "a2", "b1"]);
    assert.deepEqual(
      emptiedCancelledBatchIds([
        { id: "A", productIds: ["a1", "a2"] },
        { id: "B", productIds: ["b1", "b2"] },
        { id: "C", productIds: [] }
      ], purged),
      ["A", "C"]
    );
  });
});
