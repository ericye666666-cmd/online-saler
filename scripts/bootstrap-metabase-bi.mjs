import { pathToFileURL } from "node:url";

const PREFIX = "[Online Saler BI]";

export const warehouseCards = [
  {
    name: `${PREFIX} Available inventory`,
    display: "scalar",
    sql: `SELECT COUNT(*) AS "Available inventory" FROM bi_product_inventory WHERE is_available`
  },
  {
    name: `${PREFIX} Listed in last 7 days`,
    display: "scalar",
    sql: `SELECT COUNT(*) AS "Listed in last 7 days" FROM bi_product_inventory WHERE published_at >= CURRENT_TIMESTAMP - INTERVAL '7 days'`
  },
  {
    name: `${PREFIX} Units sold in last 7 days`,
    display: "scalar",
    sql: `SELECT COALESCE(SUM(sales_units), 0) AS "Units sold in last 7 days" FROM bi_sales WHERE is_sale AND sold_at >= CURRENT_TIMESTAMP - INTERVAL '7 days'`
  },
  {
    name: `${PREFIX} Revenue in last 30 days`,
    display: "scalar",
    sql: `SELECT COALESCE(SUM(sales_revenue_ksh), 0) AS "Revenue KSh in last 30 days" FROM bi_sales WHERE is_sale AND sold_at >= CURRENT_TIMESTAMP - INTERVAL '30 days'`
  },
  {
    name: `${PREFIX} Available inventory by category`,
    display: "bar",
    sql: `SELECT category AS "Category", COUNT(*) AS "Available items" FROM bi_product_inventory WHERE is_available GROUP BY category ORDER BY "Available items" DESC, category`
  },
  {
    name: `${PREFIX} Listing and sales velocity`,
    display: "line",
    sql: `SELECT day AS "Day", products_listed AS "Products listed", units_sold AS "Units sold" FROM bi_daily_operations WHERE day >= CURRENT_DATE - 29 ORDER BY day`
  },
  {
    name: `${PREFIX} Category performance`,
    display: "table",
    sql: `WITH inventory AS (
  SELECT category,
    COUNT(*) FILTER (WHERE is_available) AS available_inventory,
    COUNT(*) FILTER (WHERE published_at >= CURRENT_TIMESTAMP - INTERVAL '30 days') AS listed_30d
  FROM bi_product_inventory
  GROUP BY category
), sales AS (
  SELECT category,
    SUM(sales_units) FILTER (WHERE is_sale AND sold_at >= CURRENT_TIMESTAMP - INTERVAL '30 days') AS sold_30d,
    SUM(sales_revenue_ksh) FILTER (WHERE is_sale AND sold_at >= CURRENT_TIMESTAMP - INTERVAL '30 days') AS revenue_30d
  FROM bi_sales
  GROUP BY category
)
SELECT
  COALESCE(i.category, s.category) AS "Category",
  COALESCE(i.available_inventory, 0) AS "Available inventory",
  COALESCE(i.listed_30d, 0) AS "Listed 30d",
  COALESCE(s.sold_30d, 0) AS "Sold 30d",
  COALESCE(s.revenue_30d, 0) AS "Revenue KSh 30d",
  CASE
    WHEN COALESCE(i.available_inventory, 0) + COALESCE(s.sold_30d, 0) = 0 THEN 0
    ELSE ROUND(COALESCE(s.sold_30d, 0) * 100.0 / (COALESCE(i.available_inventory, 0) + COALESCE(s.sold_30d, 0)), 1)
  END AS "Sell-through percent"
FROM inventory i
FULL OUTER JOIN sales s ON s.category = i.category
ORDER BY "Sold 30d" DESC, "Available inventory" DESC`
  }
];

export const searchCards = [
  {
    name: `${PREFIX} Searches in last 7 days`,
    display: "scalar",
    sql: `SELECT COUNT(*) AS "Searches in last 7 days" FROM bi_search_keywords WHERE searched_at >= CURRENT_TIMESTAMP - INTERVAL '7 days'`
  },
  {
    name: `${PREFIX} Unique keywords in last 7 days`,
    display: "scalar",
    sql: `SELECT COUNT(DISTINCT keyword) AS "Unique keywords in last 7 days" FROM bi_search_keywords WHERE searched_at >= CURRENT_TIMESTAMP - INTERVAL '7 days'`
  },
  {
    name: `${PREFIX} Zero-result rate in last 7 days`,
    display: "scalar",
    sql: `SELECT COALESCE(ROUND(COUNT(*) FILTER (WHERE is_zero_result) * 100.0 / NULLIF(COUNT(*), 0), 1), 0) AS "Zero-result rate percent" FROM bi_search_keywords WHERE searched_at >= CURRENT_TIMESTAMP - INTERVAL '7 days'`
  },
  {
    name: `${PREFIX} Top search keywords`,
    display: "bar",
    sql: `SELECT keyword AS "Keyword", searches_last_7d AS "Searches last 7d" FROM bi_search_keyword_trends WHERE searches_last_7d > 0 ORDER BY search_rank LIMIT 20`
  },
  {
    name: `${PREFIX} Rising search keywords`,
    display: "table",
    sql: `SELECT rising_rank AS "Rising rank", keyword AS "Keyword", searches_last_7d AS "Searches last 7d", searches_previous_7d AS "Previous 7d", search_delta AS "Change", growth_percent AS "Growth percent", zero_result_rate_percent AS "Zero-result rate percent" FROM bi_search_keyword_trends WHERE search_delta > 0 ORDER BY rising_rank LIMIT 30`
  },
  {
    name: `${PREFIX} Daily search trend`,
    display: "line",
    sql: `SELECT day AS "Day", searches AS "Searches", zero_result_searches AS "Zero-result searches" FROM bi_daily_operations WHERE day >= CURRENT_DATE - 29 ORDER BY day`
  },
  {
    name: `${PREFIX} Zero-result keyword opportunities`,
    display: "table",
    sql: `SELECT keyword AS "Keyword", searches_last_7d AS "Searches last 7d", zero_result_searches_last_7d AS "Zero-result searches", zero_result_rate_percent AS "Zero-result rate percent", last_searched_at AS "Last searched" FROM bi_search_keyword_trends WHERE zero_result_searches_last_7d > 0 ORDER BY zero_result_searches_last_7d DESC, searches_last_7d DESC LIMIT 30`
  }
];

