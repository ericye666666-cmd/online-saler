-- Business closure P0: fulfillment nodes, node transit, delivery cost, payment
-- review, order-level refunds and the notification outbox.
--
-- Every change is additive. RefundRecord."orderId" is the only new NOT NULL
-- column on an existing table; it is backfilled from the return it belongs to
-- before the constraint is applied.

-- CreateEnum
CREATE TYPE "FulfillmentNodeType" AS ENUM ('WAREHOUSE', 'STORE');
CREATE TYPE "FulfillmentNodeStatus" AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE "NotificationChannel" AS ENUM ('SMS', 'WHATSAPP');
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'CANCELLED');
CREATE TYPE "NotificationAudience" AS ENUM ('CUSTOMER', 'AFFILIATE', 'NODE', 'WAREHOUSE', 'ADMIN');
CREATE TYPE "RefundKind" AS ENUM ('AFTER_SALE_RETURN', 'UNFULFILLABLE_ORDER', 'DUPLICATE_PAYMENT', 'OVERPAYMENT');
CREATE TYPE "PaymentReviewDecision" AS ENUM ('SETTLED', 'NOT_RECEIVED', 'REFUNDED');

-- CreateTable
CREATE TABLE "FulfillmentNode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "FulfillmentNodeType" NOT NULL DEFAULT 'STORE',
    "status" "FulfillmentNodeStatus" NOT NULL DEFAULT 'ACTIVE',
    "supportsPickup" BOOLEAN NOT NULL DEFAULT true,
    "supportsDelivery" BOOLEAN NOT NULL DEFAULT true,
    "mapsUrl" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FulfillmentNode_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FulfillmentNode_code_key" ON "FulfillmentNode"("code");
CREATE INDEX "FulfillmentNode_status_sortOrder_idx" ON "FulfillmentNode"("status", "sortOrder");
CREATE INDEX "FulfillmentNode_type_status_idx" ON "FulfillmentNode"("type", "status");

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "audience" "NotificationAudience" NOT NULL,
    "channel" "NotificationChannel" NOT NULL DEFAULT 'SMS',
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "dedupeKey" TEXT NOT NULL,
    "recipientPhone" TEXT NOT NULL,
    "recipientLabel" TEXT,
    "body" TEXT NOT NULL,
    "orderId" TEXT,
    "affiliateId" TEXT,
    "fulfillmentNodeId" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,
    "providerMessageId" TEXT,
    "provider" TEXT,
    "sentAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Notification_dedupeKey_key" ON "Notification"("dedupeKey");
CREATE INDEX "Notification_status_nextAttemptAt_idx" ON "Notification"("status", "nextAttemptAt");
CREATE INDEX "Notification_audience_status_createdAt_idx" ON "Notification"("audience", "status", "createdAt");
CREATE INDEX "Notification_orderId_createdAt_idx" ON "Notification"("orderId", "createdAt");
CREATE INDEX "Notification_affiliateId_createdAt_idx" ON "Notification"("affiliateId", "createdAt");
CREATE INDEX "Notification_topic_createdAt_idx" ON "Notification"("topic", "createdAt");

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN "homeNodeId" TEXT;
CREATE INDEX "Employee_homeNodeId_status_idx" ON "Employee"("homeNodeId", "status");

-- AlterTable
ALTER TABLE "CheckoutDraft" ADD COLUMN "fulfillmentNodeId" TEXT,
ADD COLUMN "whatsappPhone" TEXT;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "fulfillmentNodeId" TEXT,
ADD COLUMN "whatsappPhone" TEXT;
CREATE INDEX "Order_fulfillmentNodeId_status_createdAt_idx" ON "Order"("fulfillmentNodeId", "status", "createdAt");

-- AlterTable
ALTER TABLE "OrderFulfillment" ADD COLUMN "fulfillmentNodeId" TEXT,
ADD COLUMN "packageCode" TEXT,
ADD COLUMN "sentToNodeByEmployeeId" TEXT,
ADD COLUMN "sentToNodeAt" TIMESTAMP(3),
ADD COLUMN "arrivedAtNodeByEmployeeId" TEXT,
ADD COLUMN "arrivedAtNodeAt" TIMESTAMP(3),
ADD COLUMN "nodeReceiptNote" TEXT,
ADD COLUMN "actualDeliveryCostKsh" INTEGER,
ADD COLUMN "deliveryCostNote" TEXT,
ADD COLUMN "deliveryCostByEmployeeId" TEXT,
ADD COLUMN "deliveryCostRecordedAt" TIMESTAMP(3),
ADD COLUMN "exceptionFromStatus" "FulfillmentStatus",
ADD COLUMN "exceptionResolvedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "OrderFulfillment_packageCode_key" ON "OrderFulfillment"("packageCode");
CREATE INDEX "OrderFulfillment_fulfillmentNodeId_status_updatedAt_idx" ON "OrderFulfillment"("fulfillmentNodeId", "status", "updatedAt");

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN "providerQueryCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "providerQueryAt" TIMESTAMP(3),
ADD COLUMN "providerQueryResultCode" INTEGER,
ADD COLUMN "providerQueryDescription" TEXT,
ADD COLUMN "reviewDecision" "PaymentReviewDecision",
ADD COLUMN "reviewedByAdminUserId" TEXT,
ADD COLUMN "reviewedAt" TIMESTAMP(3),
ADD COLUMN "reviewNote" TEXT;

