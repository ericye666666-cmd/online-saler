# Staging Product Factory setup

This checklist configures the first-stage Product Factory without displaying secret values. Use the configuration checker in Operations after the related UI PR lands.

## 1. Google Cloud project

### Select the project

- Open Google Cloud Console.
- Use the project selector in the top bar.
- Select `online-saler-staging`.
- Verify: the project name in the header is `online-saler-staging` before changing anything.
- Common error: configuring a similarly named production project. Stop if the header does not say staging.

### Required APIs

Go to **APIs & Services > Enabled APIs & services** and verify these are enabled:

- Cloud Run Admin API
- Cloud Build API
- Artifact Registry API
- Cloud SQL Admin API
- Secret Manager API
- IAM Credentials API
- Service Usage API

Verification: each API page shows **API enabled**. A deployment failure containing `SERVICE_DISABLED` means the matching API is missing.

### Cloud SQL

Go to **SQL > Instances**.

- The staging PostgreSQL instance must be running.
- Its database must match the database name encoded in the staging `DATABASE_URL` secret.
- Do not run reset, drop, or destructive Prisma commands.

Verification:

- `Deploy API to Staging` passes **Run staging migrations and seed test operator**.
- The API `/health` check alone is not enough; the deploy workflow must also create/read a real product-domain record.

Common errors:

- `P3009`: inspect `_prisma_migrations`; the staging recovery script only resolves a failed migration after schema equivalence is proven.
- `P1001`: Cloud SQL connection or networking is unavailable.
- `permission denied`: the migration job service account lacks Cloud SQL access.

### Secret Manager

Go to **Security > Secret Manager**. Verify secrets exist for the names referenced in `.github/workflows/deploy-api-staging.yml`.

At minimum the runtime needs:

- staging database URL
- OpenAI API key
- Operations admin bootstrap/reset secret where configured

Do not put secret values in GitHub variables, source code, screenshots, logs, or the Operations configuration page.

Verification:

- Open each secret and confirm at least one enabled version exists.
- In **Permissions**, confirm the API runtime service account has **Secret Manager Secret Accessor** only for secrets it needs.

Common errors:

- `Secret version not found`: add or enable a version.
- `Permission denied on secret`: grant accessor to the Cloud Run runtime service account, not to all users.

### Cloud Storage

Go to **Cloud Storage > Buckets** and open the staging product-image bucket configured by the deployment workflow.

Verify:

- API runtime can create and read original product images.
- API runtime can create transparent, white-background, and optimized variants.
- Objects are not public unless the current application design explicitly requires it.
- CORS allows only the staging Operations and Storefront origins if browser-direct access is used.

Common errors:

- `403` from image content routes: service account lacks object access or the API proxy route is wrong.
- Browser broken image with a successful API response: inspect MIME type and content disposition.
- Missing original after rerun: this is a product safety defect; stop processing because originals must be immutable.

### Artifact Registry

Go to **Artifact Registry > Repositories**.

Verify the staging repository contains images for:

- API
- Operations
- Storefront
- lightweight OpenCV processor
- rembg + BiRefNet processor

Common error: build succeeds but deploy cannot pull. Grant the Cloud Run service agent read access to the repository.

### Cloud Run services

Go to **Cloud Run** and verify these staging services are present and healthy:

- API
- Operations
- Storefront
- lightweight OpenCV processor
- rembg + BiRefNet processor

For each service, open **Revisions** and verify the latest revision receives traffic.

Image processors:

- should require authentication
- should scale to zero when idle
- should use concurrency `1` unless load testing proves a higher value is safe
- should only be invokable by the API runtime/deployment identities

Verification:

- Deployment workflow health checks pass for both processors.
- API smoke verifies an automatic lightweight path and a BiRefNet fallback path.

Common errors:

- `401/403` from API to processor: Cloud Run Invoker binding or identity token audience is wrong.
- timeout/cold start: inspect processor logs; do not silently switch to a paid API.
- rembg container restart: check model availability, memory, and pinned Pillow/rembg versions.

### IAM and Workload Identity Federation

Go to **IAM & Admin > IAM** and **Workload Identity Federation**.

Verify:

- GitHub Actions deployment identity is bound to this repository and expected branch/environment.
- Deployment identity can push images and deploy only the staging services/jobs it owns.
- API runtime identity can access Cloud SQL, required secrets, storage objects, and invoke both private processors.
- Do not replace existing role bindings when adding one permission.

Common errors:

- GitHub authentication succeeds but deploy fails: deployment service account is missing a resource-level role.
- API deploy succeeds but processing fails: runtime service account, not deployment account, lacks Invoker or storage access.

## 2. GitHub repository

Open `ericye666666-cmd/online-saler`.

### Actions and environments

