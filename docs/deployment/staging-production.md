# Staging and Production Plan

## Environments

Use separate Google Cloud projects or clearly separated resources:

- `online-saler-staging`
- `online-saler-production`

Staging is for test products, sandbox payment, and integration checks. Production is for real customers, real inventory, real M-Pesa, and real commission records.

## Initial Google Cloud Resources

Required for the MVP:

- Cloud Run for `storefront`, `operations`, `admin`, `api`, and `worker`.
- Cloud SQL for PostgreSQL.
- Cloud Storage for original images, public product images, and private evidence.
- Secret Manager for database credentials, M-Pesa keys, JWT secrets, and social platform tokens.
- Artifact Registry for Docker images.
- Cloud Logging and Monitoring for runtime visibility.

Not required for the first MVP:

- Kubernetes / GKE.
- Compute Engine virtual machines.
- BigQuery.
- GPU services.
- Multi-region deployment.

## Suggested Buckets

```text
online-saler-original-private
online-saler-public-images
online-saler-private-evidence
```

## Social Links

MVP uses share links rather than full social APIs:

- WhatsApp share links and inquiry links.
- Facebook Open Graph metadata.
- Instagram and TikTok campaign links with source parameters.
- Affiliate referral parameters on every shareable URL.

Full WhatsApp Cloud API, Meta Graph API, Instagram API, and TikTok posting APIs are second-stage integrations.

## Deployment Flow

```text
Pull request
  -> CI
  -> merge to develop
  -> deploy staging
  -> staging smoke test
  -> release tag
  -> deploy production
  -> monitor
  -> rollback previous image if needed
```
