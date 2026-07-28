-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('DRAFT', 'PHOTOGRAPHED', 'AI_PROCESSING', 'AI_PROCESSED', 'CALIBRATION_PENDING', 'CALIBRATED', 'BARCODE_ASSIGNED', 'REVIEW_PENDING', 'REWORK_REQUIRED', 'APPROVED', 'READY_FOR_STORAGE', 'PUBLISHED', 'UNPUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ProductImageType" AS ENUM ('FRONT', 'BACK', 'LABEL', 'DEFECT', 'DETAIL', 'SOCIAL_CARD');

-- CreateEnum
CREATE TYPE "ProductGender" AS ENUM ('WOMEN', 'MEN', 'KIDS', 'UNISEX');

-- CreateEnum
CREATE TYPE "ConditionGrade" AS ENUM ('LIKE_NEW', 'EXCELLENT', 'GOOD', 'FAIR');

-- CreateEnum
CREATE TYPE "AIExtractionStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "ReviewResult" AS ENUM ('APPROVED', 'REWORK_REQUIRED', 'REJECTED');

-- CreateEnum
CREATE TYPE "MeasurementSource" AS ENUM ('AI_ACCEPTED', 'HUMAN_EDITED', 'HUMAN_ENTERED');

-- CreateEnum
CREATE TYPE "DefectSeverity" AS ENUM ('MINOR', 'MAJOR');

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "productCode" TEXT NOT NULL,
    "barcode" TEXT,
    "status" "ProductStatus" NOT NULL DEFAULT 'DRAFT',
    "title" TEXT,
    "category" TEXT,
    "brand" TEXT,
    "color" TEXT,
    "gender" "ProductGender",
    "tagSize" TEXT,
    "finalSizeLabel" TEXT,
    "conditionGrade" "ConditionGrade",
    "priceKsh" INTEGER,
    "createdByEmployeeId" TEXT,
    "approvedByEmployeeId" TEXT,
    "publishedAt" TIMESTAMP(3),
    "unpublishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductImage" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "type" "ProductImageType" NOT NULL,
    "originalUrl" TEXT NOT NULL,
    "publicUrl" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "uploadedByEmployeeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductMeasurement" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "measurementType" TEXT NOT NULL,
    "aiValueCm" DECIMAL(6,2),
    "aiConfidence" DECIMAL(4,3),
    "finalValueCm" DECIMAL(6,2),
    "finalSource" "MeasurementSource",
    "reviewedByEmployeeId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductMeasurement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIExtraction" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "provider" TEXT,
    "model" TEXT,
    "inputImageIds" JSONB,
    "rawOutputJson" JSONB,
    "normalizedOutputJson" JSONB,
    "status" "AIExtractionStatus" NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "AIExtraction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductDefect" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "defectType" TEXT NOT NULL,
    "severity" "DefectSeverity" NOT NULL,
    "description" TEXT NOT NULL,
    "customerSafeDescription" TEXT,
    "imageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductDefect_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductReview" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "reviewerEmployeeId" TEXT,
    "result" "ReviewResult" NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Product_productCode_key" ON "Product"("productCode");

-- CreateIndex
CREATE UNIQUE INDEX "Product_barcode_key" ON "Product"("barcode");

-- CreateIndex
CREATE INDEX "Product_status_publishedAt_idx" ON "Product"("status", "publishedAt");

-- CreateIndex
CREATE INDEX "Product_category_finalSizeLabel_priceKsh_idx" ON "Product"("category", "finalSizeLabel", "priceKsh");

-- CreateIndex
CREATE INDEX "Product_conditionGrade_idx" ON "Product"("conditionGrade");

-- CreateIndex
CREATE INDEX "ProductImage_productId_type_idx" ON "ProductImage"("productId", "type");

-- CreateIndex
CREATE INDEX "ProductImage_uploadedByEmployeeId_idx" ON "ProductImage"("uploadedByEmployeeId");

-- CreateIndex
CREATE INDEX "ProductMeasurement_measurementType_idx" ON "ProductMeasurement"("measurementType");

-- CreateIndex
CREATE INDEX "ProductMeasurement_reviewedByEmployeeId_idx" ON "ProductMeasurement"("reviewedByEmployeeId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductMeasurement_productId_measurementType_key" ON "ProductMeasurement"("productId", "measurementType");

-- CreateIndex
CREATE INDEX "AIExtraction_productId_status_idx" ON "AIExtraction"("productId", "status");

-- CreateIndex
CREATE INDEX "AIExtraction_createdAt_idx" ON "AIExtraction"("createdAt");

-- CreateIndex
CREATE INDEX "ProductDefect_productId_idx" ON "ProductDefect"("productId");

-- CreateIndex
CREATE INDEX "ProductDefect_defectType_idx" ON "ProductDefect"("defectType");

-- CreateIndex
CREATE INDEX "ProductDefect_imageId_idx" ON "ProductDefect"("imageId");

-- CreateIndex
CREATE INDEX "ProductReview_productId_createdAt_idx" ON "ProductReview"("productId", "createdAt");

-- CreateIndex
CREATE INDEX "ProductReview_reviewerEmployeeId_idx" ON "ProductReview"("reviewerEmployeeId");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_createdByEmployeeId_fkey" FOREIGN KEY ("createdByEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_approvedByEmployeeId_fkey" FOREIGN KEY ("approvedByEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductImage" ADD CONSTRAINT "ProductImage_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductImage" ADD CONSTRAINT "ProductImage_uploadedByEmployeeId_fkey" FOREIGN KEY ("uploadedByEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductMeasurement" ADD CONSTRAINT "ProductMeasurement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductMeasurement" ADD CONSTRAINT "ProductMeasurement_reviewedByEmployeeId_fkey" FOREIGN KEY ("reviewedByEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIExtraction" ADD CONSTRAINT "AIExtraction_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductDefect" ADD CONSTRAINT "ProductDefect_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductDefect" ADD CONSTRAINT "ProductDefect_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "ProductImage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductReview" ADD CONSTRAINT "ProductReview_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductReview" ADD CONSTRAINT "ProductReview_reviewerEmployeeId_fkey" FOREIGN KEY ("reviewerEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

