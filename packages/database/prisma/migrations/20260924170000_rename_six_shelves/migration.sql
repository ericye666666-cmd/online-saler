-- The six shelves are labelled A-1, A-2, B-1, B-2, C-1, C-2 in the
-- warehouse. Rename in place: ids stay the same, so every garment keeps its
-- shelf and its movement history. Only rows that still carry the old name
-- are touched, so this is safe to run on a database that never had them.
UPDATE "WarehouseLocation" AS w
SET "locationCode" = m.new_code,
    "zoneCode" = split_part(m.new_code, '-', 1),
    "rackCode" = split_part(m.new_code, '-', 2),
    "updatedAt" = CURRENT_TIMESTAMP
FROM (VALUES
  ('A1', 'A-1'),
  ('A2', 'A-2'),
  ('A3', 'B-1'),
  ('A4', 'B-2'),
  ('A5', 'C-1'),
  ('A6', 'C-2')
) AS m(old_code, new_code)
WHERE w."locationCode" = m.old_code
  AND NOT EXISTS (SELECT 1 FROM "WarehouseLocation" taken WHERE taken."locationCode" = m.new_code);

INSERT INTO "AuditLog" ("id", "actorType", "sourceApp", "module", "entityType", "action", "afterJson", "reason", "createdAt")
VALUES (
  gen_random_uuid()::text, 'SYSTEM'::"ActorType", 'API'::"SourceApp", 'WAREHOUSE', 'WarehouseLocation',
  'WAREHOUSE_SHELVES_RENAMED',
  '{"A1":"A-1","A2":"A-2","A3":"B-1","A4":"B-2","A5":"C-1","A6":"C-2"}'::jsonb,
  'Shelves renamed to match the labels on the physical shelves.',
  CURRENT_TIMESTAMP
);
