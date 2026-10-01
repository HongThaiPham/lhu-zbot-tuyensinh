# Authentication

## Strategy

Phase 3 uses server-issued opaque sessions for the Admin -> NestJS API topology.

- Random high-entropy session token is generated server-side.
- Browser stores token only in an HttpOnly cookie.
- Database stores only `token_hash` (SHA-256 hash), never raw tokens.
- Sessions are bounded by `SESSION_TTL_SECONDS` and support revocation (`revoked_at`).

JWT was intentionally not introduced because this admin architecture benefits from immediate server-side session revocation and straightforward auditability.

## Password hashing

Passwords are hashed with Argon2id using library-managed salts.
Plaintext passwords are never persisted, logged, or returned by API responses.

## Session lifecycle

1. `POST /auth/login` validates credentials and active account status.
2. Server creates session row and sets HttpOnly cookie.
3. Protected routes load session by token hash and reject missing/unknown/expired/revoked sessions.
4. `POST /auth/logout` revokes session and clears cookie.

## Cookie security

- `HttpOnly=true`
- `Secure=true` in production
- `SameSite` controlled by `SESSION_COOKIE_SAME_SITE` (`lax` or `strict`)
- bounded `Max-Age` from `SESSION_TTL_SECONDS`
- cookie token never exposed to client JavaScript

## RBAC

Phase 3 model:

- `users`
- `roles`
- `user_roles`

Initial role: `ADMIN`.

Authorization is server-side via guards/decorators:

- `SessionAuthGuard`
- `@Roles(...)`
- `RolesGuard`

Semantics:

- unauthenticated -> `401`
- authenticated but insufficient role -> `403`

## CSRF / origin protection

State-changing authenticated routes enforce allowed `Origin` with `ADMIN_ORIGIN`.
Cross-origin mutation requests are rejected.

## Login abuse control

Phase 3 applies bounded in-memory throttling for login failures per IP and per normalized identity.
Successful authentication clears the normalized identity bucket only and does not clear shared IP failure history.
This is deterministic for single-instance runtime and documented as a non-distributed limitation for multi-replica production.

## Client IP derivation

Client address uses framework-native `req.ip` semantics. When `TRUST_PROXY=true`, Nest/Express is configured with single-hop trusted proxy mode (`trust proxy = 1`) and expects one controlled edge proxy that overwrites forwarding headers.

## Session activity writes

`lastUsedAt` updates are throttled (5-minute minimum interval) to avoid write amplification on every authenticated request.

## Bootstrap procedure

Initial admin is created via explicit command only:

```bash
ADMIN_BOOTSTRAP_EMAIL=... ADMIN_BOOTSTRAP_PASSWORD=... pnpm --filter @lhu/bot-service auth:bootstrap-admin
```

Properties:

- explicit operator action
- idempotent
- existing admin password is not reset on rerun
- ensures `ADMIN` role assignment
- no default credentials committed

## Troubleshooting

- `401` on `/auth/me`: missing/expired/revoked session cookie
- `403` on admin mutation: authenticated user lacks required role
- `400 Invalid request origin`: `Origin` does not match `ADMIN_ORIGIN`
