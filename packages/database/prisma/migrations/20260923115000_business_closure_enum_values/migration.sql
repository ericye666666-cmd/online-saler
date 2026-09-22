-- Node transit states and the exception reasons the write-off path needs.
-- PostgreSQL requires newly-added enum values to be committed before a later
-- transaction can use them in data updates or inserts, so they land on their own.
--
-- Every AFTER anchor is a label that already existed, so nothing in this file
-- depends on a value added earlier in the same transaction. The statements are
-- therefore written in reverse of the reading order they produce.
ALTER TYPE "FulfillmentStatus" ADD VALUE IF NOT EXISTS 'ARRIVED_AT_NODE' AFTER 'PACKED';
ALTER TYPE "FulfillmentStatus" ADD VALUE IF NOT EXISTS 'IN_TRANSIT_TO_NODE' AFTER 'PACKED';

ALTER TYPE "FulfillmentExceptionReason" ADD VALUE IF NOT EXISTS 'CUSTOMER_UNREACHABLE' AFTER 'DELIVERY_FAILED';
ALTER TYPE "FulfillmentExceptionReason" ADD VALUE IF NOT EXISTS 'WRONG_NODE' AFTER 'DELIVERY_FAILED';
ALTER TYPE "FulfillmentExceptionReason" ADD VALUE IF NOT EXISTS 'NODE_NOT_RECEIVED' AFTER 'DELIVERY_FAILED';
ALTER TYPE "FulfillmentExceptionReason" ADD VALUE IF NOT EXISTS 'ITEM_SOLD_OFFLINE' AFTER 'DELIVERY_FAILED';
