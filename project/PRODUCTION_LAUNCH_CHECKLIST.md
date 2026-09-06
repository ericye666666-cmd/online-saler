# Production Launch Checklist

This checklist is the release gate for the first Safaricom Till production test and the later live order rollout.

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
| `PRODUCTION_MPESA_TEST_PHONE_WHITELIST` | `MPESA_TEST_PHONE_WHITELIST` | Comma-separated Kenya phone numbers allowed during 1 KSh test mode. |

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
MPESA_PRODUCTION_LAUNCH_MODE=one_ksh
MPESA_TEST_AMOUNT_KSH=1
MPESA_ENABLE_SANDBOX_SIMULATOR=false
```

Do not switch `MPESA_PRODUCTION_LAUNCH_MODE` to `live` until the 1 KSh Till test is signed off.

The production Storefront deployment workflow now blocks deployment when:

- Any required Google Secret Manager secret is missing or has no latest version.
- The production H.O./Business Shortcode and Store/Till Number are non-numeric or identical.
- `MPESA_CALLBACK_URL_PRODUCTION` is missing.
- `MPESA_CALLBACK_URL_PRODUCTION` is not an HTTPS `/api/payments/mpesa/callback` URL.
- `mpesa_launch_mode=one_ksh` is selected but `PRODUCTION_MPESA_TEST_PHONE_WHITELIST` is empty.
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

## 1 KSh Safaricom Till test

Use this only with `MPESA_PRODUCTION_LAUNCH_MODE=one_ksh`.

1. Confirm the production H.O./Business Shortcode, Store/Till Number, and passkey with Safaricom.
2. Add only the test phone numbers to `PRODUCTION_MPESA_TEST_PHONE_WHITELIST`.
3. Deploy production Storefront with the manual workflow input `mpesa_launch_mode=one_ksh`.
4. Confirm Google OAuth callback is registered:
   ```text
   <storefront-url>/api/auth/google/callback
   ```
5. Confirm M-Pesa callback is registered or configured:
   ```text
   <storefront-url>/api/payments/mpesa/callback
   ```
6. Publish one low-risk test item.
7. Sign in with Google on a mobile phone.
8. Checkout using a whitelisted M-Pesa phone.
9. Confirm the STK Push amount is exactly `KSh 1`.
10. Enter the M-Pesa PIN.
11. Confirm money arrives in the correct Till.
12. Confirm callback reaches the app.
13. Confirm `Payment.status = SUCCESS`.
14. Confirm `Order.status = PAID`.
15. Confirm related inventory is `PAID`.
16. Confirm the product is no longer available on Storefront.
17. Re-send or simulate the same callback payload and confirm it does not create a duplicate payment, order state change, or commission.

## Live amount opening steps

Only perform this after the 1 KSh test is approved.

1. Confirm at least one successful 1 KSh payment receipt in the correct Till.
2. Confirm customer-facing error pages and retry states on mobile.
3. Confirm Cloud Run logs contain no recurring errors for callback, checkout, or cleanup.
4. Confirm alerts are enabled for Cloud Run 5xx and high latency.
5. Confirm database migrations have been applied.
6. Confirm Cloud Scheduler cleanup succeeds for at least 10 minutes.
7. Run a two-customer same-item test:
   - Customer A starts payment and reserves the item.
   - Customer B tries the same item and receives an unavailable or reserved message.
   - Customer A pays successfully.
   - Customer B still cannot buy the same item.
8. Deploy production Storefront again with workflow input:
   ```text
   mpesa_launch_mode=live
   ```
9. Place one real order with the real amount.
10. Confirm `Payment SUCCESS`, `Order PAID`, inventory `PAID`, and the product removed from sale.

## Launch no-go conditions

Do not open live payments if any of these are true:

- Callback is not reachable over public HTTPS.
- Payment callback creates manual review for the 1 KSh test.
- The same callback can be applied twice.
- Inventory remains available after successful payment.
- Cloud Scheduler cannot release expired reservations.
- Storefront mobile checkout has a blocking UI error.
- Google OAuth cannot return users to checkout.
- Cloud Run production secrets are missing or stored outside Secret Manager.
