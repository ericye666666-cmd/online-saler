# Kikuyu MVP field acceptance plan

Prepared **2026-09-06**. **Plan only: no field step below has been executed or
marked passed by preparing this document.** Production counts, current runtime
configuration and money settlement have not been independently queried in this
review. Historical payment success is not acceptance of the current release.

## Record the run before starting

| Field | To complete |
|---|---|
| Run date, local time and timezone | Pending |
| Environment, deployed API/Operations/Storefront revisions | Pending |
| Batch code and ten product/barcode references | Pending |
| Capture operator / reviewer / warehouse lead | Pending — assign names and backups |
| Customer-service / pickup / delivery owners | Pending — assign names and backups |
| Finance and affiliate settlement owner | Pending — assign names and backups |
| Existing live payment mode and actual commission rate/source checked by | Pending |
| Evidence location and final reviewer | Pending |

Keep receipts, private customer details and staff records in the approved private
operational evidence location. Link a restricted reference in the acceptance
record; do not commit phone numbers, credentials or receipt images to Git.

## Preconditions

- [ ] Required code validation and staging scenarios passed for the intended
  release; record the release/test evidence rather than assume it.
- [ ] The real environment and its relationship to store/POS systems are known.
  Do not alter POS or store stock to perform these checks.
- [ ] Power, internet, measurement board, camera, printing and shelf labels work.
- [ ] Ten unique, sellable physical garments are set aside in positions 1–10,
  separate from store stock. Include different garment types, one light-colored
  garment and one item with a disclosed defect where available.
- [ ] Shelves have space for ten and the screen matches the physical codes.
- [ ] Named staff know their accounts and duties. A role discussed previously
  does not establish today's person responsible.
- [ ] Existing production payment, delivery and commission settings are verified.
  Record the actual configured rate; do not change it to 10% or 30% for this run.

The first 1,000 online items remain isolated from store stock. These ten are part
of that controlled online stock when real production inventory is used.

## A. Ten-item digital production and physical stock

Use the [employee SOP](../product-factory-employee-sop.md) in one uninterrupted
batch. Keep an observer's measurements separate from the operator's work.

| Check | Expected result | Result / evidence |
|---|---|---|
| A1 Photograph ten, then upload in order | Each product shows its matching garment and required photos; no duplicate products | Pending |
| A2 Run processing | All ten reach reviewable results; failures stay attached to the same item and retries are recorded | Pending |
| A3 Confirm facts and measurements | Ten records checked against the garment; title/category/size/condition/defects/price are correct | Pending |
| A4 Required AI display images | Ten images present and checked by a named human; no invented/hidden garment features or defects | Pending |
| A5 Labels and shelf assignment | Ten different barcodes; every label includes the correct size and shelf; all are readable | Pending |
| A6 Physical placement | 10/10 garments match their barcode and assigned shelf; shelf group counts sum to ten | Pending |
| A7 Batch stock-in/publication | Final confirmation occurs after physical placement and image checks; no duplicate records if an action is retried | Pending |
| A8 Mobile storefront check | All ten published products can be inspected with usable images, facts and prices before any are reserved/sold | Pending |
| A9 Independent retrieval | A different employee finds the requested garments using their recorded shelves and barcodes | Pending |

Fill one row per item. Product numbers below are worksheet positions, not system
product codes; replace pending identifiers with the actual records.

| Item | Product / barcode | Facts and AI image checked by | Printed / actual shelf match | Published / retrieval result |
|---|---|---|---|---|
| 01 | Pending | Pending | Pending | Pending |
| 02 | Pending | Pending | Pending | Pending |
| 03 | Pending | Pending | Pending | Pending |
| 04 | Pending | Pending | Pending | Pending |
| 05 | Pending | Pending | Pending | Pending |
| 06 | Pending | Pending | Pending | Pending |
| 07 | Pending | Pending | Pending | Pending |
| 08 | Pending | Pending | Pending | Pending |
| 09 | Pending | Pending | Pending | Pending |
| 10 | Pending | Pending | Pending | Pending |

Record capture/upload time, human confirmation time, printing/placement time,
processing wait, retries, reprints and items requiring rework. Use attributable
provider usage/billing to calculate total batch AI cost and cost per successfully
published item. If actual cost is unavailable, mark it **unverified**; do not
substitute a model estimate or invent a productivity pass threshold.

## B. Controlled abnormal-case checks in staging

Run deliberate error injection and clock manipulation only in the appropriate
test environment. Do not replay fabricated callbacks or change production
timestamps to force a pass.

