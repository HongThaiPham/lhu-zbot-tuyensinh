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
- `apps/bot-service/src/zalo` is the canonical Zalo boundary; only this module calls the official Zalo Bot REST API transport.

## Zalo API integration foundation (Phase 4)

- Canonical transport path:
  - `OfficialZaloHttpClient` -> `ZaloAdapter` -> `ZaloService`
- Admin test endpoint:
  - `POST /admin/zalo/test-connection`
  - session auth + ADMIN RBAC + CSRF/origin guard
- Runtime readiness remains internal dependency based (PostgreSQL/Redis); no live Zalo call in `/health/ready`.

## Authentication and authorization (Phase 3)

- Strategy: server-issued opaque session cookie with server-side session persistence in PostgreSQL.
- Session token is random and only stored in browser HttpOnly cookie; database stores token hash only.
- Password hashing uses Argon2id.
- RBAC uses `users`, `roles`, and `user_roles`.
- Audit logging uses append-oriented `audit_logs` and transactional write patterns for important mutations.

## Database readiness contract (Phase 2)

- `/health/live`: process-level liveness only.
- `/health/ready`: returns success only when PostgreSQL application-level query + migrated schema check succeed and Redis dependency is reachable.
- Readiness must fail when PostgreSQL or Redis is unavailable and recover after dependencies recover.
