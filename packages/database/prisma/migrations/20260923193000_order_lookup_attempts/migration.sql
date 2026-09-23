-- Rate-limit ledger for the customer order lookup.
--
-- The lookup lets someone who lost their browser cookie reach their order again
-- with a phone number and an order number. That makes it the only place an
-- unauthenticated caller can probe for an order, so attempts are counted in the
-- database rather than in one server's memory — Cloud Run runs several
-- instances and restarts them freely, and an in-memory ceiling would be no
-- ceiling at all.
--
-- The order number tried is deliberately not stored: a table of guessed order
-- numbers would be a better attack surface than the thing it protects.
CREATE TABLE "OrderLookupAttempt" (
  "id" TEXT NOT NULL,
  "normalizedPhone" TEXT NOT NULL,
  "callerHash" TEXT,
  "succeeded" BOOLEAN NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "OrderLookupAttempt_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OrderLookupAttempt_normalizedPhone_createdAt_idx" ON "OrderLookupAttempt"("normalizedPhone", "createdAt");
CREATE INDEX "OrderLookupAttempt_callerHash_createdAt_idx" ON "OrderLookupAttempt"("callerHash", "createdAt");
