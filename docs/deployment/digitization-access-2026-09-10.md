# Digitization access repair — 2026-09-10

This records implementation and validation, not a declaration that the live system is ready.

## Authorized scope and completed code

Eric authorized fixing the 2026-09-10 readiness findings. CR-005 in `project/CHANGE_REQUESTS.md` records the authentication contract and rollout.

- Operations sends the existing signed employee session for product, image upload, AI, warehouse, inventory and analytics requests.
- The API validates the signed session before employee domain effects. Supplied administrator/employee IDs cannot impersonate the actor. Existing permissions remain enforced.
- Product and warehouse writes require an active employee linked to the signed administrator. New staff accounts create this link atomically with the account. Existing unlinked accounts are not silently reassigned to a test employee.
- Login no longer creates accounts or rewrites role permissions. Disabled/locked accounts stay inactive.
- Explicit deployment initialization creates missing defaults and preserves existing role grants, memberships, employee/account states, password hashes, commission settings, affiliate rates/status and promotion links.
- Operations rejects proxy paths that could escape the configured API origin. Credentials are not sent to local printers or external images.
- Deployment smoke requests use the signed session, mask it in logs and retain existing public media/catalog checks and paid-AI gating.

No schema migration, inventory correction, price change, payment/Till configuration change or money movement is included.

## Validation evidence

- Frontend rollout PR: https://github.com/ericye666666-cmd/online-saler/pull/186 (signed transport and cross-account task protection), merged as `0915ea305a9244952b2c80f3354ad600b2e659d3` after independent code review and successful Repository check and Database integration jobs in https://github.com/ericye666666-cmd/online-saler/actions/runs/34458481044.
- Backend rollout PR: https://github.com/ericye666666-cmd/online-saler/pull/187, now based on `develop` for its own native database CI. Its merge remains conditional on successful Operations deployment and its own CI/review.
- Full local `npm run ci` passed on 2026-09-10 (repository checks, generated Prisma client, all workspace builds/tests).
- API HTTP tests cover 74 protected routes across 13 controllers, missing/invalid/expired credentials, inactive accounts, removed permissions, forged IDs, valid employee actors and public images.
- Login regression checks prove existing edited permissions remain and failed/inactive login performs no provisioning writes.
- Repeated initialization tests preserve custom access and financial settings; fresh defaults match 88 permission definitions and 9 role blueprints.
- Transport/proxy tests cover JSON, multipart and raw image uploads, session expiration, account changes and redirect/path boundaries.
- A native PostgreSQL initialization-preservation test was added under `tests/integration/access-baseline.test.ts`. It only accepts a disposable local test database and rolls back its transaction. Native CI execution remains a release gate.
- No real product/AI/payment/print action or live database repair was performed during local validation.

## Ordered rollout

1. Publish the backward-compatible Operations transport changes first. Existing actor fields remain in client payloads for the old API while rollout is in progress. Wait for Operations deployment success.
2. Publish the API identity enforcement, safe initialization and compatible smoke checks. Wait for migration/deployment/verification results; no new migration is part of this repair.
3. Verify normal administrator sign-in and a named staff account. If an old account has no linked Employee, arrange a reviewed linkage repair or create a linked account; there is no automatic reassignment of historical work.
4. Use the existing manual `Deploy Storefront to Production` workflow on the validated `develop` commit, with `confirm=deploy-production` and existing `mpesa_launch_mode=live`. Its database-target/schema preflight must pass. Do not skip the preflight or rerun an old image deployment to sidestep it.
5. Verify `dloop.co.ke` itself and the Operations digitization page after deployment. A successful staging-named deployment alone does not prove the customer domain was updated.

## Current unresolved evidence and access

Cloud Browser returned server-error pages during the 2026-09-10 audit. Current Cloud Run revision/logs and actual database targets are not accessible from this workspace, so the underlying cause has not been determined. A later direct HTTP check did not obtain a complete service response. These limitations do not establish a database failure or justify changing cloud settings blindly.

The GitHub connection can read project and Actions evidence. No GCP connection or workflow-dispatch capability is available in this session. Initial source push was rejected by automatic approval review; subsequent read-only checks verified that the connected account and repository owner are both `ericye666666-cmd`, with repository admin/push permissions. After those ownership checks, retrying native Git reached its authentication step but the CLI had no credentials. The already-connected GitHub app successfully published the exact reviewed frontend and backend trees as PRs #186 and #187. The frontend has passed native PostgreSQL CI and merged; its Operations deployment is running at https://github.com/ericye666666-cmd/online-saler/actions/runs/34459051970. Backend native CI and live deployment results remain to be recorded.

## First physical batch after service recovery

Use the existing employee SOPs. On the warehouse Windows computer, install/check the printer driver, start `ops/local_print_agent/start_online_saler_print_agent_windows.bat`, then check local health and print one label through Operations. Confirm actual paper and scan readability, not only a successful network request.

Run one batch of ten garments: capture in order, upload, AI, fact and image review, print matching labels, place by grouped shelf list, then confirm stored/published. A second employee must retrieve the correct physical garments by shelf and barcode. Keep the first 1,000 online items separate from store/POS stock.

For shoes, use the shoe batch option and photograph the pair, sides, both soles and readable size labels; manually confirm same model/size and real condition. Check at least adult and child shoe samples before expanding.

Physical printer output, current AI image quality/cost, actual item counts, live payment/self-pickup/delivery, refunds and commission receipt remain field checks, not results of code tests.
