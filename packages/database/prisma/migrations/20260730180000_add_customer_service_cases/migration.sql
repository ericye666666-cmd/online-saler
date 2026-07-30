-- CreateEnum
CREATE TYPE "CustomerServiceCaseStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "CustomerServiceIssueType" AS ENUM ('PAYMENT', 'PICKUP', 'DELIVERY', 'AFTER_SALE', 'ORDER', 'OTHER');

-- CreateTable
CREATE TABLE "CustomerServiceCase" (
    "id" TEXT NOT NULL,
    "customerId" TEXT,
    "orderId" TEXT,
    "issueType" "CustomerServiceIssueType" NOT NULL DEFAULT 'OTHER',
    "status" "CustomerServiceCaseStatus" NOT NULL DEFAULT 'OPEN',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "tags" JSONB,
    "createdByAdminUserId" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerServiceCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerServiceNote" (
    "id" TEXT NOT NULL,
    "caseId" TEXT,
    "customerId" TEXT,
    "orderId" TEXT,
    "authorAdminUserId" TEXT,
    "body" TEXT NOT NULL,
    "tags" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerServiceNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerServiceCase_status_issueType_updatedAt_idx" ON "CustomerServiceCase"("status", "issueType", "updatedAt");
CREATE INDEX "CustomerServiceCase_customerId_createdAt_idx" ON "CustomerServiceCase"("customerId", "createdAt");
CREATE INDEX "CustomerServiceCase_orderId_createdAt_idx" ON "CustomerServiceCase"("orderId", "createdAt");
CREATE INDEX "CustomerServiceCase_createdByAdminUserId_createdAt_idx" ON "CustomerServiceCase"("createdByAdminUserId", "createdAt");

CREATE INDEX "CustomerServiceNote_caseId_createdAt_idx" ON "CustomerServiceNote"("caseId", "createdAt");
CREATE INDEX "CustomerServiceNote_customerId_createdAt_idx" ON "CustomerServiceNote"("customerId", "createdAt");
CREATE INDEX "CustomerServiceNote_orderId_createdAt_idx" ON "CustomerServiceNote"("orderId", "createdAt");
CREATE INDEX "CustomerServiceNote_authorAdminUserId_createdAt_idx" ON "CustomerServiceNote"("authorAdminUserId", "createdAt");

-- AddForeignKey
ALTER TABLE "CustomerServiceCase" ADD CONSTRAINT "CustomerServiceCase_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CustomerServiceCase" ADD CONSTRAINT "CustomerServiceCase_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CustomerServiceCase" ADD CONSTRAINT "CustomerServiceCase_createdByAdminUserId_fkey" FOREIGN KEY ("createdByAdminUserId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CustomerServiceNote" ADD CONSTRAINT "CustomerServiceNote_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "CustomerServiceCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerServiceNote" ADD CONSTRAINT "CustomerServiceNote_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CustomerServiceNote" ADD CONSTRAINT "CustomerServiceNote_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CustomerServiceNote" ADD CONSTRAINT "CustomerServiceNote_authorAdminUserId_fkey" FOREIGN KEY ("authorAdminUserId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
