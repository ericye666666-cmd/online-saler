# MVP Task Register

Reviewed against the repository on **2026-09-06**. This register separates code,
test evidence, deployment and real operational acceptance. A merged feature is
not evidence that employees use it successfully or that money has settled.

## Status and evidence rules

- **Implementation:** `Not Started`, `Designed`, `In Progress`, `Implemented`.
- **Validation:** `Not Run`, `Tests Present`, `Passed`, `Failed`, `Blocked`.
  `Tests Present` means a relevant automated test exists; it does not claim a
  fresh passing run or full coverage. Record command, date, revision and result
  when changing it to `Passed`.
- **Production acceptance:** `Pending`, `Partial`, `Accepted`, `Blocked`.
  `Accepted` requires dated production or field evidence, a named owner and a
  recorded result. Development fixtures and simulated payments do not qualify.
- **Deployment:** record the actual deployed revision and environment in release
  evidence. Workflow files or a merge do not prove current runtime state.
  Production bindings have not been independently checked in this document review.

Current production product counts, completed orders, refunds and commission
payments **have not been queried in this review**. Do not fill those figures
from test data or infer completion of the first 1,000 items.

## Existing implementation

| ID | Area / deliverable | Implementation | Validation evidence | Production acceptance / next proof |
|---|---|---|---|---|
| ARCH-001 | Next.js, NestJS, Prisma and PostgreSQL monorepo | Implemented | Workspace build/typecheck/test scripts present | Pending: confirm deployed revisions and dependency boundaries, including POS |
| GOV-001 | Branch, CR, migration and release governance | Implemented | [Engineering Rules v1](../docs/development/engineering-rules-v1.md) | Pending: apply required CI/review and release gates to this change |
| INFRA-001 | Staging and production deployment definitions | Implemented | Workflow files and deployment script tests present | Pending: verify live resources, secrets bindings, scheduler, backup restore, monitoring and rollback |
| PROD-001 | Product states and unique barcode rules | Implemented | `product-domain.spec.ts`, `product-barcode-format.spec.ts` | Pending: verify ten unique garments, labels and state transitions in the field |
| PROD-002 | Product, inventory and supporting Prisma models | Implemented | Append-only migrations and schema validation scripts present | Pending: verify deployed schema and preserve historical records |
| PROD-003 | Product services, calibration, review and audit records | Implemented | Product and calibration tests present | Pending: verify staff permissions, rework and publication on the deployed revision |
| FACT-001 | Three-stage batch factory: capture → automation → confirmation/publication | Implemented | Batch flow, size, upload and display tests present | Pending: uninterrupted ten-item batch and measured operator time |
| IMG-001 | Original images, cutout/white background, required AI display image and sales details | Implemented | Image, detail generation and measurement guide tests present | Pending: ten-item visual checks, human confirmation and actual per-item cost; alternate publication guards tracked below |
| INV-001 | Warehouse location codes, capacities, shelf assignment and movement | Implemented | Warehouse capacity/storage tests; location screen uses codes such as `A-010101` | Pending: confirm physical shelf labels, capacities and system mappings |
| INV-002 | Labels with barcode/size/shelf and grouped batch stock-in | Implemented | Local label print and batch storage tests present | Pending: label readability and 10/10 physical-to-system location match |
| SHOP-001 | Catalog, filters, detail, Google sign-in, cart and bilingual checkout | Implemented | Storefront UI/cart tests; [historical UI QA](../design-qa.md) | Pending: current deployed mobile purchase flow using real inventory |
| PAY-001 | M-Pesa initiation, callback, polling and payment-driven stock updates | Implemented | Payment service, client and fulfillment tests present | Partial (historical report only): project conversation reports order `DL-20260812-04E59DC1`, 200 KSh, Paid on 2026-08-12; receipt/database not rechecked here |
| PAY-002 | Production Till configuration and release checklist | Implemented | Production guard tests and [launch checklist](PRODUCTION_LAUNCH_CHECKLIST.md) | Pending: verify current Till, callback, runtime mode, scheduler and payment reconciliation |
| PAY-003 | Fifteen-minute reservation, expiry, retry and duplicate-event protection | Implemented | Checkout/payment tests present | Pending: concurrent same-item, timeout and late-callback evidence; fresh regression tracked below |
| FUL-001 | Order center, scan picking, packing, pickup and delivery workflow | Implemented | Fulfillment state and payment-to-fulfillment tests present | Pending: one real pickup and one real delivery completed with handover evidence |
| RET-001 | Service tickets and return/refund requirement recording | Implemented | Fulfillment/service code present; full closure is not implied | Pending: inspection, refund evidence, inventory and commission reconciliation; RET-002 below |
| AFF-001 | Single-level referral attribution and commission ledger | Implemented | `affiliate-service.test.ts`, `affiliate-platform.test.ts` | Pending: real attributed order and verified configured rate; AFF-003 below |
| AFF-002 | Affiliate profiles, collections, campaigns and share assets | Implemented | Affiliate platform tests; approved [CR-002](CHANGE_REQUESTS.md) | Pending: actual promoter use, attributable orders and one weekly settlement |
| DATA-001 | Inventory, warehouse/search analytics and Metabase integration | Implemented | Analytics service, inventory overview and Metabase tests present | Pending: reconcile live reports against orders, stock and payment records |

