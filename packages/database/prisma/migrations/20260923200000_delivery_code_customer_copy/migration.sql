-- The delivery code, readable, for the customer's own order page.
--
-- The hash stays and is still the only thing verification reads. This column
-- exists because the SMS provider is not live: a code that only the customer's
-- inbox could hold is, without an inbox, a code that reaches nobody and an
-- order that can never be completed. Redacted from every operations and rider
-- response.
ALTER TABLE "OrderFulfillment" ADD COLUMN IF NOT EXISTS "deliveryCode" TEXT;
