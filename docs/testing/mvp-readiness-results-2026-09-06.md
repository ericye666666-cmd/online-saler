# MVP readiness validation results — 2026-09-06

**The initial PR revision passed full repository CI and PostgreSQL 16 integration,
including all seven native concurrency checks. Follow-up fulfillment/UI changes
require the next candidate run. Browser access is blocked in this session;
deployment and field acceptance remain pending.** Local simulated providers do not establish actual
payment, refund, commission receipt or OpenAI cost/quality.

## Candidate and evidence scope

| Reference | Recorded value / status |
|---|---|
| Review PR | [PR #181](https://github.com/ericye666666-cmd/online-saler/pull/181) |
| Initial PR commit | `8fb74b0c` |
| Initial Actions run | [Run 34049645924](https://github.com/ericye666666-cmd/online-saler/actions/runs/34049645924), Passed: Repository check and Database integration |
| Final candidate revision | Pending — record the final PR head and its own checks |
| Full repository CI | Initial `8fb74b0c`: Passed; follow-up candidate pending |
| Native PostgreSQL 16 integration/concurrency job | Initial `8fb74b0c`: 24 runner tests passed, zero failures/skips (23 business scenarios plus one parent wrapper); follow-up candidate pending |
| Browser interaction verification | Blocked: Cloud Browser rejected both `http://terminal.local:4187` and `http://localhost:4187` with `net::ERR_BLOCKED_BY_CLIENT`; no browser pass claimed |
| Deployment / production database / field acceptance | Pending |

The targeted results below were produced while implementing and reviewing the
working tree. They are not a claim that every result belongs to the initial PR
commit, or that the initial Actions run validates changes added later. Replace
pending entries only with evidence for the actual final candidate. Recent
fulfillment fixes and UI compatibility changes need their updated test records.

## Passed targeted checks

| Area | Recorded result | Coverage and limits |
|---|---|---|
| Product publication | 55 targeted tests passed | Required AI image and human confirmation, current review evidence, normal/alternate publish paths, stock/shelf readiness, retries and returned-item review; transaction fixtures do not prove native database races |
| AI cost controls | 17 mocked provider/configuration tests passed | Model/quality request handling and estimation behavior; no live model-access, image-quality or actual billing claim |
| Commission guards | 13 targeted tests passed | Eligibility timing, configured-rate preservation, safe payment/rejection, verified actor and audit; real database evidence separately below |
| Legacy customer service | 8 targeted tests passed | All legacy controller routes require verified tokens; body actor spoofing rejected; order-lock waiting/re-read, before/after audit, managed-case protection and wrong-order case rejection |
| Structured after-sales | 8 targeted tests passed | Return eligibility, amount and workflow checks; this count predates the latest fulfillment follow-up and must not be relabeled as its regression result |
| Fulfillment inventory integrity | 6 targeted tests passed | Order-lock re-read for cancellation, scan, packing and handover; late requests cannot overwrite returned/resold inventory; duplicate handover preserves completion time |
| Operations compatibility | TypeScript passed | Customer-service requests carry Bearer tokens; managed return cases use the structured workflow and owner-only assignment |
| Documentation | Local links, Markdown table structure and scoped `git diff --check` passed | Employee/supervisor SOP, task register, field plan and rollout plan; no employee training or deployment implied |

Relevant suites are registered in `apps/api/package.json`, including
`operations-product-publication.service.spec.ts`, `prisma-product-publication.spec.ts`,
provider/detail/image tests, `operations-commission-policy.spec.ts`,
`operations-affiliate.service.spec.ts`, `operations-customer-service.service.spec.ts`
`operations-after-sales.spec.ts` and `operations-fulfillment-integrity.spec.ts`. Re-run the candidate's configured test suite
after later edits; the counts above are bounded evidence rather than a permanent
green status for those files.

## Local persistent-database checks: 16 scenarios passed

The local PGlite run used SQL materialized from the released schema plus the
unchanged new migration. Payment/OpenAI providers were mocked or blocked. The
unified local execution returned exit code 0.

| Suite | Sequential scenarios passed | Native concurrency scenarios skipped |
|---|---:|---:|
| `tests/integration/payment-inventory.test.ts` | 12 | 5 |
| `tests/integration/mvp-order-after-sales.test.ts` | 1 | 0 |
| `tests/integration/commission-db.test.ts` | 3 | 2 |
| **Total scenarios** | **16** | **7** |

The commission runner also reports its enclosing parent test as passed; that
wrapper is not counted as a fourth independent business scenario here. This
avoids inflating the combined scenario count.

The full-chain scenario uses two garments and exercises payment, barcode-verified
pickup, staged refund records, commission reconciliation and reviewed restocking
with persistent SQL state. External refund references in the test are fixtures;
no funds were transferred.

The session log is retained outside Git at
`/workspace/scratch/9fa8c3cf494d/test-runtime/pglite-integration-20260906.log`.
It records the 12 payment passes, full-chain pass, three commission child passes
and seven skips. Native CI run evidence should be attached to the final PR so
reviewers do not depend on this session-local file.

PGlite in this run uses a single database connection. Passing sequential SQL
tests establishes persistent behavior and rollback checks in that environment;
it **does not establish concurrent native PostgreSQL correctness**.

## Seven native concurrency checks passed on initial PR revision

| Suite | Skipped locally; executed successfully in native PostgreSQL CI |
|---|---|
| Payment | Two customers reserve the same unique item |
| Payment | Concurrent payment initiation sends only one STK request |
| Payment | Simultaneous duplicate callbacks settle once |
| Payment | Callback racing customer cancellation produces one consistent outcome |
| Payment | Callback racing reservation expiry never leaves paid stock available |
| Commission | Simultaneous payment recording writes one paid status and one audit |
| Commission | Return committed under the shared order lock blocks commission payment recording |

The initial native run executed every case above with the PGlite skip condition
disabled. Its TAP summary is `tests 24 / pass 24 / fail 0 / skipped 0`; one test is
the commission parent wrapper, leaving 23 business scenarios. Later candidates
must preserve this result. The local skips are not counted as local passes.

## Migration and final validation gates

The historical `0002` migration begins with a UTF-8 BOM and failed a complete
empty-database replay in the local PostgreSQL-compatible engine. Historical files
were not rewritten. `scripts/prepare-integration-db.mjs` instead prepares an empty
loopback test database from released schema commit
`e319fe94febb0479fe143914c0e2b6f6d87b764d`, executes the unchanged
`20260906140000_add_manual_after_sales` migration, then compares the resulting
database with the proposed schema. This verifies the candidate upgrade shape;
it does not prove full historical installation or repair shared migration history.

The final CI must record outcomes for the configured `npm run ci` repository job
and the database job's preparation plus `npm run test:integration`. Native race
tests cannot be replaced by the PGlite pass. Browser checks must additionally
verify staff authentication, managed-case owner assignment, after-sales actions
and the corrected publication interface on the final UI/API combination.

Follow the [rollout plan](../deployment/mvp-readiness-rollout.md) before any merge
or dispatch that can reach the shared environment. The staging-named Storefront
workflow uses production M-Pesa and a live launch mode. No service or database
was established as isolated merely from its name.

## Unchanged operational acceptance

Production quantities and current runtime bindings have not been queried in this
review. The first 1,000 online items remain separated from store stock. The
[ten-item field plan](mvp-field-acceptance.md), real pickup/delivery, actual refund,
weekly affiliate receipt, backup recovery and POS dependency check all remain
pending. Code and document completion does not close these gates.

## Browser limitation

A temporary harness imported the actual `AfterSalesPanel` and Operations styles,
with synthetic session props and an independent mock HTTP service. It included
request, approval, inspection, partial/full refund, restock, role and retry states.
Both supported local addresses were rejected by the Cloud Browser client before
the application could be inspected. No production route or authentication bypass
was added. Browser interaction, responsive layout and real API/session pairing
remain required release checks.
