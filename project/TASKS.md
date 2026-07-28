# Task Register

Use this file for high-level planning before issues are created. Track design,
implementation, and test status separately so documentation completion is not
mistaken for working software.

Status values:

- `Not Started`
- `Designed`
- `Implemented`
- `Tested`
- `Accepted`
- `Blocked`

| ID | Area | Task | Design | Implementation | Tests | Notes |
|---|---|---|---|---|---|---|
| ARCH-001 | Architecture | Confirm technical stack and monorepo layout | Designed | Implemented | Tested | Next.js, NestJS, Prisma, PostgreSQL monorepo skeleton is merged. |
| GOV-001 | Governance | Engineering Rules v1 | Designed | Implemented | Tested | Added as executable project governance for branches, PRs, migrations, CRs, DoD, releases, and rollback. |
| INFRA-001 | Infrastructure | Create staging Google Cloud project plan | Designed | Implemented | Tested | Staging CI/CD, Cloud Run deployment, Cloud SQL, database, app user, and runtime identity are in place. |
| PROD-001 | Product | Define product state machine | Designed | Implemented | Tested | Backend Product state machine enforces the frozen flow and CR-001 barcode timing. |
| PROD-002 | Product | Product Prisma schema | Designed | Implemented | Tested | Product schema PR #4 is merged with append-only migration `0002_product_domain_v0_2`. |
| PROD-003 | Product | Product repository and domain service | Designed | Implemented | Tested | Repository abstraction, Prisma implementation, state transitions, barcode checks, and audit logging. |
| INV-001 | Inventory | Define online location code format | Not Started | Not Started | Not Started | Must align with warehouse SOP. |
| PAY-001 | Payment | Define M-Pesa integration contract | Designed | Not Started | Not Started | Include callback idempotency before implementation. |
| AFF-001 | Affiliate | Define referral and commission ledger model | Designed | Not Started | Not Started | Single-level MVP only. |
