-- Customers may collect from the Kikuyu warehouse.
--
-- The warehouse was seeded as delivery-only, so it never appeared among the
-- pickup points at checkout. Opening it costs nothing downstream: a warehouse
-- node needs no transit, so a packed parcel goes straight to the pickup shelf
-- instead of travelling to a store and being scanned in.
--
-- Renamed at the same time. "Central Warehouse" is what it is called internally;
-- "Kikuyu Warehouse" is what a shopper choosing a collection point needs to read.
UPDATE "FulfillmentNode"
SET "supportsPickup" = true,
    "name" = 'Kikuyu Warehouse',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "code" = 'WAREHOUSE';
