-- The launch commission rate is 25% (2500 bps) since 2026-09-15, but
-- commissions recorded before that were written at the old rate. The owner
-- decided on 2026-09-26 to restate them at 25%; none had been paid out yet.
--
-- Only unpaid commissions (PENDING, CONFIRMED) are restated: a PAID row records
-- what was actually paid, and a REJECTED row earns nothing. Amounts scale by
-- the rate, so rows reduced by a partial return keep their proportion, and are
-- capped at 25% of the order subtotal so they stay within the policy check
-- (amount <= subtotal * rate). Rerunning it changes nothing.
UPDATE "Commission"
SET "commissionAmountKsh" = LEAST(
      ROUND("commissionAmountKsh" * 2500.0 / "rateBps"),
      ROUND("orderSubtotalKsh" * 0.25)
    )::int,
    "rateBps" = 2500,
    "updatedAt" = now()
WHERE status IN ('PENDING', 'CONFIRMED')
  AND "rateBps" > 0
  AND "rateBps" < 2500;
