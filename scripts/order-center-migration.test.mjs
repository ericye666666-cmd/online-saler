import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const enumMigration = readFileSync(
  new URL("../packages/database/prisma/migrations/20260801165000_add_operations_fulfillment_statuses/migration.sql", import.meta.url),
  "utf8"
);
const migration = readFileSync(
  new URL("../packages/database/prisma/migrations/20260801170000_unify_operations_order_center/migration.sql", import.meta.url),
  "utf8"
);

assert.match(enumMigration, /ADD VALUE IF NOT EXISTS 'READY_TO_PACK'/);
assert.match(enumMigration, /ADD VALUE IF NOT EXISTS 'READY_FOR_DISPATCH'/);
assert.doesNotMatch(enumMigration, /^\s*(UPDATE|INSERT|CREATE TABLE)/im);
assert.doesNotMatch(migration, /ALTER TYPE "FulfillmentStatus" ADD VALUE/i);
assert.match(migration, /INSERT INTO "OrderFulfillment"/);
assert.match(migration, /LEFT JOIN "OrderFulfillment"/);
assert.match(migration, /WHERE o\."status" = 'PAID' AND f\."id" IS NULL/);
assert.match(migration, /INSERT INTO "FulfillmentItem"/);
assert.match(migration, /LEFT JOIN "OrderSnapshot"/);
assert.match(migration, /THEN 'VERIFIED'::"FulfillmentItemStatus"/);
assert.match(migration, /INSERT INTO "DeliveryRider"/);
assert.match(migration, /Migrated from the existing fulfillment rider fields/);
assert.match(migration, /FulfillmentEvent_idempotencyKey_key/);
assert.match(migration, /dispatchedByEmployeeId/);
assert.match(migration, /afterSaleReason/);
assert.doesNotMatch(migration, /DROP TABLE|DROP COLUMN|DELETE FROM|TRUNCATE/i);

console.log("Order-center compatibility migration checks passed");
