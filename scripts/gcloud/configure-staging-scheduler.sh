#!/usr/bin/env bash
set -euo pipefail

: "${GCP_PROJECT_ID:?Set GCP_PROJECT_ID.}"
: "${GCP_REGION:?Set GCP_REGION.}"
: "${STOREFRONT_PUBLIC_URL:?Set STOREFRONT_PUBLIC_URL.}"
: "${INTERNAL_CRON_SECRET:?Set INTERNAL_CRON_SECRET.}"

JOB_NAME="${JOB_NAME:-release-expired-reservations-staging}"
URI="${STOREFRONT_PUBLIC_URL%/}/api/internal/release-expired-reservations"

if gcloud scheduler jobs describe "${JOB_NAME}" --project "${GCP_PROJECT_ID}" --location "${GCP_REGION}" >/dev/null 2>&1; then
  gcloud scheduler jobs update http "${JOB_NAME}" \
    --project "${GCP_PROJECT_ID}" \
    --location "${GCP_REGION}" \
    --schedule "* * * * *" \
    --time-zone "Africa/Nairobi" \
    --uri "${URI}" \
    --http-method POST \
    --update-headers "Authorization=Bearer ${INTERNAL_CRON_SECRET}"
else
  gcloud scheduler jobs create http "${JOB_NAME}" \
    --project "${GCP_PROJECT_ID}" \
    --location "${GCP_REGION}" \
    --schedule "* * * * *" \
    --time-zone "Africa/Nairobi" \
    --uri "${URI}" \
    --http-method POST \
    --headers "Authorization=Bearer ${INTERNAL_CRON_SECRET}"
fi

echo "Cloud Scheduler job ${JOB_NAME} calls ${URI} every minute."
