# Online Saler

Online Saler is the working repository for the Second-hand Digital Platform MVP in Kikuyu, Kenya.

The first milestone is to turn 1,000 real second-hand clothing items into online, purchasable, uniquely tracked products.

## MVP Scope

Included in the first version:

- Product digitization: barcode, photos, AI extraction, manual review, publishing.
- Unique online inventory: one item, one stock record, one location.
- Customer storefront: browse, filter, product detail, checkout.
- M-Pesa payment flow and payment reconciliation.
- Warehouse operations: check-in, picking, packing, pickup, delivery handoff.
- Affiliate attribution and weekly commission ledger.
- Admin console for products, inventory, orders, payments, fulfillment, affiliates, and reports.

Not included in the first version:

- Multi-vendor marketplace.
- Multi-level distribution.
- Native mobile apps.
- Nationwide delivery automation.
- AI recommendation engine.
- General merchandise or tail-goods agency model.

## System Shape

The MVP uses three frontends and one modular backend:

- `apps/storefront`: customer-facing shopping experience.
- `apps/operations`: employee workflow app for digitization, warehouse, service, and fulfillment.
- `apps/admin`: management console.
- `apps/api`: unified backend API.
- `apps/worker`: async jobs for image processing, reservation expiry, commission confirmation, and notifications.

Business capabilities are organized as middle-platform modules inside the backend:

- Foundation
- Product
- Inventory
- Transaction
- Payment
- Fulfillment and Returns
- Affiliate and Commission
- Data Operations

## Repository Layout

```text
apps/             Frontend apps, API, and worker
packages/         Shared database, types, UI, config, and business rules
docs/             Architecture, business rules, APIs, modules, testing, and deployment
project/          Roadmap, task register, bug register, and change requests
tests/            Unit, integration, and end-to-end test suites
infrastructure/   Cloud Run, Cloud SQL, storage, and deployment scripts
scripts/          Local repository checks and automation
```

## Branch Strategy

- `main`: production-ready releases only.
- `develop`: integration branch for the current release.
- `feature/*`: scoped feature branches.
- `fix/*`: scoped bug-fix branches.
- `docs/*`: documentation-only changes.

All work should target `develop` first. Release candidates are promoted from `develop` to `main` after integration testing.

## Local Check

This skeleton has no runtime dependencies yet. Run:

```bash
npm run check:repo
```

The check validates that the expected monorepo folders and governance files exist.

## Documentation

Start with:

- [System Overview](docs/architecture/system-overview.md)
- [MVP Business Rules](docs/business-rules/mvp-rules.md)
- [Branch Strategy](docs/development/branch-strategy.md)
- [Staging and Production Plan](docs/deployment/staging-production.md)
- [Roadmap](project/ROADMAP.md)
