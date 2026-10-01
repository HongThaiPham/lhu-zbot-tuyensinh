# Configuration

## Source of truth

`packages/config` is the canonical configuration package for runtime validation and typed configuration access.

## Architecture

- Configuration is parsed once at startup using explicit schema validation.
- Services consume typed, immutable config objects instead of reading `process.env` directly.
- Validation errors are fail-fast and safe: they report variable names and reasons, never secret values.

## Environment behavior

- `development`: local defaults are allowed for non-sensitive values.
- `test`: deterministic test configuration is supported.
- `production`: required secrets must be present, non-empty, non-placeholder, and structurally valid.

## Supported variables (Phase 1)

### Bot service

- `NODE_ENV` (`development | test | production`) — required
- `DATABASE_URL` (`postgres://` or `postgresql://`) — required
- `REDIS_URL` (`redis://` or `rediss://`) — required
- `BOT_SERVICE_ROLE` (`api | worker`) — required
- `ZALO_UPDATE_MODE` (`polling | webhook`) — required
- `PORT` (TCP port 1-65535) — optional, defaults to `3001`
- `APP_ENCRYPTION_KEY` — required in production

### Admin

- `NODE_ENV` (`development | test | production`) — required
- `NEXT_PUBLIC_API_BASE_URL` (`http://` or `https://`) — required and safe to expose to browser bundles (defaults to `http://127.0.0.1:4201` for local tooling when unset)

## Secret classification

- Secret in Phase 1: `APP_ENCRYPTION_KEY`
- Public in Phase 1: `NEXT_PUBLIC_API_BASE_URL`

`APP_ENCRYPTION_KEY` must never be logged or rendered in error output. Production startup fails if it is missing, empty, placeholder/default, too short, or malformed.

## Docker Compose usage

- `docker-compose.yml` (development) provides safe local defaults.
- `docker-compose.prod.yml` requires explicit production-sensitive values, including `APP_ENCRYPTION_KEY`.
- PostgreSQL and Redis remain internal-only in production topology (no public host port mapping).

## Startup validation and fail-fast behavior

On invalid configuration, startup fails immediately with a safe error format:

- `APP_ENCRYPTION_KEY: required in production`
- `BOT_SERVICE_ROLE: invalid value`

Values are never included in error messages.

## Environment precedence

Environment values are read from process environment at startup and validated once. Compose-provided values override file defaults as normal Docker Compose behavior.

## Adding future variables

1. Add the variable to `packages/config` schema.
2. Add typed property mappings to the relevant config object.
3. Add validation rules and safe error messages.
4. Add deterministic tests for valid/invalid behavior.
5. Update `.env.example` and this document.
