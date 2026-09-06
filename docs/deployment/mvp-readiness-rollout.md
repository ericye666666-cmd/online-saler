# MVP readiness rollout and rollback — 2026-09-06

**This is a prepared release plan, based on repository inspection. It is not a
deployment or production acceptance record.** This review has no verified
production credentials, database connection or server inventory. Current live
revisions, stock/order totals, backup recoverability and POS dependencies remain
unverified. Record those facts before executing the cloud steps below.

## The existing “staging” workflows can affect live commerce

| Repository evidence | Actual behavior visible in code | Release consequence |
|---|---|---|
| [deploy-storefront-staging.yml](../../.github/workflows/deploy-storefront-staging.yml) | Named “Deploy Live Storefront”; pushes to `develop` deploy `online-saler-storefront-staging` with `MPESA_ENV=production`, `MPESA_ENVIRONMENT=production`, `MPESA_PRODUCTION_LAUNCH_MODE=live`, production M-Pesa secrets and `DATABASE_URL=STAGING_DATABASE_URL:latest` | Do not treat this service or database as disposable or payment-isolated because its name contains staging |
| Same Storefront workflow | Uses the staging Cloud SQL instance/runtime account and resolves `online-saler-api-staging`; public callback is derived from the deployed URL | Confirm which domain, database and Till real customers use; a separate production-named workflow does not answer that question |
| [deploy-api-staging.yml](../../.github/workflows/deploy-api-staging.yml) | Push to `develop` builds processors/API, runs `db:migrate-staging`, seeds operator records, creates smoke-test products and executes a scoped cleanup job | This is more than an application image deploy; do not run it against an unverified live database as a rehearsal |
| [deploy-operations-staging.yml](../../.github/workflows/deploy-operations-staging.yml) | Independently deploys on a matching `develop` push and resolves the staging-named API | API, Storefront and Operations jobs do not have a shared migration/deployment sequence |
| Storefront reservation scheduler step | `continue-on-error: true`; missing secret can skip setup | Green deployment does not prove the one-minute expiry job is working |
| [deploy-storefront-production.yml](../../.github/workflows/deploy-storefront-production.yml) | Manual workflow with separate production variables, database secret and explicit payment-mode input | It deploys Storefront only; it neither proves API/Operations readiness nor identifies the currently used customer environment |

Before merging a schema-affecting release into `develop`, the release operator
must have a controlled deployment gate in place. With the existing independent
push workflows, a merge can start live mutations before review of the target
database or completion of the migration. A draft PR and green unit tests alone
do not prevent that behavior.

One concrete control is to pause the three deployment workflows while performing
the coordinated release below. These are **operator actions, not actions already
taken in this review**:

```bash
gh workflow disable deploy-api-staging.yml --repo ericye666666-cmd/online-saler
gh workflow disable deploy-operations-staging.yml --repo ericye666666-cmd/online-saler
gh workflow disable deploy-storefront-staging.yml --repo ericye666666-cmd/online-saler
gh run list --repo ericye666666-cmd/online-saler --status in_progress
gh run list --repo ericye666666-cmd/online-saler --status queued
```

Disabling does not cancel an already running job. Identify any deployment in
progress and let a known safe step finish or stop that specific execution after
checking whether its migration has begun. Do not cancel unrelated CI or business
work. Leave normal deployment automation paused until its live target, sequencing
and cleanup behavior have been reviewed; do not blindly re-enable it at the end.

## Validate the candidate using an isolated database

Record the immutable candidate commit, base commit and commands/results. Required
repository checks are:

```bash
npm ci
npm run db:generate
npx prisma validate --schema packages/database/prisma
npm run typecheck
npm run ci
git diff --check
```

The [CI database job](../../.github/workflows/ci.yml) uses a disposable local
PostgreSQL 16 service and mocked external providers. The prepared sequence is:

```bash
node scripts/prepare-integration-db.mjs
npm run build -w @online-saler/database
npm run build -w @online-saler/shared-types
npm run build -w @online-saler/business-rules
npm run build -w @online-saler/api
npm run test:integration
```

