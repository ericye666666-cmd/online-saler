import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// This bootstrap is exclusively for a new disposable test database. Historical
// 0002 contains a UTF-8 BOM rejected by PostgreSQL; do not rewrite its checksum.
// Instead materialize the released schema, execute the exact new migration, and
// prove that the resulting database matches the proposed Prisma schema.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baseline = "e319fe94febb0479fe143914c0e2b6f6d87b764d";
const migration = "20260906140000_add_manual_after_sales";
const raw = process.env.MVP_INTEGRATION_DATABASE_URL;
if (!raw) throw new Error("MVP_INTEGRATION_DATABASE_URL must name a disposable local test database.");
const url = new URL(raw);
if (!["postgres:", "postgresql:"].includes(url.protocol)
  || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  || !/test/i.test(url.pathname)
  || [...url.searchParams.keys()].some((key) => !["schema", "connection_limit", "sslmode", "pool_timeout", "connect_timeout"].includes(key))) {
  throw new Error("Refusing database bootstrap: only loopback PostgreSQL test databases are allowed.");
}
process.env.DATABASE_URL = raw;
const { PrismaClient } = await import("@prisma/client");
const db = new PrismaClient();
try {
  const rows = await db.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname = current_schema()`;
  if (rows.length) throw new Error("Refusing database bootstrap: the target schema is not empty.");
} finally {
  await db.$disconnect();
}
const directory = mkdtempSync(path.join(tmpdir(), "mvp-schema-test-"));
const schemaDirectory = path.join(directory, "prisma");
mkdirSync(schemaDirectory);
const env = { ...process.env, DATABASE_URL: raw, CHECKPOINT_DISABLE: "1", PRISMA_HIDE_UPDATE_MESSAGE: "1" };
const cli = path.join(root, "node_modules/prisma/build/index.js");
const runPrisma = (args) => execFileSync(process.execPath, [cli, ...args], { cwd: root, env, stdio: "inherit" });
try {
  const paths = execFileSync("git", ["ls-tree", "-r", "--name-only", baseline, "packages/database/prisma"], { cwd: root, encoding: "utf8" })
    .trim().split("\n").filter((file) => file.endsWith(".prisma"));
  if (!paths.length) throw new Error("Released baseline schemas are unavailable; checkout history is required.");
  for (const file of paths) {
    const content = execFileSync("git", ["show", `${baseline}:${file}`], { cwd: root });
    writeFileSync(path.join(schemaDirectory, path.basename(file)), content);
  }
  runPrisma(["db", "push", "--schema", schemaDirectory, "--skip-generate"]);
  runPrisma(["db", "execute", "--schema", "packages/database/prisma", "--file", `packages/database/prisma/migrations/${migration}/migration.sql`]);
  // --from-schema-datasource reads the connection without echoing it as an argument.
  runPrisma(["migrate", "diff", "--from-schema-datasource", "packages/database/prisma", "--to-schema-datamodel", "packages/database/prisma", "--exit-code"]);
  console.log("Disposable database verified: released schema + unchanged new migration equals proposed schema.");
} finally {
  rmSync(directory, { recursive: true, force: true });
}
