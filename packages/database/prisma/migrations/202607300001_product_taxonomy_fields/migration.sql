ALTER TABLE "Product"
ADD COLUMN "subcategory" TEXT,
ADD COLUMN "kidsAgeRange" TEXT;

CREATE INDEX "Product_category_subcategory_idx" ON "Product"("category", "subcategory");
CREATE INDEX "Product_gender_kidsAgeRange_idx" ON "Product"("gender", "kidsAgeRange");