CREATE INDEX "Payment_status_providerQueryAt_idx" ON "Payment"("status", "providerQueryAt");

-- AlterTable
ALTER TABLE "MpesaCallback" ADD COLUMN "resolvedByAdminUserId" TEXT,
ADD COLUMN "resolvedAt" TIMESTAMP(3),
ADD COLUMN "resolutionNote" TEXT;

CREATE INDEX "MpesaCallback_processingStatus_resolvedAt_createdAt_idx" ON "MpesaCallback"("processingStatus", "resolvedAt", "createdAt");

-- AlterTable: order-level refunds. Backfill before enforcing NOT NULL.
ALTER TABLE "RefundRecord" ADD COLUMN "orderId" TEXT,
ADD COLUMN "kind" "RefundKind" NOT NULL DEFAULT 'AFTER_SALE_RETURN',
ADD COLUMN "reason" TEXT;

UPDATE "RefundRecord" AS r
SET "orderId" = a."orderId"
FROM "AfterSaleReturn" AS a
WHERE r."afterSaleReturnId" = a."id" AND r."orderId" IS NULL;

DELETE FROM "RefundRecord" WHERE "orderId" IS NULL;

ALTER TABLE "RefundRecord" ALTER COLUMN "orderId" SET NOT NULL;
ALTER TABLE "RefundRecord" ALTER COLUMN "afterSaleReturnId" DROP NOT NULL;

CREATE INDEX "RefundRecord_orderId_recordedAt_idx" ON "RefundRecord"("orderId", "recordedAt");
CREATE INDEX "RefundRecord_kind_recordedAt_idx" ON "RefundRecord"("kind", "recordedAt");

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_homeNodeId_fkey" FOREIGN KEY ("homeNodeId") REFERENCES "FulfillmentNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_fulfillmentNodeId_fkey" FOREIGN KEY ("fulfillmentNodeId") REFERENCES "FulfillmentNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OrderFulfillment" ADD CONSTRAINT "OrderFulfillment_fulfillmentNodeId_fkey" FOREIGN KEY ("fulfillmentNodeId") REFERENCES "FulfillmentNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OrderFulfillment" ADD CONSTRAINT "OrderFulfillment_sentToNodeByEmployeeId_fkey" FOREIGN KEY ("sentToNodeByEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OrderFulfillment" ADD CONSTRAINT "OrderFulfillment_arrivedAtNodeByEmployeeId_fkey" FOREIGN KEY ("arrivedAtNodeByEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OrderFulfillment" ADD CONSTRAINT "OrderFulfillment_deliveryCostByEmployeeId_fkey" FOREIGN KEY ("deliveryCostByEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_reviewedByAdminUserId_fkey" FOREIGN KEY ("reviewedByAdminUserId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MpesaCallback" ADD CONSTRAINT "MpesaCallback_resolvedByAdminUserId_fkey" FOREIGN KEY ("resolvedByAdminUserId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RefundRecord" ADD CONSTRAINT "RefundRecord_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RefundRecord" ADD CONSTRAINT "RefundRecord_recordedByAdminUserId_fkey" FOREIGN KEY ("recordedByAdminUserId") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_fulfillmentNodeId_fkey" FOREIGN KEY ("fulfillmentNodeId") REFERENCES "FulfillmentNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed the six fulfillment nodes: the central warehouse plus the five stores
-- that were until now only a hard-coded list on the checkout page.
INSERT INTO "FulfillmentNode" ("id", "code", "name", "type", "status", "supportsPickup", "supportsDelivery", "mapsUrl", "sortOrder", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'WAREHOUSE', 'Central Warehouse', 'WAREHOUSE', 'ACTIVE', false, true, NULL, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'thogoto', 'Thogoto', 'STORE', 'ACTIVE', true, true, 'https://maps.app.goo.gl/6xrUnjQAZYzizHUZ7', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'kinoo', 'Kinoo', 'STORE', 'ACTIVE', true, true, 'https://maps.app.goo.gl/7vaRmyQjfyw4C5Pi7?g_st=ac', 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'lucky-summer', 'Lucky Summer', 'STORE', 'ACTIVE', true, true, 'https://maps.app.goo.gl/tJoWM7w69qRUBfCu6?g_st=ac', 3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'pipeline', 'Pipeline', 'STORE', 'ACTIVE', true, true, 'https://maps.app.goo.gl/9cK5aeXV1M3nWFXj7?g_st=ac', 4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'utawala', 'Utawala', 'STORE', 'ACTIVE', true, true, 'https://maps.app.goo.gl/52wf91GfZ5jEkTzi8?g_st=ac', 5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

-- Best-effort backfill so existing pickup orders already belong to a node. The
-- store name was written into the delivery note as "Pickup point: <name>".
UPDATE "Order" AS o
SET "fulfillmentNodeId" = n."id"
FROM "FulfillmentNode" AS n
WHERE o."fulfillmentNodeId" IS NULL
  AND o."fulfillmentMethod" = 'PICKUP'
  AND n."type" = 'STORE'
  AND o."deliveryNote" LIKE 'Pickup point: ' || n."name" || '%';

UPDATE "OrderFulfillment" AS f
SET "fulfillmentNodeId" = o."fulfillmentNodeId"
FROM "Order" AS o
WHERE f."orderId" = o."id" AND f."fulfillmentNodeId" IS NULL AND o."fulfillmentNodeId" IS NOT NULL;
