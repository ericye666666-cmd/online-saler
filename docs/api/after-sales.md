# Manual after-sales API (CR-004)

Implementation contract, 2026-09-06. No endpoint initiates a transfer. An externally verified refund is a financial record, not a request to a payment provider.

## Authentication and permissions

All routes require the Operations bearer token; body/query actor IDs are ignored. Read requires `orders.view`. Request and inspection require `orders.after-sale`. Approval/rejection and refund recording require both `orders.after-sale` and existing `action.customer-service.approve`; these powers are not added to existing role grants automatically.

## Additive endpoints

Base: `/operations/orders/:orderId/after-sales`.

- `GET /`: return `{ returns: [...] }`, including order item/snapshot, refund records, commission adjustment and audit events.
- `POST /`: `{ orderItemId, reason, note, idempotencyKey }`. Reason is one of `WRONG_ITEM`, `PHOTO_MISMATCH`, `UNDISCLOSED_DEFECT`, `MEASUREMENT_DIFFERENCE`, `DELIVERY_DAMAGE`. Server receipt must be within 24 hours after fulfillment completion; a measurement difference requires `measurementDifferenceCm > 3`. The order must have successful payment and completed delivery/pickup. No client timestamp bypass.
- `POST /:returnId/decision`: `{ approved: boolean, note, idempotencyKey }`.
- `POST /:returnId/receive`: `{ receivedBarcode, restockable: boolean, note, idempotencyKey }`. Record actual physical receipt and inspection. Mismatched barcodes cannot be marked restockable. Receipt alone does not make the item available.
- `POST /:returnId/refunds`: `{ amountKsh, externalReference, evidenceNote, refundedAt, note, idempotencyKey }`. Require a positive integer amount, external proof/reference and nonfuture timestamp; aggregate refund cannot exceed the original order-item line total or original successful order payment. Delivery fees are not automatically refunded. Additional externally verified installments may be recorded up to the item limit. A partial installment keeps the return RECEIVED and the service ticket/commission hold open; only the full original line total completes refund reconciliation.
- `POST /:returnId/restock`: `{ locationCode, note, idempotencyKey }`. Only after physical receipt judged restockable and full item refund reconciliation. Requires original barcode identity, unchanged delivered inventory, no newer paid/reserved/completed sale, and active shelf capacity. Changes inventory to AVAILABLE and product to REVIEW_PENDING, requiring refreshed product review/publish before sale.

Every mutation requires a nonempty reason/note and an idempotency key. Reusing a key with different action/payload is rejected; retries return current recorded state. All mutations lock the original Order row before reading financial/workflow state; restock also locks locations and inventory and uses conditional writes.

## Additive data and states

`AfterSaleReturn`: unique order item; `REQUESTED -> APPROVED -> RECEIVED -> REFUND_RECORDED`, or `REQUESTED -> REJECTED`. One audited lifecycle per unique sold item. Request/decision/receipt actors, timestamps, reason and barcode inspection evidence are persisted. `restockedAt` records a separate optional inventory action. A rejected request is final in this workflow; exceptional reopening remains manual review, never timestamp backdating.

`RefundRecord`: immutable manual externally verified amount/reference/time/actor/evidence. External reference is globally unique. Original Payment SUCCESS record remains intact. Order is marked REFUNDED only if recorded refund sum equals total paid order price; partial item refunds preserve COMPLETED. A partly reimbursed item remains RECEIVED with requiresRefund/return/commission flags active; neither restocking nor financial settlement is enabled by a first installment.

`AfterSaleEvent`: immutable action with source app, authenticated actor, before/after JSON, note, request hash and order-scoped unique idempotency key.

`CommissionAdjustment`: one immutable adjustment per returned item. Refunded items revoke their original share of the order commission (integer KSh apportioned by original item prices, deterministic largest remainder). Pending/confirmed commissions retain their history and lose only that item share; zero balance becomes REJECTED. Already PAID commissions retain paid state/amount/time and generate `RECOVERY_REQUIRED`, never a fictitious recovery or transfer. Approval/request do not move money. REQUESTED, APPROVED and RECEIVED returns block commission confirmation/payment. The first verified installment revokes that item’s commission share, but the unresolved return continues blocking the remaining order commission. Managed service tickets close on rejection or full item refund reconciliation; unrelated service tickets are never silently closed.

## Rollout and limits

Append-only migration; no historical migration or production data rewrite. Deploy schema before code. Roll back runtime by disabling the new workflow/redeploying previous image; retain all tables and evidence. True customer delivery, receipt of the physical garment, externally executed refunds and recovery settlement need actual operational verification. The first implementation does not add automatic refunds, shipping-fee policy, goodwill compensation or retroactive request eligibility.

## Verification evidence

- `operations-after-sales.spec.ts`: eligibility boundary, cumulative financial limits, exact commission apportionment, evidence validation, token-derived actor identity, approval permission gate, and lock-before-idempotency ordering.
- `operations-product-publication.service.spec.ts` also covers the returned-item sequence: receipt/refund restock yields REVIEW_PENDING + AVAILABLE; use the individual product review, prepare-for-storage, and publish controls to reapprove refreshed product facts. A legacy batch containing archived/unpublished siblings may be unsuitable for batch-wide republishing.
- Prisma schema validation/generation and API TypeScript validation run locally. An actual PostgreSQL transaction/integration test is a separate gate; do not label fixture/unit tests as executed customer refunds.
