import { readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const schemaPath = "packages/database/prisma";
const migrationsPath = join(schemaPath, "migrations");
const seedScript = "packages/database/prisma/seed-staging-test-employee.mjs";

function executable(name) {
  return process.platform === "win32" ? `${name}.cmd` : name;
}

function run(command, args, options = {}) {
  const result = spawnSync(executable(command), args, {
    env: process.env,
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit"
  });

  if (options.capture) {
    return {
      status: result.status ?? 1,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? ""
    };
  }

  if (result.status !== 0) {
    throw new MigrationCommandError(
      `${command} ${args.join(" ")} failed with exit code ${result.status ?? 1}.`,
      result.status ?? 1
    );
  }
  return { status: 0, stdout: "", stderr: "" };
}

export class MigrationCommandError extends Error {
  constructor(message, exitCode = 1) {
    super(message);
    this.name = "MigrationCommandError";
    this.exitCode = exitCode;
  }
}

export function classifyMigrationFailure(output) {
  if (output.includes("P3005")) return "P3005";
  if (output.includes("P3009")) return "P3009";
  return null;
}

function printCaptured(result) {
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
}

function listMigrationNames() {
  return readdirSync(migrationsPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => basename(entry.name))
    .sort();
}

function migrateDeploy() {
  return run("npx", ["prisma", "migrate", "deploy", "--schema", schemaPath], {
    capture: true
  });
}

function schemaDiff(databaseUrl) {
  return run(
    "npx",
    [
      "prisma",
      "migrate",
      "diff",
      "--from-url",
      databaseUrl,
      "--to-schema-datamodel",
      schemaPath,
      "--exit-code"
    ],
    { capture: true }
  );
}

async function readMigrationHistory() {
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();

  try {
    return await prisma.$queryRawUnsafe(`
      SELECT
        migration_name AS "migrationName",
        started_at AS "startedAt",
        finished_at AS "finishedAt",
        rolled_back_at AS "rolledBackAt"
      FROM "_prisma_migrations"
      ORDER BY started_at ASC
    `);
  } finally {
    await prisma.$disconnect();
  }
}

export function buildMigrationHistoryRecoveryPlan(localMigrationNames, migrationHistory) {
  const localNames = new Set(localMigrationNames);
  const unresolvedFailedRows = migrationHistory.filter(
    (row) => row.finishedAt == null && row.rolledBackAt == null
  );

  if (unresolvedFailedRows.length === 0) {
    throw new MigrationCommandError(
      "Prisma reported P3009, but _prisma_migrations contains no unresolved failed migration. Refusing automatic recovery."
    );
  }

  const unknownFailed = unresolvedFailedRows.filter((row) => !localNames.has(row.migrationName));
  if (unknownFailed.length > 0) {
    throw new MigrationCommandError(
      `Failed migration is not present in this release: ${unknownFailed
        .map((row) => row.migrationName)
        .join(", ")}. Refusing automatic recovery.`
    );
  }

  const appliedNames = new Set(
    migrationHistory
      .filter((row) => row.finishedAt != null && row.rolledBackAt == null)
      .map((row) => row.migrationName)
  );

  return {
    failedMigrations: unresolvedFailedRows.map((row) => ({
      migrationName: row.migrationName,
      startedAt: row.startedAt
    })),
    migrationsToResolve: localMigrationNames.filter((name) => !appliedNames.has(name))
  };
}

function requireDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new MigrationCommandError("DATABASE_URL is required before staging migrations can run.");
  }
  return databaseUrl;
}

function assertSchemaMatchesTarget(databaseUrl, diffRunner = schemaDiff) {
  console.log("Comparing the staging database schema with the target Prisma schema...");
  const diff = diffRunner(databaseUrl);

  if (diff.status !== 0) {
    printCaptured(diff);
    throw new MigrationCommandError(
      "Staging schema drift detected. Refusing to resolve migration history while the database differs from the target Prisma schema.",
      diff.status
    );
  }

  console.log("Staging schema matches the target Prisma schema.");
}

function resolveAppliedMigration(migrationName, commandRunner = run) {
  console.log(`Resolving migration as applied after schema verification: ${migrationName}`);
  commandRunner("npx", [
    "prisma",
    "migrate",
    "resolve",
    "--schema",
    schemaPath,
    "--applied",
    migrationName
  ]);
}

export async function recoverP3009({
  databaseUrl,
  localMigrationNames,
  historyReader = readMigrationHistory,
  diffRunner = schemaDiff,
  resolver = resolveAppliedMigration
}) {
  const migrationHistory = await historyReader();
  const plan = buildMigrationHistoryRecoveryPlan(localMigrationNames, migrationHistory);

  for (const failed of plan.failedMigrations) {
    const startedAt = failed.startedAt ? new Date(failed.startedAt).toISOString() : "unknown";
    console.log(`Unresolved failed migration: ${failed.migrationName} (started ${startedAt})`);
  }

  assertSchemaMatchesTarget(databaseUrl, diffRunner);

  for (const migrationName of plan.migrationsToResolve) {
    resolver(migrationName);
  }

  return plan;
}

function baselineExistingStagingSchema() {
  const databaseUrl = requireDatabaseUrl();
  console.log("Checking whether the existing staging schema matches Prisma before baselining migrations...");
  assertSchemaMatchesTarget(databaseUrl);

  for (const migrationName of listMigrationNames()) {
    resolveAppliedMigration(migrationName);
  }
}

export async function main() {
  const firstDeploy = migrateDeploy();
  const deployOutput = `${firstDeploy.stdout}\n${firstDeploy.stderr}`;
  const failureCode = classifyMigrationFailure(deployOutput);

  if (firstDeploy.status === 0) {
    printCaptured(firstDeploy);
  } else if (failureCode === "P3005") {
    printCaptured(firstDeploy);
    baselineExistingStagingSchema();

    const secondDeploy = migrateDeploy();
    printCaptured(secondDeploy);
    if (secondDeploy.status !== 0) {
      throw new MigrationCommandError("Prisma migrate deploy failed after P3005 recovery.", secondDeploy.status);
    }
  } else if (failureCode === "P3009") {
    printCaptured(firstDeploy);
    await recoverP3009({
      databaseUrl: requireDatabaseUrl(),
      localMigrationNames: listMigrationNames()
    });

    const secondDeploy = migrateDeploy();
    printCaptured(secondDeploy);
    if (secondDeploy.status !== 0) {
      throw new MigrationCommandError("Prisma migrate deploy failed after P3009 recovery.", secondDeploy.status);
    }
  } else {
    printCaptured(firstDeploy);
    throw new MigrationCommandError("Prisma migrate deploy failed.", firstDeploy.status);
  }

  run("node", [seedScript]);
}

const isEntrypoint = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntrypoint) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = error?.exitCode ?? 1;
  });
}
