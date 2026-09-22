# Payment exceptions, reconciliation and refunds

M-Pesa does not always tell a clean story. A callback can arrive after the
reservation expired, for the wrong amount, with a receipt already recorded
against another payment, or for an STK request that was never made here. The
payment code has always refused to guess: anything ambiguous becomes
`MANUAL_REVIEW`. What was missing until 2026-09-23 was anywhere for those
payments to go afterwards — the shopper had paid, the order stayed unpaid, and
only a direct database edit could finish it.

## The review queue

**订单中心 → 支付复核** lists two things:

- **Payments in `MANUAL_REVIEW`**, each with the plain-language reason it is
  held and everything needed to check it against the merchant statement:
  amount against order total, receipt, phone, checkout request id, and the
  result of any Safaricom status query.
- **Orphan callbacks** — callbacks with no matching payment, usually a customer
  paying the till directly. These can be closed with a note.

Two decisions end a payment:

| Action | What happens |
| --- | --- |
| **确认收到款项，放行订单** | Runs the same settlement routine a clean callback does: stock becomes PAID, a picking task appears, the affiliate earns a pending commission, the shopper is told. |
| **确认没有收到款项** | Closes the payment as failed and hands the garments back to the shop floor. |

Settlement shares one function (`settleSuccessfulPayment`) with the automatic
path, so a hand-settled payment is indistinguishable from an ordinary one.
If the garment has already gone — released and sold to someone else — settlement
refuses and says so; that order has to be refunded instead.

## Reconciliation

`/api/internal/reconcile-payments` runs every minute. For every payment still
`PENDING` more than 45 seconds after the STK request, it asks Safaricom what
actually happened:

- **ResultCode 0** — settle the order and tell the shopper. If the garment is
  gone, park the payment in review and alert the on-call numbers.
- **1032 / 1037 / 1** — cancelled, timed out, no funds: close the payment and
  release the reservation.
- **Anything non-numeric** (still processing) — leave it and try again later, up
  to eight times.

A provider outage never stops the batch; the attempt is recorded either way so
no payment can be queried forever.

## Refunds

The system never moves money. A refund is executed in M-Pesa first and then
recorded on the order with its reference and evidence. Refunds now attach to
the order rather than only to a return, so an order that was paid for and can
never be fulfilled can be refunded too.

The sequence for an order that cannot be fulfilled:

1. **无法履约，作废订单** — choose whether the garment goes back on sale or is
   recorded as lost. The order is cancelled and the commission reversed.
2. The order appears under **订单中心 → 财务汇总 → 待退款** with the amount owed.
3. Refund the customer in M-Pesa.
4. **登记退款** on the order with the amount and reference. When recorded
   refunds cover the payment, the order becomes `REFUNDED`.

Recorded refunds can never exceed what was actually paid.

## Configuration

| Variable | Purpose |
| --- | --- |
| `INTERNAL_CRON_SECRET` | Bearer token the scheduler presents to the internal routes. |
| `MPESA_STK_QUERY_URL` | Overrides the transaction status endpoint; defaults per environment. |
| `ADMIN_ALERT_PHONES` | Comma-separated numbers that receive payment and fulfillment exception alerts. With none set, alerts are simply not queued and the exception still shows in the order centre. |
| `AFRICASTALKING_USERNAME` / `AFRICASTALKING_API_KEY` / `AFRICASTALKING_SENDER_ID` | SMS delivery. Without them, messages queue and stay visible under 系统管理 → 通知队列. |

None of these are secrets that belong in the repository. Production values live
in Google Secret Manager.

## Checking it by hand

1. In staging, start a checkout and let the reservation expire without paying.
   The payment closes and the garment returns to sale.
2. Use `/api/internal/mpesa/simulate-callback` to post a success callback for a
   payment whose reservation has already expired. It lands in 支付复核 with
   "Callback arrived after the reservation window closed."
3. Settle it with a note. The order moves to 待拣货, a commission appears under
   待确认佣金, and the shopper's message appears in 通知队列.