Test filenames above are indexed by workspace `package.json` files and the root
test script. They document discoverable coverage, not passing results for this
readiness work.

## Authorized readiness work — 2026-09-06

The owner authorized this work after reviewing the autonomous closure scope.
[CR-003 and CR-004](CHANGE_REQUESTS.md) define existing-rule enforcement and
manual after-sales boundaries. Preserve actual configured commission rates;
the prior discussion of 30% and the code fallback of 10% are not evidence of
the current production setting.

| ID | Deliverable | Implementation | Validation | Completion evidence / remaining gate |
|---|---|---|---|---|
| CLOSE-001 | Reconcile this register, employee/admin SOPs and field acceptance plan | Implemented | Passed (document checks) | SOPs, status distinctions, links, table structure and diff checked; staff training and production evidence remain pending |
| AI-002 | Finish cost-control changes and prevent unnecessary paid deployment checks | Implemented | Passed (targeted: 17 mocked tests) | Provider/configuration behavior verified; actual model access, garment quality, billed cost and final CI remain pending |
| PROD-004 | Enforce required, human-confirmed AI display image and publication readiness across entry points | Implemented | Passed (targeted: 55 tests) | CR-003; alternate paths, batch retries and return-to-review covered; native database CI and field verification remain pending |
| AFF-003 | Enforce commission delivery/return timing, safe transitions and refund reconciliation | Implemented | Passed (targeted: 13 tests; 3 PGlite scenarios) | CR-003/004; 24-hour eligibility, paid-history preservation and audit covered; two native concurrency scenarios and final CI pending |
| PAY-004 | Re-run checkout/payment/inventory abnormal-case regression and repair demonstrated gaps | Implemented | Passed (targeted: 12 PGlite scenarios); Tests Present (native CI pending) | Sequential retry/callback/expiry behavior passed; five native concurrency scenarios explicitly skipped locally and must pass in PostgreSQL CI |
| RET-002 | Audited return decision, physical inspection and externally verified refund recording | Implemented | Passed (targeted: 8 after-sales + 8 legacy customer-service tests; 1 PGlite chain) | CR-004; newer fulfillment changes require refreshed results; browser, final CI and actual refund execution pending |
| QA-001 | Integrate and test the changed modules together | In Progress | Tests Present (full/native CI pending) | Local targeted checks and 16 PGlite scenarios passed; seven native concurrency checks skipped; browser and final candidate CI remain pending |
| REL-001 | Inspect deployment/POS dependencies and prepare rollout/rollback | Implemented | Passed (static/document checks) | [Rollout plan](../docs/deployment/mvp-readiness-rollout.md) prepared; staging-named Storefront uses live M-Pesa. Actual targets, POS dependencies, backup/restore and deployment remain unverified |

Dated counts, their limitations and PR/CI references are recorded in the
[2026-09-06 readiness results](../docs/testing/mvp-readiness-results-2026-09-06.md).
Implementation completion above describes the prepared changes and documentation;
it does not promote any production or field acceptance status.

## Field and commercial launch

The first **1,000 unique online garments stay isolated from store/POS stock**.
The same physical garment must not be offered simultaneously through a store
and the online MVP. No stock transfer or production quantity correction is
authorized by updating this document.

| ID | Work outside code completion | Status | Required evidence / responsibility |
|---|---|---|---|
| FIELD-001 | Power, capture board, printing, internet and labeled shelves ready | Pending | Warehouse lead to be named; opening check recorded |
| FIELD-002 | Train operators and run one ten-item batch | Pending | Named operator/reviewer; [field acceptance record](../docs/testing/mvp-field-acceptance.md) |
| FIELD-003 | Real pickup and delivery orders | Pending | Named customer-service and fulfillment owners; receipt, scans and handover evidence |
| FIELD-004 | Returns, refund reconciliation and weekly affiliate settlement | Pending | Named warehouse inspector and finance owner; external transaction evidence |
| FIELD-005 | Expand from accepted batches to 1,000 sellable items | Pending | Dated production counts and physical stock reconciliation, excluding sold/unavailable/rejected items |
| OPS-001 | Assign capture, review, fulfillment, support and finance duties | Pending | Existing staffing discussions are not a completed roster; record names, backups and training results |
| GROW-001 | Activate 10–20 affiliates and run 30-day commercial validation | Pending | Operational owner, attributable orders, weekly settlement and daily economics review |

General-merchandise Distributor workflows, store/POS changes, franchise rollout
and offline B2B bale sales are separate projects. Do not count them toward the
software or field acceptance of the 1,000-item clothing MVP.
