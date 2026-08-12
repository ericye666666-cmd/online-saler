# MVP API Contract

This document defines the first API contract for the Second-hand Digital
Platform MVP. It is intentionally contract-first and implementation-neutral.

The backend is a modular monolith exposed through one unified API.

## General API Rules

### Base Paths

```text
/api/v1/public       Storefront public and customer APIs
/api/v1/operations   Employee work APIs
/api/v1/admin        Management APIs
/api/v1/webhooks     Provider callbacks
```

### Response Envelope

Successful responses:

```json
{
  "data": {},
  "meta": {}
}
```

Error responses:

```json
{
  "error": {
    "code": "INVENTORY_NOT_AVAILABLE",
    "message": "This item is no longer available.",
    "details": {}
  }
}
```

### Common Error Codes

| Code | Meaning |
| --- | --- |
| `UNAUTHORIZED` | Missing or invalid auth. |
| `FORBIDDEN` | Actor lacks permission. |
| `VALIDATION_ERROR` | Request fields are invalid. |
| `NOT_FOUND` | Entity does not exist or is not visible to actor. |
| `STATE_CONFLICT` | Action is not valid for current state. |
| `INVENTORY_NOT_AVAILABLE` | Item cannot be reserved or sold. |
| `DUPLICATE_REQUEST` | Idempotency key or provider event already processed. |
| `PAYMENT_AMOUNT_MISMATCH` | Provider amount does not match order amount. |
| `RETURN_WINDOW_CLOSED` | Return request is outside the allowed window. |
| `RATE_LIMITED` | Actor has exceeded allowed frequency. |

### Idempotency

The following endpoints require an `Idempotency-Key` header:

- `POST /api/v1/public/orders`
- `POST /api/v1/public/payments/mpesa/initiate`
- `POST /api/v1/admin/refunds`
- `POST /api/v1/admin/commission-settlements/:batchCode/pay`

M-Pesa callbacks must also be idempotent using provider ids and receipt numbers.

### Auth

| API Area | Auth |
| --- | --- |
| Public product browsing | No auth. |
| Public checkout | Phone required; OTP can be deferred in MVP if business approves. |
| Customer order lookup | Phone plus order code or OTP. |
| Operations | Employee session required. |
| Admin | Employee session plus permission required. |
| Webhooks | Provider verification and secret configuration required. |

Operations and Admin requests send the employee access token in the
`Authorization: Bearer <token>` header. Query-string or request-body user ids
are never accepted as proof of identity.

## Foundation APIs

### `POST /api/v1/admin/auth/login`

Employee login.

Request:

```json
{
  "phone": "254700000000",
  "password": "string"
}
```

Response:

```json
{
  "data": {
    "employee": {
      "employeeCode": "EMP-001",
      "name": "Jane",
      "roles": ["PRODUCT_REVIEWER"]
    },
    "accessToken": "jwt",
    "expiresAt": "2026-07-28T12:00:00Z"
  }
}
```

### `GET /api/v1/admin/me`

Returns current employee, roles, permissions, and accessible apps.

### `GET /api/v1/admin/audit-logs`

Query audit logs.

Filters:

- `module`
- `entityType`
- `entityId`
- `actorId`
- `from`
- `to`

## Product APIs

### `POST /api/v1/operations/products/:productCode/barcode`

Assign or validate a unique formal barcode after human calibration.

Permission: product create.

Request:

```json
{
  "barcode": "DLF-26-000001",
  "mode": "ASSIGN"
}
```

Response:

```json
{
  "data": {
    "productCode": "DLF-26-000001",
    "barcode": "DLF-26-000001",
    "status": "BARCODE_ASSIGNED"
  }
}
```

State change:

```text
CALIBRATED -> BARCODE_ASSIGNED
```

Rules:

- Product must already be `CALIBRATED`.
- Barcode must be globally unique.
- New product shells and photographed-only products cannot receive a formal barcode.

### `POST /api/v1/operations/products/:productCode/images`

Upload or register product image.

Permission: product media upload.

Request:

```json
{
  "type": "FRONT",
  "fileName": "front.jpg",
  "contentType": "image/jpeg",
  "sortOrder": 1
}
```

Response:

```json
{
  "data": {
    "imageId": "uuid",
    "uploadUrl": "signed-url",
    "expiresAt": "2026-07-28T12:00:00Z"
  }
}
```

### `POST /api/v1/operations/products/:productCode/images/:imageId/complete`

Marks a signed upload complete and queues image processing.

