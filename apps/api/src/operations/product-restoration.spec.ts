import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { InventoryItemStatus, ProductStatus } from "@online-saler/database";
import {
  ProductRestorationError,
  planProductRestoration,
  restoreTargetStatus,
  type RestorationCandidate,
  type ShelfSpace
} from "./product-restoration";
import { ProductStateMachine } from "../product/product-state-machine";

function candidate(id: string, previousStatus: ProductStatus | null, extra: Partial<RestorationCandidate> = {}): RestorationCandidate {
  return {
    id,
    productCode: `BATCH-1-${id}`,
    status: ProductStatus.ARCHIVED,
    barcode: null,
    previousStatus,
    inventoryItem: null,
    previousShelf: null,
    ...extra
  };
}

function shelved(id: string, previousStatus: ProductStatus, inventoryStatus: InventoryItemStatus, shelfId = "A"): RestorationCandidate {
  return candidate(id, previousStatus, {
    barcode: `9260000000${id}`,
    inventoryItem: { id: `item-${id}`, status: inventoryStatus, locationId: null },
    previousShelf: { id: shelfId, locationCode: `${shelfId}-01` }
  });
}

const shelfA: ShelfSpace = { id: "A", locationCode: "A-01", capacity: 10, currentItemCount: 8, active: true };

describe("restoreTargetStatus", () => {
  it("returns a garment to the step it was on", () => {
    assert.equal(restoreTargetStatus(ProductStatus.DRAFT), ProductStatus.DRAFT);
    assert.equal(restoreTargetStatus(ProductStatus.CALIBRATED), ProductStatus.CALIBRATED);
    assert.equal(restoreTargetStatus(ProductStatus.REVIEW_PENDING), ProductStatus.REVIEW_PENDING);
    assert.equal(restoreTargetStatus(ProductStatus.READY_FOR_STORAGE), ProductStatus.READY_FOR_STORAGE);
  });

  it("re-runs AI recognition that was abandoned by the archive", () => {
    assert.equal(restoreTargetStatus(ProductStatus.AI_PROCESSING), ProductStatus.PHOTOGRAPHED);
  });

  it("does not restore live items or unknown history", () => {
    assert.equal(restoreTargetStatus(ProductStatus.PUBLISHED), null);
    assert.equal(restoreTargetStatus(ProductStatus.UNPUBLISHED), null);
    assert.equal(restoreTargetStatus(ProductStatus.ARCHIVED), null);
    assert.equal(restoreTargetStatus(null), null);
  });
});

describe("planProductRestoration", () => {
  it("restores every item to its previous step", () => {
    const plan = planProductRestoration([
      candidate("01", ProductStatus.DRAFT),
      candidate("02", ProductStatus.CALIBRATION_PENDING)
    ], []);
    assert.deepEqual(plan.restore.map((item) => [item.id, item.toStatus]), [
      ["01", ProductStatus.DRAFT],
      ["02", ProductStatus.CALIBRATION_PENDING]
    ]);
    assert.deepEqual(plan.shelfReturns, []);
    assert.deepEqual(plan.needsShelf, []);
  });

  it("puts garments back on the shelf they came off while it has room", () => {
    const plan = planProductRestoration([
      shelved("01", ProductStatus.READY_FOR_STORAGE, InventoryItemStatus.AVAILABLE),
      shelved("02", ProductStatus.BARCODE_ASSIGNED, InventoryItemStatus.PENDING_STOCK_IN),
      shelved("03", ProductStatus.BARCODE_ASSIGNED, InventoryItemStatus.PENDING_STOCK_IN)
    ], [shelfA]);
    assert.deepEqual(plan.shelfReturns.map((item) => [item.productId, item.locationCode, item.physicallyShelved]), [
      ["01", "A-01", true],
      ["02", "A-01", false]
    ]);
    // Shelf A had two free slots; the third garment waits for the batch steps to choose a shelf.
    assert.deepEqual(plan.needsShelf.map((item) => item.productId), ["03"]);
  });

  it("never returns a garment to an inactive shelf", () => {
    const plan = planProductRestoration(
      [shelved("01", ProductStatus.BARCODE_ASSIGNED, InventoryItemStatus.PENDING_STOCK_IN)],
      [{ ...shelfA, active: false }]
    );
    assert.deepEqual(plan.shelfReturns, []);
    assert.deepEqual(plan.needsShelf.map((item) => item.productId), ["01"]);
  });

  it("refuses items that are not archived, lack history, or touch an order", () => {
    assert.throws(
      () => planProductRestoration([{ ...candidate("01", ProductStatus.DRAFT), status: ProductStatus.DRAFT }], []),
      ProductRestorationError
    );
    assert.throws(() => planProductRestoration([candidate("01", null)], []), ProductRestorationError);
    assert.throws(() => planProductRestoration([candidate("01", ProductStatus.PUBLISHED)], []), ProductRestorationError);
    assert.throws(
      () => planProductRestoration([shelved("01", ProductStatus.READY_FOR_STORAGE, InventoryItemStatus.PAID)], [shelfA]),
      ProductRestorationError
    );
    assert.throws(() => planProductRestoration([], []), ProductRestorationError);
  });
});

describe("ProductStateMachine.assertCanRestore", () => {
  const machine = new ProductStateMachine();

  it("lets an archived item back to an intake step with a reason", () => {
    const rule = machine.assertCanRestore({ fromStatus: ProductStatus.ARCHIVED, toStatus: ProductStatus.CALIBRATED, reason: "Clothes found" });
    assert.equal(rule.action, "PRODUCT_RESTORE");
  });

  it("refuses live targets, non-archived sources and missing reasons", () => {
    assert.throws(() => machine.assertCanRestore({ fromStatus: ProductStatus.ARCHIVED, toStatus: ProductStatus.PUBLISHED, reason: "x" }));
    assert.throws(() => machine.assertCanRestore({ fromStatus: ProductStatus.ARCHIVED, toStatus: ProductStatus.AI_PROCESSING, reason: "x" }));
    assert.throws(() => machine.assertCanRestore({ fromStatus: ProductStatus.DRAFT, toStatus: ProductStatus.CALIBRATED, reason: "x" }));
    assert.throws(() => machine.assertCanRestore({ fromStatus: ProductStatus.ARCHIVED, toStatus: ProductStatus.DRAFT }));
  });

  it("still refuses a normal transition out of ARCHIVED", () => {
    assert.throws(() => machine.assertCanTransition({ fromStatus: ProductStatus.ARCHIVED, toStatus: ProductStatus.DRAFT, reason: "x" }));
  });
});
