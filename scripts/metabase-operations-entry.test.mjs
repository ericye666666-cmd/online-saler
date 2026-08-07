import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const workflow = readFileSync(new URL("../.github/workflows/deploy-operations-staging.yml", import.meta.url), "utf8");
const shell = readFileSync(new URL("../apps/operations/src/components/admin/operations-admin-shell.tsx", import.meta.url), "utf8");

test("resolves existing Metabase dashboards and injects their URLs into Operations", () => {
  assert.match(workflow, /online-saler-metabase-staging/);
  assert.match(workflow, /\[Online Saler BI\] Warehouse performance/);
  assert.match(workflow, /\[Online Saler BI\] Search keywords/);
  assert.match(workflow, /METABASE_WAREHOUSE_DASHBOARD_URL=\$\{\{ env\.METABASE_WAREHOUSE_DASHBOARD_URL \}\}/);
  assert.match(workflow, /METABASE_SEARCH_DASHBOARD_URL=\$\{\{ env\.METABASE_SEARCH_DASHBOARD_URL \}\}/);
});

test("shows advanced warehouse and search analysis under Data Center", () => {
  assert.match(shell, /高级仓库分析/);
  assert.match(shell, /搜索分析/);
  assert.match(shell, /analytics\.warehouse\.view/);
  assert.match(shell, /\/analytics\/warehouse-bi/);
  assert.match(shell, /\/analytics\/search-bi/);
});
