import { existsSync } from "node:fs";

const requiredPaths = [
  "README.md",
  ".gitignore",
  ".github/workflows/ci.yml",
  ".github/CODEOWNERS",
  ".github/pull_request_template.md",
  ".github/ISSUE_TEMPLATE/bug_report.yml",
  ".github/ISSUE_TEMPLATE/feature_request.yml",
  ".github/ISSUE_TEMPLATE/change_request.yml",
  "apps/storefront/README.md",
  "apps/operations/README.md",
  "apps/admin/README.md",
  "apps/api/README.md",
  "apps/worker/README.md",
  "packages/database/README.md",
  "packages/shared-types/README.md",
  "packages/business-rules/README.md",
  "packages/ui/README.md",
  "packages/config/README.md",
  "docs/architecture/system-overview.md",
  "docs/business-rules/mvp-rules.md",
  "docs/development/branch-strategy.md",
  "docs/deployment/staging-production.md",
  "docs/api/README.md",
  "docs/modules/README.md",
  "docs/testing/README.md",
  "project/ROADMAP.md",
  "project/TASKS.md",
  "project/BUGS.md",
  "project/CHANGE_REQUESTS.md",
  "tests/unit/README.md",
  "tests/integration/README.md",
  "tests/e2e/README.md",
  "infrastructure/cloud-run/README.md",
  "infrastructure/cloud-sql/README.md",
  "infrastructure/storage/README.md",
  "infrastructure/scripts/README.md"
];

const missing = requiredPaths.filter((path) => !existsSync(path));

if (missing.length > 0) {
  console.error("Repository skeleton is incomplete. Missing paths:");
  for (const path of missing) {
    console.error(`- ${path}`);
  }
  process.exit(1);
}

console.log(`Repository skeleton check passed (${requiredPaths.length} paths).`);