| Scenario | Expected result | Result / evidence |
|---|---|---|
| Cart / reservation boundary | Adding to cart does not reserve; payment initiation starts the documented 15-minute reservation | Pending |
| Two customers, same unique item | Only one active reservation/sale can succeed; the other customer receives an unavailable response | Pending |
| Failed initiation, cancelled payment and expiry | State and stock reconcile correctly; stock is released when due and does not remain locked indefinitely | Pending |
| Duplicate and late payment events | No duplicate order, stock sale or commission; late payment never takes stock already belonging to another customer and remains reconcilable | Pending |
| Missing/wrong AI image and unavailable stock | Every publication entry point refuses unmet prerequisites; normal batch publication still works | Pending |
| Wrong picking scan | Wrong barcode blocks packing/handover; correct barcode allows the intended transition | Pending |
| Return/refund/commission paths | Allowed sequence succeeds; duplicates, premature confirmation, invalid refund references and unsafe restocking are rejected | Pending |
| Permissions | A staff account cannot perform actions outside its assigned role | Pending |

## C. Real orders and handover

Use actual consenting purchasers and the existing live configuration for real
orders. Do not reset sold items to available to reuse them in a test. Record any
remaining external access or operational blocker as **Blocked**, not Passed.

| Check | Expected result | Result / evidence |
|---|---|---|
| C1 Pickup purchase with two garments | Actual charged amount matches the checkout total and receipt; payment/order/stock agree for both items | Pending |
| C2 Pickup fulfillment | Picker locates both garments, scans matching barcodes, packs them, records ready-for-pickup, then completes actual customer handover | Pending |
| C3 Delivery purchase via a valid affiliate link | Correct affiliate attribution is recorded; items, delivery charge and paid total match existing rules | Pending |
| C4 Delivery fulfillment | Assigned staff collect the correct package, record dispatch and actual delivery; customer and Operations views agree | Pending |
| C5 Post-sale stock reconciliation | Sold items cannot be purchased again; remaining available count reconciles with the original ten and active reservations | Pending |

Record both order numbers, item barcodes, private receipt references, payment
amounts, order/fulfillment timestamps, pickup/delivery evidence and responsible
staff. A `PAID` order alone does not pass C2 or C4.

## D. After-sales and commission settlement

Follow the existing [MVP business rules](../business-rules/mvp-rules.md). Do not
invent a defect or an eligible return to create a production test. If no actual
eligible case is available, record staging coverage separately and leave the
real after-sales execution **Pending**.

| Check | Expected result | Result / evidence |
|---|---|---|
| D1 Request and decision | Actual request time, reason and evidence recorded; 24-hour window and existing eligibility rules applied | Pending |
| D2 Returned-item inspection | Correct physical garment/barcode received; condition and resellability recorded by the inspector | Pending |
| D3 Actual refund and recording | Finance verifies an external refund under the existing payment process; system record matches actual amount and transaction reference; recording does not itself transfer money | Pending |
| D4 Stock after return | Stock changes only after physical receipt/acceptance; product returns to REVIEW_PENDING for individual review and publication, without duplicate stock-in; no newer reservation/sale is overwritten | Pending |
| D5 Commission reversal | Related commission is adjusted; any already-paid amount remains a finance recovery item with payment history preserved | Pending |
| D6 Eligible commission confirmation | For the completed attributed order, wait the actual 24 hours after delivery and check for valid returns before confirmation | Pending |
| D7 Weekly payment | Finance pays through its actual approved process; affiliate confirms receipt and ledger evidence matches amount and external payment reference | Pending |

Record whether the deployed after-sales workflow has a usable staff interface
or still requires an authorized operator to use an API. Do not report a complete
employee process if only the backend is implemented. A “mark paid” action is
not proof that a refund or commission reached the recipient.

## Decision and expansion to 1,000

For each failed or blocked check, record the issue, affected product/order,
owner, fix and recheck result. Stop publication/handover for mismatched garments,
misleading images, missing stock, duplicate sale, unexplained payment differences
or unverified refund/commission entries until the affected case is resolved.

| Acceptance area | Decision | Named reviewer / evidence |
|---|---|---|
| Code/staging regression | Pending | Pending |
| Ten-item physical batch | Pending | Pending |
| Real pickup and delivery | Pending | Pending |
| Real after-sales execution | Pending | Pending |
| Commission receipt and weekly settlement | Pending | Pending |
| Current infrastructure / backup / rollback readiness | Pending | Pending |
| Complete MVP field acceptance | Pending | Pending |

After a successful batch, repeat the process and reconcile each batch. To claim
1,000 sellable garments, provide a dated production count of unique approved,
published, available online items with usable images and correct physical
locations. Exclude sold, reserved, missing, rejected and unfinished items from
that available-stock count. Keep total garments ever digitized as a separate
metric. Ten successful items do not establish acceptance of 1,000 items or the
30-day commercial launch.
