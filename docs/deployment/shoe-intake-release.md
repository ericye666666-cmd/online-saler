# Shoe intake release — 2026-09-06

The shoe intake application changes are merged in PRs
[183](https://github.com/ericye666666-cmd/online-saler/pull/183) and
[184](https://github.com/ericye666666-cmd/online-saler/pull/184).
The customer-domain release is still pending. See the
[validation record](../testing/shoe-intake-results-2026-09-06.md) for CI,
deployment evidence and live-browser limitations.

## Actual service mapping

All services below are in project `online-saler-staging`, region
`africa-south1`. The project name does not establish payment or data isolation.

| Surface | Service | Shoe release status |
|---|---|---|
| Employee Operations | `online-saler-operations-staging` | Deployed; authenticated first-pair acceptance pending |
| Product API | `online-saler-api-staging` | Migration, deployment and smoke checks passed |
| Staging-named Storefront URL | `online-saler-storefront-staging` | Deployed and shoe navigation checked |
| Customer domain `dloop.co.ke` | `online-saler-storefront-production` | Still on the previous application release |

The customer Storefront uses the staging-named API, but its database Secret is
`PRODUCTION_DATABASE_URL`. The API uses `STAGING_DATABASE_URL`. The shared Cloud
SQL attachment does not prove the same database/schema. Production preflight
must establish this before deployment, without printing connection strings or
changing the database.

The [2026-08-13 production deployment](https://github.com/ericye666666-cmd/online-saler/actions/runs/31688652751)
records the previous application image:

```text
africa-south1-docker.pkg.dev/online-saler-staging/online-saler/storefront@sha256:02b8327dfffea30f2676311cc886b234afb3a82e96b482b99c14a8b1ffbd7c4b
```

This is a historical rollback candidate, not a newly verified traffic/revision
snapshot. Record the current production revision and traffic before releasing;
preserve current runtime configuration if an image rollback is needed. No
database rollback or destructive migration is part of this release.

## Final manual production release

Use the existing
[Deploy Storefront to Production workflow](https://github.com/ericye666666-cmd/online-saler/actions/workflows/deploy-storefront-production.yml)
after the production preflight change has been merged and its CI has passed.
Record the selected commit SHA and the resulting workflow run URL.

| Run workflow field | Value for this release |
|---|---|
| Branch | `develop`, including the merged production preflight change |
| `confirm` | `deploy-production` |
| `mpesa_launch_mode` | `live` — preserves the mode recorded in the existing production service |

The manual trigger and confirmation remain in place. Do not retry with weaker
checks if preflight fails. A database-target mismatch or schema difference needs
diagnosis before publishing the new Storefront. This workflow must not run
`db push`, seed test operators, reset data or automatically repair migrations.

The current assistant GitHub connection supports reviewing, committing, merging
and reading Actions results but does not expose a `workflow_dispatch` action.
An operator must start this existing manual workflow from GitHub. No alternate
production trigger is introduced to work around that missing capability.

After success, verify `dloop.co.ke` itself, not only the workflow's Cloud Run
service URL: open the Shoes menu and check that the featured Boots and Sandals
cards apply their corresponding shoe-type filters. Check the cart without
placing an order or initiating payment. The absence of saleable shoes is
expected until real pairs have completed intake and publication.

## First physical intake

Follow the bilingual [employee SOP](../shoe-intake-employee-sop.md):
商品中心 → 新建批次 → 鞋类 · 一双一个商品.

Use actual adult and children's pairs for the initial acceptance. Capture all
four required views, verify the printed size system and original label, and
confirm same-model/same-size pairing and condition manually. Compare generated
display images against the actual shoes before approving. Confirm one product,
one barcode and one inventory unit per pair, then check the published size,
shoe type, condition, original gallery and price on the customer domain.

Physical photography, condition inspection and generated-image acceptance have
not been performed by the automated tests. The release does not assert live
payment acceptance or reservation-scheduler operation.
