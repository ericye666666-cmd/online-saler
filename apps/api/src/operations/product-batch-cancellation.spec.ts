import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { InventoryItemStatus, ProductBatchStatus, ProductStatus } from "@online-saler/database";
import { BatchCancellationError, planBatchCancellation, type CancellableProduct } from "./product-batch-cancellation";

const open = { status: ProductBatchStatus.OPEN };

function product(
  id: string,
  status: ProductStatus,
  inventory?: { status: InventoryItemStatus; locationId: string | null; locationCode?: string }
): CancellableProduct {
  return {
    id,
    productCode: `BATCH-1-${id}`,
    status,
    inventoryItem: inventory
      ? {
          id: `item-${id}`,
          status: inventory.status,
          locationId: inventory.locationId,
          location: inventory.locationCode ? { locationCode: inventory.locationCode } : null
        }
      : null
  };
}

describe("planBatchCancellation", () => {
  it("archives every unfinished item and leaves items that already went live alone", () => {
    const plan = planBatchCancellation(open, [
      product("01", ProductStatus.DRAFT),
      product("02", ProductStatus.CALIBRATION_PENDING),
      product("03", ProductStatus.PUBLISHED, { status: InventoryItemStatus.AVAILABLE, locationId: "A", locationCode: "A-01" }),
      product("04", ProductStatus.UNPUBLISHED, { status: InventoryItemStatus.AVAILABLE, locationId: "A", locationCode: "A-01" }),
      product("05", ProductStatus.ARCHIVED)
    ], "Wrong stock delivered");

    assert.deepEqual(plan.archive.map((item) => item.id), ["01", "02"]);
    assert.deepEqual(plan.kept.map((item) => item.id), ["03", "04", "05"]);
    // Live items keep their shelf; only unfinished items give theirs back.
    assert.deepEqual(plan.releases, []);
  });

  it("frees reserved slots and flags items that were already put on the shelf", () => {
    const plan = planBatchCancellation(open, [
      product("01", ProductStatus.BARCODE_ASSIGNED, { status: InventoryItemStatus.PENDING_STOCK_IN, locationId: "A", locationCode: "A-01" }),
      product("02", ProductStatus.READY_FOR_STORAGE, { status: InventoryItemStatus.AVAILABLE, locationId: "B", locationCode: "B-02" }),
      product("03", ProductStatus.CALIBRATED)
    ], "Cancelled");

    assert.deepEqual(plan.releases.map(({ productId, locationCode, physicallyShelved }) => ({ productId, locationCode, physicallyShelved })), [
      { productId: "01", locationCode: "A-01", physicallyShelved: false },
      { productId: "02", locationCode: "B-02", physicallyShelved: true }
    ]);
  });

  it("refuses to touch an item whose inventory is tied to a customer order", () => {
    assert.throws(
      () => planBatchCancellation(open, [
        product("01", ProductStatus.READY_FOR_STORAGE, { status: InventoryItemStatus.RESERVED, locationId: "A" })
      ], "Cancelled"),
      (error: unknown) => error instanceof BatchCancellationError && /RESERVED/.test(error.message)
    );
  });

  it("only cancels batches that are still in progress, and always with a reason", () => {
    assert.throws(() => planBatchCancellation({ status: ProductBatchStatus.COMPLETED }, [], "x"), /still in progress/);
    assert.throws(() => planBatchCancellation({ status: ProductBatchStatus.CANCELLED }, [], "x"), /already cancelled/);
    assert.throws(() => planBatchCancellation(open, [], "   "), /reason is required/);
    assert.throws(() => planBatchCancellation(open, [], undefined), /reason is required/);
  });
});
