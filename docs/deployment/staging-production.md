# Staging and Production Plan

## Environments

Use separate Google Cloud projects or clearly separated resources:

- `online-saler-staging`
- `online-saler-production`

Staging is for test products, sandbox payment, integration checks, and extended pre-production validation. Production is for real customers, real inventory, real M-Pesa, and real commission records.

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

## Staging API Database Binding

The staging API deployment is configured by `.github/workflows/deploy-api-staging.yml`.

Staging resources:

- Cloud Run service: `online-saler-api-staging`
- Runtime service account: `online-saler-api-staging@online-saler-staging.iam.gserviceaccount.com`
- Cloud SQL instance connection name: `online-saler-staging:africa-south1:online-saler-staging-db`
- PostgreSQL database: `online_saler_staging`
- PostgreSQL application user: `online_saler_app`
- Secret Manager secret: `STAGING_DATABASE_URL`
- Runtime environment variable: `DATABASE_URL`

The workflow must:

1. Build and push the API image.
2. Deploy Cloud Run with the dedicated runtime service account.
3. Attach the Cloud SQL instance with the Cloud SQL connector.
4. Inject `DATABASE_URL` from `STAGING_DATABASE_URL:latest`.
5. Verify the public `/health` endpoint.

The secret value must never be committed to GitHub or written into documentation. The GitHub deployment identity must have permission to deploy Cloud Run and act as the runtime service account. The runtime service account requires only the permissions needed to connect to Cloud SQL and read the required secret.

Pull-request CI should use an ephemeral PostgreSQL service container. It must not connect directly to the long-lived staging Cloud SQL instance.

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
