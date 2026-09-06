import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Compare database identity without logging credentials or passing URLs as CLI arguments.
export function databaseTarget(raw) {
  try {
    const url = new URL(raw);
    if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.pathname.slice(1) || url.hash) throw new Error();
    // Unknown/duplicate options could alter the actual target (for example an
    // options search_path or query port). Fail closed instead of guessing how
    // the Prisma engine resolves them.
    const allowed = new Set(["host", "schema", "sslmode", "sslaccept", "sslcert", "sslidentity", "sslpassword",
      "connection_limit", "pool_timeout", "connect_timeout", "socket_timeout", "pgbouncer", "statement_cache_size", "application_name"]);
    const keys = [...url.searchParams.keys()];
    if (new Set(keys).size !== keys.length || keys.some((key) => !allowed.has(key))) throw new Error();
    if (["host", "schema"].some((key) => url.searchParams.has(key) && !url.searchParams.get(key))) throw new Error();
    const host = url.searchParams.get("host") || url.hostname;
    if (!host) throw new Error();
    return JSON.stringify({
      host: (host.startsWith("/") ? host : host.toLowerCase()).replace(/\/$/, ""),
      port: url.port || "5432",
      database: decodeURIComponent(url.pathname.slice(1)),
      schema: url.searchParams.get("schema") || "public"
    });
  } catch {
    throw new Error("Database preflight requires valid PostgreSQL connection targets; values are redacted.");
  }
}

export function verifyProductionDatabase({ env = process.env, run = spawnSync, log = console.log } = {}) {
  if (databaseTarget(env.DATABASE_URL) !== databaseTarget(env.PREFLIGHT_API_DATABASE_URL)) {
    throw new Error("Production Storefront and API database targets differ. No schema or data changes were made.");
  }
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const schema = path.join(root, "packages/database/prisma");
  const result = run(process.execPath, [
    path.join(root, "node_modules/prisma/build/index.js"), "migrate", "diff",
    "--from-schema-datasource", schema, "--to-schema-datamodel", schema, "--exit-code"
  ], {
    cwd: root,
    env: { ...env, CHECKPOINT_DISABLE: "1", PRISMA_HIDE_UPDATE_MESSAGE: "1" },
    // Introspection/diff only; never print engine diagnostics that could include a URL.
    encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 240_000, maxBuffer: 8 * 1024 * 1024
  });
  if (result.status === 2) {
    throw new Error("Production database differs from the candidate Prisma schema. Apply the reviewed migrations before publishing.");
  }
  if (result.error || result.signal || result.status !== 0) {
    throw new Error("Read-only production schema verification failed; connection and engine diagnostics are redacted.");
  }
  log("PASS: Production Storefront and API share a database target; the candidate Prisma schema matches. No database writes were executed.");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { verifyProductionDatabase(); } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
