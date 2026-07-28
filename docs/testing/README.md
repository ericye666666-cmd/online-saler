# Testing Strategy

## Test Layers

- Unit tests: business rules and pure logic.
- Integration tests: database-backed module interactions.
- End-to-end tests: storefront, operations, and admin flows.
- Concurrency tests: one item cannot be sold twice.
- Permission tests: employees cannot perform actions outside their roles.

## First Critical Tests

- Cart does not reserve inventory.
- Payment initiation reserves inventory for 15 minutes.
- Reservation expiry releases inventory.
- M-Pesa duplicate callback is idempotent.
- Payment success creates a picking task.
- Wrong item scan blocks packing.
- Return cancels related commission.
- Affiliate attribution expires after 7 days.
