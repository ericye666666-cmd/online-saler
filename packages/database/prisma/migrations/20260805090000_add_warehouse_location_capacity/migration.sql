CREATE TYPE "WarehouseLocationStatus" AS ENUM ('ACTIVE', 'FULL', 'INACTIVE');

ALTER TABLE "WarehouseLocation"
  ADD COLUMN "capacity" INTEGER NOT NULL DEFAULT 100,
  ADD COLUMN "status" "WarehouseLocationStatus" NOT NULL DEFAULT 'ACTIVE';

ALTER TABLE "AuditLog"
  ADD COLUMN "actorAdminUserId" TEXT;

WITH occupied AS (
  SELECT "locationId", COUNT(*)::INTEGER AS item_count
  FROM "InventoryItem"
  WHERE "locationId" IS NOT NULL
    AND "status" IN ('PENDING_STOCK_IN', 'AVAILABLE', 'RESERVED', 'PAID', 'RETURNED')
  GROUP BY "locationId"
)
UPDATE "WarehouseLocation" location
SET "capacity" = GREATEST(100, occupied.item_count),
    "status" = CASE
      WHEN location."active" = false THEN 'INACTIVE'::"WarehouseLocationStatus"
      WHEN occupied.item_count >= GREATEST(100, occupied.item_count)
        THEN 'FULL'::"WarehouseLocationStatus"
      ELSE 'ACTIVE'::"WarehouseLocationStatus"
    END
FROM occupied
WHERE occupied."locationId" = location."id";

UPDATE "WarehouseLocation"
SET "status" = 'INACTIVE'::"WarehouseLocationStatus"
WHERE "active" = false;

ALTER TABLE "WarehouseLocation"
  ADD CONSTRAINT "WarehouseLocation_capacity_positive" CHECK ("capacity" > 0);

CREATE INDEX "WarehouseLocation_status_locationCode_idx"
  ON "WarehouseLocation"("status", "locationCode");

CREATE INDEX "AuditLog_actorAdminUserId_createdAt_idx"
  ON "AuditLog"("actorAdminUserId", "createdAt");

ALTER TABLE "AuditLog"
  ADD CONSTRAINT "AuditLog_actorAdminUserId_fkey"
  FOREIGN KEY ("actorAdminUserId") REFERENCES "AdminUser"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
