# Metabase BI

Metabase is the BI surface for warehouse performance and storefront search demand. The application does not implement its own charts.

## Data boundary

Metabase uses two separate PostgreSQL connections:

1. **Application database**: stores Metabase users, dashboard definitions, and settings. It must not use the embedded H2 database outside local experiments.
2. **Warehouse read-only connection**: connects to the Online Saler database with a login that inherits `metabase_reader`. That role can select only the five `bi_*` views.

The search views contain the normalized keyword, category, result count, and timestamp. They do not contain customer, email, phone, or session identifiers.

## Local startup

Copy `.env.example` to `.env`, replace both secrets, then run:

```sh
docker compose --env-file .env up -d
```

Open `http://localhost:3003`, create the first Metabase administrator, and add the Online Saler PostgreSQL database using a read-only login.

After creating a Metabase API key and noting the warehouse database ID, create or refresh both dashboards:

```sh
METABASE_URL=http://localhost:3003 \
METABASE_API_KEY=... \
METABASE_WAREHOUSE_DATABASE_ID=2 \
node scripts/bootstrap-metabase-bi.mjs
```

## Staging prerequisites

The manual staging workflow expects these Google Secret Manager secrets:

- `METABASE_DB_CONNECTION_URI_STAGING`: a JDBC-style PostgreSQL URI for the dedicated Metabase application database through the Cloud SQL Auth Proxy sidecar, for example `jdbc:postgresql://127.0.0.1:5432/metabase?user=metabase&password=...`.
- `METABASE_ENCRYPTION_SECRET_KEY_STAGING`: at least 16 random characters.

Metabase does not create its application database. Create the empty `metabase` database before the first workflow run and keep it separate from the Online Saler warehouse database.

The staging service runs Metabase and a pinned Cloud SQL Auth Proxy sidecar in the same Cloud Run instance. Metabase connects to the proxy over `127.0.0.1:5432`; the database is not exposed directly to Cloud Run over the public internet. The runtime service account must retain `Cloud SQL Client` and `Secret Manager Secret Accessor`.

After the first deployment:

1. Create the first Metabase administrator.
2. Create a warehouse login and grant it the `metabase_reader` role from `create-readonly-role.sql`.
3. Add the Online Saler staging PostgreSQL database in Metabase using that read-only login.
4. Create a Metabase API key and run `scripts/bootstrap-metabase-bi.mjs`.
5. Store the resulting dashboard URLs as GitHub Actions variables:
   - `METABASE_WAREHOUSE_DASHBOARD_URL_STAGING`
   - `METABASE_SEARCH_DASHBOARD_URL_STAGING`

The Operations navigation redirects authenticated employees to Metabase. Metabase maintains its own login and dashboard permissions; no dashboard is made public.
