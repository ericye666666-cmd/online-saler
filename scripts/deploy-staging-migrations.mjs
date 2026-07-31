import { readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { spawnSync } from "node:child_process";

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
    process.exit(result.status ?? 1);
  }
  return { status: 0, stdout: "", stderr: "" };
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

function baselineExistingStagingSchema() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is required before staging migrations can run.");
    process.exit(1);
  }

  console.log("Checking whether the existing staging schema matches Prisma before baselining migrations...");
  const diff = run(
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

  if (diff.status !== 0) {
    printCaptured(diff);
    console.error(
      "Staging database is not migration-baseline-safe. Refusing to mark migrations as applied while schema drift exists."
    );
    process.exit(diff.status);
  }

  for (const migrationName of listMigrationNames()) {
    console.log(`Marking existing staging migration as applied: ${migrationName}`);
    run("npx", [
      "prisma",
      "migrate",
      "resolve",
      "--schema",
      schemaPath,
      "--applied",
      migrationName
    ]);
  }
}

const firstDeploy = migrateDeploy();
if (firstDeploy.status === 0) {
  printCaptured(firstDeploy);
} else if (`${firstDeploy.stdout}\n${firstDeploy.stderr}`.includes("P3005")) {
  printCaptured(firstDeploy);
  baselineExistingStagingSchema();

  const secondDeploy = migrateDeploy();
  printCaptured(secondDeploy);
  if (secondDeploy.status !== 0) {
    process.exit(secondDeploy.status);
  }
} else {
  printCaptured(firstDeploy);
  process.exit(firstDeploy.status);
}

run("node", [seedScript]);