Set `MVP_INTEGRATION_DATABASE_URL` to an **empty, loopback PostgreSQL test
database** and `DATABASE_URL` to that same test connection before running these
commands. The helper refuses non-loopback targets, non-test database names,
unexpected URL parameters and nonempty schemas. These commands must never point
at a Cloud SQL production or staging database. Integration tests mock payment
providers; their results do not establish live M-Pesa or actual money settlement.

### Historical migration bootstrap limitation

`0002_product_domain_v0_2/migration.sql` begins with UTF-8 BOM bytes `ef bb bf`.
Replaying the complete history into an empty database failed with a syntax error
in the local PostgreSQL-compatible verification engine. Preserve historical
files and checksums; do not remove that BOM in this release or mark failed cloud
migrations applied merely to continue.

[prepare-integration-db.mjs](../../scripts/prepare-integration-db.mjs) therefore:

1. Materializes the released Prisma schema from pinned `main` release commit
   `e319fe94febb0479fe143914c0e2b6f6d87b764d` in an empty disposable test database.
2. Executes the exact new
   `20260906140000_add_manual_after_sales/migration.sql`, without changing it.
3. Runs a database-to-proposed-schema diff with `--exit-code`; any remaining
   schema difference fails preparation.

Its temporary `prisma db push` is solely for the fresh local test baseline. This
is not a shared-database deployment method, does not repair historical migration
history, and does not verify a full historical install. The CI checkout needs
full history (`fetch-depth: 0`) for that pinned baseline. Shared-environment
upgrade still requires a real backup/clone rehearsal and `prisma migrate deploy`.

## Record the actual target and rollback references

Complete this worksheet from authorized cloud access. Names in the existing
workflows are leads to check, not confirmed runtime facts.

| Required fact | Status |
|---|---|
| Customer domain → Storefront service and project/region | Pending |
| Storefront → API URL and database instance/database/schema | Pending |
| Operations → API URL; worker/cleanup jobs and schedulers using the same database | Pending |
| Actual M-Pesa environment, launch mode, callback URL and Till | Pending |
| Relationship to POS servers, databases and shared services | Pending |
| Current API/Operations/Storefront revision names, image digests and traffic split | Pending |
| Runtime identities, secret reference names/versions and nonsecret model settings | Pending |
| Database migration history, schema drift, backup ID and isolated restore result | Pending |
| Named release owner, finance/warehouse contacts and field acceptance owners | Pending |

Use the following variables only after mapping the target: `READINESS_PROJECT`,
`READINESS_REGION`, `READINESS_SQL_INSTANCE`, `READINESS_SQL_CONNECTION`,
`READINESS_DATABASE_SECRET_VERSION` (a `SECRET_NAME:VERSION` reference, not a URL),
`READINESS_RUNTIME_ACCOUNT`, `READINESS_API_SERVICE`, `READINESS_OPERATIONS_SERVICE`,
`READINESS_STOREFRONT_SERVICE`, and immutable `READINESS_*_IMAGE` digests. Record
`READINESS_PREVIOUS_*_REVISION` for rollback and a candidate `READINESS_SUFFIX`.
Do not copy secret values into Git, shell history, PR descriptions or this document.

For each mapped service, record nonsecret revision/traffic/image information:

```bash
gcloud run services describe "${READINESS_API_SERVICE:?}" \
  --project "${READINESS_PROJECT:?}" --region "${READINESS_REGION:?}" \
  --format='json(status.latestReadyRevisionName,status.traffic,spec.template.spec.serviceAccountName,spec.template.spec.containers.image)'
```

Repeat for Operations and Storefront. Inspect effective secret bindings, database
targets, callback and model settings in a restricted session without printing
credential values. Verify the scheduler URI and recent successful executions;
neither the service name nor its configured schedule proves that it runs.

## Back up, rehearse and migrate before changing application traffic

The new migration adds `AfterSaleReturn`, `RefundRecord`, `CommissionAdjustment`
and `AfterSaleEvent`, their enums, indexes, foreign keys and amount constraints.
It does not require rewriting historic order/payment/commission rows. Review
the exact SQL and migration status on the mapped database.

