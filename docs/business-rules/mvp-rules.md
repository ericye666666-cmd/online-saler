# MVP Business Rules

These rules define the first 1,000-item Kikuyu MVP.

## Inventory

- Each second-hand clothing item is unique.
- The first 1,000 online items are fully isolated from store inventory.
- The cart does not reserve inventory.
- Inventory is reserved only after payment is initiated.
- Reservation duration is 5 minutes (2026-09-23; previously 15).
- One phone number may reserve at most 5 items at the same time.
- Closing an order always settles its stock. An unpaid cancellation returns the
  garment to sale; a paid order that can never be fulfilled is written off with
  an explicit outcome — back on the shelf, or recorded as lost.
- A garment held by a paid deposit sits in its own inventory state,
  `DEPOSIT_HELD`, and must never be sold over the counter. It still occupies a
  shelf and still counts against warehouse capacity.

## Deposit plan (50% deposit, 7-day hold)

Added 2026-09-23. A shopper who cannot pay in full today may pay half and hold
the piece for a week.

- The choice is offered at checkout on every order of at least KSh 2: pay in
  full, or pay a 50% deposit.
- The deposit is half the order total including delivery, **rounded up**, so on
  an odd total the first payment is the larger half. The balance is the
  remainder. Both figures are frozen on the order at checkout; a later price
  edit cannot change what the shopper owes.
- The deposit itself is still an M-Pesa STK prompt inside the ordinary
  five-minute reservation window. The seven days start only once that money has
  actually landed.
- While the deposit holds, **nothing is picked, packed or dispatched, and no
  affiliate commission exists.** A deposit order is a sale that may still fall
  through. Only the balance completes it.
- The balance is one payment for the full remainder; it cannot be paid in
  instalments. A failed or cancelled balance prompt costs the shopper nothing
  and leaves the hold standing.
- One phone number may hold at most 3 items on deposit at a time. This is
  counted separately from, and applies on top of, the 5-item cart reservation
  cap.
- Reminders go out on day 4 and day 6.
- **There is no grace period.** At the seven-day mark the garment goes back on
  sale immediately.
- On lapse the shopper is refunded **30% of the order total** and the shop
  keeps **20% of the order total** for the week the piece spent off sale. On a
  KSh 1,000 order: KSh 500 deposit, KSh 300 refunded, KSh 200 kept. The refund
  is never more than what was actually collected.
- The refund is *raised*, not paid: the expiry sweep creates a
  `LAPSED_DEPOSIT` refund request in the finance queue, and someone executes it
  in M-Pesa by hand like every other refund.

## Payment

- Customers pay the platform, not the affiliate.
- M-Pesa is the first payment method.
- Payment callbacks must be idempotent.
- Payment status and order status are separate.
- A callback that does not match cleanly — late, wrong amount, duplicate
  receipt, no matching STK request — is never guessed at. It goes to manual
  review, where a reviewer settles it or marks it not received against the
  M-Pesa merchant statement.
- Every STK request whose callback never arrives is queried against Safaricom
  directly, so a lost callback cannot quietly expire on a shopper who has paid.
- Every payment records which leg of the order it is: `FULL`, `DEPOSIT` or
  `BALANCE`. An amount is only accepted when it matches that leg exactly, so a
  deposit can never be mistaken for a discounted full payment.

## Fulfillment

- Orders are served from fulfillment nodes: one central warehouse plus the
  stores. Nodes are configured in operations, not in code.
- Pickup orders carry the node the shopper chose at checkout, and a six
  character pickup code they read out at the counter. Delivery orders are
  routed to a node by operations before the package leaves the warehouse.
- A package bound for a store is sent, then scanned in on arrival, before it
  can be handed to anyone. Warehouse handovers skip both steps.
- Kikuyu warehouse pickup is free.
- Local delivery charges the customer a flat KSh 50 (2026-09-23; it was 0 under
  the 2026-09-12 launch policy). The node pays the real Bolt fare, which is
  recorded per order; the difference is the company's delivery subsidy.
- Redelivery is arranged manually without an automatic delivery charge.
- A fulfillment exception remembers the step it interrupted, so a resolved
  exception rejoins the flow instead of ending the order.

## Returns

2026-09-12: after-sales is handled by customer service manually. The following
existing criteria remain reference for staff; do not add automated decisions or refunds.

Returns are accepted only when:

- The wrong item was delivered.
- The received item is materially different from the photos.
- A major defect was not disclosed.
- A key measurement differs by more than 3 cm.
- The item was seriously damaged during delivery.

Return requests must be submitted within 24 hours after delivery.

## Refunds

- The system never moves money. A refund is executed in M-Pesa first and then
  recorded against the order with its reference and evidence.
- Refunds attach to the order, not only to a return, so an order that was paid
  for but can never be fulfilled can be refunded too.
- Recorded refunds can never exceed what was actually paid. Once they cover the
  full payment the order becomes REFUNDED.
- A lapsed deposit hold is the one refund the system raises by itself. It has
  no requesting admin user, because it is created by a timer, and it still
  waits for approval and manual execution like every other refund.

## Affiliate

- Affiliate distribution is single-level in the MVP.
- New commissions use 25% of the paid item subtotal, excluding delivery
  (2026-09-15); historical commission snapshots are preserved.
- Attribution uses the last valid referral source: the most recent tracked
  click within the window wins, including when a shopper clicks one affiliate's
  link and then another's before paying.
- Attribution expires after 7 days.
- Commission is estimated after payment.
- Commission is confirmed 24 hours after delivery if no valid return request exists.
- Commission is paid weekly.
- Refunded items revoke the related commission.
- A cancelled or written-off order reverses its commission: an unconfirmed one
  is rejected, a confirmed one is frozen with a hold reason so it cannot be
  paid out without review.

## Notifications

- Messages are queued in an outbox inside the transaction that earns them, so a
  provider outage can never roll back an order and a retried transition can
  never send twice.
- Customers are told: payment received, ready for pickup, dispatched,
  completed, refunded.
- Affiliates are told: first sale, new order, commission available, paid.
- Stores are told when a package is on its way and when one is waiting for a rider.
- With no SMS provider configured, messages stay queued and visible in
  operations rather than being dropped.

## Explicitly Out of Scope

- Multi-vendor marketplace.
- Multi-level distribution.
- Native app.
- AI recommendation.
- Nationwide delivery automation.
- General merchandise agency model.
