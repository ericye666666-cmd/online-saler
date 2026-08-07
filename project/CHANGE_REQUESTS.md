# Change Requests

Use this file when a change affects shared business rules, data contracts, APIs, or state machines.

| ID | Status | Summary | Impacted modules | Decision |
|---|---|---|---|---|
| CR-002 | Approved | Unify customer and small-business promotion as one Affiliate Platform V1 | Affiliate, Storefront, Transaction attribution, Database, Cloud Storage | Approved by owner request on 2026-08-04; implement without changing commission states, settlement, or level-up rules. |

## CR-002: Affiliate Platform V1

```text
Change Request ID: CR-002
Current rule or contract: Affiliate accounts, referral clicks, seven-day attribution, order attribution, and single-level commissions exist. Affiliate activation is Operations-controlled and there are no public profiles, levels, collections, campaigns, or share-asset records.
Requested change: Let any authenticated customer become a Level 1 Affiliate immediately; add Level 1-3 data, public Affiliate slugs/profiles, Collections, Campaigns, placement-aware links, and template-generated share asset records. Keep exactly one Affiliate identity for customer and small-business promoters.
Reason: Affiliate Platform V1 needs one complete promotion workflow from catalog sharing through attributable visits, orders, commission visibility, collections, campaigns, and downloadable marketing assets.
Impacted modules: Storefront, Affiliate, Transaction attribution, Prisma database, Cloud Storage, Storefront staging image.
Database impact: Append-only migration adds Affiliate level/profile fields, Collection and Campaign models, ShareCard/StatusPack/TikTokVideo records, collection-aware links/clicks, and placement attribution fields.
API impact: Backward-compatible Storefront Affiliate APIs are added. Existing ref/source/campaign parameters remain valid; placement is optional and additive.
Operational impact: Storefront staging needs the existing product-image bucket and a Remotion-compatible Debian image with Chrome runtime libraries. No second backend or authentication system is introduced.
Financial impact: Existing single-level commission calculation and PENDING/CONFIRMED/PAID/REJECTED states are unchanged. Withdrawal remains out of scope.
Risk: New migration and server-side MP4 rendering add database and runtime resource load. Collection publishing is blocked below 5 or above 30 items, and asset generation is Affiliate-only.
Rollback: Redeploy the previous Storefront image. Keep the append-only migration in place; new nullable/additive fields and tables can remain unused. Do not edit or remove historical migrations.
Decision: Approved by the owner request dated 2026-08-04. Level upgrade rules, external social APIs, AI content/video, automatic posting, contact access, bulk messaging, and withdrawals are explicitly excluded.
```

## Template

```text
Change Request ID:
Current rule or contract:
Requested change:
Reason:
Impacted modules:
Database impact:
API impact:
Operational impact:
Financial impact:
Risk:
Rollback:
Decision:
```
