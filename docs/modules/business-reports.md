# Business report emails (daily, weekly, monthly)

The owner gets three automatic emails. Each covers a period that has already
ended, on Nairobi time:

| Report | Sent (Nairobi) | Covers | Compared with |
| --- | --- | --- | --- |
| Daily | every day 07:00 | yesterday, 00:00–24:00 | the day before |
| Weekly | Mondays 07:05 | last Monday–Sunday | the week before |
| Monthly | 1st of the month 07:10 | last calendar month | the month before |

## What is in it

- **Sales and collections**: M-Pesa cash in (deposits included), paid orders,
  order value, items sold, average order, pickup vs delivery, new deposit
  holds, payment success rate, refunds, and a warning when a payment is
  waiting for manual review.
- **Inventory and listing**: items checked in, items published, what is on sale
  now and its total ticket price, items held in carts or by deposits, items
  still in digitisation, and the five listings that have gone longest unsold.
- **Warehouse**: parcels packed and handed over in the period, delivery
  failures, the current queue at each stage, paid orders more than 48 hours old
  and still not handed over, and picks and packs per employee.
- **Affiliates**: orders and order value from affiliates, commission earned and
  paid, and the top five affiliates by commission.
- **Returns and customer service**: return requests, returns received, new
  cases, open and overdue cases, and refunds waiting for approval.

Period numbers are compared with the previous period. Numbers marked "现在"
(right now) describe the shop at the moment the email was built.

An order counts as sold when its last payment clears: the full payment, or the
balance on a deposit order. A deposit alone is counted as a new hold, not as a
sale.

## How it runs

- Code: `apps/storefront/src/reports/` and the internal route
  `POST /api/internal/send-business-report?period=daily|weekly|monthly`,
  protected by `INTERNAL_CRON_SECRET` like the other scheduler routes.
- Schedule: three Cloud Scheduler jobs, `business-report-{daily,weekly,monthly}-production`,
  created by `scripts/gcloud/configure-production-scheduler.sh` during the
  production storefront deploy.
- Read only. It never changes an order, payment, garment or commission.
- Email is sent with [Resend](https://resend.com). Each send carries an
  idempotency key (`business-report/<period>/<first day>`), so a scheduler retry
  does not send the same report twice.

## One-time setup

1. Create a Resend account with the address that should receive the reports,
   and create an API key.
2. Store two secrets in Google Secret Manager in the production project (never
   in GitHub or in this repository):
   - `PRODUCTION_RESEND_API_KEY`: the Resend API key
   - `PRODUCTION_BUSINESS_REPORT_EMAIL_TO`: recipient addresses, comma-separated
3. Run the production storefront deploy once. It attaches both secrets and
   creates the three scheduler jobs.

Until a domain is verified in Resend, mail is sent from `onboarding@resend.dev`
and only reaches the Resend account owner's own address. To send to other people
as well, verify a domain in Resend and set `BUSINESS_REPORT_EMAIL_FROM`.

If either secret is missing, the deploy prints a warning, the jobs still run,
and the route answers `sent: false` with the reason. Nothing else is affected.

## Checking or re-sending by hand

With the cron secret as the bearer token:

- `...?period=weekly&preview=1` returns the email as a web page and sends nothing.
- `...?period=daily&date=2026-09-20` builds the report for the period that holds
  that day. Re-sending the same period within 24 hours is ignored by Resend.