### `POST /api/v1/operations/products/:productCode/ai-extractions`

Start AI extraction.

Permission: product ai process.

Response:

```json
{
  "data": {
    "extractionId": "uuid",
    "status": "PENDING"
  }
}
```

### `GET /api/v1/operations/products/:productCode`

Operations product detail including internal status, images, AI output, and
manual calibration fields.

### `PATCH /api/v1/operations/products/:productCode/calibration`

Save human-reviewed fields.

Permission: product calibrate.

Request:

```json
{
  "category": "DRESS",
  "color": "BLACK",
  "tagSize": "M",
  "finalSizeLabel": "M",
  "conditionGrade": "GOOD",
  "priceKsh": 750,
  "measurements": [
    {"type": "CHEST", "finalValueCm": 92},
    {"type": "LENGTH", "finalValueCm": 105}
  ],
  "defects": [
    {
      "defectType": "SMALL_STAIN",
      "severity": "MINOR",
      "description": "Small mark near hem",
      "imageId": "uuid"
    }
  ]
}
```

Rules:

- AI raw values are not overwritten.
- Audit log records field changes.

State change:

```text
AI_PROCESSED or CALIBRATION_PENDING or REWORK_REQUIRED -> CALIBRATED
```

### `POST /api/v1/operations/products/:productCode/review`

Approve or return product to rework.

Permission: product review.

Request:

```json
{
  "result": "APPROVED",
  "reason": null
}
```

State change:

```text
REVIEW_PENDING -> APPROVED
REVIEW_PENDING -> REWORK_REQUIRED
```

### `POST /api/v1/admin/products/:productCode/publish`

Publish a product once inventory is available.

Permission: product publish.

Rules:

- Product must be `READY_FOR_STORAGE`.
- Inventory must be `AVAILABLE`.

## Public Product APIs

### `GET /api/v1/public/products`

Product list for Storefront.

Query:

- `category`
- `size`
- `minPriceKsh`
- `maxPriceKsh`
- `color`
- `sort`
- `page`
- `limit`
- `ref`

Response fields:

```json
{
  "data": [
    {
      "productCode": "DLF-26-000001",
      "title": "Black dress, size M",
      "primaryImageUrl": "https://...",
      "priceKsh": 750,
      "category": "DRESS",
      "sizeLabel": "M",
      "conditionGrade": "GOOD",
      "isAvailable": true,
      "publishedAt": "2026-07-28T10:00:00Z"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 24,
    "total": 1000
  }
}
```

### `GET /api/v1/public/products/:productCode`

Product detail for Storefront.

Must not expose warehouse location.

## Inventory APIs

### `POST /api/v1/admin/inventory/locations`

Create online location.

Permission: inventory location manage.

Request:

```json
{
  "locationCode": "ON-KKY-C03-B07",
  "siteCode": "KKY",
  "capacityItems": 40
}
```

### `POST /api/v1/operations/inventory/check-in`

Scan product into a location.

Permission: inventory check-in.

Request:

```json
{
  "barcode": "DLF-26-000001",
  "locationCode": "ON-KKY-C03-B07"
}
```

Rules:

- Product must be `APPROVED` or `READY_FOR_STORAGE`.
- Product cannot already be in active online inventory.
- Location must be active.

State change:

```text
Inventory PENDING_CHECKIN -> AVAILABLE
```

### `POST /api/v1/operations/inventory/move`

Move item to another location.

Request:

```json
{
  "barcode": "DLF-26-000001",
  "toLocationCode": "ON-KKY-C04-B02",
  "reason": "Rebalanced cage capacity"
}
```

### `GET /api/v1/admin/inventory/items`

Search inventory by product, barcode, location, status, and batch.

### `POST /api/v1/admin/inventory/items/:barcode/hold`

Admin hold.

Permission: inventory exception manage.

Requires reason.

## Transaction APIs

### `POST /api/v1/public/orders`

Create order and reserve inventory.

Request:

```json
{
  "customer": {
    "name": "Mary",
    "phone": "254700000000"
  },
  "fulfillmentMethod": "DELIVERY",
  "deliveryAddress": {
    "area": "Kikuyu",
    "line1": "Near ...",
    "landmark": "..."
  },
  "items": [
    {"productCode": "DLF-26-000001"}
  ],
  "referralCode": "MARY01"
}
```

Rules:

- Re-check item availability.
- Reserve each item for 15 minutes.
- Reject if phone already has more than 5 active reservations.
- Snapshot item prices and delivery fee.
- Create attribution if referral source is valid.

