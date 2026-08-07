#!/usr/bin/env bash
set -euo pipefail

: "${GCP_PROJECT_ID:?Set GCP_PROJECT_ID.}"
: "${STOREFRONT_PUBLIC_URL:?Set STOREFRONT_PUBLIC_URL.}"

GCP_SCHEDULER_REGION="${GCP_SCHEDULER_REGION:-europe-west1}"
JOB_NAME="${JOB_NAME:-release-expired-reservations-production}"
SECRET_NAME="${SECRET_NAME:-PRODUCTION_INTERNAL_CRON_SECRET}"
CRON_SECRET="$(gcloud secrets versions access latest --project "${GCP_PROJECT_ID}" --secret "${SECRET_NAME}")"

if [ -z "${CRON_SECRET}" ]; then
  echo "${SECRET_NAME} is empty or unavailable." >&2
  exit 1
fi

URI="${STOREFRONT_PUBLIC_URL%/}/api/internal/release-expired-reservations"

if gcloud scheduler jobs describe "${JOB_NAME}" --project "${GCP_PROJECT_ID}" --location "${GCP_SCHEDULER_REGION}" >/dev/null 2>&1; then
  gcloud scheduler jobs update http "${JOB_NAME}" \
    --project "${GCP_PROJECT_ID}" \
    --location "${GCP_SCHEDULER_REGION}" \
    --schedule "* * * * *" \
    --time-zone "Africa/Nairobi" \
    --uri "${URI}" \
    --http-method POST \
    --headers "Authorization=Bearer ${CRON_SECRET}"
else
  gcloud scheduler jobs create http "${JOB_NAME}" \
    --project "${GCP_PROJECT_ID}" \
    --location "${GCP_SCHEDULER_REGION}" \
    --schedule "* * * * *" \
    --time-zone "Africa/Nairobi" \
    --uri "${URI}" \
    --http-method POST \
    --headers "Authorization=Bearer ${CRON_SECRET}"
fi

echo "Cloud Scheduler job ${JOB_NAME} in ${GCP_SCHEDULER_REGION} calls ${URI} every minute."
