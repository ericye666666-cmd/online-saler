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
