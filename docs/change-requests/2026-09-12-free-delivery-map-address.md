# Free delivery, map address and initial affiliate rate

Eric authorized this change on 2026-09-12: delivery is free, customer addresses
should use a reusable GitHub Google Maps component, after-sales remains manual,
and the initial affiliate rate is 10%.

- New checkout delivery charges are zero. Existing orders/payment reservations
  keep their original amount snapshots; no payment request is repriced in flight.
- Use MIT-licensed `@vis.gl/react-google-maps`, Google Places (New), map pins and
  optional browser location. Load only on request; keep manual address entry.
- Store the selected coordinates as a canonical Google Maps URL alongside the
  address in the existing deliveryAddress field. No database/API shape change.
  Customers and Operations receive the same immutable order address.
- New commissions use 10% of item subtotal. Historical commissions retain their
  recorded rate/amount. Existing configuration is retained for a future policy,
  but does not override this initial fixed-rate launch policy.
- After-sales continues through customer service and existing manual records;
  no automatic refund, approval or new return eligibility mechanism is added.
- Existing Kikuyu fulfillment geography is retained; free delivery does not
  silently introduce a nationwide delivery promise.

Validation: shared fee rules, new commission calculation with legacy overrides,
address serialization/range checks, checkout build/type checks and rendered UI.
Deployment needs a browser-restricted Google Maps key, Maps JavaScript API and
Places API (New). No permission or payment provider changes. Rollback previous
runtime images; retain order, commission and customer service history.
