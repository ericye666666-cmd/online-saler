# Engineering Rules v1

This document turns the current project governance decisions into executable
engineering rules. It does not change business rules, product contracts, API
contracts, or state machines.

## Branch Strategy

- `develop` is the integration branch for feature and fix work.
- `main` is release-only and must represent production-ready code.
- Feature branches use `feature/*`; fixes use `fix/*`; documentation-only work
  uses `docs/*`.
- Pull requests target `develop` by default.
- `main` receives only release or hotfix pull requests.
- Branch protection must require CI, review conversation resolution, and pull
  request review before merge on `develop` and `main`.
- Force pushes and branch deletion should be blocked for `develop` and `main`.

## Pull Request Rules

- Every PR must declare scope, risk, validation, and rollout impact.
- Draft PRs are required for incomplete infrastructure, schema, or domain work.
- CI must pass before merge.
- Required review conversations must be resolved before merge.
- PRs must not include secrets, credentials, production data, or unrelated file
  churn.
- PRs must not mix low-level schema changes with unrelated UI or workflow
  changes.
- If implementation discovers a required shared-contract change, stop that
  part of the PR and submit a Change Request instead of silently changing the
  contract.

## Migration Rules

- Prisma migrations are append-only.
- Never edit, rename, reorder, or delete historical migration folders after
  they have been merged.
- Do not use `prisma db push` against shared cloud databases.
- Shared environments must use `prisma migrate deploy`.
- Local development may use local PostgreSQL and disposable databases.
- Pull request CI should use an ephemeral PostgreSQL service container when a
  database integration test is needed.
- Pull request CI must not connect directly to long-lived staging or
  pre-production Cloud SQL.

## Change Request Rules

The following changes require a documented Change Request before
implementation:

- Shared data contracts, including Prisma models that other modules depend on.
- API request or response fields.
- Product, inventory, reservation, order, payment, fulfillment, return,
  attribution, or commission states.
- Core business rules such as inventory locking, refund eligibility, delivery
  fees, pricing, payment flow, attribution, or commission timing.
- Cross-module permissions or shared error codes.

Change Requests must include impact on database, API, operations, finance,
rollback, and whether Eric approval is required.

## Database Change Rules

- Database writes must preserve one-item inventory integrity.
- State changes must be backend-controlled and audit logged.
- High-risk manual overrides require actor, source app, reason, before state,
  and after state.
- Domain services must own state transitions; controllers and frontends may
  request actions but must not set final states directly.
- Unique identifiers such as product codes and formal barcodes must be enforced
  by database constraints and domain checks.
- Long-lived staging or pre-production data must be treated as real operational
  data.

## API Version Rules

- MVP APIs remain unversioned until a breaking external contract exists.
- Breaking API changes require a Change Request and migration notes.
- Internal services may add fields backward-compatibly when callers can ignore
  them.
- Public, operations, admin, and webhook surfaces must keep separate ownership
  and auth assumptions.
- Webhook handlers must be idempotent once payment integration begins.

## Definition of Done

A PR is not done until:

- Scope is limited to the stated module or document area.
- `npm run db:generate` succeeds when Prisma types are used or changed.
- Prisma schema validation succeeds when database files are in scope.
- Relevant typecheck, build, and tests pass.
- `npm run ci` passes.
- `git diff --check` passes.
- PR description records validation results, known blockers, rollback notes,
  and follow-up tasks.

## Release Flow

```text
feature/* or fix/*
        |
        v
      develop
        |
        v
 automated staging deployment
        |
        v
 staging smoke test
        |
        v
 release PR to main
        |
        v
 production deployment
```

## Rollback Principles

- Runtime rollback should prefer redeploying the previous known-good image.
- Database rollback must be planned before merge when a migration is risky.
- Never roll back a shared migration by editing historical migration files.
- Data repair scripts must be reviewed, logged, and scoped to explicit records.
- If a release changes business behavior, rollback notes must explain what
  happens to already-created orders, reservations, payments, returns, and
  commissions.
