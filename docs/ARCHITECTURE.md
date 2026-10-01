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
