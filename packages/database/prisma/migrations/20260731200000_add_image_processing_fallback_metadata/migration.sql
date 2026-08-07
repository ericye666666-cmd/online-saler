ALTER TABLE "ProductImageProcessingJob"
ADD COLUMN "qualityScore" DOUBLE PRECISION,
ADD COLUMN "qualityIssues" JSONB,
ADD COLUMN "fallbackFrom" TEXT,
ADD COLUMN "fallbackReason" TEXT;
