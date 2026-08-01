# MVP State Machines

This document defines the state machines that protect one-item inventory, payment
accuracy, fulfillment, returns, and commission integrity.

State transitions must be enforced by the backend. Frontends may request actions,
but they must not directly set final states.

## Global Rules

- All state changes write `AuditLog`.
- State changes must record actor, timestamp, source app, and reason when manual.
- Payment status and order status are separate.
- Product state and inventory state are separate.
- Inventory reservation and payment callback handlers must be idempotent.
- A terminal state can only be reopened through an explicit exception flow.
- High-risk manual overrides require an admin permission and reason.

## Product State

Product state describes the digital product record and content readiness.

```text
DRAFT
  -> PHOTOGRAPHED
  -> AI_PROCESSING
  -> AI_PROCESSED
  -> CALIBRATION_PENDING
  -> CALIBRATED
  -> BARCODE_ASSIGNED
  -> REVIEW_PENDING
  -> REWORK_REQUIRED
  -> APPROVED
  -> READY_FOR_STORAGE
  -> PUBLISHED
  -> UNPUBLISHED
  -> ARCHIVED
```

### Product State Definitions

| State | Meaning |
| --- | --- |
| `DRAFT` | Product shell exists but has no assigned barcode. |
| `PHOTOGRAPHED` | Required images are uploaded. |
| `AI_PROCESSING` | AI extraction job is running. |
| `AI_PROCESSED` | AI raw output is saved. |
| `CALIBRATION_PENDING` | AI values are ready for human calibration. |
| `CALIBRATED` | Human final data is saved; no formal barcode has been assigned yet. |
| `BARCODE_ASSIGNED` | Unique formal barcode is assigned after calibration. |
| `REVIEW_PENDING` | Calibrated and barcoded product is ready for review. |
| `REWORK_REQUIRED` | Review failed; product needs new photos, data, or condition correction. |
| `APPROVED` | Human reviewer approved final product data. |
| `READY_FOR_STORAGE` | Product is approved and ready for check-in. |
| `PUBLISHED` | Product is visible on Storefront. |
| `UNPUBLISHED` | Product is hidden but not archived. |
| `ARCHIVED` | Product record is closed for normal operations. |

### Product Transition Rules

- Formal barcode is assigned only after human calibration is complete.
- `DRAFT -> PHOTOGRAPHED` requires front, back, and label images tied to the product shell or capture batch item.
- Defect images are required if any defect is recorded.
- `PHOTOGRAPHED -> AI_PROCESSING` can be automatic or manual.
- `AI_PROCESSING -> AI_PROCESSED` saves AI output and confidence values.
- `AI_PROCESSED -> CALIBRATION_PENDING` exposes AI values to the human calibrator.
- `CALIBRATION_PENDING -> CALIBRATED` requires final category, price, condition, and measurements.
- `CALIBRATED -> BARCODE_ASSIGNED` requires unique formal barcode.
- `BARCODE_ASSIGNED -> REVIEW_PENDING` requires barcode and final data to be complete.
- `REVIEW_PENDING -> APPROVED` requires reviewer approval of final category, price, condition, measurements, and barcode.
- `REVIEW_PENDING -> REWORK_REQUIRED` requires reason.
- `REWORK_REQUIRED -> PHOTOGRAPHED` is allowed when new photos are required.
- `REWORK_REQUIRED -> CALIBRATION_PENDING` is allowed when only data or condition correction is required.
- `APPROVED -> READY_FOR_STORAGE` is allowed only when formal barcode and final data are complete.
- `READY_FOR_STORAGE -> PUBLISHED` requires inventory state `AVAILABLE`.
- `PUBLISHED -> UNPUBLISHED` is allowed for admin and system rules.
- `ARCHIVED` cannot return to normal states without admin exception.

## Inventory State

Inventory state describes the physical item's sale and warehouse position.

```text
PENDING_CHECKIN
  -> AVAILABLE
  -> RESERVED
  -> PAID
  -> PICKING
  -> PICKED
  -> PACKED
  -> SHIPPED
  -> DELIVERED
  -> RETURN_INSPECTION
  -> AVAILABLE

Any non-terminal operating state can move to:
  LOST
  DAMAGED
  ADMIN_HOLD
```

### Inventory State Definitions

| State | Meaning |
| --- | --- |
| `PENDING_CHECKIN` | Product approved but not yet scanned into an online location. |
| `AVAILABLE` | Item is physically online and can be sold. |
| `RESERVED` | Item is reserved for a payment attempt. |
| `PAID` | Order is paid and item is no longer for sale. |
| `PICKING` | Item is assigned to a picking task. |
| `PICKED` | Correct barcode was scanned for the order. |
| `PACKED` | Item is inside a parcel. |
| `SHIPPED` | Parcel has left warehouse or is out for pickup handoff. |
| `DELIVERED` | Item was delivered or picked up. |
| `RETURN_INSPECTION` | Returned item is waiting for warehouse inspection. |
| `LOST` | Item cannot be found after exception process. |
| `DAMAGED` | Item cannot be sold because it is damaged. |
| `ADMIN_HOLD` | Admin temporarily blocks sale or movement. |

