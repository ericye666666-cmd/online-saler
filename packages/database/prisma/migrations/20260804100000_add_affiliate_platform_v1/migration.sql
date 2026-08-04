-- Affiliate Platform V1 keeps a single Affiliate identity and extends it with
-- levels, public profiles, collections, campaigns, placement attribution, and
-- template-generated share asset records.

CREATE TYPE "AffiliateLevel" AS ENUM ('LEVEL_1', 'LEVEL_2', 'LEVEL_3');
CREATE TYPE "CollectionStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
CREATE TYPE "CampaignChannel" AS ENUM ('WHATSAPP', 'STATUS', 'TIKTOK', 'FACEBOOK');
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');
CREATE TYPE "AffiliateAssetStatus" AS ENUM ('PROCESSING', 'READY', 'FAILED');

ALTER TYPE "AffiliateLinkType" ADD VALUE 'COLLECTION';

ALTER TABLE "Affiliate"
  ADD COLUMN "slug" TEXT,
  ADD COLUMN "bio" TEXT,
  ADD COLUMN "level" "AffiliateLevel" NOT NULL DEFAULT 'LEVEL_1';

UPDATE "Affiliate"
SET "slug" = lower(regexp_replace("affiliateCode", '[^a-zA-Z0-9]+', '-', 'g'))
  || '-' || lower(substr(replace("id", '-', ''), 1, 8));

ALTER TABLE "Affiliate" ALTER COLUMN "slug" SET NOT NULL;
CREATE UNIQUE INDEX "Affiliate_slug_key" ON "Affiliate"("slug");

ALTER TABLE "Order" ADD COLUMN "affiliatePlacement" TEXT;

ALTER TABLE "AffiliateLink"
  ADD COLUMN "collectionId" TEXT,
  ADD COLUMN "placement" TEXT;

ALTER TABLE "AffiliateClick"
  ADD COLUMN "collectionId" TEXT,
  ADD COLUMN "placement" TEXT;

ALTER TABLE "AffiliateAttribution" ADD COLUMN "placement" TEXT;

CREATE TABLE "Collection" (
  "id" TEXT NOT NULL,
  "affiliateId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "coverImage" TEXT,
  "description" TEXT,
  "status" "CollectionStatus" NOT NULL DEFAULT 'DRAFT',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Collection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CollectionItem" (
  "collectionId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CollectionItem_pkey" PRIMARY KEY ("collectionId", "productId")
);

