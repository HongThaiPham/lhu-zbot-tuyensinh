# LHU Zalo Admissions Bot

This repository bootstraps the LHU admissions assistant monorepo for a Next.js admin app and a NestJS bot service.

## Workspace structure

- `apps/admin` – Next.js Admin UI
- `apps/bot-service` – NestJS API and worker service
- `packages/*` – shared libraries for config, database, UI, and common logic

## Local development

```bash
pnpm install --frozen-lockfile
pnpm dev
```

## Phase 0 status

This branch establishes the monorepo foundation, workspace tooling, Docker Compose runtime skeleton, and verified bootstrap checks.

### Phase 0 verification distinction

- Unit/behavioral tests: not implemented yet in Phase 0.
- Runtime Compose smoke verification: implemented and required in CI via `scripts/phase-0-compose-smoke.sh`.
- The package-level `test` scripts currently only confirm the Phase 0 bootstrap state; they do not provide behavioral coverage.
