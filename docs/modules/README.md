# Module Notes

This directory records module-level decisions and implementation notes.

Each module should define:

- Owner.
- Scope.
- Out-of-scope boundaries.
- Data entities.
- API endpoints.
- State transitions.
- Permissions.
- Tests.
- Operational risks.

## Notes in this directory

- [picking-and-dispatch.md](picking-and-dispatch.md) — the warehouse's morning:
  the daily run, the shelf-ordered picking sheet, and the picker's phone.
- [fulfillment-nodes.md](fulfillment-nodes.md) — the warehouse-to-store hand-off,
  node configuration, and delivery economics.
- [delivery-code-and-riders.md](delivery-code-and-riders.md) — the customer
  delivery code, the rider's mobile screen, authorized drop-off, failed
  deliveries, and the store rider roster.
- [payment-exceptions.md](payment-exceptions.md) — the manual review queue,
  M-Pesa reconciliation, refunds, and the environment they need.
- [deposit-plan.md](deposit-plan.md) — the 50% deposit, the seven-day hold, the
  balance payment, and what happens to the money when the deadline passes.
- [customer-service.md](customer-service.md) — global customer search, the Order
  360 view, cases with owners and SLAs, escalation, and the two-person refund
  approval gate.
