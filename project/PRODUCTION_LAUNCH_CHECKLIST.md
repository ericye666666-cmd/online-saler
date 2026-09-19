# Production Launch Checklist

This checklist is the release gate for every production Storefront deployment. Live M-Pesa payments opened on 2026-09-15.

## Required Google Secret Manager secrets

Create these secrets in the production Google Cloud project. Do not store these values in GitHub repository secrets, source files, PR comments, or issue comments.

| Secret name | Used as runtime env var | Notes |
| --- | --- | --- |
| `PRODUCTION_DATABASE_URL` | `DATABASE_URL` | Production PostgreSQL connection string. |
| `PRODUCTION_CUSTOMER_SESSION_SECRET` | `CUSTOMER_SESSION_SECRET` | Random 32+ byte signing secret. |
| `PRODUCTION_GOOGLE_CLIENT_SECRET` | `GOOGLE_CLIENT_SECRET` | Google OAuth web client secret. |
| `PRODUCTION_INTERNAL_CRON_SECRET` | `INTERNAL_CRON_SECRET` | Internal reservation cleanup secret. |
| `PRODUCTION_MPESA_CONSUMER_KEY` | `MPESA_CONSUMER_KEY` | Safaricom production app key. |
| `PRODUCTION_MPESA_CONSUMER_SECRET` | `MPESA_CONSUMER_SECRET` | Safaricom production app secret. |
| `PRODUCTION_MPESA_SHORTCODE` | `MPESA_SHORTCODE` | Production H.O./Business Shortcode used to generate the STK password. |
| `PRODUCTION_MPESA_TILL_NUMBER` | `MPESA_TILL_NUMBER` | Production Store/Till Number used as `PartyB` for Buy Goods. |
| `PRODUCTION_MPESA_PASSKEY` | `MPESA_PASSKEY` | Production STK Push passkey. |

`PRODUCTION_MPESA_TEST_PHONE_WHITELIST` is no longer read by anything and can be deleted from Secret Manager.

## Required GitHub repository variables

These are not secrets, but they must point to production resources before the manual production workflow is used.

| Variable | Expected value |
| --- | --- |
| `GCP_PROJECT_ID_PRODUCTION` | Production Google Cloud project ID. |
| `GCP_REGION_PRODUCTION` | Production Cloud Run region. |
| `GCP_ARTIFACT_REPOSITORY_PRODUCTION` | Artifact Registry repository. |
| `GCP_WORKLOAD_IDENTITY_PROVIDER_PRODUCTION` | GitHub OIDC provider resource name. |
| `GCP_SERVICE_ACCOUNT_PRODUCTION` | GitHub deployer service account email. |
| `GCP_STOREFRONT_SERVICE_ACCOUNT_PRODUCTION` | Cloud Run runtime service account email. |
| `GCP_CLOUD_SQL_INSTANCE_PRODUCTION` | Cloud SQL instance connection name. |
| `API_URL_PRODUCTION` | Production API service URL. |
| `STOREFRONT_PUBLIC_URL_PRODUCTION` | Customer-facing Storefront URL. |
| `GOOGLE_CLIENT_ID_PRODUCTION` | Google OAuth web client ID. |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY_PRODUCTION` | Browser Google Maps key restricted to the production Storefront domain; Maps JavaScript API and Places API must be enabled. |
| `MPESA_CALLBACK_URL_PRODUCTION` | Full callback URL, usually `<storefront-url>/api/payments/mpesa/callback`. |

## Runtime M-Pesa configuration

Production Cloud Run must use:

```text
MPESA_ENV=production
MPESA_TRANSACTION_TYPE=CustomerBuyGoodsOnline
MPESA_SHORTCODE=<H.O./Business Shortcode>
MPESA_TILL_NUMBER=<Store/Till Number>
MPESA_CALLBACK_URL=<production callback URL>
MPESA_ENABLE_SANDBOX_SIMULATOR=false
```

Every customer is charged the full order total. There is no test amount and no phone whitelist.

The `one_ksh` launch mode was removed on 2026-09-19. It let a single dropdown choice in the deploy form restrict payment to a few staff phones, and while it was deployed on that day every real customer's M-Pesa prompt was refused. Do not reintroduce a launch-mode choice into the deploy form. Revisions deployed before the removal may still carry `MPESA_PRODUCTION_LAUNCH_MODE` and `MPESA_TEST_AMOUNT_KSH`; the code no longer reads them.

The production Storefront deployment workflow blocks deployment when:

- Any required Google Secret Manager secret is missing or has no latest version.
- The production H.O./Business Shortcode and Store/Till Number are non-numeric or identical.
- `MPESA_CALLBACK_URL_PRODUCTION` is missing.
- `MPESA_CALLBACK_URL_PRODUCTION` is not an HTTPS `/api/payments/mpesa/callback` URL.
- The deployed callback endpoint cannot reject malformed callback payloads with HTTP 400.

## Cloud Scheduler

The reservation cleanup endpoint is:

```text
POST /api/internal/release-expired-reservations
```

The V1 scheduler path uses `INTERNAL_CRON_SECRET`. Configure it from Secret Manager, not from a committed value:

```bash
GCP_PROJECT_ID=<production-project> \
GCP_REGION=<region> \
STOREFRONT_PUBLIC_URL=<production-storefront-url> \
scripts/gcloud/configure-production-scheduler.sh
```

Expected result:

```text
Cloud Scheduler calls the cleanup endpoint every minute.
Expired CheckoutDraft rows become EXPIRED.
Pending payments become EXPIRED.
Reserved inventory returns to AVAILABLE.
```

The production Storefront deployment workflow configures this scheduler automatically after each successful deployment. A production deploy should be considered failed if scheduler configuration fails.

## Post-deploy payment check

Run this after any deployment that touches checkout, payment, or the M-Pesa configuration. It charges real money, so use a low-priced item and warn the warehouse that the test order must not be packed.

1. Confirm the M-Pesa callback is registered or configured:
   ```text
   <storefront-url>/api/payments/mpesa/callback
   ```
2. On a mobile phone, without signing in, add one low-priced available item to the bag and check out.
3. Confirm the STK Push arrives and shows the full item price.
4. Enter the M-Pesa PIN.
5. Confirm money arrives in the correct Till.
6. Confirm callback reaches the app.
7. Confirm `Payment.status = SUCCESS`.
8. Confirm `Order.status = PAID`.
9. Confirm related inventory is `PAID`.
10. Confirm the product is no longer available on Storefront.
11. Re-send or simulate the same callback payload and confirm it does not create a duplicate payment, order state change, or commission.

For changes to reservation or inventory handling, also run a two-customer same-item test:

- Customer A starts payment and reserves the item.
- Customer B tries the same item and receives an unavailable or reserved message.
- Customer A pays successfully.
- Customer B still cannot buy the same item.

## Deployment no-go conditions

Do not deploy, or roll back, if any of these are true:

- Callback is not reachable over public HTTPS.
- A successful payment callback lands in manual review.
- The same callback can be applied twice.
- Inventory remains available after successful payment.
- Cloud Scheduler cannot release expired reservations.
- Storefront mobile checkout has a blocking UI error.
- Checkout asks for sign-in before payment.
- Cloud Run production secrets are missing or stored outside Secret Manager.
