-- The two states a failed delivery passes through on its way back to the store.
-- PostgreSQL requires a newly-added enum value to be committed before another
-- transaction can write it, so these land on their own ahead of the columns and
-- tables that use them.
--
-- Both AFTER anchors name 'OUT_FOR_DELIVERY', a label that already exists, so
-- nothing here depends on a value added earlier in the same transaction. The
-- statements are written in reverse of the reading order they produce:
-- ... OUT_FOR_DELIVERY, DELIVERY_FAILED, RETURNING_TO_NODE, COMPLETED ...
ALTER TYPE "FulfillmentStatus" ADD VALUE IF NOT EXISTS 'RETURNING_TO_NODE' AFTER 'OUT_FOR_DELIVERY';
ALTER TYPE "FulfillmentStatus" ADD VALUE IF NOT EXISTS 'DELIVERY_FAILED' AFTER 'OUT_FOR_DELIVERY';
