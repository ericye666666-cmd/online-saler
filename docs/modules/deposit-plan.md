# Deposit plan — 50% now, the piece held for 7 days

Added 2026-09-23.

## Why

Every garment here is one of one. A shopper who wants a piece but does not have
the full price today has exactly two options without this feature: pay anyway,
or lose it. Both are bad — the first is not possible, the second is a sale that
never happens and a piece that sells for less later.

A deposit turns that into a third option. Half the money now takes the piece off
sale for a week, and the shop is compensated for the week whether or not the
sale completes.

## Scope

- A pay-in-full / pay-50% choice at checkout.
- A `DEPOSIT_HELD` inventory state that the warehouse can see and must not sell.
- A balance payment on the customer's own order page.
- Reminders at day 4 and day 6, and an hourly sweep that releases lapsed holds
  and raises the refund owed.

## Out of scope

- Instalments. The balance is one payment for the whole remainder.
- Extensions or grace periods. Seven days is seven days.
- Automatic refund payout. The system never moves money; the sweep raises a
  refund request and a person executes it in M-Pesa.
- A configurable deposit rate or eligibility threshold. Both are constants in
  `packages/business-rules/src/deposit-plan.ts`.

## The money

All figures are against the **order total, including delivery**.

| | KSh 1,000 order |
| --- | --- |
| Deposit, paid now | 500 |
| Balance, due within 7 days | 500 |
| If the balance arrives | order completes normally |
| If it does not | 300 refunded, 200 kept, piece back on sale |

The deposit rounds **up**, so on an odd total the first payment is the larger
half and the shop never carries the rounding loss. Both legs are frozen on the
order at checkout as `depositKsh` and `balanceKsh`; a later price edit cannot
move what the shopper owes.

The refund is capped at what was actually collected, so a part-collected or
manually adjusted deposit can never refund more than came in.

## Data

| Entity | What changed |
| --- | --- |
| `Order` | `paymentPlan` (`FULL` \| `DEPOSIT_50`), `depositKsh`, `balanceKsh`, `depositPaidAt`, `balanceDueAt`, index on `(status, balanceDueAt)`. |
| `Payment` | `kind` (`FULL` \| `DEPOSIT` \| `BALANCE`). |
| `OrderStatus` | `DEPOSIT_PAID`, `DEPOSIT_EXPIRED`. |
| `InventoryItemStatus` | `DEPOSIT_HELD`. |
| `RefundKind` | `LAPSED_DEPOSIT`. |
| `RefundRequest` | `requestedByAdminUserId` is now nullable — the sweep has no person behind it. |

Migrations: `20260923190000_deposit_plan_enum_values` then
`20260923191000_deposit_plan`. Enum values land first because PostgreSQL will
not let a transaction write an enum label added in that same transaction.

## Flow

1. Checkout with `paymentPlan: "DEPOSIT_50"` reserves stock exactly as a normal
   checkout does — `AVAILABLE -> RESERVED`, five-minute window. The seven days
   have not started.
2. The STK prompt asks for `depositKsh`, and the payment row carries
   `kind: DEPOSIT`.
3. On a confirmed deposit, `settleDepositPayment` moves the stock
   `RESERVED -> DEPOSIT_HELD`, sets `balanceDueAt = now + 7 days`, parks the
   order in `DEPOSIT_PAID` and closes the checkout draft — which is what stops
   the five-minute reservation sweep from taking the piece back minutes later.
   **No picking task and no commission are created.**
4. The shopper pays the balance from `/orders/<number>`. That prompt carries
   `kind: BALANCE` and is checked against the deposit window and `DEPOSIT_HELD`
   stock, not the cart reservation.
5. A confirmed balance goes through the ordinary `settleSuccessfulPayment`, so a
   deposit order and a pay-in-full order reach picking in exactly the same
   shape: one picking task, one commission, one `PAID` order.
6. If `balanceDueAt` passes first, `lapseDepositHold` releases the stock to
   `AVAILABLE`, moves the order to `DEPOSIT_EXPIRED` and creates a
   `LAPSED_DEPOSIT` refund request — all in one transaction, so the piece is
   never both off sale and unaccounted for.

## Endpoints

| Route | Change |
| --- | --- |
| `POST /api/checkout/start` | Accepts `paymentPlan`. Absent means `FULL`, so an older client is unaffected. |
| `POST /api/payments/mpesa/initiate` | Charges the deposit, the balance or the total depending on the order's state. Unchanged request body. |
| `GET /api/payments/mpesa/status` | Also returns `paymentPlan`, `depositKsh`, `balanceKsh`, `balanceDueAt`, `balanceDaysLeft`. |
| `POST /api/internal/expire-deposit-holds` | New. Reminders first, then lapse. Bearer `INTERNAL_CRON_SECRET`. |
| `POST /api/internal/reconcile-payments` | A recovered deposit now places the hold instead of completing the order; a dead balance prompt no longer touches the hold. |
| `/orders` | New page. The shopper's own orders, deposit holds pinned on top. Without it a balance has no front door. |
| `POST /api/orders/lookup` | New. Phone number plus order number re-attaches an order to this device. Rate limited; see below. |
| `GET /operations/deposit-holds` | New. The deposit board, behind `page.orders.deposits`. |
| `GET /operations/finance/summary` | Also returns the `deposits` block. |

