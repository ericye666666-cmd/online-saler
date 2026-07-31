-- CreateEnum
CREATE TYPE "ProductImageVariant" AS ENUM ('ORIGINAL', 'CUTOUT_TRANSPARENT', 'CUTOUT_WHITE', 'OPTIMIZED_MAIN');

-- CreateEnum
CREATE TYPE "ImageProcessingOperation" AS ENUM ('REMOVE_BACKGROUND', 'COMPOSE_WHITE_BACKGROUND', 'OPTIMIZE_MAIN_IMAGE');

-- CreateEnum
CREATE TYPE "ImageProcessingStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateTable
CREATE TABLE "ProductImageVariantAsset" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sourceImageId" TEXT NOT NULL,
    "variant" "ProductImageVariant" NOT NULL,
    "storageUrl" TEXT NOT NULL,
    "publicUrl" TEXT,
    "widthPx" INTEGER,
    "heightPx" INTEGER,
    "mimeType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductImageVariantAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductImageProcessingJob" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sourceImageId" TEXT NOT NULL,
    "operation" "ImageProcessingOperation" NOT NULL,
    "targetVariant" "ProductImageVariant" NOT NULL,
    "status" "ImageProcessingStatus" NOT NULL DEFAULT 'PENDING',
    "provider" TEXT,
    "processorVersion" TEXT,
    "outputImageId" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "retryReason" TEXT,
    "failureCode" TEXT,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductImageProcessingJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductMainImageSelection" (
    "productId" TEXT NOT NULL,
    "selectedImageId" TEXT NOT NULL,
    "variant" "ProductImageVariant" NOT NULL,
    "selectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductMainImageSelection_pkey" PRIMARY KEY ("productId")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductImageVariantAsset_productId_sourceImageId_variant_key" ON "ProductImageVariantAsset"("productId", "sourceImageId", "variant");

-- CreateIndex
CREATE INDEX "ProductImageVariantAsset_productId_variant_createdAt_idx" ON "ProductImageVariantAsset"("productId", "variant", "createdAt");

-- CreateIndex
CREATE INDEX "ProductImageVariantAsset_sourceImageId_idx" ON "ProductImageVariantAsset"("sourceImageId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductImageProcessingJob_outputImageId_key" ON "ProductImageProcessingJob"("outputImageId");

-- CreateIndex
CREATE INDEX "ProductImageProcessingJob_productId_status_createdAt_idx" ON "ProductImageProcessingJob"("productId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ProductImageProcessingJob_sourceImageId_operation_createdAt_idx" ON "ProductImageProcessingJob"("sourceImageId", "operation", "createdAt");

-- CreateIndex
CREATE INDEX "ProductMainImageSelection_selectedImageId_idx" ON "ProductMainImageSelection"("selectedImageId");
