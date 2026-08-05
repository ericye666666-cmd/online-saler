import assert from "node:assert/strict";
import { test } from "node:test";
import { InventoryItemStatus, ProductStatus } from "@online-saler/database";
import { buildInventoryOverview, type InventoryOverviewRecord } from "./inventory-overview";

function record(
  status: InventoryItemStatus,
  category: string | null,
  productStatus: ProductStatus = ProductStatus.PUBLISHED,
  locationId: string | null = "shelf-a"
): InventoryOverviewRecord {
  return {
    status,
    locationId,
    product: {
      category,
      subcategory: null,
      gender: "WOMEN",
      finalSizeLabel: "M",
      conditionGrade: "GOOD",
      status: productStatus
    }
  };
}

test("counts live warehouse inventory by category and inventory status", () => {
  const overview = buildInventoryOverview([
    record(InventoryItemStatus.AVAILABLE, "Dresses"),
    record(InventoryItemStatus.RESERVED, "Dresses"),
    record(InventoryItemStatus.PAID, null, ProductStatus.READY_FOR_STORAGE),
    record(InventoryItemStatus.DELIVERED, "Dresses")
  ]);
  assert.equal(overview.metrics.currentWarehouseTotal, 3);
  assert.equal(overview.metrics.available, 1);
  assert.equal(overview.metrics.reserved, 1);
  assert.equal(overview.metrics.paidAwaitingOutbound, 1);
  assert.equal(overview.metrics.sold, 2);
  assert.equal(overview.categories.find((row) => row.category === "Dresses")?.currentWarehouseCount, 2);
  assert.equal(overview.categories.find((row) => row.category === "Unclassified")?.currentWarehouseCount, 1);
});

test("excludes outbound and detached items from current warehouse totals", () => {
  const overview = buildInventoryOverview([
    record(InventoryItemStatus.PICKED, "Tops"),
    record(InventoryItemStatus.PACKED, "Tops"),
    record(InventoryItemStatus.AVAILABLE, "Tops", ProductStatus.PUBLISHED, null)
  ]);
  assert.equal(overview.metrics.currentWarehouseTotal, 0);
  assert.deepEqual(overview.categories, []);
});