Go to **Settings > Actions > General**.

- Actions must be enabled for this repository.
- Workflow permissions must allow the existing deployment design.

Go to **Settings > Environments** and open the staging environment if present.

- Confirm environment secrets/variables referenced by workflows exist.
- Confirm branch rules allow `develop` to deploy staging.
- Do not copy production credentials into staging.

### Repository variables and secrets

Go to **Settings > Secrets and variables > Actions**.

Verify names against workflow references; the application must not depend on undocumented local-only variables.

Expected configuration categories:

- GCP project/region
- Workload Identity provider
- deployment service account
- service and job names
- storage bucket
- runtime domains

Verification: `Deploy API to Staging`, Operations deployment, and Storefront deployment all finish green after a merge to `develop`.

### Branch protection

Go to **Settings > Branches** or **Rules > Rulesets**.

- `develop` should require CI before merge.
- Do not require a deployment workflow that only starts after merge as a pre-merge check.
- Keep `main` reserved for release.

## 3. Operations setup

### Admin and employee account

Open the staging Operations URL and sign in with a staging admin account.

Go to **系统管理 > 账号管理**.

- Admin must be active.
- Admin must be linked to an Employee record.
- Product Factory operator needs product create/edit permissions.
- Reviewer needs product approve permission.
- Publisher needs product publish permission.

Verification: Product Factory pages load without `403`, and audit records use the linked employee ID.

### Product taxonomy

Go to **商品中心 > 分类与属性**.

Before the first real batch, confirm:

- categories and subcategories match AI output enums
- colors, sizes, condition grades, and defect types are enabled
- Storefront filters use the same active taxonomy

Do not delete an option already used by a product. Disable it for new work instead.

To add an option:

1. Select its tab: 分类、子分类、颜色、尺码、成色 or 瑕疵.
2. Enter a stable uppercase code and the Chinese display name.
3. For a subcategory, select its parent category or 通用.
4. Enter its sort order and click **新增**.
5. Verify it appears in the batch calibration selector and that OpenAI no longer returns a disabled option.

To rename or disable an option, edit the row and click **保存**. The code and historical product values stay unchanged. There is intentionally no delete action.

### Product Factory configuration checker

Go to **系统管理 > 商品工厂配置**.

- Click **重新检查** after every staging deployment.
- Every server item should show **已配置**.
- The page only reports secret presence; it never displays secret values.
- **Deli 打印代理** is checked from the current employee computer. Start the local agent, then rerun the check.
- The signed-in admin must show **已关联员工** before creating, calibrating, reviewing, storing, or publishing products.

If a server item is missing, use its displayed guidance and rerun the matching deployment workflow. If only the printer item is missing, do not redeploy Cloud Run; fix the employee workstation.

### Barcode settings

Confirm the staging barcode prefix and label layout before printing.

- Barcode is generated only after all ten products are calibrated.
- Label should show Barcode text, short product title, batch code, and item index.
- Duplicate scans must be rejected.

### Local printer

On the employee workstation:

- Install and connect the selected label printer.
- Start the repository's local print agent.
- Confirm the configured printer name and label size match the physical labels.
- Print one staging test label and compare the preview before printing ten.

Common errors:

- `print agent not ready`: local service is not running or browser cannot reach it.
- wrong printer: configured name does not match the operating system printer list.
- clipped Barcode: physical label size differs from the selected template.

### Scanner

Configure the Barcode scanner as a keyboard input device with an Enter suffix.

Verify:

- scanning a product label fills exactly one Barcode field
- scanning the same label twice shows a duplicate error
- scanning a wrong-batch product shows a wrong-batch error
- scanner input works without changing keyboard layout

### Warehouse locations

Create or confirm enabled location codes and positive capacities before stock-in.

- Shelf locations do not use QR codes or shelf scanning.
- Formal Barcode generation reserves shelf text automatically within remaining capacity.
- Employees place the batch from the grouped shelf list and confirm all items once.
- The assigned location, employee, and time remain in inventory movement and audit history.

Do not bypass capacity validation or silently change a location after its product label is printed.

## 4. Final readiness verification

The Product Factory is ready for the first real batch only when all checks below pass:

1. API, Operations, Storefront, lightweight processor, and BiRefNet processor are healthy.
2. Staging migrations complete without reset or data deletion.
3. Operations login resolves a linked employee and required permissions.
4. A real original image uploads and remains downloadable after every rerun.
5. Lightweight processing records provider and quality metadata.
6. A forced or quality-triggered BiRefNet fallback succeeds.
7. Transparent PNG has a real alpha channel.
8. White-background and optimized-main variants are generated.
9. Test records are hidden by default but can be shown by an admin.
10. One complete ten-item browser E2E passes on desktop and `390x844` mobile viewport.
