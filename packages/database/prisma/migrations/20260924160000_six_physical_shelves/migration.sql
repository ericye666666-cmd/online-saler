-- The warehouse has six physical shelves, A1 to A6, each holding up to 200
-- garments. Every garment still in the warehouse is moved onto them: a whole
-- batch goes on one shelf, largest batches first, each onto whichever shelf is
-- emptiest, so the six end up as even as whole batches allow. The old
-- 100-cell grid (A-010101 ...) is then deleted.
--
-- One DO block, so it either moves everything or nothing. If the stock does
-- not fit into six shelves of 200 in whole batches, it aborts and changes
-- nothing.
DO $$
DECLARE
  shelf_codes CONSTANT TEXT[] := ARRAY['A1', 'A2', 'A3', 'A4', 'A5', 'A6'];
  shelf_capacity CONSTANT INTEGER := 200;
  grp RECORD;
  target RECORD;
  plan JSONB := '[]'::jsonb;
BEGIN
  INSERT INTO "WarehouseLocation" ("id", "locationCode", "capacity", "status", "active", "note", "createdAt", "updatedAt")
  SELECT gen_random_uuid()::text, code, shelf_capacity, 'ACTIVE'::"WarehouseLocationStatus", true, 'Physical shelf', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  FROM unnest(shelf_codes) AS code
  ON CONFLICT ("locationCode") DO UPDATE
    SET "capacity" = shelf_capacity,
        "active" = true,
        "status" = 'ACTIVE'::"WarehouseLocationStatus",
        "updatedAt" = CURRENT_TIMESTAMP;

  CREATE TEMP TABLE shelf_load AS
    SELECT "id", "locationCode" AS code, 0 AS items
    FROM "WarehouseLocation"
    WHERE "locationCode" = ANY (shelf_codes);

  FOR grp IN
    SELECT
      COALESCE(p."batchId", 'item:' || i."id") AS group_key,
      COALESCE(MIN(b."batchCode"), MIN(p."productCode")) AS label,
      array_agg(i."id") AS item_ids,
      COUNT(*)::int AS item_count
    FROM "InventoryItem" i
    JOIN "Product" p ON p."id" = i."productId"
    LEFT JOIN "ProductBatch" b ON b."id" = p."batchId"
    -- The statuses that occupy a shelf (WAREHOUSE_OCCUPYING_STATUSES).
    WHERE i."status" IN ('PENDING_STOCK_IN', 'AVAILABLE', 'RESERVED', 'DEPOSIT_HELD', 'PAID', 'RETURNED')
    GROUP BY 1
    ORDER BY COUNT(*) DESC, 2, 1
  LOOP
    SELECT * INTO target
    FROM shelf_load
    WHERE items + grp.item_count <= shelf_capacity
    ORDER BY items, code
    LIMIT 1;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Stock does not fit on six shelves of % in whole batches (stuck at %, % items).',
        shelf_capacity, grp.label, grp.item_count;
    END IF;
    UPDATE shelf_load SET items = items + grp.item_count WHERE "id" = target."id";

    INSERT INTO "InventoryMovement" ("id", "inventoryItemId", "productId", "movementType", "fromLocationId", "toLocationId", "reason", "createdAt")
    SELECT
      gen_random_uuid()::text, i."id", i."productId", 'MOVE'::"InventoryMovementType", i."locationId", target."id",
      'Shelves consolidated into A1-A6' || COALESCE(' (was ' || old."locationCode" || ')', ''),
      CURRENT_TIMESTAMP
    FROM "InventoryItem" i
    LEFT JOIN "WarehouseLocation" old ON old."id" = i."locationId"
    WHERE i."id" = ANY (grp.item_ids) AND i."locationId" IS DISTINCT FROM target."id";

    UPDATE "InventoryItem"
    SET "locationId" = target."id", "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = ANY (grp.item_ids) AND "locationId" IS DISTINCT FROM target."id";

    plan := plan || jsonb_build_array(jsonb_build_object('batch', grp.label, 'items', grp.item_count, 'shelf', target.code));
  END LOOP;

  -- Sold, picked and packed items lose their old code here; they are no
  -- longer on a shelf.
  DELETE FROM "WarehouseLocation" WHERE NOT ("locationCode" = ANY (shelf_codes));

  UPDATE "WarehouseLocation" w
  SET "status" = (CASE WHEN l.items >= w."capacity" THEN 'FULL' ELSE 'ACTIVE' END)::"WarehouseLocationStatus",
      "updatedAt" = CURRENT_TIMESTAMP
  FROM shelf_load l
  WHERE l."id" = w."id";

  INSERT INTO "AuditLog" ("id", "actorType", "sourceApp", "module", "entityType", "action", "afterJson", "reason", "createdAt")
  VALUES (
    gen_random_uuid()::text, 'SYSTEM'::"ActorType", 'API'::"SourceApp", 'WAREHOUSE', 'WarehouseLocation',
    'WAREHOUSE_SHELVES_CONSOLIDATED',
    jsonb_build_object(
      'capacity', shelf_capacity,
      'shelves', (SELECT jsonb_object_agg(code, items) FROM shelf_load),
      'batches', plan
    ),
    'Six physical shelves A1-A6; each batch moved whole onto one shelf.',
    CURRENT_TIMESTAMP
  );

  DROP TABLE shelf_load;
END $$;
