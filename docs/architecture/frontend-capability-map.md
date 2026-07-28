# Frontend Capability Map

This document defines the MVP frontends, the capabilities each frontend owns, and
which middle-platform module each capability calls.

The MVP has three frontends:

1. `apps/storefront`: customer and affiliate-facing shopping experience.
2. `apps/operations`: employee work app for production, warehouse, service, and fulfillment.
3. `apps/admin`: management console for control, exception handling, audit, and reporting.

The three frontends share one backend API. No frontend owns business truth. The
backend middle-platform modules own rules, state changes, audit logs, and data.

## Capability Map

```text
Storefront
  -> Product module for catalog and item detail
  -> Inventory module for availability
  -> Transaction module for cart snapshot and orders
  -> Payment module for M-Pesa payment initiation and status
  -> Fulfillment module for pickup, delivery, and return status
  -> Affiliate module for referral attribution
  -> Data Ops module for events

Operations App
  -> Product module for barcode, media, AI extraction, calibration, review
  -> Inventory module for check-in, movement, count, reservation visibility
  -> Fulfillment module for picking, packing, pickup, delivery handoff, returns
  -> Transaction module for order lookup
  -> Payment module for payment status lookup only
  -> Data Ops module for work events

Admin Console
  -> All modules through role-based permissions
  -> Used for configuration, approval, reconciliation, exception handling, audit, and exports
```

## Frontend 1: Storefront

Storefront is the public customer experience. It must feel like a real mobile
commerce site, not an internal catalog.

### Users

- Direct customers in Kikuyu and nearby areas.
- Customers arriving from affiliate links.
- Affiliates browsing shareable items.

### MVP Routes

```text
/
/category/:slug
/search
/products/:productCode
/cart
/checkout
/checkout/payment
/orders/:orderCode
/support
/returns/:orderCode
/affiliate/:refCode
```

### Pages and Capabilities

| Page | User Goal | Required Capabilities | Backend Modules |
| --- | --- | --- | --- |
| Home | Find new and trusted products quickly | New arrivals, categories, delivery note, trust signals, search entry | Product, Data Ops |
| Category | Browse a focused product set | Product grid, category filters, price filters, size filters, sort by newest | Product, Inventory, Data Ops |
| Search | Find a specific style or size | Keyword search, no-result state, suggested filters | Product, Data Ops |
| Product Detail | Decide whether to buy one unique item | Photos, price, actual measurements, condition, defects, only-one notice, pickup/delivery note, share, WhatsApp ask | Product, Inventory, Affiliate, Data Ops |
| Cart | Review selected items | Item list, quantity locked to 1, remove item, availability check, subtotal | Transaction, Inventory |
| Checkout | Submit customer and fulfillment details | Name, phone, pickup or delivery, address, delivery fee, referral preservation | Transaction, Affiliate |
| Payment | Pay by M-Pesa | STK push initiation, countdown, success, failure, retry, manual status refresh | Payment, Transaction, Inventory |
| Order Detail | Track order | Payment status, picking status, pickup code, delivery status, return entry | Transaction, Payment, Fulfillment |
| Return Request | Ask for an eligible return | Reason, evidence upload, 24-hour limit, policy display | Fulfillment, Payment |
| Affiliate Landing | Preserve ref source | Store referral cookie or session, show shareable product discovery | Affiliate, Product |

### Storefront Rules

- Cart does not reserve inventory.
- Checkout must re-check availability before payment initiation.
- Payment initiation reserves inventory for 15 minutes.
- One customer phone number may reserve at most 5 items at once.
- Product quantity is always 1.
- Product price is platform-controlled.
- Delivery fee is not commissionable.
- Storefront must not expose employee-only warehouse locations.
- A product marked unavailable must not allow checkout.
- Affiliate attribution is silent to the customer unless the UI later chooses to show it.

### Storefront MVP Data Needs