CREATE TABLE "Campaign" (
  "id" TEXT NOT NULL,
  "affiliateId" TEXT NOT NULL,
  "collectionId" TEXT,
  "title" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "channel" "CampaignChannel" NOT NULL,
  "source" TEXT NOT NULL,
  "placement" TEXT NOT NULL,
  "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ShareCard" (
  "id" TEXT NOT NULL,
  "affiliateId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "campaignId" TEXT,
  "affiliateLink" TEXT NOT NULL,
  "storageObjectKey" TEXT,
  "publicUrl" TEXT,
  "width" INTEGER NOT NULL DEFAULT 1200,
  "height" INTEGER NOT NULL DEFAULT 630,
  "status" "AffiliateAssetStatus" NOT NULL DEFAULT 'PROCESSING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ShareCard_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StatusPack" (
  "id" TEXT NOT NULL,
  "affiliateId" TEXT NOT NULL,
  "collectionId" TEXT NOT NULL,
  "campaignId" TEXT,
  "itemCount" INTEGER NOT NULL,
  "pageCount" INTEGER NOT NULL,
  "affiliateLink" TEXT NOT NULL,
  "storageObjectKey" TEXT,
  "publicUrl" TEXT,
  "status" "AffiliateAssetStatus" NOT NULL DEFAULT 'PROCESSING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StatusPack_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TikTokVideo" (
  "id" TEXT NOT NULL,
  "affiliateId" TEXT NOT NULL,
  "collectionId" TEXT NOT NULL,
  "campaignId" TEXT,
  "durationSeconds" INTEGER NOT NULL DEFAULT 12,
  "affiliateLink" TEXT NOT NULL,
  "storageObjectKey" TEXT,
  "publicUrl" TEXT,
  "status" "AffiliateAssetStatus" NOT NULL DEFAULT 'PROCESSING',
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TikTokVideo_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Collection_slug_key" ON "Collection"("slug");
CREATE INDEX "Collection_affiliateId_status_updatedAt_idx" ON "Collection"("affiliateId", "status", "updatedAt");
CREATE INDEX "CollectionItem_productId_idx" ON "CollectionItem"("productId");
CREATE INDEX "CollectionItem_collectionId_sortOrder_idx" ON "CollectionItem"("collectionId", "sortOrder");
CREATE UNIQUE INDEX "Campaign_affiliateId_slug_key" ON "Campaign"("affiliateId", "slug");
CREATE INDEX "Campaign_affiliateId_status_createdAt_idx" ON "Campaign"("affiliateId", "status", "createdAt");
CREATE INDEX "Campaign_collectionId_idx" ON "Campaign"("collectionId");
CREATE INDEX "ShareCard_affiliateId_createdAt_idx" ON "ShareCard"("affiliateId", "createdAt");
CREATE INDEX "ShareCard_productId_createdAt_idx" ON "ShareCard"("productId", "createdAt");
CREATE INDEX "StatusPack_affiliateId_createdAt_idx" ON "StatusPack"("affiliateId", "createdAt");
CREATE INDEX "StatusPack_collectionId_createdAt_idx" ON "StatusPack"("collectionId", "createdAt");
CREATE INDEX "TikTokVideo_affiliateId_createdAt_idx" ON "TikTokVideo"("affiliateId", "createdAt");
CREATE INDEX "TikTokVideo_collectionId_createdAt_idx" ON "TikTokVideo"("collectionId", "createdAt");
CREATE INDEX "AffiliateLink_collectionId_idx" ON "AffiliateLink"("collectionId");
DROP INDEX "AffiliateLink_source_campaign_idx";
CREATE INDEX "AffiliateLink_source_placement_campaign_idx" ON "AffiliateLink"("source", "placement", "campaign");
CREATE INDEX "AffiliateClick_collectionId_clickedAt_idx" ON "AffiliateClick"("collectionId", "clickedAt");
DROP INDEX "AffiliateClick_source_campaign_idx";
CREATE INDEX "AffiliateClick_source_placement_campaign_idx" ON "AffiliateClick"("source", "placement", "campaign");

ALTER TABLE "Collection" ADD CONSTRAINT "Collection_affiliateId_fkey"
  FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CollectionItem" ADD CONSTRAINT "CollectionItem_collectionId_fkey"
  FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CollectionItem" ADD CONSTRAINT "CollectionItem_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_affiliateId_fkey"
  FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_collectionId_fkey"
  FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AffiliateLink" ADD CONSTRAINT "AffiliateLink_collectionId_fkey"
  FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AffiliateClick" ADD CONSTRAINT "AffiliateClick_collectionId_fkey"
  FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ShareCard" ADD CONSTRAINT "ShareCard_affiliateId_fkey"
  FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShareCard" ADD CONSTRAINT "ShareCard_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShareCard" ADD CONSTRAINT "ShareCard_campaignId_fkey"
  FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StatusPack" ADD CONSTRAINT "StatusPack_affiliateId_fkey"
  FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StatusPack" ADD CONSTRAINT "StatusPack_collectionId_fkey"
  FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StatusPack" ADD CONSTRAINT "StatusPack_campaignId_fkey"
  FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TikTokVideo" ADD CONSTRAINT "TikTokVideo_affiliateId_fkey"
  FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TikTokVideo" ADD CONSTRAINT "TikTokVideo_collectionId_fkey"
  FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TikTokVideo" ADD CONSTRAINT "TikTokVideo_campaignId_fkey"
  FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CollectionItem" ADD CONSTRAINT "CollectionItem_sortOrder_check" CHECK ("sortOrder" >= 0);
ALTER TABLE "ShareCard" ADD CONSTRAINT "ShareCard_dimensions_check" CHECK ("width" = 1200 AND "height" = 630);
ALTER TABLE "StatusPack" ADD CONSTRAINT "StatusPack_itemCount_check" CHECK ("itemCount" IN (4, 6, 8));
ALTER TABLE "StatusPack" ADD CONSTRAINT "StatusPack_pageCount_check" CHECK ("pageCount" IN (4, 6, 8));
ALTER TABLE "TikTokVideo" ADD CONSTRAINT "TikTokVideo_duration_check" CHECK ("durationSeconds" BETWEEN 10 AND 15);
