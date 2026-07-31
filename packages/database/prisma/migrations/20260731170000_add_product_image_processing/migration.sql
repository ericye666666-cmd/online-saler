-- CreateEnum
CREATE TYPE "ProductImageVariant" AS ENUM ('ORIGINAL', 'CUTOUT_TRANSPARENT', 'CUTOUT_WHITE', 'OPTIMIZED_MAIN');

-- CreateEnum
CREATE TYPE "ImageProcessingOperation" AS ENUM ('REMOVE_BACKGROUND', 'COMPOSE_WHITE_BACKGROUND', 'OPTIMIZE_MAIN_IMAGE');

-- CreateEnum
CREATE TYPE "ImageProcessingStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED');

-- AlterTable
ALTER TABLE "Product"
ADD COLUMN "selectedMainImageId" TEXT;

-- AlterTable
ALTER TABLE "ProductImage"
ADD COLUMN "sourceImageId" TEXT,
ADD COLUMN "variant" "ProductImageVariant" NOT NULL DEFAULT 'ORIGINAL',
ADD COLUMN "widthPx" INTEGER,
ADD COLUMN "heightPx" INTEGER,
ADD COLUMN "mimeType" TEXT;

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

-- CreateIndex
CREATE UNIQUE INDEX "Product_selectedMainImageId_key" ON "Product"("selectedMainImageId");

-- CreateIndex
CREATE INDEX "ProductImage_productId_type_variant_idx" ON "ProductImage"("productId", "type", "variant");

-- CreateIndex
CREATE INDEX "ProductImage_sourceImageId_idx" ON "ProductImage"("sourceImageId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductImage_productId_sourceImageId_variant_key" ON "ProductImage"("productId", "sourceImageId", "variant");

-- CreateIndex
CREATE UNIQUE INDEX "ProductImageProcessingJob_outputImageId_key" ON "ProductImageProcessingJob"("outputImageId");

-- CreateIndex
CREATE INDEX "ProductImageProcessingJob_productId_status_createdAt_idx" ON "ProductImageProcessingJob"("productId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ProductImageProcessingJob_sourceImageId_operation_createdAt_idx" ON "ProductImageProcessingJob"("sourceImageId", "operation", "createdAt");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_selectedMainImageId_fkey" FOREIGN KEY ("selectedMainImageId") REFERENCES "ProductImage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductImage" ADD CONSTRAINT "ProductImage_sourceImageId_fkey" FOREIGN KEY ("sourceImageId") REFERENCES "ProductImage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductImageProcessingJob" ADD CONSTRAINT "ProductImageProcessingJob_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductImageProcessingJob" ADD CONSTRAINT "ProductImageProcessingJob_sourceImageId_fkey" FOREIGN KEY ("sourceImageId") REFERENCES "ProductImage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductImageProcessingJob" ADD CONSTRAINT "ProductImageProcessingJob_outputImageId_fkey" FOREIGN KEY ("outputImageId") REFERENCES "ProductImage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
