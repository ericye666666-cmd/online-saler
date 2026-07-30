-- CreateEnum
CREATE TYPE "AffiliateStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "AffiliateLinkType" AS ENUM ('STORE', 'PRODUCT');

-- CreateEnum
CREATE TYPE "CommissionStatus" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED', 'PAID');

-- CreateTable
CREATE TABLE "Affiliate" (
    "id" TEXT NOT NULL,
    "affiliateCode" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "status" "AffiliateStatus" NOT NULL DEFAULT 'ACTIVE',
    "commissionRateBps" INTEGER,
    "disabledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Affiliate_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Order"
ADD COLUMN "affiliateId" TEXT,
ADD COLUMN "affiliateSource" TEXT,
ADD COLUMN "affiliateCampaign" TEXT;

-- CreateTable
CREATE TABLE "AffiliateLink" (
    "id" TEXT NOT NULL,
    "affiliateId" TEXT NOT NULL,
    "linkCode" TEXT NOT NULL,
    "type" "AffiliateLinkType" NOT NULL DEFAULT 'STORE',
    "productId" TEXT,
    "landingPath" TEXT NOT NULL,
    "source" TEXT,
    "campaign" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AffiliateLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AffiliateClick" (
    "id" TEXT NOT NULL,
    "affiliateId" TEXT NOT NULL,
    "affiliateLinkId" TEXT,
    "productId" TEXT,
    "customerId" TEXT,
    "sessionId" TEXT,
    "source" TEXT,
    "campaign" TEXT,
    "landingPath" TEXT NOT NULL,
    "referrer" TEXT,
    "userAgent" TEXT,
    "ipHash" TEXT,
    "clickedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AffiliateClick_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AffiliateAttribution" (
    "id" TEXT NOT NULL,
    "affiliateId" TEXT NOT NULL,
    "affiliateClickId" TEXT,
    "customerId" TEXT NOT NULL,
    "orderId" TEXT,
    "source" TEXT,
    "campaign" TEXT,
    "attributedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AffiliateAttribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Commission" (
    "id" TEXT NOT NULL,
    "affiliateId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "attributionId" TEXT,
    "status" "CommissionStatus" NOT NULL DEFAULT 'PENDING',
    "rateBps" INTEGER NOT NULL,
    "orderSubtotalKsh" INTEGER NOT NULL,
    "commissionAmountKsh" INTEGER NOT NULL,
    "eligibleAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "holdReason" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Commission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Affiliate_affiliateCode_key" ON "Affiliate"("affiliateCode");
CREATE INDEX "Affiliate_status_createdAt_idx" ON "Affiliate"("status", "createdAt");
CREATE INDEX "Affiliate_phone_idx" ON "Affiliate"("phone");
CREATE INDEX "Affiliate_email_idx" ON "Affiliate"("email");

CREATE INDEX "Order_affiliateId_createdAt_idx" ON "Order"("affiliateId", "createdAt");

CREATE UNIQUE INDEX "AffiliateLink_linkCode_key" ON "AffiliateLink"("linkCode");
CREATE INDEX "AffiliateLink_affiliateId_type_createdAt_idx" ON "AffiliateLink"("affiliateId", "type", "createdAt");
CREATE INDEX "AffiliateLink_productId_idx" ON "AffiliateLink"("productId");
CREATE INDEX "AffiliateLink_source_campaign_idx" ON "AffiliateLink"("source", "campaign");

CREATE INDEX "AffiliateClick_affiliateId_clickedAt_idx" ON "AffiliateClick"("affiliateId", "clickedAt");
CREATE INDEX "AffiliateClick_customerId_clickedAt_idx" ON "AffiliateClick"("customerId", "clickedAt");
CREATE INDEX "AffiliateClick_sessionId_clickedAt_idx" ON "AffiliateClick"("sessionId", "clickedAt");
CREATE INDEX "AffiliateClick_source_campaign_idx" ON "AffiliateClick"("source", "campaign");

CREATE UNIQUE INDEX "AffiliateAttribution_affiliateClickId_key" ON "AffiliateAttribution"("affiliateClickId");
CREATE UNIQUE INDEX "AffiliateAttribution_orderId_key" ON "AffiliateAttribution"("orderId");
CREATE INDEX "AffiliateAttribution_affiliateId_attributedAt_idx" ON "AffiliateAttribution"("affiliateId", "attributedAt");
CREATE INDEX "AffiliateAttribution_customerId_expiresAt_idx" ON "AffiliateAttribution"("customerId", "expiresAt");

CREATE UNIQUE INDEX "Commission_orderId_key" ON "Commission"("orderId");
CREATE UNIQUE INDEX "Commission_attributionId_key" ON "Commission"("attributionId");
CREATE INDEX "Commission_affiliateId_status_createdAt_idx" ON "Commission"("affiliateId", "status", "createdAt");
CREATE INDEX "Commission_status_eligibleAt_idx" ON "Commission"("status", "eligibleAt");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AffiliateLink" ADD CONSTRAINT "AffiliateLink_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AffiliateLink" ADD CONSTRAINT "AffiliateLink_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AffiliateClick" ADD CONSTRAINT "AffiliateClick_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AffiliateClick" ADD CONSTRAINT "AffiliateClick_affiliateLinkId_fkey" FOREIGN KEY ("affiliateLinkId") REFERENCES "AffiliateLink"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AffiliateClick" ADD CONSTRAINT "AffiliateClick_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AffiliateClick" ADD CONSTRAINT "AffiliateClick_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AffiliateAttribution" ADD CONSTRAINT "AffiliateAttribution_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AffiliateAttribution" ADD CONSTRAINT "AffiliateAttribution_affiliateClickId_fkey" FOREIGN KEY ("affiliateClickId") REFERENCES "AffiliateClick"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AffiliateAttribution" ADD CONSTRAINT "AffiliateAttribution_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AffiliateAttribution" ADD CONSTRAINT "AffiliateAttribution_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Commission" ADD CONSTRAINT "Commission_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Commission" ADD CONSTRAINT "Commission_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Commission" ADD CONSTRAINT "Commission_attributionId_fkey" FOREIGN KEY ("attributionId") REFERENCES "AffiliateAttribution"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Affiliate invariants
ALTER TABLE "Affiliate" ADD CONSTRAINT "Affiliate_commissionRateBps_check" CHECK ("commissionRateBps" IS NULL OR ("commissionRateBps" >= 0 AND "commissionRateBps" <= 5000));
ALTER TABLE "Commission" ADD CONSTRAINT "Commission_rateBps_check" CHECK ("rateBps" >= 0 AND "rateBps" <= 5000);
ALTER TABLE "Commission" ADD CONSTRAINT "Commission_orderSubtotalKsh_check" CHECK ("orderSubtotalKsh" >= 0);
ALTER TABLE "Commission" ADD CONSTRAINT "Commission_commissionAmountKsh_check" CHECK ("commissionAmountKsh" >= 0);

-- Default configurable commission rate: 10% in basis points.
INSERT INTO "SystemSetting" ("key", "valueJson", "scope", "createdAt", "updatedAt")
VALUES ('affiliate.defaultCommissionRateBps', '1000'::jsonb, 'GLOBAL', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
