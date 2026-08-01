ALTER TABLE "Product"
  ADD COLUMN "pattern" TEXT,
  ADD COLUMN "sleeveType" TEXT;

WITH latest_decisions AS (
  SELECT DISTINCT ON (extraction."productId", decision."fieldName")
    extraction."productId",
    decision."fieldName",
    decision."finalValueJson" #>> '{}' AS value
  FROM "AIFieldDecision" AS decision
  INNER JOIN "AIExtraction" AS extraction ON extraction.id = decision."extractionId"
  WHERE decision."fieldName" IN ('pattern', 'sleeveType')
    AND decision."finalValueJson" IS NOT NULL
    AND jsonb_typeof(decision."finalValueJson") = 'string'
  ORDER BY extraction."productId", decision."fieldName", decision."reviewedAt" DESC NULLS LAST, decision."updatedAt" DESC
)
UPDATE "Product" AS product
SET "pattern" = latest.value
FROM latest_decisions AS latest
WHERE product.id = latest."productId"
  AND latest."fieldName" = 'pattern'
  AND product."pattern" IS NULL;

WITH latest_decisions AS (
  SELECT DISTINCT ON (extraction."productId", decision."fieldName")
    extraction."productId",
    decision."fieldName",
    decision."finalValueJson" #>> '{}' AS value
  FROM "AIFieldDecision" AS decision
  INNER JOIN "AIExtraction" AS extraction ON extraction.id = decision."extractionId"
  WHERE decision."fieldName" IN ('pattern', 'sleeveType')
    AND decision."finalValueJson" IS NOT NULL
    AND jsonb_typeof(decision."finalValueJson") = 'string'
  ORDER BY extraction."productId", decision."fieldName", decision."reviewedAt" DESC NULLS LAST, decision."updatedAt" DESC
)
UPDATE "Product" AS product
SET "sleeveType" = latest.value
FROM latest_decisions AS latest
WHERE product.id = latest."productId"
  AND latest."fieldName" = 'sleeveType'
  AND product."sleeveType" IS NULL;
