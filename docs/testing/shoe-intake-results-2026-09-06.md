# Shoe intake validation — 2026-09-06

This release adds the shoe intake path to the existing ten-item batch factory.
One pair remains one Product, one Barcode and one InventoryItem. It does not
change payment, order quantity, commission or shelf allocation rules.

## Implemented behavior

- New batches offer `鞋类 · 一双一个商品`; ten ordered product positions are
  created with category SHOES and persisted intakeCategory.
- Capture requires original pair, side, soles and size-label views. AI receives
  the latest originals only. A human confirms the same-model/same-size pair and
  customer-visible condition notes; AI never supplies that confirmation.
- Original tag text and its size system are retained without conversions. Adult
  and children's shoes bypass clothing fit recommendations and garment board,
  cutout and symmetry processing. Optional insole length is manually measured.
- Shoe AI display images are generated from the current whole-pair original.
  Selection and final publication reject old cutout-derived images and images
  based on a replaced front photograph.
- Shoe details and storefront filters use shoe type, actual shoe size and actual
  condition labels. Shoes never default to M or show clothing measurement diagrams.
- Calibration and all review/publication paths enforce shoe facts and source
  photos; existing AI-image, barcode, label, review and shelf checks remain.

## Evidence and limits

- Targeted API/provider/details, Operations form payload and storefront tests
  cover adult and kids shoes, unknown/conflicting sizes, human confirmation,
  original-image ownership/freshness, missing views, image lineage and apparel
  regression.
- The local shoe database test passes against disposable PGlite using SQL from
  the released schema plus the exact existing readiness and new shoe migrations.
  It verifies ten-pair batch creation, default apparel batches, real calibration
  writes/audit decisions, missing-label rejection without review writes, complete
  approval/publication and one inventory item per pair. This is sequential
  evidence; the GitHub CI PostgreSQL 16 job is the native database gate.
- The integration bootstrap replays both additive migrations and uses Prisma
  schema diff against PostgreSQL. Historical migrations are unchanged.
- Browser navigation to the local Operations preview was blocked with
  `net::ERR_BLOCKED_BY_CLIENT`. No authenticated shoe form browser acceptance
  or visual approval is claimed from typechecks/builds.
- Paid OpenAI calls and real customer payments were not used for these tests.
  First live intake should use actual adult and children's pairs and compare
  generated images with their originals before publishing.

Employee instructions: [shoe intake SOP](../shoe-intake-employee-sop.md).

## Merged release and deployed services

- [PR 183](https://github.com/ericye666666-cmd/online-saler/pull/183) contains
  the intake feature; [PR 184](https://github.com/ericye666666-cmd/online-saler/pull/184)
  corrects the two shoe navigation cards to Boots and Sandals with matching filters.
  Both are merged into `develop`; the application commit is
  `7acf43092cd2f58589dda08a604363de6444f9f7`.
- Local `npm run ci` passed, including 247 API tests and all application builds.
  [Native PostgreSQL CI](https://github.com/ericye666666-cmd/online-saler/actions/runs/34059177576)
  passed the schema diff and all 25 database integration tests with no skipped
  tests. [Final application CI](https://github.com/ericye666666-cmd/online-saler/actions/runs/34059671044)
  also passed both jobs.
- The [API deployment](https://github.com/ericye666666-cmd/online-saler/actions/runs/34059311193)
  succeeded, including its migration job, API smoke checks and scoped smoke-data
  cleanup. [Operations deployment](https://github.com/ericye666666-cmd/online-saler/actions/runs/34059311191)
  succeeded. [Staging-named Storefront deployment](https://github.com/ericye666666-cmd/online-saler/actions/runs/34059670969)
  succeeded with seven smoke checks and revision
  `online-saler-storefront-staging-00095-9x4` serving all traffic.
- A browser check confirmed Boots/Sandals on the staging-named Storefront.
  The customer domain still showed the previous navigation. Its Shoes category
  was empty; this release has not entered or published the user's physical pairs.
  On the customer domain, one existing garment could be added to the cart and
  was shown as available after inventory refresh; it was then removed. No order
  or payment was created. Operations required sign-in, so authenticated live
  intake acceptance remains outstanding.

## Customer-domain deployment remains pending

The customer domain `dloop.co.ke` targets
`online-saler-storefront-production`, not `online-saler-storefront-staging`.
The [domain audit](https://github.com/ericye666666-cmd/online-saler/actions/runs/31362760329)
records its load balancer and serverless NEG route. The
[last production deployment](https://github.com/ericye666666-cmd/online-saler/actions/runs/31688652751)
used application commit `e319fe94febb0479fe143914c0e2b6f6d87b764d`, the
staging-named API, production payment mode `live`, and
`DATABASE_URL=PRODUCTION_DATABASE_URL:latest`.

The API migration uses `STAGING_DATABASE_URL:latest`. Both services attach the
same Cloud SQL instance, but this alone does not establish that their database
and schema are identical. The production release must verify the targets and
current schema before switching its application image. Do not count green
staging-named deployments as customer-domain acceptance. The existing production
workflow remains manual, with its confirmation and payment-mode inputs intact.