```text
Product card:
  productCode
  title
  primaryImageUrl
  priceKsh
  category
  sizeLabel
  conditionGrade
  isAvailable
  publishedAt

Product detail:
  productCode
  images[]
  title
  priceKsh
  category
  color
  brand
  tagSize
  actualMeasurements
  conditionGrade
  defects[]
  careNote
  isAvailable
  pickupEnabled
  deliveryEnabled
  deliveryFeeKsh

Checkout:
  cartItems[]
  customerName
  customerPhone
  fulfillmentMethod
  deliveryAddress
  referralCode
```

### Storefront Out of Scope

- Native mobile app.
- AI recommendation engine.
- Marketplace seller pages.
- Multi-level affiliate display.
- Nationwide delivery pricing automation.
- Customer wallet.
- Complex member points.

## Frontend 2: Operations App

Operations App is the employee work surface. It must be fast, simple, and scan-first.
It is not a management dashboard.

### Users

- Digitization staff.
- Review staff.
- Warehouse staff.
- Pickers and packers.
- Pickup and delivery handoff staff.
- Customer service staff.

### MVP Routes

```text
/operations
/operations/digitization/new
/operations/digitization/:productCode
/operations/review
/operations/check-in
/operations/move
/operations/count
/operations/picking
/operations/picking/:taskId
/operations/packing/:parcelCode
/operations/pickup
/operations/delivery-handoff
/operations/support/orders
/operations/returns
```

### Pages and Capabilities

| Area | Required Capabilities | Backend Modules |
| --- | --- | --- |
| Digitization Queue | See assigned items and current production status | Product, Data Ops |
| Barcode Assignment | Generate or scan barcode, prevent duplicate barcode | Product, Foundation |
| Photo Upload | Upload front, back, label, defect images; retry failed uploads | Product, Foundation |
| AI Extraction | Start extraction, view extraction status, save raw output | Product |
| Manual Calibration | Edit final measurements and attributes while preserving AI raw values | Product, Audit |
| Product Review | Approve, reject, or return to rework | Product, Audit |
| Check-in | Scan location, scan product, mark item available online | Inventory, Product |
| Movement | Scan product and new location, record movement | Inventory, Audit |
| Count | Count by location, record missing, extra, damaged | Inventory, Audit |
| Picking | Pick by task, scan location, scan product, block wrong item | Fulfillment, Inventory |
| Packing | Pack items into parcel, scan items again, print or show parcel code | Fulfillment |
| Pickup | Verify pickup code or phone, mark handed over | Fulfillment |
| Delivery Handoff | Assign rider or delivery batch, record handoff | Fulfillment |
| Support Order Lookup | Find order by phone, order code, or product code | Transaction, Payment, Fulfillment |
| Return Intake | Register evidence and receive returned barcode for inspection | Fulfillment, Inventory |

### Operations App Rules

- Employees must sign in.
- Every high-risk action must write an audit log.
- Employee app actions should prefer scan or select over free typing.
- A product cannot be checked in until it is approved for storage.
- A product cannot become available without a location.
- A picked item must match both the order item and product barcode.
- A packed item must be scanned again before shipment or pickup.
- Customer service can create return requests but cannot approve refunds.

### Operations MVP Data Needs

```text
Work item:
  productCode
  currentProductState
  assignedTo
  requiredAction
  lastUpdatedAt

Scan response:
  scannedCode
  entityType
  displayName
  allowedActions[]
  blockingReason

Picking task:
  taskId
  orderCode
  itemCount
  orderedLocations[]
  requiredScans[]
  priority
```

### Operations Out of Scope

- Offline-first full warehouse app.
- Native scanner app.
- Route optimization.
- Automated rider marketplace integration.
- Employee payroll.

## Frontend 3: Admin Console

Admin Console is the control plane. It is used to configure rules, monitor flow,
review exceptions, approve sensitive actions, and export data.

### Users

- Owner.
- Operations manager.
- Warehouse supervisor.
- Customer service supervisor.
- Affiliate operator.
- Finance and reconciliation staff.
- Admin.

### MVP Routes

```text
/admin
/admin/products
/admin/products/:productCode
/admin/inventory
/admin/inventory/locations
/admin/orders
/admin/orders/:orderCode
/admin/payments
/admin/payments/reconciliation
/admin/fulfillment
/admin/returns
/admin/affiliates
/admin/commissions
/admin/customers
/admin/support
/admin/analytics
/admin/employees
/admin/roles
/admin/audit-logs
/admin/settings
```

