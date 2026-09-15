-- Apply the requested 25% policy to all existing affiliates and the global setting.
-- Historical Commission records are intentionally preserved.
UPDATE "Affiliate"
SET "commissionRateBps" = 2500, "updatedAt" = CURRENT_TIMESTAMP
WHERE "commissionRateBps" IS DISTINCT FROM 2500;

INSERT INTO "SystemSetting" ("key", "valueJson", "scope", "createdAt", "updatedAt")
VALUES ('affiliate.defaultCommissionRateBps', '2500'::jsonb, 'GLOBAL', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO UPDATE
SET "valueJson" = '2500'::jsonb, "updatedAt" = CURRENT_TIMESTAMP;