### Inventory Transition Rules

- `PENDING_CHECKIN -> AVAILABLE` requires product state `READY_FOR_STORAGE` or `PUBLISHED`, a valid online location, and product barcode scan.
- `AVAILABLE -> RESERVED` is created only by payment initiation.
- Cart actions do not change inventory state.
- Reservation duration is 15 minutes.
- One phone number may hold at most 5 active reservations.
- `RESERVED -> AVAILABLE` happens when reservation expires or order is canceled before payment.
- `RESERVED -> PAID` happens only after valid payment confirmation.
- `PAID -> PICKING` happens when picking task is generated.
- `PICKING -> PICKED` requires correct location and product barcode scan.
- `PICKED -> PACKED` requires packer scan confirmation.
- `PACKED -> SHIPPED` requires pickup or delivery handoff.
- `SHIPPED -> DELIVERED` requires pickup code verification, delivery confirmation, or admin-approved evidence.
- `RETURN_INSPECTION -> AVAILABLE` requires inspection pass and optional new location.
- `LOST`, `DAMAGED`, and `ADMIN_HOLD` require reason and audit log.

## Reservation State

Reservation is the short-lived lock created when a customer starts payment.

```text
ACTIVE
  -> PAID
  -> EXPIRED
  -> CANCELLED
  -> RELEASED_BY_ADMIN
```

### Reservation Rules

- Reservation is created when M-Pesa payment is initiated.
- Reservation expires after 15 minutes unless payment is confirmed.
- If M-Pesa callback arrives near expiry, payment handler must verify reservation and payment idempotently.
- Expired reservation releases inventory to `AVAILABLE`.
- Paid reservation moves inventory to `PAID`.
- Duplicate payment callback must not create another reservation or order item.

## Order State

Order state describes the customer order lifecycle.

```text
CREATED
  -> PAYMENT_PENDING
  -> PAID
  -> PICKING
  -> READY_FOR_PICKUP
  -> OUT_FOR_DELIVERY
  -> DELIVERED
  -> COMPLETED

Side paths:
PAYMENT_PENDING -> CANCELLED
PAID -> CANCEL_REQUESTED
PAID -> CANCELLED_BY_PLATFORM
Any active state -> EXCEPTION
DELIVERED -> RETURN_REQUESTED
RETURN_REQUESTED -> RETURN_APPROVED
RETURN_APPROVED -> RETURN_RECEIVED
RETURN_RECEIVED -> REFUNDED
```

### Order State Definitions

| State | Meaning |
| --- | --- |
| `CREATED` | Order shell exists before payment initiation. |
| `PAYMENT_PENDING` | Payment initiated and inventory reserved. |
| `PAID` | Payment confirmed. |
| `PICKING` | Warehouse is picking the order. |
| `READY_FOR_PICKUP` | Order is packed and ready for customer pickup. |
| `OUT_FOR_DELIVERY` | Order is with delivery process. |
| `DELIVERED` | Customer received order or pickup was completed. |
| `COMPLETED` | Delivery plus post-delivery waiting window is complete. |
| `CANCEL_REQUESTED` | Customer requested cancellation after payment. |
| `CANCELLED` | Unpaid order canceled or expired. |
| `CANCELLED_BY_PLATFORM` | Platform canceled due to missing item or exception. |
| `EXCEPTION` | Requires manual review. |
| `RETURN_REQUESTED` | Customer submitted return request. |
| `RETURN_APPROVED` | Return accepted under policy. |
| `RETURN_RECEIVED` | Returned barcode was received. |
| `REFUNDED` | Refund was executed. |

### Order Transition Rules

- Order amount is captured as a price snapshot.
- Order item prices do not change after order creation.
- Delivery fee snapshot is captured at checkout.
- `PAYMENT_PENDING -> CANCELLED` happens when reservation expires before payment.
- `PAID -> PICKING` can be automatic.
- `DELIVERED -> COMPLETED` happens after the return request window passes and no valid return is open.
- Return request must be within 24 hours after delivery.
- Platform-canceled paid orders require refund flow.

## Payment State

Payment state describes money movement and M-Pesa callback handling.

```text
INITIATED
  -> CUSTOMER_PROMPTED
  -> SUCCESS
  -> FAILED
  -> TIMEOUT
  -> MANUAL_REVIEW
  -> REFUND_PENDING
  -> REFUNDED
```

### Payment Rules

