import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL("../packages/database/prisma/migrations/20260803130000_add_bi_analytics/migration.sql", import.meta.url),
  "utf8"
);
const grants = readFileSync(new URL("../infrastructure/metabase/create-readonly-role.sql", import.meta.url), "utf8");
const workflow = readFileSync(new URL("../.github/workflows/deploy-metabase-staging.yml", import.meta.url), "utf8");

test("creates the anonymous search table and all durable BI views", () => {
  assert.match(migration, /CREATE TABLE "StorefrontSearchEvent"/);
  for (const view of [
    "bi_product_inventory",
    "bi_sales",
    "bi_search_keywords",
    "bi_search_keyword_trends",
    "bi_daily_operations"
  ]) {
    assert.match(migration, new RegExp(`CREATE VIEW ${view}`));
  }
  assert.doesNotMatch(migration.match(/CREATE TABLE "StorefrontSearchEvent"[\s\S]*?\);/)?.[0] ?? "", /customer|email|phone|session/i);
});

test("grants Metabase access only to BI views", () => {
  assert.match(grants, /CREATE ROLE metabase_reader NOLOGIN/);
  assert.match(grants, /GRANT SELECT ON[\s\S]*bi_daily_operations[\s\S]*TO metabase_reader/);
  assert.doesNotMatch(grants, /GRANT SELECT ON ALL TABLES/i);
  assert.doesNotMatch(grants, /GRANT (INSERT|UPDATE|DELETE)/i);
});

test("pins Metabase and keeps staging deployment manual", () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /push:/);
  assert.match(workflow, /METABASE_VERSION: v0\.63\.2/);
  assert.match(workflow, /METABASE_DB_CONNECTION_URI_STAGING/);
});
