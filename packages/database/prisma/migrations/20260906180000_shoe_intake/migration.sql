-- Shoe intake is additive; existing apparel batches and products keep their behavior.
ALTER TABLE "Product"
  ADD COLUMN "shoeSizeSystem" TEXT,
  ADD COLUMN "shoeType" TEXT,
  ADD COLUMN "shoePairConfirmed" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "shoeConditionNotes" TEXT;

ALTER TABLE "ProductBatch" ADD COLUMN "intakeCategory" TEXT;