- Payment records are separate from orders.
- Each M-Pesa request has an idempotency key.
- M-Pesa callback transaction id must be unique.
- Duplicate callback returns success to M-Pesa but does not repeat state changes.
- Payment amount must match order amount.
- Amount mismatch goes to `MANUAL_REVIEW`.
- Delayed callback after reservation expiry goes to `MANUAL_REVIEW` unless order can be safely paid.
- Refund execution requires restricted permission.
- Refund record must link to original payment.

## Fulfillment State

`OrderFulfillment.status` is the single operational order state machine used by
Operations. `Order.status` remains the high-level payment/completion envelope;
the Order Center must not introduce a second picking or delivery state machine.

```text
PAID
  -> PICKING
  -> READY_TO_PACK
  -> PACKED

Pickup:
PACKED -> READY_FOR_PICKUP -> COMPLETED

Delivery:
PACKED -> READY_FOR_DISPATCH -> OUT_FOR_DELIVERY -> COMPLETED

Any non-completed active state -> EXCEPTION
```

### Fulfillment Rules

- A successful payment creates exactly one `OrderFulfillment` and one
  `FulfillmentItem` per order item.
- Picking is claimed or assigned at order level. Every item retains its barcode
  and warehouse location in the same order detail.
- A wrong barcode records a rejected scan event and cannot verify the item.
- The order reaches `READY_TO_PACK` only when every `FulfillmentItem` is
  `VERIFIED`.
- Packing records the start employee, completion employee, method, parcel count,
  note, and timestamps before moving to `PACKED`.
- Pickup and delivery paths are mutually exclusive. Pickup requires order number,
  customer phone, or pickup-code verification.
- Delivery requires an internal employee rider or an external rider record before
  dispatch. Each assignment records the assigning admin, rider, assignment time,
  estimated delivery time, and note.
- Picker, packer, dispatch confirmer, rider, pickup confirmer, and after-sale owner
  are separate relations.
- Every action writes a `FulfillmentEvent` with old/new state, admin actor,
  related employee or rider, note, and timestamp. Transition events use an
  idempotency key so repeated clicks do not append duplicates.
- Exceptions record warehouse facts only. Refund decisions remain an after-sale
  responsibility.

## Return State

Return state handles customer return requests and reverse inventory.

```text
REQUESTED
  -> REJECTED
  -> APPROVED
  -> RECEIVED
  -> INSPECTING
  -> ACCEPTED
  -> REFUND_PENDING
  -> REFUNDED

or

INSPECTING
  -> REJECTED_AFTER_INSPECTION
```

### Return Rules

- Return request must be submitted within 24 hours after delivery.
- Eligible reasons:
  - wrong item delivered
  - item materially different from photos
  - major undisclosed defect
  - key measurement differs by more than 3 cm
  - serious delivery damage
- Customer preference or size misunderstanding is not automatically eligible.
- Returned item must have matching barcode.
- Returned item cannot go directly to `AVAILABLE`; it must pass inspection.
- Accepted return revokes related commission.

## Commission State

Commission state describes affiliate earning lifecycle.

```text
ESTIMATED
  -> DELIVERY_WAITING
  -> CONFIRMED
  -> PAYABLE
  -> IN_SETTLEMENT_BATCH
  -> PAID

Side paths:
ESTIMATED -> VOIDED
DELIVERY_WAITING -> VOIDED
CONFIRMED -> REVERSED
PAYABLE -> REVERSED
```

### Commission Rules

- Commission is single-level in MVP.
- Commission is estimated after payment.
- Commission is not confirmed until 24 hours after delivery and no valid return request exists.
- Refunded item revokes or reverses the related commission.
- Commission batch is paid weekly.
- Commission payment and commission calculation require separate permissions.
- Manual commission adjustment requires reason and audit log.

## Affiliate Attribution State

Attribution state records referral source, not payment eligibility.

```text
CAPTURED
  -> USED_ON_ORDER
  -> EXPIRED
  -> OVERRIDDEN_BY_NEW_VALID_SOURCE
  -> VOIDED
```

### Attribution Rules

- Last valid referral source wins.
- Attribution expires after 7 days.
- Attribution may be captured by referral code, link parameter, QR code, or checkout code.
- Admin edit is exceptional and requires permission, reason, and audit.
- Attribution does not guarantee commission if order is canceled, refunded, or returned.

## Required Audit Events

Audit is required for:

- Barcode assignment.
- Product review approval or rejection.
- Manual change to measurements, condition, price, or category.
- Inventory check-in, movement, count difference, missing, damaged, hold.
- Reservation creation, expiry, release, and paid conversion.
- Manual order cancellation.
- Payment manual review and refund.
- Picking and packing scan mismatch.
- Return approval, rejection, inspection, refund.
- Affiliate attribution manual edit.
- Commission confirmation, reversal, settlement, payment.
- Role and permission changes.

## Development Rule

Any change to these states requires a documented change request before
implementation. The change request must list affected modules, API changes,
database migration needs, test cases, and rollback plan.
