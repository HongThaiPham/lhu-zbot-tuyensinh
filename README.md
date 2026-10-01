# LHU Zalo Admissions Bot

This repository bootstraps the LHU admissions assistant monorepo for a Next.js admin app and a NestJS bot service.

## Workspace structure

- `apps/admin` – Next.js Admin UI
- `apps/bot-service` – NestJS API and worker service
- `packages/*` – shared libraries for config, database, UI, and common logic

## Configuration

- Canonical runtime configuration is implemented in `packages/config`.
- See `docs/CONFIGURATION.md` for variable rules, startup validation, and production secret requirements.

## Local development

```bash
pnpm install --frozen-lockfile
pnpm dev
```

## Database foundation (Phase 2)

- Canonical database package: `packages/database`
- Prisma schema/migrations: committed and reproducible
- pgvector extension: enabled through migration history
- Deterministic seed + verification scripts:
  - `pnpm db:prisma:generate`
  - `pnpm db:migrate:deploy`
  - `pnpm db:seed`
  - `pnpm db:verify`
  - `pnpm db:verify:fresh`

See `docs/DATABASE.md` for the full migration, seeding, health, and CI workflow.

## Authentication foundation (Phase 3)

- Auth strategy: opaque session cookie with server-side session records
- Password hashing: Argon2id
- RBAC: users/roles/user_roles
- Audit: append-oriented audit log with transactional writes for important mutations
- Bootstrap command (explicit only): `pnpm --filter @lhu/bot-service auth:bootstrap-admin`

See:

- `docs/AUTHENTICATION.md`
- `docs/AUDIT.md`

## Zalo REST API integration foundation (Phase 4)

- Third-party Zalo SDK dependency: `none`
- Internal boundary: `apps/bot-service/src/zalo`
- Admin connection test endpoint: `POST /admin/zalo/test-connection`
- Manual live test (optional, requires real token): `pnpm zalo:test-connection`

See:

- `docs/ZALO_INTEGRATION.md`

## Zalo getUpdates long polling foundation (Phase 5)

- Implemented API: `POST /bot<BOT_TOKEN>/getUpdates`
- Polling owner: `bot-worker` only
- Mode gating: polling runs only when `ZALO_UPDATE_MODE=polling`
- `bot-api` health endpoints remain free of live Zalo dependency
- Verification script: `./scripts/phase-5-zalo-polling-foundation.sh`
