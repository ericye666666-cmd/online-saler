-- The owner widened returns on 2026-09-26: a customer who is simply not
-- satisfied may bring the parcel back to a store within 3 days for an M-Pesa
-- refund. That needs its own reason value; the five existing reasons stay.
-- On its own so the new label is committed before anything writes it.
ALTER TYPE "AfterSaleReturnReason" ADD VALUE IF NOT EXISTS 'NOT_SATISFIED';
