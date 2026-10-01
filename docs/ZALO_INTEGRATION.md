# Zalo Integration (Phase 4)

## References consulted

- Official Zalo Bot docs target: `https://docs.zaloplatforms.com/docs/BOT` (DNS lookup was unavailable from this CI/sandbox runtime, so verification used the installed SDK API surface plus package README/source inspection).
- Installed SDK package: `node-zalo-bot@0.1.6`.

## SDK surface used in Phase 4

Phase 4 uses only:

- constructor: `new ZaloBot(token, { polling: false })`
- method: `getMe()`

Contract tests also verify presence of `getUpdates`, `sendMessage`, and `setWebHook` so CI catches API drift affecting planned next phases.

## Architecture boundary

`apps/bot-service/src/zalo` is the only module that imports `node-zalo-bot`.

Flow:

`AdminZaloController -> AdminZaloService -> ZaloService -> ZaloAdapter -> NodeZaloSdkFactory -> node-zalo-bot -> Zalo API`

No non-Zalo module instantiates SDK objects directly.

## Configuration

- `ZALO_BOT_TOKEN` added to typed config.
- Production validation:
  - required (`ZALO_BOT_TOKEN: required in production`)
  - placeholder/default values rejected
- Value is never included in validation errors.
- Dev/test can omit token for deterministic tests with fakes/mocks.

## getMe identity mapping

The adapter normalizes `getMe` into internal `ZaloBotIdentity`:

- required: `id` (stringified)
- optional (if present): `name -> displayName`, `username`, `avatar`

Malformed payloads map to `INVALID_RESPONSE`.

## Connection test behavior

Connection testing performs one bounded `getMe` attempt (no polling/webhook startup). Result categories:

- `CONNECTED`
- `AUTHENTICATION_FAILED`
- `RATE_LIMITED`
- `NETWORK_ERROR`
- `UPSTREAM_ERROR`
- `INVALID_RESPONSE`

No aggressive retries are added in Phase 4.

## Error normalization and redaction

- Upstream SDK/API errors are mapped to internal safe categories.
- Safe metadata may include status code, upstream code, retryability, `Retry-After`.
- Token-bearing URLs are sanitized (e.g. `/bot<token>/...` -> `/bot[REDACTED]/...`).
- Token values are never logged or returned.

## Admin endpoint

- `POST /admin/zalo/test-connection`
- Guarded by session auth + ADMIN role + existing CSRF/origin policy.
- Returns normalized safe result only.
- Action is audited (`ADMIN_ZALO_TEST_CONNECTION`) without secret fields.

## Timeout and retry

- Adapter-level timeout: 5s for `getMe`.
- Authentication failures are not retried.
- Phase 4 keeps a single-attempt test flow.

## Runtime health

- `/health/live` and `/health/ready` do not call Zalo externally.
- Zalo check is explicit (`/admin/zalo/test-connection`) rather than readiness-coupled.

## Manual live test command

```bash
pnpm zalo:test-connection
```

Requires `ZALO_BOT_TOKEN`. Prints safe status/identity only, exits non-zero on failure.

## Known SDK limitations observed

- Package ships no TypeScript declarations; local declaration file is maintained for the Phase 4 contract used by this repository.
- Package source is distributed as obfuscated JavaScript, so contract tests are kept to detect API drift on upgrades.

## Upgrade procedure

1. Upgrade `node-zalo-bot` version.
2. Run SDK contract test and full CI.
3. Re-check constructor/getMe compatibility and error mapping behavior.
4. Update this document with new verified version/surface.
