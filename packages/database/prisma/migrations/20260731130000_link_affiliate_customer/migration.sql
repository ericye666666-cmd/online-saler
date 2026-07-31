ALTER TABLE "Affiliate" ADD COLUMN "customerId" TEXT;

CREATE UNIQUE INDEX "Affiliate_customerId_key" ON "Affiliate"("customerId");

ALTER TABLE "Affiliate"
  ADD CONSTRAINT "Affiliate_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
