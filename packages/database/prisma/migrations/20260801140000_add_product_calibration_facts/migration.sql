CREATE TYPE "ProductFitType" AS ENUM ('SLIM', 'REGULAR', 'RELAXED', 'OVERSIZED', 'UNKNOWN');

CREATE TYPE "ProductStretchLevel" AS ENUM ('NONE', 'LOW', 'MEDIUM', 'HIGH', 'UNKNOWN');

CREATE TYPE "ProductFabricWeight" AS ENUM ('LIGHT', 'REGULAR', 'HEAVY', 'UNKNOWN');

ALTER TABLE "Product"
  ADD COLUMN "fitType" "ProductFitType",
  ADD COLUMN "stretchLevel" "ProductStretchLevel",
  ADD COLUMN "fabricWeight" "ProductFabricWeight";
