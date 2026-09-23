-- The states the 50% deposit plan adds to three existing enums.
-- PostgreSQL requires a newly-added enum value to be committed before another
-- transaction can write it, so these land on their own ahead of the columns
-- that use them.
--
-- Each AFTER anchor names a label that already exists, so nothing here depends
-- on a value added earlier in the same transaction. The order statements are
-- written in reverse of the reading order they produce:
-- ... PAYMENT_PROCESSING, DEPOSIT_PAID, DEPOSIT_EXPIRED, PAID ...
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'DEPOSIT_EXPIRED' AFTER 'PAYMENT_PROCESSING';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'DEPOSIT_PAID' AFTER 'PAYMENT_PROCESSING';

-- A garment held by a paid deposit is not a five-minute cart lock. The
-- warehouse must be able to tell them apart: one expires on its own, the other
-- has a customer's money against it and must never be sold over the counter.
ALTER TYPE "InventoryItemStatus" ADD VALUE IF NOT EXISTS 'DEPOSIT_HELD' AFTER 'RESERVED';

ALTER TYPE "RefundKind" ADD VALUE IF NOT EXISTS 'LAPSED_DEPOSIT' AFTER 'OVERPAYMENT';
