-- Guest checkout: an M-Pesa phone number is enough to place an order.
-- Google sign-in stays available but is no longer required, so the columns it
-- used to guarantee become optional.
ALTER TABLE "Customer" ALTER COLUMN "googleSubjectId" DROP NOT NULL;
ALTER TABLE "Customer" ALTER COLUMN "email" DROP NOT NULL;
ALTER TABLE "Customer" ALTER COLUMN "normalizedEmail" DROP NOT NULL;

-- Only guest records ever carry normalizedPhone. Existing accounts are left
-- without one on purpose: an unauthenticated checkout must never be able to
-- attach an order, or write a delivery address, onto somebody's account just
-- because the shopper typed that account's M-Pesa number.
ALTER TABLE "Customer" ADD COLUMN "normalizedPhone" TEXT;

CREATE UNIQUE INDEX "Customer_normalizedPhone_key" ON "Customer"("normalizedPhone");
