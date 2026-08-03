import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { validDashboardUrl } from "./metabase-dashboard-url";

assert.equal(validDashboardUrl("https://bi.example.test/dashboard/1"), "https://bi.example.test/dashboard/1");
assert.equal(validDashboardUrl("javascript:alert(1)"), null);
assert.equal(validDashboardUrl("not-a-url"), null);

const shell = readFileSync(resolve(process.cwd(), "src/components/admin/operations-admin-shell.tsx"), "utf8");
assert.match(shell, /仓库经营 BI/);
assert.match(shell, /搜索关键词 BI/);
assert.match(shell, /\/analytics\/warehouse-bi/);
assert.match(shell, /\/analytics\/search-bi/);

console.log("Metabase BI routes tests passed");
