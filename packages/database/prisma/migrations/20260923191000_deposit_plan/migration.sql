-- The 50% deposit plan: half the total holds the garment for seven days, the
-- balance completes the sale.
--
-- Every change is additive. The two new NOT NULL columns on "Order" carry a
-- zero default, and "paymentPlan" defaults to FULL, so every existing order
-- keeps behaving exactly as it did — one payment for the whole total.
--
-- "RefundRequest"."requestedByAdminUserId" relaxes from NOT NULL to nullable.
-- That widens what the column accepts and rejects nothing that is already
-- stored, so no existing row is touched and the change is safe to run while
-- the site is serving. A lapsed deposit is raised by the expiry sweep, which
-- runs on a timer with no person at a desk to attribute it to.

-- CreateEnum
CREATE TYPE "OrderPaymentPlan" AS ENUM ('FULL', 'DEPOSIT_50');
CREATE TYPE "PaymentKind" AS ENUM ('FULL', 'DEPOSIT', 'BALANCE');

-- AlterTable: the order remembers which plan it was bought on, what each leg
-- is worth, and when the hold runs out. depositKsh/balanceKsh are frozen at
-- checkout so a later price edit cannot move what the shopper still owes.
ALTER TABLE "Order"
  ADD COLUMN "paymentPlan" "OrderPaymentPlan" NOT NULL DEFAULT 'FULL',
  ADD COLUMN "depositKsh" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "balanceKsh" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "depositPaidAt" TIMESTAMP(3),
  ADD COLUMN "balanceDueAt" TIMESTAMP(3);

-- Drives the sweep that releases garments whose balance never arrived.
CREATE INDEX "Order_status_balanceDueAt_idx" ON "Order"("status", "balanceDueAt");

-- AlterTable: which leg of the order a payment is. Existing payments are all
-- single full payments, which is what the default records.
ALTER TABLE "Payment"
  ADD COLUMN "kind" "PaymentKind" NOT NULL DEFAULT 'FULL';

CREATE INDEX "Payment_orderId_kind_status_idx" ON "Payment"("orderId", "kind", "status");

-- AlterTable: the expiry sweep raises its own refund request.
ALTER TABLE "RefundRequest"
  ALTER COLUMN "requestedByAdminUserId" DROP NOT NULL;
