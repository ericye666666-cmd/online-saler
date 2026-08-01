-- PostgreSQL requires newly-added enum values to be committed before a later
-- transaction can use them in data updates or inserts.
ALTER TYPE "FulfillmentStatus" ADD VALUE IF NOT EXISTS 'READY_TO_PACK' AFTER 'PICKING';
ALTER TYPE "FulfillmentStatus" ADD VALUE IF NOT EXISTS 'READY_FOR_DISPATCH' AFTER 'READY_FOR_PICKUP';
