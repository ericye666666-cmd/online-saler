CREATE TYPE "ProductDetailStatus" AS ENUM ('PENDING', 'GENERATING', 'READY', 'FAILED', 'OUTDATED', 'APPROVED');
CREATE TYPE "ProductDetailAssetType" AS ENUM ('FRONT_MAIN', 'BACK_MAIN', 'MEASUREMENT_GUIDE', 'FIT_GUIDE', 'CONDITION_GUIDE', 'SHARE_CARD');

ALTER TABLE "Product" ADD COLUMN "detailSourceVersion" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "ProductDetailProfile" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "status" "ProductDetailStatus" NOT NULL DEFAULT 'PENDING',
    "fitType" "ProductFitType",
    "stretchLevel" "ProductStretchLevel",
    "fabricWeight" "ProductFabricWeight",
    "bodyChestMinCm" DECIMAL(6,2),
    "bodyChestMaxCm" DECIMAL(6,2),
    "bodyWaistMinCm" DECIMAL(6,2),
    "bodyWaistMaxCm" DECIMAL(6,2),
    "bodyHipMinCm" DECIMAL(6,2),
    "bodyHipMaxCm" DECIMAL(6,2),
    "heightMinCm" DECIMAL(6,2),
    "heightMaxCm" DECIMAL(6,2),
    "weightMinKg" DECIMAL(6,2),
    "weightMaxKg" DECIMAL(6,2),
    "expectedFit" TEXT,
    "recommendationConfidence" DECIMAL(4,3),
    "recommendationBasis" JSONB,
    "recommendationWarnings" JSONB,
    "sellingPointsJson" JSONB,
    "customerDescription" TEXT,
    "fitSummary" TEXT,
    "measurementSummary" TEXT,
    "conditionSummary" TEXT,
    "sizeDisclaimer" TEXT,
    "styleTagsJson" JSONB,
    "missingInformationJson" JSONB,
    "warningsJson" JSONB,
    "generatedByModel" TEXT,
    "promptVersion" TEXT,
    "rawOutputJson" JSONB,
    "finalOutputJson" JSONB,
    "sourceDataVersion" INTEGER NOT NULL,
    "contentVersion" INTEGER NOT NULL DEFAULT 0,
    "approvedAt" TIMESTAMP(3),
    "approvedByEmployeeId" TEXT,
    "outdatedReason" TEXT,
    "outdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProductDetailProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProductDetailAsset" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "detailProfileId" TEXT NOT NULL,
    "type" "ProductDetailAssetType" NOT NULL,
    "status" "ProductDetailStatus" NOT NULL DEFAULT 'PENDING',
    "storageUrl" TEXT,
    "publicUrl" TEXT,
    "mimeType" TEXT,
    "widthPx" INTEGER,
    "heightPx" INTEGER,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "templateVersion" TEXT,
    "sourceDataVersion" INTEGER NOT NULL,
    "failureCode" TEXT,
    "errorMessage" TEXT,
    "outdatedReason" TEXT,
    "outdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProductDetailAsset_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProductDetailGenerationJob" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "batchId" TEXT,
    "detailProfileId" TEXT NOT NULL,
    "status" "ProductDetailStatus" NOT NULL DEFAULT 'PENDING',
    "sourceDataVersion" INTEGER NOT NULL,
    "provider" TEXT,
    "model" TEXT,
    "promptVersion" TEXT,
    "requestJson" JSONB,
    "rawOutputJson" JSONB,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "failureCode" TEXT,
    "errorMessage" TEXT,
    "outdatedReason" TEXT,
    "outdatedAt" TIMESTAMP(3),
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "estimatedCostUsd" DECIMAL(10,6),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProductDetailGenerationJob_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProductDetailProfile_status_updatedAt_idx" ON "ProductDetailProfile"("status", "updatedAt");
CREATE INDEX "ProductDetailProfile_sourceDataVersion_idx" ON "ProductDetailProfile"("sourceDataVersion");
CREATE UNIQUE INDEX "ProductDetailProfile_productId_sourceDataVersion_key" ON "ProductDetailProfile"("productId", "sourceDataVersion");
CREATE UNIQUE INDEX "ProductDetailAsset_detailProfileId_type_locale_key" ON "ProductDetailAsset"("detailProfileId", "type", "locale");
CREATE INDEX "ProductDetailAsset_productId_status_updatedAt_idx" ON "ProductDetailAsset"("productId", "status", "updatedAt");
CREATE INDEX "ProductDetailAsset_sourceDataVersion_idx" ON "ProductDetailAsset"("sourceDataVersion");
CREATE UNIQUE INDEX "ProductDetailGenerationJob_productId_sourceDataVersion_key" ON "ProductDetailGenerationJob"("productId", "sourceDataVersion");
CREATE INDEX "ProductDetailGenerationJob_batchId_status_createdAt_idx" ON "ProductDetailGenerationJob"("batchId", "status", "createdAt");
CREATE INDEX "ProductDetailGenerationJob_status_createdAt_idx" ON "ProductDetailGenerationJob"("status", "createdAt");

ALTER TABLE "ProductDetailProfile" ADD CONSTRAINT "ProductDetailProfile_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductDetailAsset" ADD CONSTRAINT "ProductDetailAsset_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductDetailAsset" ADD CONSTRAINT "ProductDetailAsset_detailProfileId_fkey" FOREIGN KEY ("detailProfileId") REFERENCES "ProductDetailProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductDetailGenerationJob" ADD CONSTRAINT "ProductDetailGenerationJob_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductDetailGenerationJob" ADD CONSTRAINT "ProductDetailGenerationJob_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ProductBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProductDetailGenerationJob" ADD CONSTRAINT "ProductDetailGenerationJob_detailProfileId_fkey" FOREIGN KEY ("detailProfileId") REFERENCES "ProductDetailProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
