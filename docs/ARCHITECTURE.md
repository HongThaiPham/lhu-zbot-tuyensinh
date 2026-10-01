# Architecture

## Runtime topology

- `admin` – Next.js admin UI
- `bot-api` – NestJS API/webhook service
- `bot-worker` – background processing worker
- `postgres` – PostgreSQL with pgvector
- `redis` – Redis cache/queue backend

## Boundaries

- Admin communicates with backend APIs only.
- Bot service owns Zalo, AI, queueing, crawler, and admissions logic.
- Shared packages isolate cross-cutting code.
- `packages/database` is the canonical database boundary for Prisma schema, migrations, seed, DB client lifecycle, and DB health probe.

## Database readiness contract (Phase 2)

- `/health/live`: process-level liveness only.
- `/health/ready`: returns success only when PostgreSQL application-level query + migrated schema check succeed and Redis dependency is reachable.
- Readiness must fail when PostgreSQL or Redis is unavailable and recover after dependencies recover.
