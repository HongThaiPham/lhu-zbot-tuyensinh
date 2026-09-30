# LHU Zalo Admissions Bot

This repository bootstraps the LHU admissions assistant monorepo for a Next.js admin app and a NestJS bot service.

## Workspace structure

- `apps/admin` – Next.js Admin UI
- `apps/bot-service` – NestJS API and worker service
- `packages/*` – shared libraries for config, database, UI, and common logic

## Local development

```bash
pnpm install
pnpm dev
```

## Phase 0 status

This branch establishes the monorepo foundation, workspace tooling, Docker Compose runtime skeleton, and verified bootstrap checks.