Response:

```json
{
  "data": {
    "orderCode": "ORD-000001",
    "status": "PAYMENT_PENDING",
    "totalKsh": 800,
    "reservationExpiresAt": "2026-07-28T10:15:00Z"
  }
}
```

### `GET /api/v1/public/orders/:orderCode`

Customer order detail.

Requires phone verification or order lookup token.

### `POST /api/v1/public/orders/:orderCode/cancel`

Cancel unpaid order or request cancellation.

Rules:

- `PAYMENT_PENDING` unpaid order can cancel and release reservation.
- Paid order follows exception rules.

### `GET /api/v1/admin/orders`

Admin order list.

### `GET /api/v1/admin/orders/:orderCode`

Admin order detail including payments, inventory, fulfillment, returns, and commission.

## Payment APIs

### `POST /api/v1/public/payments/mpesa/initiate`

Initiate M-Pesa payment for an order.

Request:

```json
{
  "orderCode": "ORD-000001",
  "phone": "254700000000"
}
```

Rules:

- Order must be `PAYMENT_PENDING`.
- Reservation must be active.
- Payment amount equals order total.
- Endpoint is idempotent for the same order and idempotency key.

Response:

```json
{
  "data": {
    "paymentCode": "PAY-000001",
    "status": "CUSTOMER_PROMPTED",
    "orderCode": "ORD-000001",
    "amountKsh": 800
  }
}
```

### `POST /api/v1/webhooks/mpesa/stk-callback`

M-Pesa callback endpoint.

Rules:

- Store raw callback before processing.
- Match callback to payment by provider ids.
- Process duplicate callback once only.
- Verify amount.
- On success:
  - Payment -> `SUCCESS`
  - Order -> `PAID`
  - Inventory -> `PAID`
  - Create fulfillment task
  - Create estimated commission if attribution exists
- On mismatch or late callback:
  - Payment -> `MANUAL_REVIEW`
  - Order remains safe

### `GET /api/v1/admin/payments`

Payment list and filters.

### `POST /api/v1/admin/payments/reconcile`

Run or upload reconciliation.

### `POST /api/v1/admin/refunds`

Create approved refund execution request.

Permission: refund execute.

## Fulfillment APIs

Operations uses one order-centered API surface:

- `GET /operations/orders` — cards/list with unified filters.
- `GET /operations/orders/summary` — counts for the 12 status tabs.
- `GET /operations/orders/:orderId` — products, locations, assignments, cases,
  delivery assignments, and the complete event timeline.
- `POST /operations/orders/:orderId/assign-picker`
- `POST /operations/orders/:orderId/claim-picking`
- `POST /operations/orders/:orderId/items/:orderItemId/scan`
- `POST /operations/orders/:orderId/start-packing`
- `POST /operations/orders/:orderId/complete-packing`
- `POST /operations/orders/:orderId/ready-for-pickup`
- `POST /operations/orders/:orderId/ready-for-dispatch`
- `POST /operations/orders/:orderId/assign-rider`
- `POST /operations/orders/:orderId/dispatch`
- `POST /operations/orders/:orderId/confirm-pickup`
- `POST /operations/orders/:orderId/complete-delivery`
- `POST /operations/orders/:orderId/exception`
- `POST /operations/orders/:orderId/cancel`
- `POST /operations/orders/:orderId/assign-after-sale`

Every endpoint checks the matching `orders.*` permission on the server. Employee
actions additionally require an active employee linked to the admin account.
Order Center responses mask customer and payment phone numbers; server-side
search and pickup verification continue to use the stored value.
Wrong barcode responses include expected barcode, actual barcode, product, and
correct location.

Warehouse location capacity management lives in Product Center and remains
separate from daily order work. Counts are computed from the current
`InventoryItem.locationId`, not historical movements:

- `GET /operations/warehouse-locations`
- `GET /operations/warehouse-locations/summary`
- `POST /operations/warehouse-locations`
- `POST /operations/warehouse-locations/bulk`
- `PATCH /operations/warehouse-locations/:locationId/status`
- `PATCH /operations/warehouse-locations/:locationId/capacity`
- `POST /operations/warehouse-locations/move-item`
- `GET /operations/inventory-overview`

Every read and mutation checks the matching warehouse or inventory permission
on the server. Shelf QR codes and shelf scanning are not part of this contract;
product Barcode verification for order picking remains unchanged.

### `POST /api/v1/operations/deliveries/:shipmentCode/attempts`

