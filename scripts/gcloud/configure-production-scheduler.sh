#!/usr/bin/env bash
set -euo pipefail

: "${GCP_PROJECT_ID:?Set GCP_PROJECT_ID.}"
: "${STOREFRONT_PUBLIC_URL:?Set STOREFRONT_PUBLIC_URL.}"

GCP_SCHEDULER_REGION="${GCP_SCHEDULER_REGION:-europe-west1}"
JOB_NAME="${JOB_NAME:-release-expired-reservations-production}"
VIDEO_JOB_NAME="${VIDEO_JOB_NAME:-render-affiliate-videos-production}"
RECONCILE_JOB_NAME="${RECONCILE_JOB_NAME:-reconcile-mpesa-payments-production}"
NOTIFY_JOB_NAME="${NOTIFY_JOB_NAME:-send-notifications-production}"
DEPOSIT_JOB_NAME="${DEPOSIT_JOB_NAME:-expire-deposit-holds-production}"
SECRET_NAME="${SECRET_NAME:-PRODUCTION_INTERNAL_CRON_SECRET}"
CRON_SECRET="$(gcloud secrets versions access latest --project "${GCP_PROJECT_ID}" --secret "${SECRET_NAME}")"

if [ -z "${CRON_SECRET}" ]; then
  echo "${SECRET_NAME} is empty or unavailable." >&2
  exit 1
fi

# Creates or updates one Cloud Scheduler job that POSTs to an internal route.
#
# gcloud echoes the whole job definition when it writes one, and that definition
# contains the Authorization header. Whoever runs this then pastes the output
# into a chat or a ticket to show it worked, and the bearer token goes with it —
# which is exactly how this secret leaked on 2026-09-24. stdout goes to /dev/null
# and the summary line below says what happened instead; stderr is left alone so
# a real failure still reaches the screen.
upsert_job() {
  local name="$1" path="$2" schedule="$3" deadline="$4"
  local uri="${STOREFRONT_PUBLIC_URL%/}${path}"
  if gcloud scheduler jobs describe "${name}" --project "${GCP_PROJECT_ID}" --location "${GCP_SCHEDULER_REGION}" >/dev/null 2>&1; then
    gcloud scheduler jobs update http "${name}" \
      --project "${GCP_PROJECT_ID}" \
      --location "${GCP_SCHEDULER_REGION}" \
      --schedule "${schedule}" \
      --time-zone "Africa/Nairobi" \
      --uri "${uri}" \
      --http-method POST \
      --attempt-deadline "${deadline}" \
      --update-headers "Authorization=Bearer ${CRON_SECRET}" >/dev/null
  else
    gcloud scheduler jobs create http "${name}" \
      --project "${GCP_PROJECT_ID}" \
      --location "${GCP_SCHEDULER_REGION}" \
      --schedule "${schedule}" \
      --time-zone "Africa/Nairobi" \
      --uri "${uri}" \
      --http-method POST \
      --attempt-deadline "${deadline}" \
      --headers "Authorization=Bearer ${CRON_SECRET}" >/dev/null
  fi
  echo "Cloud Scheduler job ${name} in ${GCP_SCHEDULER_REGION} calls ${uri} on '${schedule}'."
}

upsert_job "${JOB_NAME}" "/api/internal/release-expired-reservations" "* * * * *" "180s"
# Plans each affiliate's daily TikTok videos and renders one per call; about
# 90 videos a day (30 affiliates x 3) finish within the first hours of the day.
upsert_job "${VIDEO_JOB_NAME}" "/api/internal/run-through-videos" "*/3 * * * *" "300s"
# Asks Safaricom what happened to STK requests whose callback never arrived. A
# lost callback otherwise means the shopper paid and the garment was released.
upsert_job "${RECONCILE_JOB_NAME}" "/api/internal/reconcile-payments" "* * * * *" "180s"
# Drains the notification outbox.
upsert_job "${NOTIFY_JOB_NAME}" "/api/internal/send-notifications" "* * * * *" "120s"
# Deposit holds run on a seven-day clock, so hourly is far more often than the
# deadline needs. It is hourly anyway because the moment a hold lapses the
# garment should be back on sale -- a piece nobody can buy earns nothing -- and
# because a shopper an hour late still gets the refund the policy promises.
#
# Without this job the deposit feature silently half-works: money is taken and
# stock is held, but no hold ever expires, no garment returns to sale and no
# refund is ever raised. That is the worst of the three states to be in, which
# is why it belongs here and not in a runbook step somebody has to remember.
upsert_job "${DEPOSIT_JOB_NAME}" "/api/internal/expire-deposit-holds" "0 * * * *" "300s"