## Recovering a lost order

A deposit has a deadline, so "message customer service" is not an acceptable
answer for a shopper who cleared their browser. `/orders` carries a lookup form
that takes the M-Pesa number and the order number and, when both match,
re-attaches the order to the device's guest cookie — after which the order page
and the balance payment work normally.

- The order number is the secret: `DL-<date>-<8 hex>`, thirty-two bits. The
  phone proves it belongs to the caller. **Both** must match.
- Every failure returns one identical message. Distinguishing "wrong phone" from
  "no such order" would leak a fact about somebody else's purchase.
- Attempts are counted in `OrderLookupAttempt`: five failures per phone and
  twenty attempts per caller in fifteen minutes. The counter is in the database
  rather than in memory because Cloud Run runs several instances.
- The order number tried is never stored, and the caller's address is stored
  only as a salted hash.

## The money, on the operations side

Two figures that must never be added together:

| | Where | What it means |
| --- | --- | --- |
| **定金在途 / deposit held** | Finance summary, deposit board | Cash collected against sales that have not happened. **Not revenue** — it can still become a completed sale or a refund. Excluded from net revenue on purpose. |
| **违约金收入 / forfeit** | Finance summary, deposit board | Deposit kept when a hold lapsed. This *is* revenue, and it is added to net revenue. |

Both are computed in `apps/api/src/operations/deposit-ledger.ts` from the
payments and refund requests actually recorded, never from the policy rate, so
a part-collected deposit or a refund finance adjusted reports what happened. A
refund request that finance **rejected or cancelled** turns the whole deposit
into forfeit — that is finance overruling the 30% rule, and the ledger follows
them rather than the policy.

The net revenue formula is now:

```text
GMV + forfeited deposits - refunds - affiliate commission - delivery subsidy
```

## Every path that can confirm money

A deposit must never reach `settleSuccessfulPayment`, or half the money buys a
picking task and an affiliate commission. Three paths can confirm a payment and
all three branch on `Payment.kind`:

1. **The M-Pesa callback** — `apps/storefront/src/payments/payment-service.ts`.
2. **The status-query sweep**, for lost callbacks —
   `apps/storefront/src/payments/payment-reconciliation.ts`.
3. **Manual review**, when a callback was ambiguous —
   `apps/api/src/operations/operations-payment-review.service.ts`.

Any fourth path added later has to make the same choice.

## Operational risks

- **The hourly scheduler job is load-bearing.** Without
  `expire-deposit-holds-*`, holds never expire: pieces stay off sale forever, no
  reminder goes out, and no refund is raised. See
  [staging-production.md](../deployment/staging-production.md).
- **`page.orders.deposits` now attaches itself.** Every API deployment offers
  each existing role, once, every default permission it has not been offered
  before (ledger: system setting `access.roleDefaultGrants.offered`), so a role
  whose defaults gain a code is granted it on the next deployment. A default an
  operator removes afterwards is never put back, a role emptied by hand stays
  empty, and nothing is ever revoked. Nothing has to be ticked by hand any more.
  To preview what a deployment would add, run the seed with `--dry-run`.
- **Reminders depend on the SMS outbox being drained.** The outbox has no live
  provider yet, so today the day-4 and day-6 reminders queue and sit there. The
  deadline still enforces itself, which means a shopper can currently lose a
  hold without having been warned. Wire up SMS before promoting this.
- **Lapse refunds need someone working the finance queue.** The sweep only
  raises the debt; nothing pays it.
- Staff must not sell a `DEPOSIT_HELD` garment over the counter. It counts
  against shelf capacity and shows as `DEPOSIT_HELD` in the inventory overview.
- **A guest who loses their browser cookie loses the route to their order.** The
  cookie lasts 30 days, comfortably longer than the hold, but a cleared browser
  or a second handset means customer service has to find the order — and the
  clock keeps running while they do.
- **Deposit money is invisible in analytics.** `paidOrderStatuses` counts only
  `PAID`, `FULFILLING` and `COMPLETED`, so neither the deposits being held nor
  the 20% kept on a lapse appears in the operations dashboard. Left alone
  deliberately: folding `DEPOSIT_PAID` into "paid orders" would report an order
  total that has not been collected.
- Cancelling a deposit order goes through write-off, not cancel — the order has
  a successful payment, so the order centre refuses the plain cancel and asks
  for a stock outcome. The refund is then a staff judgement, not the 30% rule:
  the shop cancelling is not the shopper missing a deadline.

## Tests

- `packages/business-rules/src/deposit-plan.test.ts` — the split, the rounding,
  the seven-day clock, the 30/20 lapse settlement and its cap.
- `apps/storefront/src/payments/mpesa-production-guard.test.ts` — a deposit
  never satisfies a balance or a total.
- `apps/storefront/src/payments/payment-service.test.ts` — the expected amount
  per payment leg.
- `apps/storefront/src/orders/order-service.test.ts` — the two new order labels,
  and that neither shows a fulfilment tracker.
