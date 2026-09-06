# Change Requests

Use this file when a change affects shared business rules, data contracts, APIs, or state machines.

| ID | Status | Summary | Impacted modules | Decision |
|---|---|---|---|---|
| CR-002 | Approved | Unify customer and small-business promotion as one Affiliate Platform V1 | Affiliate, Storefront, Transaction attribution, Database, Cloud Storage | Approved by owner request on 2026-08-04; implement without changing commission states, settlement, or level-up rules. |
| CR-003 | Approved for implementation; acceptance pending | Enforce existing product publishing and commission eligibility rules at every backend entry point | Product, Inventory, Affiliate, Operations | Owner authorized the reviewed MVP closure work on 2026-09-06. Preserve configured commission rates and historical records. |
| CR-004 | Approved for implementation; acceptance pending | Complete auditable manual after-sales handling with inventory and commission reconciliation | Fulfillment, Returns, Payment records, Inventory, Affiliate, Operations | Owner authorized the reviewed after-sales closure scope on 2026-09-06. No live money transfer or new commercial eligibility rule is authorized by this implementation record. |

## CR-003: Existing-rule enforcement

- **Current contract:** Approved product content and physically available inventory are required for sale. The current batch factory requires an approved AI display image. Commission confirmation is allowed only 24 hours after delivery with no valid return; refunded items revoke the related commission.
- **Change:** Apply equivalent backend guards to alternate publish/review paths and manual commission actions. Reject invalid or duplicate transitions, preserve actor and audit evidence, and identify configuration defaults explicitly without changing an existing affiliate's rate.
- **Payment/inventory enforcement:** Preserve the existing 15-minute reservation, one-item stock, idempotent M-Pesa callback and manual-review rules. Serialize payment initiation, callback settlement and reservation cleanup, recheck reservation ownership inside the transaction, and prevent late/duplicate callbacks or stock-in retries from releasing or selling stock held by another order. External provider calls are mocked during automated verification.
- **Authentication enforcement:** Affiliate actions must resolve the actor from a verified Operations token rather than trusting a caller-supplied administrator ID. Existing permission grants remain intact; forged, missing or expired credentials must be rejected.
- **Additive Operations responses:** Commission settings expose `source` (`FALLBACK` or `SYSTEM_SETTING`), and commission rows expose `eligibility.eligibleAt` and `eligibility.blockingReason`. Existing consumers may ignore these fields; they explain existing rules without changing configured rates or historical amounts.
- **Database/API impact:** Prefer existing fields and states; internal validation may reject requests that previously bypassed the documented rules. Document any additive field separately before implementing it.
- **Operations/finance impact:** Ineligible products and commissions remain blocked until their prerequisites are completed. This work neither pays affiliates nor changes historic amounts.
- **Rollback:** Redeploy the previous application image. Keep audit records and do not restore an invalid state through a bulk data rewrite.
- **Decision:** Implementation is authorized by Eric's 2026-09-06 instruction to start the proposed autonomous work. Production configuration, live payments, and field acceptance remain independently verifiable gates.

## CR-004: Manual after-sales closure

- **Current contract:** MVP return reasons and the 24-hour request window remain those in `docs/business-rules/mvp-rules.md`; service tickets currently record return/refund needs but do not complete their execution.
- **Change:** Add a backend-controlled, audited path for request, decision, returned-item inspection, verified refund recording, and related inventory/commission reconciliation. Refund recording must require an external transaction reference and must never call a transfer provider implicitly. Restocking requires a received and accepted physical item and must not overwrite newer reservations or sales. Paid commission reversals remain a finance recovery item rather than silently erasing payment history.
- **Database impact:** Any additional workflow records use a new append-only migration. Preserve all existing orders, payments, inventory and commission history; no production data repair is included.
- **API impact:** Add authenticated Operations endpoints and backward-compatible response fields as needed; existing storefront/payment contracts remain intact.
- **Operations/finance impact:** Staff can record and reconcile an externally verified refund. Eligibility, delivery charges, refund amounts beyond the original paid order, and automatic money movement are not redesigned.
- **Rollback:** Disable the new workflow and redeploy the previous application image; keep the additive schema and all audit/refund evidence. Never roll back by deleting financial history or editing an earlier migration.
- **Decision:** Implementation is authorized by Eric's 2026-09-06 instruction. Record implementation and test evidence separately from actual production refund execution.

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