1. Create and verify a backup of the **actual shared target instance**, then
   rehearse recovery into an isolated instance/database. Keep that restored
   environment disconnected from production payment, schedulers, messages and
   store/POS applications. Record the backup ID, completion and restore evidence.
2. Rehearse the new migration on the restored copy. Run the prior application
   versions against the expanded schema as well as the candidate versions. Schema
   additivity is not proof of old-version compatibility or safe mixed-version
   financial actions.
3. Before live migration, stop staff return/refund/commission mutations and
   prevent old Operations sessions from using those actions. Account for direct
   API access and jobs, not just visible buttons. Keep paid-order callbacks and
   reservation cleanup working unless a separately controlled maintenance plan
   handles in-flight payments.
4. Confirm only the intended new migration is pending. If migration history or
   schema drift differs from the rehearsed target, stop the rollout and diagnose;
   do not use `db push`, reset, drop or blanket `migrate resolve` on shared data.

Backup commands (execution and verification remain pending):

```bash
gcloud sql backups create --instance "${READINESS_SQL_INSTANCE:?}" \
  --project "${READINESS_PROJECT:?}" --description "Before MVP readiness release"
gcloud sql backups list --instance "${READINESS_SQL_INSTANCE:?}" \
  --project "${READINESS_PROJECT:?}" --format='table(id,status,startTime,endTime)'
```

Use a dedicated migration job built from the candidate API image. Its root
`npm run db:deploy` invokes `prisma migrate deploy --schema prisma` in the database
workspace. Unlike `db:migrate-staging`, it does not seed a test operator or invoke
the staging migration-recovery helper. The API Dockerfile includes the database
package, Prisma tooling and migrations needed by this command.

```bash
gcloud run jobs deploy mvp-readiness-migrate \
  --project "${READINESS_PROJECT:?}" --region "${READINESS_REGION:?}" \
  --image "${READINESS_API_IMAGE:?}" \
  --service-account "${READINESS_RUNTIME_ACCOUNT:?}" \
  --set-cloudsql-instances "${READINESS_SQL_CONNECTION:?}" \
  --set-secrets "DATABASE_URL=${READINESS_DATABASE_SECRET_VERSION:?}" \
  --command npm --args run,db:deploy \
  --max-retries 0 --task-timeout 10m --quiet
gcloud run jobs execute mvp-readiness-migrate \
  --project "${READINESS_PROJECT:?}" --region "${READINESS_REGION:?}" --wait
```

Do not continue to API deployment if that execution fails. Inspect the recorded
execution and `_prisma_migrations`; a failed migration may have left partial
artifacts. Do not retry or mark it applied until the actual state is understood.

## Deploy API, Operations and Storefront in a controlled sequence

Build all images from the same validated candidate and record immutable digests.
Retain the existing mapped service identities, database bindings, callback URLs,
traffic settings and business configuration. Apply AI model/quality settings
explicitly according to [cost controls](../ai/openai-cost-controls.md); otherwise
an older runtime override can defeat the new defaults. Do not change commission
rates, payment mode, Till, live stock or POS configuration as part of this release.

1. After migration succeeds, deploy the candidate API with no customer traffic.
   Review its inherited bindings and test its tagged URL using authenticated
   read-only checks. Avoid creating test products in the live database.
2. Route API traffic to the validated candidate. Confirm signed-in Operations
   sessions send Bearer tokens; forged `adminUserId` requests must be rejected.
3. Deploy compatible Operations and then Storefront from the candidate, using
   the same no-traffic check before each traffic switch. Their `API_URL` must
   target the mapped API service. The new order includes depend on the migration.
4. When all active writers run compatible versions, allow the new return and
   commission actions. Check the deployed staff interface, owner-only handling
   for managed cases and external-refund evidence requirements.

API example, repeated with the mapped Operations/Storefront variables in that
order. Do not copy these commands with staging defaults substituted implicitly:

