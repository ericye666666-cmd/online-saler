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

test("fills a nearly full shelf before selecting another shelf", () => {
  const productIds = Array.from({ length: 10 }, (_, index) => `product-${index + 1}`);
  const assignments = buildShelfAllocationPlan(productIds, [shelf("A", 100, 95), shelf("B", 100, 20)], () => 0);
  assert.deepEqual(assignments.slice(0, 5).map((item) => item.locationId), Array(5).fill("A"));
  assert.deepEqual(assignments.slice(5).map((item) => item.locationId), Array(5).fill("B"));
});

test("fills the last slot, reports FULL, and refuses a further assignment without another shelf", () => {
  const [assignment] = buildShelfAllocationPlan(["product-1"], [shelf("A", 100, 99)], () => 0);
  assert.equal(assignment.locationId, "A");
  assert.equal(locationMetrics(shelf("A", 100, 100)).effectiveStatus, WarehouseLocationStatus.FULL);
  assert.throws(
    () => buildShelfAllocationPlan(["product-2"], [shelf("A", 100, 100)], () => 0),
    /No shelf location has enough available capacity/
  );
});

test("keeps one batch concentrated instead of randomizing every item", () => {
  const productIds = Array.from({ length: 10 }, (_, index) => `product-${index + 1}`);
  const assignments = buildShelfAllocationPlan(productIds, [shelf("A", 50, 0), shelf("B", 50, 0)], () => 0.75);
  assert.deepEqual(new Set(assignments.map((item) => item.locationId)), new Set(["B"]));
});

test("does not allocate beyond total capacity", () => {
  assert.throws(
    () => buildShelfAllocationPlan(["one", "two"], [shelf("A", 100, 99)], () => 0),
    /No shelf location has enough available capacity/
  );
});

test("maps capacity and operational state to ACTIVE, FULL, and INACTIVE", () => {
  assert.equal(locationMetrics(shelf("A", 100, 99)).effectiveStatus, WarehouseLocationStatus.ACTIVE);
  assert.equal(locationMetrics(shelf("A", 100, 100)).effectiveStatus, WarehouseLocationStatus.FULL);
  assert.equal(locationMetrics(shelf("A", 100, 10, WarehouseLocationStatus.INACTIVE)).effectiveStatus, WarehouseLocationStatus.INACTIVE);
});

test("never allocates new products to an inactive shelf", () => {
  const assignments = buildShelfAllocationPlan(
    ["product-1"],
    [shelf("A", 100, 0, WarehouseLocationStatus.INACTIVE), shelf("B", 100, 0)],
    () => 0
  );
  assert.equal(assignments[0]?.locationId, "B");
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
    InventoryItemStatus.PAID,
    InventoryItemStatus.RETURNED
  ]);
  assert.equal(new Set<InventoryItemStatus>(MOVABLE_INVENTORY_STATUSES).has(InventoryItemStatus.PAID), false);
  assert.equal(new Set<InventoryItemStatus>(WAREHOUSE_OCCUPYING_STATUSES).has(InventoryItemStatus.PICKED), false);
});
