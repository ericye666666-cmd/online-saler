import assert from "node:assert/strict";
import test from "node:test";

import {
  bootstrapMetabase,
  cardPayload,
  dashboardDefinitions,
  dashboardLayout,
  searchCards,
  warehouseCards
} from "./bootstrap-metabase-bi.mjs";

test("defines warehouse and search dashboards from durable BI views", () => {
  assert.equal(dashboardDefinitions.length, 2);
  assert.ok(warehouseCards.every((card) => card.sql.includes("bi_")));
  assert.ok(searchCards.every((card) => card.sql.includes("bi_")));
  assert.ok(searchCards.some((card) => card.sql.includes("rising_rank")));
});

test("builds native Metabase cards against the configured warehouse database", () => {
  const payload = cardPayload(warehouseCards[0], 17);
  assert.equal(payload.dataset_query.database, 17);
  assert.equal(payload.dataset_query.type, "native");
  assert.equal(payload.display, "scalar");
  assert.deepEqual(payload.dataset_query.native["template-tags"], {});
});

test("lays metric cards across the first dashboard row", () => {
  const layout = dashboardLayout([11, 12, 13, 14, 15, 16, 17]);
  assert.deepEqual(layout.slice(0, 4).map(({ row, col, size_x }) => ({ row, col, size_x })), [
    { row: 0, col: 0, size_x: 6 },
    { row: 0, col: 6, size_x: 6 },
    { row: 0, col: 12, size_x: 6 },
    { row: 0, col: 18, size_x: 6 }
  ]);
  assert.equal(layout[6].size_x, 24);
});

test("creates and updates cards and dashboards idempotently", async () => {
  const calls = [];
  let nextCardId = 100;
  let nextDashboardId = 500;
  const fetchImpl = async (url, options = {}) => {
    const path = new URL(url).pathname;
    const method = options.method ?? "GET";
    const body = options.body ? JSON.parse(options.body) : null;
    calls.push({ path, method, body, apiKey: options.headers["X-API-Key"] });

    let responseBody;
    if (path === "/api/card" && method === "GET") responseBody = [];
    else if (path === "/api/dashboard" && method === "GET") responseBody = [];
    else if (path === "/api/card" && method === "POST") responseBody = { id: nextCardId++, ...body };
    else if (path === "/api/dashboard" && method === "POST") responseBody = { id: nextDashboardId++, ...body };
    else responseBody = { ok: true };

    return {
      ok: true,
      status: 200,
      json: async () => responseBody,
      text: async () => JSON.stringify(responseBody)
    };
  };

  const dashboards = await bootstrapMetabase({
    baseUrl: "https://metabase.example.test/",
    apiKey: "test-key",
    databaseId: 9,
    fetchImpl
  });

  assert.equal(dashboards.length, 2);
  assert.ok(calls.every((call) => call.apiKey === "test-key"));
  assert.equal(calls.filter((call) => call.path === "/api/card" && call.method === "POST").length, warehouseCards.length + searchCards.length);
  const dashboardUpdates = calls.filter((call) => call.path.startsWith("/api/dashboard/") && call.method === "PUT");
  assert.equal(dashboardUpdates.length, 2);
  assert.equal(dashboardUpdates[0].body.dashcards.length, warehouseCards.length);
});
