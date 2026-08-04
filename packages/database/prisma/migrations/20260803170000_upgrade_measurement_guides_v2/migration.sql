ALTER TABLE "ProductMainImageSelection"
ADD COLUMN "confirmedAt" TIMESTAMP(3);

UPDATE "ProductDetailAsset"
SET
  "status" = 'OUTDATED',
  "outdatedReason" = 'MEASUREMENT_TEMPLATE_CHANGED',
  "outdatedAt" = NOW()
WHERE "type" = 'MEASUREMENT_GUIDE'
  AND "status" <> 'OUTDATED'
  AND "templateVersion" IS DISTINCT FROM 'measurement-guides-v2.0.0';
