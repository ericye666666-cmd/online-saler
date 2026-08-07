ALTER TABLE "ProductMeasurement"
  ADD COLUMN "manualLineImageId" TEXT,
  ADD COLUMN "manualLineStartX" DECIMAL(5,4),
  ADD COLUMN "manualLineStartY" DECIMAL(5,4),
  ADD COLUMN "manualLineEndX" DECIMAL(5,4),
  ADD COLUMN "manualLineEndY" DECIMAL(5,4);
