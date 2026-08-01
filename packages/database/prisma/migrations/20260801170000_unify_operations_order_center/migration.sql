-- Extend the existing fulfillment state machine. Existing enum values and records are preserved.
ALTER TYPE "FulfillmentStatus" ADD VALUE IF NOT EXISTS 'READY_TO_PACK' AFTER 'PICKING';
ALTER TYPE "FulfillmentStatus" ADD VALUE IF NOT EXISTS 'READY_FOR_DISPATCH' AFTER 'READY_FOR_PICKUP';

CREATE TYPE "FulfillmentItemStatus" AS ENUM ('PENDING', 'VERIFIED');
CREATE TYPE "PackagingMethod" AS ENUM ('BAG', 'BOX', 'OTHER');
CREATE TYPE "PickupVerificationMethod" AS ENUM ('ORDER_NUMBER', 'PHONE', 'PICKUP_CODE');
CREATE TYPE "DeliveryRiderType" AS ENUM ('INTERNAL', 'EXTERNAL');

ALTER TABLE "WarehouseLocation"
  ADD COLUMN "zoneCode" TEXT,
  ADD COLUMN "rackCode" TEXT,
  ADD COLUMN "binCode" TEXT,
  ADD COLUMN "qrCode" TEXT;

ALTER TABLE "Order" ADD COLUMN "pickupCode" TEXT;

UPDATE "WarehouseLocation"
SET "qrCode" = "locationCode"
WHERE "qrCode" IS NULL;

ALTER TABLE "OrderFulfillment"
  ADD COLUMN "packingStartedByEmployeeId" TEXT,
  ADD COLUMN "dispatchedByEmployeeId" TEXT,
  ADD COLUMN "afterSaleOwnerEmployeeId" TEXT,
  ADD COLUMN "deliveryRiderId" TEXT,
  ADD COLUMN "packagingMethod" "PackagingMethod",
  ADD COLUMN "packageCount" INTEGER,
  ADD COLUMN "packingStartedAt" TIMESTAMP(3),
  ADD COLUMN "readyForDispatchAt" TIMESTAMP(3),
  ADD COLUMN "dispatchedAt" TIMESTAMP(3),
  ADD COLUMN "pickupVerificationMethod" "PickupVerificationMethod",
  ADD COLUMN "pickupVerificationValue" TEXT,
  ADD COLUMN "pickupNote" TEXT;

ALTER TABLE "FulfillmentEvent"
  ADD COLUMN "idempotencyKey" TEXT,
  ADD COLUMN "actorAdminUserId" TEXT,
  ADD COLUMN "relatedEmployeeId" TEXT,
  ADD COLUMN "deliveryRiderId" TEXT,
  ADD COLUMN "orderItemId" TEXT,
  ADD COLUMN "expectedBarcode" TEXT;

