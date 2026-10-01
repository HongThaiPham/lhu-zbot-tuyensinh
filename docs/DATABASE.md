# Database

## Overview

Phase 2 establishes the canonical PostgreSQL foundation in `packages/database` using Prisma migrations.

- Database engine: `pgvector/pgvector:pg16`
- Primary store: PostgreSQL
- Vector extension: `vector` (pgvector)
- ORM/tooling: Prisma (`@prisma/client` + `prisma`)

`packages/database` is the only package that owns Prisma schema, migrations, seed, DB verification scripts, and reusable DB health probing.

## Package ownership

Canonical database assets live in:

```text
packages/database/
  prisma/schema.prisma
  prisma/migrations/*
  prisma/seed.mjs
  src/prisma-client-manager.ts
  src/database-health-probe.ts
  scripts/verify-foundation.mjs
```

Application code (for example `apps/bot-service`) consumes `@lhu/database`; it should not create ad-hoc database clients across modules.

## Prisma schema location

- Schema file: `packages/database/prisma/schema.prisma`
- Datasource: PostgreSQL via `DATABASE_URL`
- Initial technical table: `system_metadata`

`system_metadata` is intentionally minimal and exists to prove migration reproducibility, deterministic seeding, and readiness against migrated schema.

## Migration strategy

Migrations are authoritative and committed to Git.

- Migration directory: `packages/database/prisma/migrations/`
- Initial migration creates:
  - `CREATE EXTENSION IF NOT EXISTS vector;`
  - `system_metadata` table

CI and production use `prisma migrate deploy` from committed migrations. `prisma db push` is not used for CI/production schema deployment.

### Naming policy

Use timestamped migration directories generated/recorded by Prisma and meaningful suffixes, for example:

```text
YYYYMMDDHHMMSS_phase-description
```

## Seed strategy

Seed entrypoint: `packages/database/prisma/seed.mjs`.

Current behavior:

- Inserts/updates a deterministic key (`phase2.foundation.seed`) in `system_metadata`
- Uses SQL upsert semantics for idempotency
- Uses no external APIs
- Uses no live Zalo or AI provider integration

Production deployments should run seed only when explicitly intended for operational data workflows.

## Health/readiness integration

`@lhu/database` provides a real database health probe that performs:

1. `SELECT 1`
2. migrated schema check (`to_regclass('public.system_metadata')`)

`apps/bot-service` `/health/ready` now requires:

- database query + migrated schema check success
- Redis dependency success

`/health/live` remains process-level liveness and stays successful while dependencies are down.

## Local development workflow

From repository root:

```bash
pnpm db:prisma:generate
pnpm db:migrate:deploy
pnpm db:seed
pnpm db:verify
```

## Fresh database reproducibility workflow

Run deterministic fresh-db verification:

```bash
pnpm db:verify:fresh
```

This command:

1. boots a clean PostgreSQL container
2. runs Prisma generate
3. deploys committed migrations
4. verifies pgvector extension and schema
5. runs seed
6. verifies seeded foundation state

## Docker Compose deployment sequencing

Expected deployment order:

1. PostgreSQL container starts and becomes healthy
2. committed migrations execute (`pnpm db:migrate:deploy`)
3. optional seed executes (`pnpm db:seed` when needed)
4. application services start and expose readiness

Application startup does not run `db push` or implicitly mutate schema.

## CI database gate

Workflow job: **Database Foundation**.

It validates on a clean pgvector-backed PostgreSQL instance:

- dependency install
- Prisma generate
- migration deploy from zero
- seed execution
- database verification (`pnpm db:verify`)

## Troubleshooting

- **Readiness fails with `schema_not_migrated`**: run migration deploy against the target database.
- **`vector` extension missing**: ensure migrations were applied from `packages/database/prisma/migrations`.
- **Seed verification fails**: rerun `pnpm db:seed`, then `pnpm db:verify`.
- **Connection failures**: confirm `DATABASE_URL` points to reachable PostgreSQL and credentials are valid.

Do not print full `DATABASE_URL` values in logs or CI diagnostics.

## Guidance for future phases

When adding domain models in later phases:

1. update `schema.prisma`
2. create a committed migration
3. verify migration on a fresh database
4. update seed logic only when necessary
5. keep bot-service consuming `@lhu/database` abstractions instead of introducing new direct Prisma client creation paths
