DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'metabase_reader') THEN
    CREATE ROLE metabase_reader NOLOGIN;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO metabase_reader;
GRANT SELECT ON
  bi_product_inventory,
  bi_sales,
  bi_search_keywords,
  bi_search_keyword_trends,
  bi_daily_operations
TO metabase_reader;

-- Create a separate LOGIN role with a secret password, then grant
-- metabase_reader to that role. Do not grant access to business tables.
