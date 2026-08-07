import assert from "node:assert/strict";
import test from "node:test";

import {
  MigrationCommandError,
  assertOrderCenterMigrationWasRolledBack,
  buildMigrationHistoryRecoveryPlan,
  classifyMigrationFailure,
  isKnownOrderCenterEnumFailure,
  recoverP3009
} from "./deploy-staging-migrations.mjs";

const localMigrations = [
  "0002_product_domain_v0_2",
  "202607290001_ai_extraction_persistence",
  "20260731170000_add_product_image_processing"
];

test("keeps P3005 baseline detection while adding P3009 recovery", () => {
  assert.equal(classifyMigrationFailure("Error: P3005 database is not empty"), "P3005");
  assert.equal(classifyMigrationFailure("Error: P3009 failed migrations found"), "P3009");
  assert.equal(classifyMigrationFailure("Error: P3018 migration failed"), null);
});

test("plans a verified baseline for a failed first migration and pending migrations", () => {
  const plan = buildMigrationHistoryRecoveryPlan(localMigrations, [
    {
      migrationName: "0002_product_domain_v0_2",
      startedAt: new Date("2026-07-29T14:48:48.072Z"),
      finishedAt: null,
      rolledBackAt: null
    }
  ]);

  assert.deepEqual(plan.failedMigrations.map((item) => item.migrationName), [
    "0002_product_domain_v0_2"
  ]);
  assert.deepEqual(plan.migrationsToResolve, localMigrations);
});

test("does not resolve migrations that already completed successfully", () => {
  const plan = buildMigrationHistoryRecoveryPlan(localMigrations, [
    {
      migrationName: "0002_product_domain_v0_2",
      startedAt: new Date("2026-07-29T14:48:48.072Z"),
      finishedAt: null,
      rolledBackAt: null
    },
    {
      migrationName: "202607290001_ai_extraction_persistence",
      startedAt: new Date("2026-07-29T15:00:00.000Z"),
      finishedAt: new Date("2026-07-29T15:00:01.000Z"),
      rolledBackAt: null
    }
  ]);

  assert.deepEqual(plan.migrationsToResolve, [
    "0002_product_domain_v0_2",
    "20260731170000_add_product_image_processing"
  ]);
});

test("refuses recovery when the failed migration is not in the release", () => {
  assert.throws(
    () =>
      buildMigrationHistoryRecoveryPlan(localMigrations, [
        {
          migrationName: "unknown_failed_migration",
          startedAt: new Date(),
          finishedAt: null,
          rolledBackAt: null
        }
      ]),
    /not present in this release/
  );
});

test("refuses recovery when P3009 has no unresolved failed row", () => {
  assert.throws(
    () =>
      buildMigrationHistoryRecoveryPlan(localMigrations, [
        {
          migrationName: "0002_product_domain_v0_2",
          startedAt: new Date(),
          finishedAt: new Date(),
          rolledBackAt: null
        }
      ]),
    /no unresolved failed migration/
  );
});

test("resolves migration history only after the schema diff succeeds", async () => {
  const events = [];

  await recoverP3009({
    databaseUrl: "postgresql://staging.example/online_saler",
    localMigrationNames: localMigrations,
    historyReader: async () => [
      {
        migrationName: "0002_product_domain_v0_2",
        startedAt: new Date("2026-07-29T14:48:48.072Z"),
        finishedAt: null,
        rolledBackAt: null
      }
    ],
    diffRunner: () => {
      events.push("diff");
      return { status: 0, stdout: "", stderr: "" };
    },
    resolver: (migrationName) => events.push(`resolve:${migrationName}`)
  });

  assert.deepEqual(events, [
    "diff",
    "resolve:0002_product_domain_v0_2",
    "resolve:202607290001_ai_extraction_persistence",
    "resolve:20260731170000_add_product_image_processing"
  ]);
});

