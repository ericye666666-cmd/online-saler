-- Add paid inventory terminal state for items with confirmed customer payment.
ALTER TYPE "InventoryItemStatus" ADD VALUE 'PAID';

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('MPESA');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'CANCELLED', 'TIMEOUT', 'EXPIRED', 'MANUAL_REVIEW');

-- CreateEnum
CREATE TYPE "MpesaCallbackProcessingStatus" AS ENUM ('APPLIED', 'DUPLICATE', 'IGNORED', 'MANUAL_REVIEW');

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "provider" "PaymentProvider" NOT NULL DEFAULT 'MPESA',
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "amountKsh" INTEGER NOT NULL,
    "currency" "OrderCurrency" NOT NULL DEFAULT 'KES',
    "phone" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "providerMerchantRequestId" TEXT,
    "providerCheckoutRequestId" TEXT,
    "providerReceiptNumber" TEXT,
    "providerResultCode" INTEGER,
    "providerResultDescription" TEXT,
    "providerResponseJson" JSONB,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MpesaCallback" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT,
    "orderId" TEXT,
    "providerMerchantRequestId" TEXT,
    "providerCheckoutRequestId" TEXT NOT NULL,
    "resultCode" INTEGER NOT NULL,
    "resultDescription" TEXT,
    "amountKsh" INTEGER,
    "mpesaReceiptNumber" TEXT,
    "phone" TEXT,
    "transactionDate" TIMESTAMP(3),
    "processingStatus" "MpesaCallbackProcessingStatus" NOT NULL,
    "rawJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MpesaCallback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Payment_idempotencyKey_key" ON "Payment"("idempotencyKey");
CREATE UNIQUE INDEX "Payment_providerCheckoutRequestId_key" ON "Payment"("providerCheckoutRequestId");
CREATE UNIQUE INDEX "Payment_providerReceiptNumber_key" ON "Payment"("providerReceiptNumber");
CREATE INDEX "Payment_orderId_status_idx" ON "Payment"("orderId", "status");
CREATE INDEX "Payment_status_requestedAt_idx" ON "Payment"("status", "requestedAt");
CREATE INDEX "Payment_phone_status_idx" ON "Payment"("phone", "status");
CREATE INDEX "Payment_providerMerchantRequestId_idx" ON "Payment"("providerMerchantRequestId");

CREATE UNIQUE INDEX "MpesaCallback_providerCheckoutRequestId_key" ON "MpesaCallback"("providerCheckoutRequestId");
CREATE INDEX "MpesaCallback_paymentId_createdAt_idx" ON "MpesaCallback"("paymentId", "createdAt");
CREATE INDEX "MpesaCallback_orderId_createdAt_idx" ON "MpesaCallback"("orderId", "createdAt");
CREATE INDEX "MpesaCallback_mpesaReceiptNumber_idx" ON "MpesaCallback"("mpesaReceiptNumber");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MpesaCallback" ADD CONSTRAINT "MpesaCallback_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Payment invariants
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_amountKsh_check" CHECK ("amountKsh" > 0);
ALTER TABLE "MpesaCallback" ADD CONSTRAINT "MpesaCallback_amountKsh_check" CHECK ("amountKsh" IS NULL OR "amountKsh" > 0);
