-- The Kikuyu warehouse has a map link now that customers can collect from it.
--
-- Opening warehouse pickup left this empty, so a shopper who chose it at
-- checkout was told where to go by name and nothing else. Every store node has
-- carried a link since they were seeded; this is the one that was missing.
--
-- Guarded on empty so it cannot overwrite a link someone typed into
-- 系统管理 → 履约点配置 before this ran.
UPDATE "FulfillmentNode"
SET "mapsUrl" = 'https://maps.app.goo.gl/wpoor2iHxpo3eSQn7?g_st=ac',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "code" = 'WAREHOUSE'
  AND ("mapsUrl" IS NULL OR "mapsUrl" = '');
