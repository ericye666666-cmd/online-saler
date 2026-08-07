import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL("../packages/database/prisma/migrations/20260805090000_add_warehouse_location_capacity/migration.sql", import.meta.url), "utf8");
const schema = readFileSync(new URL("../packages/database/prisma/schema.prisma", import.meta.url), "utf8");
const allocation = readFileSync(new URL("../apps/api/src/operations/operations-product-control.service.ts", import.meta.url), "utf8");
const warehouse = readFileSync(new URL("../apps/api/src/operations/operations-warehouse.service.ts", import.meta.url), "utf8");
const productController = readFileSync(new URL("../apps/api/src/operations/operations-product-control.controller.ts", import.meta.url), "utf8");
const batchService = readFileSync(new URL("../apps/api/src/operations/operations-product-batch.service.ts", import.meta.url), "utf8");
const fulfillment = readFileSync(new URL("../apps/api/src/operations/operations-fulfillment.service.ts", import.meta.url), "utf8");
const shelfPage = readFileSync(new URL("../apps/operations/src/app/product/warehouse-locations/warehouse-locations-client.tsx", import.meta.url), "utf8");
const legacyPage = readFileSync(new URL("../apps/operations/src/app/system/warehouse/locations/page.tsx", import.meta.url), "utf8");

test("adds capacity without rewriting existing shelf assignments", () => {
  assert.match(schema, /capacity\s+Int\s+@default\(100\)/);
  assert.match(schema, /status\s+WarehouseLocationStatus\s+@default\(ACTIVE\)/);
  assert.match(migration, /GREATEST\(100, occupied\.item_count\)/);
  assert.match(migration, /WarehouseLocation_capacity_positive/);
  assert.doesNotMatch(migration, /DELETE FROM "WarehouseLocation"|UPDATE "InventoryItem"\s+SET "locationId"/i);
});

test("serializes capacity-safe batch reservations and preserves idempotency", () => {
  assert.match(allocation, /FOR UPDATE/);
  assert.match(allocation, /buildShelfAllocationPlan/);
  assert.match(allocation, /if \(unassignedProductIds\.length === 0\) return/);
  assert.match(allocation, /No shelf location has enough available capacity/);
  assert.match(batchService, /assignBatchLocations\(products\.map/);
});

test("removes shelf QR and shelf scan surfaces while retaining product Barcode picking", () => {
  assert.doesNotMatch(shelfPage, /QRCode|qrcode|二维码|打印货位/);
  assert.doesNotMatch(productController, /confirm-placed-at-location|confirmPlacedAtLocation/);
  assert.match(fulfillment, /verifyFulfillmentItemBarcode/);
  assert.match(fulfillment, /expectedBarcode/);
  assert.match(legacyPage, /permanentRedirect\("\/product\/warehouse-locations"\)/);
});

test("enforces warehouse mutation permissions on the server", () => {
  assert.match(warehouse, /warehouse-locations\.edit-capacity/);
  assert.match(warehouse, /warehouse-locations\.move-product/);
  assert.match(warehouse, /inventory-overview\.view/);
  assert.match(warehouse, /Destination location has no available capacity/);
  assert.match(warehouse, /MOVABLE_INVENTORY_STATUSES/);
});
