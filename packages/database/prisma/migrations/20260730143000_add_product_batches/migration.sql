-- CreateEnum
CREATE TYPE "ProductBatchStatus" AS ENUM ('OPEN', 'COMPLETED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Product"
ADD COLUMN "batchId" TEXT,
ADD COLUMN "batchItemNumber" INTEGER;

-- CreateTable
CREATE TABLE "ProductBatch" (
    "id" TEXT NOT NULL,
    "batchCode" TEXT NOT NULL,
    "status" "ProductBatchStatus" NOT NULL DEFAULT 'OPEN',
    "targetCount" INTEGER NOT NULL DEFAULT 10,
    "createdByEmployeeId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductBatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductBatch_batchCode_key" ON "ProductBatch"("batchCode");

-- CreateIndex
CREATE INDEX "ProductBatch_status_createdAt_idx" ON "ProductBatch"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ProductBatch_createdByEmployeeId_idx" ON "ProductBatch"("createdByEmployeeId");

-- CreateIndex
CREATE INDEX "Product_batchId_batchItemNumber_idx" ON "Product"("batchId", "batchItemNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Product_batchId_batchItemNumber_key" ON "Product"("batchId", "batchItemNumber");

-- AddForeignKey
ALTER TABLE "ProductBatch" ADD CONSTRAINT "ProductBatch_createdByEmployeeId_fkey" FOREIGN KEY ("createdByEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ProductBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
