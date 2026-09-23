-- Customer service MVP: a case taxonomy with an owner, a deadline and an
-- escalation target, a store to bring returns back to, and an approval gate in
-- front of every refund.
--
-- Every change is additive. No column is dropped, no enum gains a value, and
-- every new column on an existing table is nullable or carries a default, so
-- rows written by the currently deployed code stay valid while it is rolling.

-- CreateEnum
CREATE TYPE "CustomerServiceCaseType" AS ENUM (
  'PAYMENT_FAILED',
  'PAID_BUT_ORDER_MISSING',
  'DUPLICATE_PAYMENT',
  'PAYMENT_PENDING',
  'WRONG_AMOUNT',
  'ORDER_LATE',
  'CUSTOMER_UNREACHABLE',
  'WRONG_ADDRESS',
  'RIDER_ISSUE',
  'PACKAGE_MISSING',
  'DELIVERY_CODE_NOT_RECEIVED',
  'WRONG_ITEM',
  'DAMAGED_ITEM',
  'MISSING_ITEM',
  'SIZE_ISSUE',
  'PRODUCT_NOT_AS_EXPECTED',
  'RETURN_REQUEST',
  'EXCHANGE_REQUEST',
  'REFUND_REQUEST',
  'OTHER'
);

CREATE TYPE "CustomerServicePriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

CREATE TYPE "CustomerServiceEscalationTarget" AS ENUM ('FULFILLMENT', 'FINANCE', 'ADMIN');

CREATE TYPE "RefundRequestStatus" AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'REFUNDED', 'CANCELLED');

-- AlterTable: the case gains a specific reason, an owner, a deadline and an
-- escalation target. Existing rows keep issueType as their only classification
-- and default to caseType OTHER at NORMAL priority with no deadline, which is
-- exactly how they behaved before.
ALTER TABLE "CustomerServiceCase"
  ADD COLUMN "caseType" "CustomerServiceCaseType" NOT NULL DEFAULT 'OTHER',
  ADD COLUMN "priority" "CustomerServicePriority" NOT NULL DEFAULT 'NORMAL',
  ADD COLUMN "assignedAdminUserId" TEXT,
  ADD COLUMN "assignedAt" TIMESTAMP(3),
  ADD COLUMN "escalated" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "escalatedTo" "CustomerServiceEscalationTarget",
  ADD COLUMN "escalatedAt" TIMESTAMP(3),
  ADD COLUMN "escalatedByAdminUserId" TEXT,
  ADD COLUMN "escalationNote" TEXT,
  ADD COLUMN "slaDueAt" TIMESTAMP(3),
  ADD COLUMN "closedAt" TIMESTAMP(3);

-- A case that was already closed keeps an honest closedAt rather than a null
-- that would read as "still open" on the dashboard.
UPDATE "CustomerServiceCase"
   SET "closedAt" = "resolvedAt"
 WHERE "status" = 'CLOSED' AND "resolvedAt" IS NOT NULL;

CREATE INDEX "CustomerServiceCase_assignedAdminUserId_status_updatedAt_idx"
  ON "CustomerServiceCase"("assignedAdminUserId", "status", "updatedAt");
CREATE INDEX "CustomerServiceCase_caseType_status_createdAt_idx"
  ON "CustomerServiceCase"("caseType", "status", "createdAt");
CREATE INDEX "CustomerServiceCase_escalated_escalatedTo_updatedAt_idx"
  ON "CustomerServiceCase"("escalated", "escalatedTo", "updatedAt");
CREATE INDEX "CustomerServiceCase_status_slaDueAt_idx"
  ON "CustomerServiceCase"("status", "slaDueAt");

ALTER TABLE "CustomerServiceCase"
  ADD CONSTRAINT "CustomerServiceCase_assignedAdminUserId_fkey"
  FOREIGN KEY ("assignedAdminUserId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CustomerServiceCase"
  ADD CONSTRAINT "CustomerServiceCase_escalatedByAdminUserId_fkey"
  FOREIGN KEY ("escalatedByAdminUserId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: where the customer brings the item back. Null keeps the previous
-- behaviour, which was always the warehouse.
ALTER TABLE "AfterSaleReturn" ADD COLUMN "returnNodeId" TEXT;

CREATE INDEX "AfterSaleReturn_returnNodeId_status_requestedAt_idx"
  ON "AfterSaleReturn"("returnNodeId", "status", "requestedAt");

ALTER TABLE "AfterSaleReturn"
  ADD CONSTRAINT "AfterSaleReturn_returnNodeId_fkey"
  FOREIGN KEY ("returnNodeId") REFERENCES "FulfillmentNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable: the approval gate. A RefundRecord is evidence that money already
-- moved; a RefundRequest is permission for it to move at all.
CREATE TABLE "RefundRequest" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "serviceCaseId" TEXT,
    "afterSaleReturnId" TEXT,
    "status" "RefundRequestStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "kind" "RefundKind" NOT NULL DEFAULT 'AFTER_SALE_RETURN',
    "amountKsh" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "requestedByAdminUserId" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedByAdminUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "refundRecordId" TEXT,
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RefundRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RefundRequest_refundRecordId_key" ON "RefundRequest"("refundRecordId");
CREATE INDEX "RefundRequest_status_requestedAt_idx" ON "RefundRequest"("status", "requestedAt");
CREATE INDEX "RefundRequest_orderId_requestedAt_idx" ON "RefundRequest"("orderId", "requestedAt");
CREATE INDEX "RefundRequest_serviceCaseId_requestedAt_idx" ON "RefundRequest"("serviceCaseId", "requestedAt");
CREATE INDEX "RefundRequest_requestedByAdminUserId_requestedAt_idx" ON "RefundRequest"("requestedByAdminUserId", "requestedAt");

ALTER TABLE "RefundRequest"
  ADD CONSTRAINT "RefundRequest_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RefundRequest"
  ADD CONSTRAINT "RefundRequest_serviceCaseId_fkey"
  FOREIGN KEY ("serviceCaseId") REFERENCES "CustomerServiceCase"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RefundRequest"
  ADD CONSTRAINT "RefundRequest_afterSaleReturnId_fkey"
  FOREIGN KEY ("afterSaleReturnId") REFERENCES "AfterSaleReturn"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RefundRequest"
  ADD CONSTRAINT "RefundRequest_requestedByAdminUserId_fkey"
  FOREIGN KEY ("requestedByAdminUserId") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RefundRequest"
  ADD CONSTRAINT "RefundRequest_reviewedByAdminUserId_fkey"
  FOREIGN KEY ("reviewedByAdminUserId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RefundRequest"
  ADD CONSTRAINT "RefundRequest_refundRecordId_fkey"
  FOREIGN KEY ("refundRecordId") REFERENCES "RefundRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;
