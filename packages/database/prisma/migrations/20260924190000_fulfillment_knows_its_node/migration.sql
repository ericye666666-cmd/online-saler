-- The node a parcel goes to is recorded twice: on the order, where checkout and
-- re-routing both write it, and on the fulfillment record, which is what the
-- store end of the loop reads. Only re-routing ever copied it across, so a
-- parcel whose node came from the customer's own choice at checkout left the
-- fulfillment record empty -- and an empty node means the receiving store's
-- board never lists the parcel and scanning its label answers "this package
-- belongs to another store". Backfills from the order, which is the field both
-- paths have always written.
UPDATE "OrderFulfillment" AS f
SET "fulfillmentNodeId" = o."fulfillmentNodeId"
FROM "Order" AS o
WHERE f."orderId" = o."id"
  AND f."fulfillmentNodeId" IS NULL
  AND o."fulfillmentNodeId" IS NOT NULL;

-- The holder column was filled from that same field by an earlier migration, so
-- a row that was empty then is still empty now even though the node is known.
UPDATE "OrderFulfillment"
SET "currentHolderType" = 'NODE', "currentHolderId" = "fulfillmentNodeId"
WHERE "fulfillmentNodeId" IS NOT NULL
  AND "currentHolderId" IS NULL
  AND "status" IN ('ARRIVED_AT_NODE', 'READY_FOR_PICKUP', 'READY_FOR_DISPATCH');
