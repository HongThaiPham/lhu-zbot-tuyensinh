# LHU Zalo Admissions Bot

This repository bootstraps the LHU admissions assistant monorepo for a Next.js admin app and a NestJS bot service.

## Workspace structure

- `apps/admin` – Next.js Admin UI
- `apps/bot-service` – NestJS API and worker service
- `packages/*` – shared libraries for config, database, UI, and common logic

## Configuration

- Canonical runtime configuration is implemented in `packages/config`.
- See `/home/runner/work/lhu-zbot-tuyensinh/lhu-zbot-tuyensinh/docs/CONFIGURATION.md` for variable rules, startup validation, and production secret requirements.

## Local development

```bash
pnpm install --frozen-lockfile
pnpm dev
```

## Phase 1 status

This branch extends the monorepo foundation with typed configuration validation and fail-fast startup checks.

### Phase 0 verification distinction

- Unit/behavioral tests: not implemented yet in Phase 0.
- Runtime Compose smoke verification: implemented and required in CI via `scripts/phase-0-compose-smoke.sh`.
- The package-level `test` scripts currently only confirm the Phase 0 bootstrap state; they do not provide behavioral coverage.
