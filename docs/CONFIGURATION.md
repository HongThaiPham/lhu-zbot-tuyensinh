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
- `ZALO_BOT_TOKEN` — required in production, optional in development/test for deterministic mock-based tests
- `PORT` (TCP port 1-65535) — optional, defaults to `3001`
- `APP_ENCRYPTION_KEY` — required in production
- `SESSION_COOKIE_NAME` — cookie name for opaque admin session (default: `lhu_admin_session`)
- `SESSION_TTL_SECONDS` — bounded session lifetime in seconds (default: `28800`)
- `SESSION_COOKIE_SAME_SITE` (`lax | strict`) — explicit SameSite policy for session cookie
- `ADMIN_ORIGIN` — allowed admin browser origin for authenticated state-changing requests (default in local: `http://127.0.0.1:4100`)
- `LOGIN_RATE_LIMIT_WINDOW_SECONDS` — login failure throttle window (default: `300`)
- `LOGIN_RATE_LIMIT_MAX_ATTEMPTS` — max failed attempts in window before temporary block (default: `5`)
- `TRUST_PROXY` (`true | false`) — enables framework trusted-proxy mode for one reverse-proxy hop (`app.set('trust proxy', 1)`); default `false`
- `ADMIN_BOOTSTRAP_EMAIL` / `ADMIN_BOOTSTRAP_PASSWORD` — only used by explicit bootstrap command

### Admin

- `NODE_ENV` (`development | test | production`) — required
- `NEXT_PUBLIC_API_BASE_URL` (`http://` or `https://`) — required and safe to expose to browser bundles. Local admin runtime may apply `http://127.0.0.1:4201` fallback only in `development`/`test`; production fails fast if missing or invalid.

## Secret classification

- Secret in Phase 4: `APP_ENCRYPTION_KEY`, `ADMIN_BOOTSTRAP_PASSWORD`, `ZALO_BOT_TOKEN`
- Public in Phase 3: `NEXT_PUBLIC_API_BASE_URL`

`APP_ENCRYPTION_KEY` must never be logged or rendered in error output. Production startup fails if it is missing, empty, placeholder/default, too short, or malformed.
`ZALO_BOT_TOKEN` must never be logged or rendered in error output. Production startup fails if it is missing/empty or a placeholder/default value.

## Docker Compose usage

- `docker-compose.yml` (development) provides safe local defaults.
- `docker-compose.prod.yml` requires explicit production-sensitive values, including `APP_ENCRYPTION_KEY`.
- `docker-compose.prod.yml` requires explicit `ZALO_BOT_TOKEN`.
- PostgreSQL and Redis remain internal-only in production topology (no public host port mapping).

## Startup validation and fail-fast behavior

On invalid configuration, startup fails immediately with a safe error format:

- `APP_ENCRYPTION_KEY: required in production`
- `ZALO_BOT_TOKEN: required in production`
- `BOT_SERVICE_ROLE: invalid value`

Values are never included in error messages.

Bootstrap command (`auth:bootstrap-admin`) also uses safe validation that reports variable names and reasons without secret values.

## Environment precedence

Environment values are read from process environment at startup and validated once. Compose-provided values override file defaults as normal Docker Compose behavior.

## TRUST_PROXY topology expectation

- Default `TRUST_PROXY=false` is safe for direct app exposure and ignores untrusted forwarding headers.
- `TRUST_PROXY=true` is intended for a single controlled reverse proxy directly in front of bot-service.
- The edge proxy must overwrite (not append user-controlled) forwarding headers before requests reach the app.

## Adding future variables

1. Add the variable to `packages/config` schema.
2. Add typed property mappings to the relevant config object.
3. Add validation rules and safe error messages.
4. Add deterministic tests for valid/invalid behavior.
5. Update `.env.example` and this document.
