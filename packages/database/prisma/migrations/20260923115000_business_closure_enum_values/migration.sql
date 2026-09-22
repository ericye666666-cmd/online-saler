-- Node transit states and the exception reasons the write-off path needs.
-- PostgreSQL requires newly-added enum values to be committed before a later
-- transaction can use them in data updates or inserts, so they land on their own.
ALTER TYPE "FulfillmentStatus" ADD VALUE IF NOT EXISTS 'IN_TRANSIT_TO_NODE' AFTER 'PACKED';
ALTER TYPE "FulfillmentStatus" ADD VALUE IF NOT EXISTS 'ARRIVED_AT_NODE' AFTER 'IN_TRANSIT_TO_NODE';
ALTER TYPE "FulfillmentExceptionReason" ADD VALUE IF NOT EXISTS 'ITEM_SOLD_OFFLINE' AFTER 'DELIVERY_FAILED';
ALTER TYPE "FulfillmentExceptionReason" ADD VALUE IF NOT EXISTS 'NODE_NOT_RECEIVED' AFTER 'ITEM_SOLD_OFFLINE';
ALTER TYPE "FulfillmentExceptionReason" ADD VALUE IF NOT EXISTS 'WRONG_NODE' AFTER 'NODE_NOT_RECEIVED';
ALTER TYPE "FulfillmentExceptionReason" ADD VALUE IF NOT EXISTS 'CUSTOMER_UNREACHABLE' AFTER 'WRONG_NODE';