```bash
gcloud run deploy "${READINESS_API_SERVICE:?}" \
  --project "${READINESS_PROJECT:?}" --region "${READINESS_REGION:?}" \
  --image "${READINESS_API_IMAGE:?}" \
  --no-traffic --tag mvp-readiness --revision-suffix "${READINESS_SUFFIX:?}"
gcloud run services describe "${READINESS_API_SERVICE:?}" \
  --project "${READINESS_PROJECT:?}" --region "${READINESS_REGION:?}" \
  --format='json(status.latestCreatedRevisionName,status.latestReadyRevisionName,status.traffic)'
```

Record the verified candidate revision as `READINESS_API_REVISION`, then switch
only that service's traffic:

```bash
gcloud run services update-traffic "${READINESS_API_SERVICE:?}" \
  --project "${READINESS_PROJECT:?}" --region "${READINESS_REGION:?}" \
  --to-revisions "${READINESS_API_REVISION:?}=100"
```

Prefer the controlled image rollout above to dispatching the whole current
staging API workflow: the latter also seeds accounts, writes smoke products and
runs cleanup. Pause if existing cached clients cannot authenticate after the
backend change; do not restore trust in caller-supplied admin IDs as a workaround.

## Verification and stop conditions

Check logs/latency, authenticated read routes, product browsing, images, cart,
current paid-order reconciliation and scheduled reservation expiry. Verify a
changed service's dependency calls, not only `/health`. Do not replay synthetic
payment callbacks against live orders.

Then use the [field acceptance plan](../testing/mvp-field-acceptance.md) for the
ten-item batch, real pickup and delivery, image/physical-stock matching, return
inspection, real refund evidence and actual weekly commission receipt. Keep code,
deployment and field results separate; a green workflow cannot mark those rows
passed. Live AI quality and total billed product cost require their own evidence.

Stop further rollout for migration failure, missing new tables, authentication
breakage, unusable main images, double reservation/sale, unmatched payments,
stuck expiry cleanup or incorrect financial history. Record affected identifiers,
the deployed revision and the next responsible operator.

## Rollback keeps the new schema and financial evidence

Choose the smallest safe rollback: an Operations-only UI rollback need not
remove backend enforcement. If an API rollback is necessary, first suspend new
return/refund/commission mutations and reconcile in-flight requests. The old API
does not contain the new managed-return and commission guards; do not allow old
writers to process new return records or record payouts during rollback.

For each affected service, restore its recorded previous revision/traffic split.
The following example assumes the previous API served 100%; use the recorded
split instead if it did not:

```bash
gcloud run services update-traffic "${READINESS_API_SERVICE:?}" \
  --project "${READINESS_PROJECT:?}" --region "${READINESS_REGION:?}" \
  --to-revisions "${READINESS_PREVIOUS_API_REVISION:?}=100"
```

Restore the recorded model/quality overrides when rolling back cost behavior.
Keep original and approved images, returns, refunds, adjustments, audit logs and
migration history. **Do not drop new tables, reverse migrations by deletion,
reset product quantities or restore a pre-release database over new live sales.**
A database restore is an incident recovery operation with explicit reconciliation
of all post-backup payments and orders, not routine application rollback.

After rollback, recheck callback/expiry health and stock/order/payment consistency.
Keep new financial operations suspended until a compatible corrected API is
deployed. Record rollback revision, time, reason, preserved pending cases and
finance follow-up; do not erase paid commission history to make totals agree.

## Release record

| Evidence | Result |
|---|---|
| Candidate and image digests; relevant validation and full CI | Pending — append actual run references |
| Target mapping, POS dependency check and backup/restore rehearsal | Pending |
| Applied migration and schema/migration-history verification | Pending |
| API/Operations/Storefront revisions and traffic checks | Pending |
| Live callback, expiry, signed staff access and existing-order reconciliation | Pending |
| Ten-item, real-order, refund and commission field acceptance | Pending |
| Rollback references and named release/finance owners | Pending |

Update [TASKS.md](../../project/TASKS.md) from this evidence. Prepared code,
documentation and tests must not be reported as already deployed or accepted.
