CREATE TABLE "StorefrontSearchEvent" (
  "id" TEXT NOT NULL,
  "keyword" TEXT NOT NULL,
  "resultCount" INTEGER NOT NULL,
  "category" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "StorefrontSearchEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StorefrontSearchEvent_createdAt_idx"
  ON "StorefrontSearchEvent"("createdAt");

CREATE INDEX "StorefrontSearchEvent_keyword_createdAt_idx"
  ON "StorefrontSearchEvent"("keyword", "createdAt");

CREATE INDEX "StorefrontSearchEvent_category_createdAt_idx"
  ON "StorefrontSearchEvent"("category", "createdAt");

CREATE VIEW bi_product_inventory AS
SELECT
  p."id" AS product_id,
  p."productCode" AS product_code,
  p."barcode" AS barcode,
  p."title" AS title,
  COALESCE(p."category", 'Unclassified') AS category,
  COALESCE(p."subcategory", 'Unclassified') AS subcategory,
  p."gender"::text AS gender,
  p."conditionGrade"::text AS condition_grade,
  p."finalSizeLabel" AS size_label,
  p."material" AS material,
  p."priceKsh" AS price_ksh,
  p."status"::text AS product_status,
  i."status"::text AS inventory_status,
  l."locationCode" AS location_code,
  l."zoneCode" AS zone_code,
  l."rackCode" AS rack_code,
  l."binCode" AS bin_code,
  p."createdAt" AS created_at,
  p."publishedAt" AS published_at,
  i."checkedInAt" AS stocked_in_at,
  (i."status" = 'AVAILABLE') AS is_available,
  CASE
    WHEN p."publishedAt" IS NULL THEN NULL
    ELSE ROUND((EXTRACT(EPOCH FROM (p."publishedAt" - p."createdAt")) / 3600.0)::numeric, 2)
  END AS listing_lead_hours
FROM "Product" p
LEFT JOIN "InventoryItem" i ON i."productId" = p."id"
LEFT JOIN "WarehouseLocation" l ON l."id" = i."locationId";

COMMENT ON VIEW bi_product_inventory IS
  'One row per product for inventory mix, warehouse location, listing velocity, and available-stock reporting.';

CREATE VIEW bi_sales AS
SELECT
  oi."id" AS order_item_id,
  o."id" AS order_id,
  o."orderNumber" AS order_number,
  o."status"::text AS order_status,
  COALESCE(pay.paid_at, o."updatedAt") AS sold_at,
  oi."productId" AS product_id,
  s."productCode" AS product_code,
  s."title" AS title,
  COALESCE(s."category", 'Unclassified') AS category,
  COALESCE(s."subcategory", 'Unclassified') AS subcategory,
  s."brand" AS brand,
  s."color" AS color,
  s."sizeLabel" AS size_label,
  s."conditionGrade"::text AS condition_grade,
  oi."quantity" AS quantity,
  oi."lineTotalKsh" AS line_total_ksh,
  (o."status" IN ('PAID', 'FULFILLING', 'COMPLETED')) AS is_sale,
  (o."status" = 'REFUNDED') AS is_refund,
  CASE WHEN o."status" IN ('PAID', 'FULFILLING', 'COMPLETED') THEN oi."quantity" ELSE 0 END AS sales_units,
  CASE WHEN o."status" IN ('PAID', 'FULFILLING', 'COMPLETED') THEN oi."lineTotalKsh" ELSE 0 END AS sales_revenue_ksh,
  CASE WHEN o."status" = 'REFUNDED' THEN oi."quantity" ELSE 0 END AS refunded_units,
  CASE WHEN o."status" = 'REFUNDED' THEN oi."lineTotalKsh" ELSE 0 END AS refunded_revenue_ksh,
  o."createdAt" AS order_created_at
FROM "OrderItem" oi
JOIN "Order" o ON o."id" = oi."orderId"
LEFT JOIN "OrderSnapshot" s ON s."orderItemId" = oi."id"
LEFT JOIN LATERAL (
  SELECT MIN(p."completedAt") AS paid_at
  FROM "Payment" p
  WHERE p."orderId" = o."id"
    AND p."status" = 'SUCCESS'
) pay ON TRUE;

COMMENT ON VIEW bi_sales IS
  'One row per order item with successful-sale and refund measures based on immutable order snapshots.';

CREATE VIEW bi_search_keywords AS
SELECT
  "id" AS search_event_id,
  "keyword" AS keyword,
  "resultCount" AS result_count,
  COALESCE("category", 'All') AS category,
  ("resultCount" = 0) AS is_zero_result,
  "createdAt" AS searched_at
FROM "StorefrontSearchEvent";

COMMENT ON VIEW bi_search_keywords IS
  'One anonymous storefront search event per row; no customer or session identifiers are stored.';

CREATE VIEW bi_search_keyword_trends AS
WITH keyword_windows AS (
  SELECT
    "keyword" AS keyword,
    COUNT(*) FILTER (WHERE "createdAt" >= CURRENT_TIMESTAMP - INTERVAL '7 days')::integer AS searches_last_7d,
    COUNT(*) FILTER (
      WHERE "createdAt" >= CURRENT_TIMESTAMP - INTERVAL '14 days'
        AND "createdAt" < CURRENT_TIMESTAMP - INTERVAL '7 days'
    )::integer AS searches_previous_7d,
    COUNT(*) FILTER (
      WHERE "createdAt" >= CURRENT_TIMESTAMP - INTERVAL '7 days'
        AND "resultCount" = 0
    )::integer AS zero_result_searches_last_7d,
    MAX("createdAt") AS last_searched_at
  FROM "StorefrontSearchEvent"
  WHERE "createdAt" >= CURRENT_TIMESTAMP - INTERVAL '14 days'
  GROUP BY "keyword"
), scored AS (
  SELECT
    keyword,
    searches_last_7d,
    searches_previous_7d,
    searches_last_7d - searches_previous_7d AS search_delta,
    CASE
      WHEN searches_previous_7d = 0 AND searches_last_7d > 0 THEN 100.0
      WHEN searches_previous_7d = 0 THEN 0.0
      ELSE ROUND(((searches_last_7d - searches_previous_7d) * 100.0 / searches_previous_7d)::numeric, 1)
    END AS growth_percent,
    zero_result_searches_last_7d,
    CASE
      WHEN searches_last_7d = 0 THEN 0.0
      ELSE ROUND((zero_result_searches_last_7d * 100.0 / searches_last_7d)::numeric, 1)
    END AS zero_result_rate_percent,
    last_searched_at
  FROM keyword_windows
)
SELECT
  keyword,
  searches_last_7d,
  searches_previous_7d,
  search_delta,
  growth_percent,
  zero_result_searches_last_7d,
  zero_result_rate_percent,
  last_searched_at,
  DENSE_RANK() OVER (ORDER BY searches_last_7d DESC, keyword ASC)::integer AS search_rank,
  DENSE_RANK() OVER (ORDER BY search_delta DESC, searches_last_7d DESC, keyword ASC)::integer AS rising_rank
FROM scored;

COMMENT ON VIEW bi_search_keyword_trends IS
  'Keyword ranking and seven-day growth compared with the prior seven-day window.';

CREATE VIEW bi_daily_operations AS
WITH days AS (
  SELECT DATE("createdAt") AS day FROM "Product"
  UNION
  SELECT DATE("publishedAt") AS day FROM "Product" WHERE "publishedAt" IS NOT NULL
  UNION
  SELECT DATE(sold_at) AS day FROM bi_sales WHERE is_sale
  UNION
  SELECT DATE("createdAt") AS day FROM "StorefrontSearchEvent"
), created_products AS (
  SELECT DATE("createdAt") AS day, COUNT(*)::integer AS products_created
  FROM "Product"
  GROUP BY DATE("createdAt")
), listed_products AS (
  SELECT DATE("publishedAt") AS day, COUNT(*)::integer AS products_listed
  FROM "Product"
  WHERE "publishedAt" IS NOT NULL
  GROUP BY DATE("publishedAt")
), sales AS (
  SELECT
    DATE(sold_at) AS day,
    SUM(sales_units)::integer AS units_sold,
    SUM(sales_revenue_ksh)::integer AS sales_revenue_ksh
  FROM bi_sales
  WHERE is_sale
  GROUP BY DATE(sold_at)
), searches AS (
  SELECT
    DATE("createdAt") AS day,
    COUNT(*)::integer AS searches,
    COUNT(*) FILTER (WHERE "resultCount" = 0)::integer AS zero_result_searches
  FROM "StorefrontSearchEvent"
  GROUP BY DATE("createdAt")
)
SELECT
  d.day,
  COALESCE(c.products_created, 0) AS products_created,
  COALESCE(l.products_listed, 0) AS products_listed,
  COALESCE(s.units_sold, 0) AS units_sold,
  COALESCE(s.sales_revenue_ksh, 0) AS sales_revenue_ksh,
  COALESCE(q.searches, 0) AS searches,
  COALESCE(q.zero_result_searches, 0) AS zero_result_searches
FROM days d
LEFT JOIN created_products c USING (day)
LEFT JOIN listed_products l USING (day)
LEFT JOIN sales s USING (day)
LEFT JOIN searches q USING (day)
WHERE d.day IS NOT NULL;

COMMENT ON VIEW bi_daily_operations IS
  'One row per active day for product intake, listing, sales, revenue, and search-volume trends.';
