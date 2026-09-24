import assert from "node:assert/strict";
import { test } from "node:test";
import { InventoryItemStatus, WarehouseLocationStatus } from "@online-saler/database";
import {
  MOVABLE_INVENTORY_STATUSES,
  WAREHOUSE_OCCUPYING_STATUSES,
  assertValidCapacity,
  buildShelfAllocationPlan,
  locationMetrics
} from "./warehouse-capacity";

function shelf(
  id: string,
  capacity: number,
  currentItemCount: number,
  status: WarehouseLocationStatus = WarehouseLocationStatus.ACTIVE
) {
  return { id, locationCode: id, capacity, currentItemCount, status, active: status !== WarehouseLocationStatus.INACTIVE };
}

test("puts the whole batch on the chosen shelf", () => {
  const productIds = Array.from({ length: 10 }, (_, index) => `product-${index + 1}`);
  const assignments = buildShelfAllocationPlan(productIds, shelf("A3", 200, 150));
  assert.deepEqual(assignments.map((item) => item.productId), productIds);
  assert.deepEqual(new Set(assignments.map((item) => item.locationCode)), new Set(["A3"]));
});

test("fills the last slot, reports FULL, and refuses a batch the chosen shelf cannot hold", () => {
  const [assignment] = buildShelfAllocationPlan(["product-1"], shelf("A", 200, 199));
  assert.equal(assignment.locationId, "A");
  assert.equal(locationMetrics(shelf("A", 200, 200)).effectiveStatus, WarehouseLocationStatus.FULL);
  assert.throws(
    () => buildShelfAllocationPlan(["one", "two"], shelf("A", 200, 199)),
    /room for 1 more item\(s\), not 2\. Choose another shelf/
  );
});

test("never puts new products on an inactive shelf", () => {
  assert.throws(
    () => buildShelfAllocationPlan(["product-1"], shelf("A", 200, 0, WarehouseLocationStatus.INACTIVE)),
    /not in use/
  );
});

test("maps capacity and operational state to ACTIVE, FULL, and INACTIVE", () => {
  assert.equal(locationMetrics(shelf("A", 100, 99)).effectiveStatus, WarehouseLocationStatus.ACTIVE);
  assert.equal(locationMetrics(shelf("A", 100, 100)).effectiveStatus, WarehouseLocationStatus.FULL);
  assert.equal(locationMetrics(shelf("A", 100, 10, WarehouseLocationStatus.INACTIVE)).effectiveStatus, WarehouseLocationStatus.INACTIVE);
});

test("rejects capacity below the current occupied count", () => {
  assert.throws(() => assertValidCapacity(100, 120), /current item count/);
  assert.doesNotThrow(() => assertValidCapacity(150, 120));
  assert.throws(() => assertValidCapacity(0, 0), /positive integer/);
});

test("counts only inventory that still occupies a shelf and blocks paid-item moves", () => {
  assert.deepEqual(WAREHOUSE_OCCUPYING_STATUSES, [
    InventoryItemStatus.PENDING_STOCK_IN,
    InventoryItemStatus.AVAILABLE,
    InventoryItemStatus.RESERVED,
    // A garment held against a deposit sits on a shelf for up to a week and
    // takes up exactly as much space as any other.
    InventoryItemStatus.DEPOSIT_HELD,
    InventoryItemStatus.PAID,
    InventoryItemStatus.RETURNED
  ]);
  assert.equal(new Set<InventoryItemStatus>(MOVABLE_INVENTORY_STATUSES).has(InventoryItemStatus.PAID), false);
  assert.equal(new Set<InventoryItemStatus>(MOVABLE_INVENTORY_STATUSES).has(InventoryItemStatus.DEPOSIT_HELD), true);
  assert.equal(new Set<InventoryItemStatus>(WAREHOUSE_OCCUPYING_STATUSES).has(InventoryItemStatus.PICKED), false);
});