### Menus and Capabilities

| Menu | Required Capabilities | Backend Modules |
| --- | --- | --- |
| Dashboard | Daily production, stock, orders, payments, fulfillment, affiliate, exceptions | Data Ops |
| Product Center | Search products, review details, inspect AI and calibration values, unpublish | Product, Audit |
| Inventory Center | Locations, availability, reservations, missing, damaged, movement logs | Inventory |
| Order Center | Order list, order detail, cancellation, exception review | Transaction, Fulfillment |
| Payment Center | M-Pesa transactions, callbacks, duplicate events, reconciliation, refunds | Payment |
| Fulfillment Center | Picking queues, packing queues, pickup, delivery, failed delivery, returns | Fulfillment |
| Affiliate Center | Affiliate accounts, referral codes, attribution, commission ledger, settlement | Affiliate |
| Customer Center | Customer records, addresses, order history, support notes, blacklist | Foundation, Transaction |
| Customer Service | Tickets, return requests, message history, FAQ management | Fulfillment, Data Ops |
| Marketing | Banners, coupons if enabled, share material, channel links | Product, Affiliate |
| Analytics | Funnels, product production, sales, inventory accuracy, affiliate performance | Data Ops |
| System | Employees, roles, permissions, settings, API keys, audit logs, backups | Foundation |

### Admin Rules

- Admin can inspect but should not bypass state machines.
- Any manual correction must include a reason and audit log.
- Price edits are restricted.
- Refund approval and refund execution require separate permissions.
- Commission calculation and commission payment require separate permissions.
- Affiliate attribution edits are exceptional and require audit reason.
- Data export is permissioned.

### Admin Out of Scope

- Full accounting system.
- ERP replacement.
- POS integration.
- Multi-warehouse replenishment.
- Multi-vendor settlement.

## Shared Cross-Frontend Relationships

```text
Product detail is shared by Storefront, Operations, and Admin:
  Storefront shows customer-safe fields.
  Operations shows work fields and scan actions.
  Admin shows full audit and exception history.

Inventory state is shared by Storefront, Operations, and Admin:
  Storefront sees available or unavailable.
  Operations sees scan actions and location.
  Admin sees movement, reservations, and exceptions.

Order state is shared by all three:
  Storefront shows customer status.
  Operations executes picking, packing, pickup, delivery, and returns.
  Admin reviews exceptions, refunds, and audit.

Affiliate attribution is shared by Storefront and Admin:
  Storefront records referral source.
  Admin reviews attribution and commission.
  Operations normally does not edit attribution.
```

## MVP Integration Boundaries

| Capability | Storefront | Operations | Admin | Owner Module |
| --- | --- | --- | --- | --- |
| Browse products | Yes | Limited lookup | Yes | Product |
| Create product | No | Yes | Yes | Product |
| Approve product | No | Role-based | Yes | Product |
| Check availability | Yes | Yes | Yes | Inventory |
| Change location | No | Yes | Yes | Inventory |
| Create order | Yes | No | Exception only | Transaction |
| Initiate payment | Yes | No | Exception only | Payment |
| Confirm payment manually | No | No | Restricted | Payment |
| Pick item | No | Yes | Monitor only | Fulfillment |
| Approve return | Customer requests only | Intake only | Yes | Fulfillment |
| Share referral link | Yes | No | Yes | Affiliate |
| Edit attribution | No | No | Restricted | Affiliate |
| View dashboards | No | Limited | Yes | Data Ops |

## Implementation Notes

- Storefront can start with mock data, but it must align with this document's data needs.
- Operations App should be built early because 1,000-item digitization depends on it.
- Admin Console can start as simple tables and detail pages, but exception workflows must be explicit.
- All three frontends must use shared types from `packages/shared-types` once API contracts are implemented.
- The first working release must prove a full path from one approved product to one paid, picked, delivered order and one estimated affiliate commission.
