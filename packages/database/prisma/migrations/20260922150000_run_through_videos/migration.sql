-- Run-through videos: which pieces each affiliate video showed, so pieces can
-- be shown evenly across affiliates.
CREATE TABLE "RunThroughVideo" (
    "id" TEXT NOT NULL,
    "affiliateId" TEXT NOT NULL,
    "category" TEXT,
    "status" "AffiliateAssetStatus" NOT NULL DEFAULT 'PROCESSING',
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RunThroughVideo_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RunThroughVideoItem" (
    "videoId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "RunThroughVideoItem_pkey" PRIMARY KEY ("videoId","productId")
);

CREATE INDEX "RunThroughVideo_affiliateId_createdAt_idx" ON "RunThroughVideo"("affiliateId", "createdAt");
CREATE INDEX "RunThroughVideoItem_productId_idx" ON "RunThroughVideoItem"("productId");

ALTER TABLE "RunThroughVideo" ADD CONSTRAINT "RunThroughVideo_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RunThroughVideoItem" ADD CONSTRAINT "RunThroughVideoItem_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "RunThroughVideo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RunThroughVideoItem" ADD CONSTRAINT "RunThroughVideoItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