export const dashboardDefinitions = [
  {
    name: `${PREFIX} Warehouse performance`,
    description: "Inventory mix, sales, listing velocity, and category performance.",
    cards: warehouseCards
  },
  {
    name: `${PREFIX} Search keywords`,
    description: "Search ranking, rising demand, and zero-result opportunities.",
    cards: searchCards
  }
];

export function cardPayload(card, databaseId) {
  return {
    name: card.name,
    display: card.display,
    dataset_query: {
      type: "native",
      database: databaseId,
      native: { query: card.sql, "template-tags": {} }
    },
    visualization_settings: {},
    collection_id: null
  };
}

export function dashboardLayout(cardIds) {
  return cardIds.map((cardId, index) => {
    const isMetric = index < 4;
    const row = isMetric ? 0 : index === 4 ? 4 : index === 5 ? 4 : 12;
    const col = isMetric ? index * 6 : index === 4 ? 0 : index === 5 ? 12 : 0;
    const sizeX = isMetric ? 6 : index === 6 ? 24 : 12;
    const sizeY = isMetric ? 4 : index === 6 ? 8 : 8;
    return { id: -(index + 1), card_id: cardId, row, col, size_x: sizeX, size_y: sizeY };
  });
}

export async function bootstrapMetabase({ baseUrl, apiKey, databaseId, fetchImpl = fetch }) {
  const api = createApiClient({ baseUrl, apiKey, fetchImpl });
  const existingCards = await api("/api/card");
  const cardsByName = new Map(existingCards.map((card) => [card.name, card]));
  const existingDashboards = await api("/api/dashboard");
  const dashboardsByName = new Map(existingDashboards.map((dashboard) => [dashboard.name, dashboard]));
  const output = [];

  for (const definition of dashboardDefinitions) {
    const cardIds = [];
    for (const card of definition.cards) {
      const payload = cardPayload(card, databaseId);
      const existing = cardsByName.get(card.name);
      const saved = existing
        ? await api(`/api/card/${existing.id}`, { method: "PUT", body: payload })
        : await api("/api/card", { method: "POST", body: payload });
      cardIds.push(saved.id ?? existing?.id);
    }

    const existing = dashboardsByName.get(definition.name);
    const dashboard = existing ?? await api("/api/dashboard", {
      method: "POST",
      body: { name: definition.name, description: definition.description, collection_id: null }
    });

    await api(`/api/dashboard/${dashboard.id}`, {
      method: "PUT",
      body: {
        name: definition.name,
        description: definition.description,
        dashcards: dashboardLayout(cardIds)
      }
    });

    output.push({ name: definition.name, id: dashboard.id, url: `${baseUrl.replace(/\/$/, "")}/dashboard/${dashboard.id}` });
  }

  return output;
}

function createApiClient({ baseUrl, apiKey, fetchImpl }) {
  const normalizedBaseUrl = baseUrl.replace(/\/$/, "");
  return async (path, options = {}) => {
    const response = await fetchImpl(`${normalizedBaseUrl}${path}`, {
      method: options.method ?? "GET",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey
      },
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    if (!response.ok) {
      throw new Error(`Metabase API ${options.method ?? "GET"} ${path} failed (${response.status}): ${await response.text()}`);
    }
    return response.status === 204 ? null : response.json();
  };
}

async function main() {
  const baseUrl = process.env.METABASE_URL;
  const apiKey = process.env.METABASE_API_KEY;
  const databaseId = Number(process.env.METABASE_WAREHOUSE_DATABASE_ID);
  if (!baseUrl || !apiKey || !Number.isInteger(databaseId) || databaseId <= 0) {
    throw new Error("METABASE_URL, METABASE_API_KEY, and a positive METABASE_WAREHOUSE_DATABASE_ID are required.");
  }

  const dashboards = await bootstrapMetabase({ baseUrl, apiKey, databaseId });
  for (const dashboard of dashboards) {
    console.log(`${dashboard.name}: ${dashboard.url}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