Record delivery attempt.

### `POST /api/v1/public/orders/:orderCode/returns`

Customer return request.

Rules:

- Must be within 24 hours after delivery.
- Reason must be eligible.
- Evidence is required for photo, defect, or damage claims.

### `POST /api/v1/admin/returns/:returnCode/decision`

Approve or reject return.

### `POST /api/v1/operations/returns/:returnCode/inspect`

Inspect returned item.

Rules:

- Received barcode must match return item.
- Accepted return may trigger refund and commission reversal.

## Affiliate APIs

### `POST /api/v1/admin/affiliates`

Create or approve affiliate.

### `GET /api/v1/admin/affiliates`

List affiliates.

### `GET /api/v1/public/affiliate/links/:refCode`

Resolve referral code and capture attribution.

This may be implemented as middleware on Storefront requests that include `ref`.

Rules:

- Last valid referral wins.
- Attribution expires after 7 days.

### `POST /api/v1/public/affiliate/share-link`

Generate or return a share link for a product or store path.

Request:

```json
{
  "affiliateCode": "MARY01",
  "productCode": "DLF-26-000001"
}
```

### `GET /api/v1/admin/commissions`

Commission ledger.

### `POST /api/v1/admin/commissions/confirm-due`

Worker/admin endpoint to confirm eligible commissions after delivery plus 24 hours.

### `POST /api/v1/admin/commission-settlements`

Create weekly settlement batch.

### `POST /api/v1/admin/commission-settlements/:batchCode/approve`

Approve batch.

### `POST /api/v1/admin/commission-settlements/:batchCode/pay`

Execute or record commission payments.

Requires idempotency key.

## Data Operations APIs

### `POST /api/v1/public/events`

Storefront event ingestion.

Events:

- `product_impression`
- `product_viewed`
- `filter_used`
- `add_to_cart`
- `checkout_started`
- `payment_started`
- `payment_status_checked`
- `whatsapp_ask_clicked`
- `share_clicked`

### `POST /api/v1/operations/events`

Operations event ingestion.

Events:

- `barcode_assigned`
- `photo_uploaded`
- `ai_extraction_started`
- `manual_calibration_saved`
- `product_reviewed`
- `inventory_checked_in`
- `picking_scan`
- `packing_scan`
- `pickup_verified`
- `delivery_handoff`
- `return_received`

### `GET /api/v1/admin/dashboards/overview`

Returns MVP dashboard:

- today's digitized items
- online available items
- orders
- paid orders
- fulfillment backlog
- returns
- affiliate orders
- commissions payable
- exceptions

### `GET /api/v1/admin/dashboards/funnel`

Storefront funnel metrics.

### `GET /api/v1/admin/exports/:type`

Permissioned CSV export.

Types:

- `products`
- `inventory`
- `orders`
- `payments`
- `commissions`
- `returns`

## Worker Jobs

Worker jobs are not public APIs but must use the same state-machine rules.

| Job | Purpose |
| --- | --- |
| `image.process` | Compress, crop, and publish customer-safe images. |
| `ai.extractProduct` | Generate raw AI product attributes. |
| `reservation.expire` | Release expired reservations. |
| `payment.reconcile` | Check unmatched or stale payments. |
| `commission.confirmDue` | Confirm eligible commissions after delivery plus 24 hours. |
| `commission.createWeeklyBatch` | Create weekly payable batch. |
| `notifications.send` | Send optional WhatsApp or internal notifications. |

## Minimum E2E API Acceptance

Before production, the API must pass these flows:

1. Create product shell, upload images, run AI extraction, save calibration, assign barcode, approve.
2. Check product into location and publish.
3. Browse product publicly.
4. Create order and reserve item.
5. Initiate M-Pesa payment.
6. Process successful callback idempotently.
7. Prevent a second customer from buying the same item.
8. Pick and pack with barcode scan.
9. Complete pickup or delivery.
10. Create estimated commission from attribution.
11. Confirm commission after delivery plus 24 hours.
12. Handle return request, refund, inventory inspection, and commission reversal.

## Open API Decisions

1. Whether customer order lookup requires OTP in MVP.
2. Whether checkout supports multiple items in one order from day one. The data
   model supports it; UI may launch with one or more items.
3. Whether `apps/operations` and `apps/admin` share the same auth endpoint.
4. Whether public events are accepted anonymously or only after session creation.
5. Whether refunds are executed through M-Pesa API in MVP or recorded manually.
