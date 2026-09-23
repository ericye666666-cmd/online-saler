#!/usr/bin/env bash
set -euo pipefail

# Cloud Scheduler jobs that poke the storefront's internal endpoints.
#
# Both of these exist because the work they drive must not happen inline. A
# checkout cannot wait on a cleanup sweep, and an order transition must not fail
# because an SMS provider is slow — so each writes its intent down and a job here
# comes along afterwards to act on it.
#
# Without the notification job the outbox is a postbox nobody empties: messages
# queue up, operations shows them as PENDING, and the customer never gets the
# delivery code their order cannot be completed without.

: "${GCP_PROJECT_ID:?Set GCP_PROJECT_ID.}"
: "${GCP_REGION:?Set GCP_REGION.}"
: "${STOREFRONT_PUBLIC_URL:?Set STOREFRONT_PUBLIC_URL.}"
: "${INTERNAL_CRON_SECRET:?Set INTERNAL_CRON_SECRET.}"

BASE_URL="${STOREFRONT_PUBLIC_URL%/}"

configure_job() {
  local job_name="$1" path="$2" schedule="$3" description="$4"
  local uri="${BASE_URL}${path}"

  if gcloud scheduler jobs describe "${job_name}" --project "${GCP_PROJECT_ID}" --location "${GCP_REGION}" >/dev/null 2>&1; then
    gcloud scheduler jobs update http "${job_name}" \
      --project "${GCP_PROJECT_ID}" \
      --location "${GCP_REGION}" \
      --schedule "${schedule}" \
      --time-zone "Africa/Nairobi" \
      --uri "${uri}" \
      --http-method POST \
      --update-headers "Authorization=Bearer ${INTERNAL_CRON_SECRET}"
  else
    gcloud scheduler jobs create http "${job_name}" \
      --project "${GCP_PROJECT_ID}" \
      --location "${GCP_REGION}" \
      --schedule "${schedule}" \
      --time-zone "Africa/Nairobi" \
      --uri "${uri}" \
      --http-method POST \
      --headers "Authorization=Bearer ${INTERNAL_CRON_SECRET}"
  fi

  echo "Cloud Scheduler job ${job_name} calls ${uri} on '${schedule}' — ${description}"
}

# Reservations expire in five minutes, so a minute of drift is already generous.
configure_job \
  "${JOB_NAME:-release-expired-reservations-staging}" \
  "/api/internal/release-expired-reservations" \
  "* * * * *" \
  "releases reservations whose checkout window has passed"

# Every two minutes. A customer waiting on a delivery code is standing at their
# gate with a rider, so this is the slowest it can be without being noticed;
# sending is retried with backoff inside the drain, not by rescheduling here.
configure_job \
  "${NOTIFICATION_JOB_NAME:-send-notifications-staging}" \
  "/api/internal/send-notifications" \
  "*/2 * * * *" \
  "empties the SMS outbox"

# Deposit holds run on a seven-day clock, so hourly is far more often than the
# deadline needs. It is hourly anyway because the moment a hold lapses the
# garment should be back on sale — a piece nobody can buy earns nothing — and
# because a shopper who is one hour late still gets the refund the policy
# promises, so there is no reason to make them wait for it.
configure_job \
  "${DEPOSIT_JOB_NAME:-expire-deposit-holds-staging}" \
  "/api/internal/expire-deposit-holds" \
  "0 * * * *" \
  "reminds shoppers whose balance is due and releases lapsed deposit holds"
