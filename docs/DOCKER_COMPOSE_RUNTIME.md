# Docker Compose Runtime Contract

The complete LHU Admissions Zalo Bot product runs through Docker Compose in development, integration/staging reference deployments and production reference deployments.

## Target Services

```text
admin       Next.js administration UI
bot-api     NestJS REST API + Zalo webhook/API role
bot-worker  NestJS background workers / queues
postgres    PostgreSQL with pgvector
redis       Redis for BullMQ/cache/locks/hot context
```

`bot-api` and `bot-worker` SHOULD use the same bot-service image with an explicit runtime role such as `BOT_SERVICE_ROLE=api|worker|all` when practical.

## Database

Use a PostgreSQL image/distribution that provides the required pgvector extension. PostgreSQL is a Compose service and uses a named persistent volume. Database initialization/migrations are reproducible and must not depend on a PostgreSQL installation on the Docker host.

Production must not publish the PostgreSQL port to a public host interface. Development may bind a local-only port when useful, but application containers communicate through the Compose service name.

## Redis

Redis is a Compose service using a named volume when persistence is required by the chosen durability policy. Production must not publish Redis to a public host interface. Application containers communicate through the Compose service name.

## Health and Dependency Readiness

PostgreSQL and Redis require meaningful healthchecks. Application startup must distinguish container start order from dependency readiness. API/worker readiness must fail when mandatory dependencies required for safe traffic are unavailable.

## Networking

Use an internal application/data network for service-to-service traffic. Only externally required HTTP services should publish/bind host ports. Database and Redis remain internal in production.

## Persistence and Backup

Use named volumes for durable PostgreSQL data and any Redis persistence selected by the architecture. Production documentation must define backup, restore and upgrade procedures. Container recreation must not destroy persistent data.

## Secrets

Do not bake credentials into images or commit them to Compose YAML. `.env.example` contains placeholders only. Production secrets are supplied through the deployment environment/secret mechanism. Admin-managed Zalo/AI credentials are encrypted application data as specified elsewhere.

## Development

Developers should be able to bootstrap infrastructure with Docker Compose without installing PostgreSQL or Redis on the host. Source-code hot reload may use Compose development overrides/profiles where useful.

## CI

Normal CI may use Docker Compose/test containers for integration tests. It must not require production credentials or paid live AI calls. Validate Compose syntax/configuration and add smoke/integration tests as the runtime matures.

## Production

Production reference Compose must use hardened multi-stage images, non-root runtime where feasible, healthchecks, restart policy, graceful shutdown, persistent volumes, internal DB/Redis networking and immutable image tags for controlled releases.

A reverse proxy/TLS layer may sit outside this Compose project depending on deployment environment. Only the required Admin/API/webhook endpoints should be externally reachable.

## Phase Interpretation

Containerization is a cross-cutting runtime requirement, not something deferred entirely until Phase 22. Early phases introduce the minimum Compose infrastructure required to test the capabilities they add. Phase 22 finalizes/hardens Dockerfiles, Compose profiles, production reference topology, health behavior and clean-deployment verification.
