-- CreateEnum
CREATE TYPE "AfterSaleReturnStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'RECEIVED', 'REFUND_RECORDED');

-- CreateEnum
CREATE TYPE "AfterSaleReturnReason" AS ENUM ('WRONG_ITEM', 'PHOTO_MISMATCH', 'UNDISCLOSED_DEFECT', 'MEASUREMENT_DIFFERENCE', 'DELIVERY_DAMAGE');

-- CreateEnum
CREATE TYPE "CommissionAdjustmentKind" AS ENUM ('REVERSAL', 'RECOVERY_REQUIRED');

-- CreateTable
CREATE TABLE "AfterSaleReturn" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "serviceCaseId" TEXT NOT NULL,
    "status" "AfterSaleReturnStatus" NOT NULL DEFAULT 'REQUESTED',
    "reason" "AfterSaleReturnReason" NOT NULL,
    "measurementDifferenceCm" DOUBLE PRECISION,
    "requestNote" TEXT NOT NULL,
    "requestedByAdminUserId" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedByAdminUserId" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "receivedByAdminUserId" TEXT,
    "receivedAt" TIMESTAMP(3),
    "receivedBarcode" TEXT,
    "restockable" BOOLEAN,
    "inspectionNote" TEXT,
    "inventoryUpdatedAt" TIMESTAMP(3),
    "restockedAt" TIMESTAMP(3),
    "restockedByAdminUserId" TEXT,
    "restockedLocationId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AfterSaleReturn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefundRecord" (
    "id" TEXT NOT NULL,
    "afterSaleReturnId" TEXT NOT NULL,
    "amountKsh" INTEGER NOT NULL,
    "externalReference" TEXT NOT NULL,
    "evidenceNote" TEXT NOT NULL,
    "refundedAt" TIMESTAMP(3) NOT NULL,
    "recordedByAdminUserId" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefundRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionAdjustment" (
    "id" TEXT NOT NULL,
    "commissionId" TEXT NOT NULL,
    "afterSaleReturnId" TEXT NOT NULL,
    "kind" "CommissionAdjustmentKind" NOT NULL,
    "amountKsh" INTEGER NOT NULL,
    "beforeAmountKsh" INTEGER NOT NULL,
    "afterAmountKsh" INTEGER NOT NULL,
    "recordedByAdminUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommissionAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AfterSaleEvent" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "afterSaleReturnId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorAdminUserId" TEXT NOT NULL,
    "sourceApp" "SourceApp" NOT NULL DEFAULT 'OPERATIONS',
    "reason" TEXT NOT NULL,
    "beforeJson" JSONB NOT NULL,
    "afterJson" JSONB NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AfterSaleEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AfterSaleReturn_orderItemId_key" ON "AfterSaleReturn"("orderItemId");

-- CreateIndex
CREATE UNIQUE INDEX "AfterSaleReturn_serviceCaseId_key" ON "AfterSaleReturn"("serviceCaseId");

-- CreateIndex
CREATE INDEX "AfterSaleReturn_orderId_status_idx" ON "AfterSaleReturn"("orderId", "status");

-- CreateIndex
CREATE INDEX "AfterSaleReturn_status_requestedAt_idx" ON "AfterSaleReturn"("status", "requestedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RefundRecord_externalReference_key" ON "RefundRecord"("externalReference");

-- CreateIndex
CREATE UNIQUE INDEX "CommissionAdjustment_afterSaleReturnId_key" ON "CommissionAdjustment"("afterSaleReturnId");

-- CreateIndex
CREATE INDEX "CommissionAdjustment_commissionId_kind_idx" ON "CommissionAdjustment"("commissionId", "kind");

-- CreateIndex
CREATE INDEX "AfterSaleEvent_afterSaleReturnId_createdAt_idx" ON "AfterSaleEvent"("afterSaleReturnId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AfterSaleEvent_orderId_idempotencyKey_key" ON "AfterSaleEvent"("orderId", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "AfterSaleReturn" ADD CONSTRAINT "AfterSaleReturn_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AfterSaleReturn" ADD CONSTRAINT "AfterSaleReturn_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AfterSaleReturn" ADD CONSTRAINT "AfterSaleReturn_serviceCaseId_fkey" FOREIGN KEY ("serviceCaseId") REFERENCES "CustomerServiceCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefundRecord" ADD CONSTRAINT "RefundRecord_afterSaleReturnId_fkey" FOREIGN KEY ("afterSaleReturnId") REFERENCES "AfterSaleReturn"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionAdjustment" ADD CONSTRAINT "CommissionAdjustment_commissionId_fkey" FOREIGN KEY ("commissionId") REFERENCES "Commission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionAdjustment" ADD CONSTRAINT "CommissionAdjustment_afterSaleReturnId_fkey" FOREIGN KEY ("afterSaleReturnId") REFERENCES "AfterSaleReturn"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AfterSaleEvent" ADD CONSTRAINT "AfterSaleEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AfterSaleEvent" ADD CONSTRAINT "AfterSaleEvent_afterSaleReturnId_fkey" FOREIGN KEY ("afterSaleReturnId") REFERENCES "AfterSaleReturn"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Financial evidence cannot contain zero/negative refunds or negative commission adjustments.
ALTER TABLE "RefundRecord" ADD CONSTRAINT "RefundRecord_positive_amount" CHECK ("amountKsh" > 0);
ALTER TABLE "CommissionAdjustment" ADD CONSTRAINT "CommissionAdjustment_nonnegative_amounts" CHECK ("amountKsh" >= 0 AND "beforeAmountKsh" >= 0 AND "afterAmountKsh" >= 0);
