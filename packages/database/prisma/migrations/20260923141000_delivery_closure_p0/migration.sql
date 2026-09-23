-- Delivery closure P0: the customer delivery code, the rider's home node and
-- login, authorized drop-off proof, the delivery failure record, and the log of
-- every code attempt.
--
-- Every change is additive. No existing column changes type or nullability, and
-- the two new NOT NULL columns on OrderFulfillment both carry defaults, so the
-- backfill is the default itself.

-- CreateEnum
CREATE TYPE "FulfillmentHolderType" AS ENUM ('WAREHOUSE', 'IN_TRANSIT', 'NODE', 'RIDER', 'CUSTOMER');
CREATE TYPE "DeliveryCompletionMethod" AS ENUM ('HANDED_TO_CUSTOMER', 'AUTHORIZED_DROP_OFF');
CREATE TYPE "DeliveryFailureReason" AS ENUM ('NO_ANSWER', 'PHONE_UNREACHABLE', 'WRONG_ADDRESS', 'CUSTOMER_REQUESTED_LATER', 'CUSTOMER_REFUSED', 'OTHER');
CREATE TYPE "CustomerCodePurpose" AS ENUM ('DELIVERY', 'PICKUP');

-- AlterTable: OrderFulfillment gains the holder, the code and the delivery outcome.
ALTER TABLE "OrderFulfillment"
  ADD COLUMN "currentHolderType" "FulfillmentHolderType" NOT NULL DEFAULT 'WAREHOUSE',
  ADD COLUMN "currentHolderId" TEXT,
  ADD COLUMN "currentHolderLabel" TEXT,
  ADD COLUMN "deliveryCodeHash" TEXT,
  ADD COLUMN "deliveryCodeIssuedAt" TIMESTAMP(3),
  ADD COLUMN "customerCodeVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "customerCodeFailedAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "customerCodeLockedAt" TIMESTAMP(3),
  ADD COLUMN "deliveryCodeSentCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "deliveryCompletionMethod" "DeliveryCompletionMethod",
  ADD COLUMN "dropOffPhotoObject" TEXT,
  ADD COLUMN "dropOffNote" TEXT,
  ADD COLUMN "deliveryFailureReason" "DeliveryFailureReason",
  ADD COLUMN "deliveryFailureNote" TEXT,
  ADD COLUMN "deliveryAttemptCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "deliveryFailedAt" TIMESTAMP(3),
  ADD COLUMN "returningToNodeAt" TIMESTAMP(3);

CREATE INDEX "OrderFulfillment_currentHolderType_status_idx" ON "OrderFulfillment"("currentHolderType", "status");

-- Packages that are already somewhere other than the warehouse keep an accurate
-- holder, so the "who has it" question is answerable for open orders too.
UPDATE "OrderFulfillment" SET "currentHolderType" = 'IN_TRANSIT'
  WHERE "status" = 'IN_TRANSIT_TO_NODE';
UPDATE "OrderFulfillment" SET "currentHolderType" = 'NODE', "currentHolderId" = "fulfillmentNodeId"
  WHERE "status" IN ('ARRIVED_AT_NODE', 'READY_FOR_PICKUP', 'READY_FOR_DISPATCH');
UPDATE "OrderFulfillment" SET "currentHolderType" = 'RIDER', "currentHolderId" = "deliveryRiderId"
  WHERE "status" = 'OUT_FOR_DELIVERY';
UPDATE "OrderFulfillment" SET "currentHolderType" = 'CUSTOMER'
  WHERE "status" = 'COMPLETED';

-- AlterTable: a rider belongs to a store, can be stood down, and can sign in.
ALTER TABLE "DeliveryRider"
  ADD COLUMN "fulfillmentNodeId" TEXT,
  ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "adminUserId" TEXT;

CREATE UNIQUE INDEX "DeliveryRider_adminUserId_key" ON "DeliveryRider"("adminUserId");
CREATE INDEX "DeliveryRider_fulfillmentNodeId_active_name_idx" ON "DeliveryRider"("fulfillmentNodeId", "active", "name");

ALTER TABLE "DeliveryRider" ADD CONSTRAINT "DeliveryRider_fulfillmentNodeId_fkey"
  FOREIGN KEY ("fulfillmentNodeId") REFERENCES "FulfillmentNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DeliveryRider" ADD CONSTRAINT "DeliveryRider_adminUserId_fkey"
  FOREIGN KEY ("adminUserId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable: every customer-code check, right or wrong. The code itself, and
-- the digits that were typed, are deliberately absent.
CREATE TABLE "CustomerCodeAttempt" (
    "id" TEXT NOT NULL,
    "fulfillmentId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "purpose" "CustomerCodePurpose" NOT NULL,
    "succeeded" BOOLEAN NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "lockedOut" BOOLEAN NOT NULL DEFAULT false,
    "deliveryRiderId" TEXT,
    "actorAdminUserId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerCodeAttempt_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CustomerCodeAttempt_fulfillmentId_createdAt_idx" ON "CustomerCodeAttempt"("fulfillmentId", "createdAt");
CREATE INDEX "CustomerCodeAttempt_orderId_createdAt_idx" ON "CustomerCodeAttempt"("orderId", "createdAt");
CREATE INDEX "CustomerCodeAttempt_succeeded_createdAt_idx" ON "CustomerCodeAttempt"("succeeded", "createdAt");
CREATE INDEX "CustomerCodeAttempt_deliveryRiderId_createdAt_idx" ON "CustomerCodeAttempt"("deliveryRiderId", "createdAt");

ALTER TABLE "CustomerCodeAttempt" ADD CONSTRAINT "CustomerCodeAttempt_fulfillmentId_fkey"
  FOREIGN KEY ("fulfillmentId") REFERENCES "OrderFulfillment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerCodeAttempt" ADD CONSTRAINT "CustomerCodeAttempt_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerCodeAttempt" ADD CONSTRAINT "CustomerCodeAttempt_deliveryRiderId_fkey"
  FOREIGN KEY ("deliveryRiderId") REFERENCES "DeliveryRider"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CustomerCodeAttempt" ADD CONSTRAINT "CustomerCodeAttempt_actorAdminUserId_fkey"
  FOREIGN KEY ("actorAdminUserId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