ALTER TABLE "CustomerServiceCase"
  ADD COLUMN "assignedEmployeeId" TEXT,
  ADD COLUMN "afterSaleReason" TEXT,
  ADD COLUMN "customerRequest" TEXT,
  ADD COLUMN "requiresReturn" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "requiresRefund" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "affectsAffiliateCommission" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "FulfillmentItem" (
  "id" TEXT NOT NULL,
  "fulfillmentId" TEXT NOT NULL,
  "orderItemId" TEXT NOT NULL,
  "expectedBarcode" TEXT,
  "status" "FulfillmentItemStatus" NOT NULL DEFAULT 'PENDING',
  "scannedBarcode" TEXT,
  "verifiedByEmployeeId" TEXT,
  "verifiedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FulfillmentItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DeliveryRider" (
  "id" TEXT NOT NULL,
  "type" "DeliveryRiderType" NOT NULL,
  "employeeId" TEXT,
  "name" TEXT NOT NULL,
  "phone" TEXT,
  "company" TEXT,
  "vehicle" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DeliveryRider_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DeliveryAssignment" (
  "id" TEXT NOT NULL,
  "fulfillmentId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "deliveryRiderId" TEXT NOT NULL,
  "assignedByAdminUserId" TEXT,
  "estimatedDeliveryAt" TIMESTAMP(3),
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DeliveryAssignment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WarehouseLocation_qrCode_key" ON "WarehouseLocation"("qrCode");
CREATE UNIQUE INDEX "Order_pickupCode_key" ON "Order"("pickupCode");
CREATE INDEX "WarehouseLocation_zoneCode_rackCode_binCode_idx" ON "WarehouseLocation"("zoneCode", "rackCode", "binCode");
CREATE INDEX "OrderFulfillment_dispatchedByEmployeeId_idx" ON "OrderFulfillment"("dispatchedByEmployeeId");
CREATE INDEX "OrderFulfillment_deliveryRiderId_idx" ON "OrderFulfillment"("deliveryRiderId");
CREATE UNIQUE INDEX "FulfillmentItem_orderItemId_key" ON "FulfillmentItem"("orderItemId");
CREATE INDEX "FulfillmentItem_fulfillmentId_status_idx" ON "FulfillmentItem"("fulfillmentId", "status");
CREATE INDEX "FulfillmentItem_verifiedByEmployeeId_verifiedAt_idx" ON "FulfillmentItem"("verifiedByEmployeeId", "verifiedAt");
CREATE UNIQUE INDEX "DeliveryRider_employeeId_key" ON "DeliveryRider"("employeeId");
CREATE INDEX "DeliveryRider_type_name_idx" ON "DeliveryRider"("type", "name");
CREATE INDEX "DeliveryRider_phone_idx" ON "DeliveryRider"("phone");
CREATE INDEX "DeliveryAssignment_fulfillmentId_createdAt_idx" ON "DeliveryAssignment"("fulfillmentId", "createdAt");
CREATE INDEX "DeliveryAssignment_orderId_createdAt_idx" ON "DeliveryAssignment"("orderId", "createdAt");
CREATE INDEX "DeliveryAssignment_deliveryRiderId_createdAt_idx" ON "DeliveryAssignment"("deliveryRiderId", "createdAt");
CREATE INDEX "FulfillmentEvent_actorAdminUserId_createdAt_idx" ON "FulfillmentEvent"("actorAdminUserId", "createdAt");
CREATE UNIQUE INDEX "FulfillmentEvent_idempotencyKey_key" ON "FulfillmentEvent"("idempotencyKey");
CREATE INDEX "FulfillmentEvent_relatedEmployeeId_createdAt_idx" ON "FulfillmentEvent"("relatedEmployeeId", "createdAt");
CREATE INDEX "FulfillmentEvent_deliveryRiderId_createdAt_idx" ON "FulfillmentEvent"("deliveryRiderId", "createdAt");
CREATE INDEX "FulfillmentEvent_orderItemId_createdAt_idx" ON "FulfillmentEvent"("orderItemId", "createdAt");
CREATE INDEX "CustomerServiceCase_assignedEmployeeId_status_updatedAt_idx" ON "CustomerServiceCase"("assignedEmployeeId", "status", "updatedAt");

ALTER TABLE "OrderFulfillment" ADD CONSTRAINT "OrderFulfillment_packingStartedByEmployeeId_fkey" FOREIGN KEY ("packingStartedByEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OrderFulfillment" ADD CONSTRAINT "OrderFulfillment_dispatchedByEmployeeId_fkey" FOREIGN KEY ("dispatchedByEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OrderFulfillment" ADD CONSTRAINT "OrderFulfillment_afterSaleOwnerEmployeeId_fkey" FOREIGN KEY ("afterSaleOwnerEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OrderFulfillment" ADD CONSTRAINT "OrderFulfillment_deliveryRiderId_fkey" FOREIGN KEY ("deliveryRiderId") REFERENCES "DeliveryRider"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FulfillmentItem" ADD CONSTRAINT "FulfillmentItem_fulfillmentId_fkey" FOREIGN KEY ("fulfillmentId") REFERENCES "OrderFulfillment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FulfillmentItem" ADD CONSTRAINT "FulfillmentItem_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FulfillmentItem" ADD CONSTRAINT "FulfillmentItem_verifiedByEmployeeId_fkey" FOREIGN KEY ("verifiedByEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DeliveryRider" ADD CONSTRAINT "DeliveryRider_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DeliveryAssignment" ADD CONSTRAINT "DeliveryAssignment_fulfillmentId_fkey" FOREIGN KEY ("fulfillmentId") REFERENCES "OrderFulfillment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DeliveryAssignment" ADD CONSTRAINT "DeliveryAssignment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DeliveryAssignment" ADD CONSTRAINT "DeliveryAssignment_deliveryRiderId_fkey" FOREIGN KEY ("deliveryRiderId") REFERENCES "DeliveryRider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DeliveryAssignment" ADD CONSTRAINT "DeliveryAssignment_assignedByAdminUserId_fkey" FOREIGN KEY ("assignedByAdminUserId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FulfillmentEvent" ADD CONSTRAINT "FulfillmentEvent_actorAdminUserId_fkey" FOREIGN KEY ("actorAdminUserId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FulfillmentEvent" ADD CONSTRAINT "FulfillmentEvent_relatedEmployeeId_fkey" FOREIGN KEY ("relatedEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FulfillmentEvent" ADD CONSTRAINT "FulfillmentEvent_deliveryRiderId_fkey" FOREIGN KEY ("deliveryRiderId") REFERENCES "DeliveryRider"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FulfillmentEvent" ADD CONSTRAINT "FulfillmentEvent_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CustomerServiceCase" ADD CONSTRAINT "CustomerServiceCase_assignedEmployeeId_fkey" FOREIGN KEY ("assignedEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Preserve the meaning of already picked orders when introducing READY_TO_PACK.
UPDATE "OrderFulfillment"
SET "status" = 'READY_TO_PACK'
WHERE "status" = 'PICKING' AND "pickedAt" IS NOT NULL;

-- Backfill one order-level picking task for every historical paid order that does not already have one.
INSERT INTO "OrderFulfillment" ("id", "orderId", "status", "createdAt", "updatedAt")
SELECT CONCAT('paid-order-task-', o."id"), o."id", 'PAID', o."updatedAt", o."updatedAt"
FROM "Order" o
LEFT JOIN "OrderFulfillment" f ON f."orderId" = o."id"
WHERE o."status" = 'PAID' AND f."id" IS NULL;

INSERT INTO "FulfillmentEvent" ("id", "idempotencyKey", "fulfillmentId", "orderId", "action", "oldStatus", "newStatus", "note", "createdAt")
SELECT CONCAT('paid-order-task-event-', f."id"), CONCAT('pick-task:', f."orderId"), f."id", f."orderId", 'PAYMENT_CONFIRMED_PICK_TASK_CREATED', NULL, 'PAID', 'Backfilled from an existing paid order.', f."createdAt"
FROM "OrderFulfillment" f
JOIN "Order" o ON o."id" = f."orderId"
WHERE o."status" = 'PAID'
  AND NOT EXISTS (
    SELECT 1 FROM "FulfillmentEvent" e
    WHERE e."fulfillmentId" = f."id" AND e."action" = 'PAYMENT_CONFIRMED_PICK_TASK_CREATED'
  );

-- Create item scan rows without replacing the immutable order snapshots.
INSERT INTO "FulfillmentItem" ("id", "fulfillmentId", "orderItemId", "expectedBarcode", "status", "verifiedByEmployeeId", "verifiedAt", "createdAt", "updatedAt")
SELECT CONCAT('fulfillment-item-', oi."id"),
       f."id",
       oi."id",
       COALESCE(os."barcode", ii."barcode", p."barcode"),
       CASE
         WHEN f."pickedAt" IS NOT NULL OR f."status" IN ('READY_TO_PACK', 'PACKED', 'READY_FOR_PICKUP', 'READY_FOR_DISPATCH', 'OUT_FOR_DELIVERY', 'COMPLETED')
           THEN 'VERIFIED'::"FulfillmentItemStatus"
         ELSE 'PENDING'::"FulfillmentItemStatus"
       END,
       CASE WHEN f."pickedAt" IS NOT NULL THEN f."assignedPickerEmployeeId" ELSE NULL END,
       f."pickedAt",
       f."createdAt",
       CURRENT_TIMESTAMP
FROM "OrderFulfillment" f
JOIN "OrderItem" oi ON oi."orderId" = f."orderId"
LEFT JOIN "OrderSnapshot" os ON os."orderItemId" = oi."id"
LEFT JOIN "InventoryItem" ii ON ii."productId" = oi."productId"
LEFT JOIN "Product" p ON p."id" = oi."productId"
ON CONFLICT ("orderItemId") DO NOTHING;

-- Retain historical external rider details and create an assignment history row.
INSERT INTO "DeliveryRider" ("id", "type", "name", "phone", "createdAt", "updatedAt")
SELECT CONCAT('legacy-rider-', f."id"), 'EXTERNAL', f."deliveryRiderName", f."deliveryRiderPhone", COALESCE(f."outForDeliveryAt", f."updatedAt"), f."updatedAt"
FROM "OrderFulfillment" f
WHERE f."deliveryRiderName" IS NOT NULL AND f."deliveryRiderId" IS NULL
ON CONFLICT ("id") DO NOTHING;

UPDATE "OrderFulfillment"
SET "deliveryRiderId" = CONCAT('legacy-rider-', "id")
WHERE "deliveryRiderName" IS NOT NULL AND "deliveryRiderId" IS NULL;

INSERT INTO "DeliveryAssignment" ("id", "fulfillmentId", "orderId", "deliveryRiderId", "note", "createdAt")
SELECT CONCAT('legacy-delivery-assignment-', f."id"), f."id", f."orderId", f."deliveryRiderId", 'Migrated from the existing fulfillment rider fields.', COALESCE(f."outForDeliveryAt", f."updatedAt")
FROM "OrderFulfillment" f
WHERE f."deliveryRiderId" IS NOT NULL
ON CONFLICT ("id") DO NOTHING;

UPDATE "FulfillmentEvent" e
SET "actorAdminUserId" = a."id",
    "relatedEmployeeId" = e."actorEmployeeId"
FROM "AdminUser" a
WHERE a."linkedEmployeeId" = e."actorEmployeeId"
  AND e."actorAdminUserId" IS NULL;

UPDATE "FulfillmentEvent" e
SET "deliveryRiderId" = f."deliveryRiderId"
FROM "OrderFulfillment" f
WHERE f."id" = e."fulfillmentId"
  AND e."deliveryRiderId" IS NULL
  AND f."deliveryRiderId" IS NOT NULL;

-- Preserve the employee and time recorded by the former one-step delivery action.
UPDATE "OrderFulfillment" f
SET "dispatchedByEmployeeId" = event."actorEmployeeId",
    "dispatchedAt" = event."createdAt"
FROM (
  SELECT DISTINCT ON ("fulfillmentId") "fulfillmentId", "actorEmployeeId", "createdAt"
  FROM "FulfillmentEvent"
  WHERE "action" = 'ASSIGN_DELIVERY'
  ORDER BY "fulfillmentId", "createdAt" DESC
) event
WHERE event."fulfillmentId" = f."id"
  AND f."dispatchedByEmployeeId" IS NULL;

UPDATE "CustomerServiceCase"
SET "afterSaleReason" = COALESCE("afterSaleReason", "title"),
    "customerRequest" = COALESCE("customerRequest", "description")
WHERE "issueType" = 'AFTER_SALE';
