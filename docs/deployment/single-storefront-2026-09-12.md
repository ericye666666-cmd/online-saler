# Single customer storefront — 2026-09-12

Eric confirmed there is no real business data and authorized consolidating the storefronts. The customer entry is https://dloop.co.ke, historically mapped to online-saler-storefront-production. The staging-named storefront is a separate deployment of the same apps/storefront source, not a separate frontend codebase.

## Repository change

Stop push-triggered deployment to online-saler-storefront-staging. Keep its explicit manual workflow for controlled diagnostics/rollback only; it still has live payment configuration and is NOT an isolated sandbox. Production retains its existing manual confirmation, live/one_ksh selection, database/schema preflight, secrets and callback checks. This change does not switch DNS, migrate data, deploy production, or stop the secondary service.

## Cloud rollout still required

1. Verify current project billing and capture both services' revisions, traffic and nonsecret settings.
2. Compare the production storefront and API database targets using the existing preflight. If they differ, explicitly choose the API's canonical product/inventory database and align the production database configuration after verifying schema. The owner's no-real-data statement is not an instruction to delete databases or reset payment credentials.
3. Deploy compatible Operations transport (#186, optionally #188), verify it, then release API enforcement #187.
4. Run the existing Deploy Storefront to Production workflow from the validated develop commit with confirm=deploy-production and mpesa_launch_mode=live. Do not weaken or bypass a failed preflight.
5. Verify dloop.co.ke product visibility, customer login, order creation, reservation behavior, STK initiation and callback reconciliation with a controlled payment. Never claim payment acceptance from a successful build or an environment variable alone.
6. After formal-domain acceptance, retire the secondary storefront and only its identified reservation scheduler; preserve the production reservation scheduler. Confirm DNS points only to the retained production service. Record actual savings after resource retirement.

## Known limitations

On September 12 the last inspected Operations deployment still reported a billing-disabled Artifact Registry failure. This is historical failure evidence, not proof of current billing state. Cloud browser access has failed; live database targets, DNS, resource shutdown and payment acceptance are unverified. GitHub connector has no workflow_dispatch capability. Do not introduce an alternate production trigger to bypass that missing access.

## Rollback

Restore the old push trigger only if intentionally returning to parallel deployment. Existing services and data are untouched by this PR. Cloud cutover requires its own captured revision/configuration rollback, without restoring old databases.