test("schema drift stops P3009 recovery before any migration is resolved", async () => {
  const resolved = [];

  await assert.rejects(
    recoverP3009({
      databaseUrl: "postgresql://staging.example/online_saler",
      localMigrationNames: localMigrations,
      historyReader: async () => [
        {
          migrationName: "0002_product_domain_v0_2",
          startedAt: new Date("2026-07-29T14:48:48.072Z"),
          finishedAt: null,
          rolledBackAt: null
        }
      ],
      diffRunner: () => ({
        status: 2,
        stdout: "[-] Missing ProductImageProcessingJob",
        stderr: ""
      }),
      resolver: (migrationName) => resolved.push(migrationName)
    }),
    (error) => error instanceof MigrationCommandError && /schema drift/i.test(error.message)
  );

  assert.deepEqual(resolved, []);
});

test("recognizes only the known transactional enum failure", () => {
  assert.equal(
    isKnownOrderCenterEnumFailure({
      migrationName: "20260801170000_unify_operations_order_center",
      logs: 'Database error code: 55P04. unsafe use of new value "READY_TO_PACK"'
    }),
    true
  );
  assert.equal(
    isKnownOrderCenterEnumFailure({
      migrationName: "20260801170000_unify_operations_order_center",
      logs: "permission denied"
    }),
    false
  );
});

test("rolls back the known failed migration only after proving no schema artifacts remain", async () => {
  const events = [];

  const plan = await recoverP3009({
    databaseUrl: "postgresql://staging.example/online_saler",
    localMigrationNames: [
      "20260801165000_add_operations_fulfillment_statuses",
      "20260801170000_unify_operations_order_center"
    ],
    historyReader: async () => [
      {
        migrationName: "20260801170000_unify_operations_order_center",
        startedAt: new Date("2026-08-01T15:37:00.000Z"),
        finishedAt: null,
        rolledBackAt: null,
        logs: 'PostgreSQL error 55P04: unsafe use of new value "READY_TO_PACK"'
      }
    ],
    rollbackStateReader: async () => {
      events.push("inspect-rollback");
      return {
        hasNewFulfillmentStatuses: false,
        hasFulfillmentItemTable: false,
        hasDeliveryRiderTable: false,
        hasDeliveryAssignmentTable: false,
        hasOrderPickupCode: false,
        hasPackingStartedByEmployeeId: false,
        hasFulfillmentEventIdempotencyKey: false
      };
    },
    rolledBackResolver: (migrationName) => events.push(`rolled-back:${migrationName}`),
    diffRunner: () => {
      throw new Error("target-schema diff must not run before retrying a rolled-back migration");
    }
  });

  assert.equal(plan.recoveryStrategy, "ROLLBACK_AND_RETRY");
  assert.deepEqual(events, [
    "inspect-rollback",
    "rolled-back:20260801170000_unify_operations_order_center"
  ]);
});

test("refuses rollback resolution when a failed migration left any schema artifact", async () => {
  assert.throws(
    () => assertOrderCenterMigrationWasRolledBack(undefined),
    /Could not inspect/
  );
  assert.throws(
    () => assertOrderCenterMigrationWasRolledBack({ hasNewFulfillmentStatuses: true }),
    /left schema artifacts/
  );

  await assert.rejects(
    recoverP3009({
      databaseUrl: "postgresql://staging.example/online_saler",
      localMigrationNames: ["20260801170000_unify_operations_order_center"],
      historyReader: async () => [
        {
          migrationName: "20260801170000_unify_operations_order_center",
          startedAt: new Date("2026-08-01T15:37:00.000Z"),
          finishedAt: null,
          rolledBackAt: null,
          logs: 'PostgreSQL error 55P04: unsafe use of new value "READY_TO_PACK"'
        }
      ],
      rollbackStateReader: async () => ({ hasDeliveryRiderTable: true }),
      rolledBackResolver: () => {
        throw new Error("must not resolve a partial migration");
      }
    }),
    /left schema artifacts/
  );
});
