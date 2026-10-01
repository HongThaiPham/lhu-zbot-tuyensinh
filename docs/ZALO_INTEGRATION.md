# Zalo Integration (Phase 4)

## References consulted

- Official Zalo Bot docs targets:
  - `https://docs.zaloplatforms.com/docs/BOT/call_api`
  - `https://docs.zaloplatforms.com/docs/BOT/apis/getMe`
  - `https://docs.zaloplatforms.com/docs/BOT/apis/getUpdates`
  - `https://docs.zaloplatforms.com/docs/BOT/apis/setWebhook`
  - `https://docs.zaloplatforms.com/docs/BOT/apis/testWebhook`
  - `https://docs.zaloplatforms.com/docs/BOT/apis/deleteWebhook`
  - `https://docs.zaloplatforms.com/docs/BOT/apis/getWebhookInfo`
  - `https://docs.zaloplatforms.com/docs/BOT/webhook`
  - `https://docs.zaloplatforms.com/docs/BOT/apis/sendMessage`
  - `https://docs.zaloplatforms.com/docs/BOT/apis/sendPhoto`
  - `https://docs.zaloplatforms.com/docs/BOT/apis/sendSticker`
  - `https://docs.zaloplatforms.com/docs/BOT/apis/sendChatAction`
  - `https://docs.zaloplatforms.com/docs/BOT/apis/sendVoice`
- Note: these endpoints were DNS-unreachable from this sandbox runtime during verification, so implementation remains constrained to documented Phase 4 behavior and mocked transport tests.

## Architecture boundary

Phase 4 permanently uses direct official REST integration (no third-party SDK):

`AdminZaloController -> AdminZaloService -> ZaloService -> ZaloAdapter -> OfficialZaloHttpClient -> Zalo Bot REST API`

`apps/bot-service/src/zalo` is the only module that owns this external transport boundary.

## Third-party SDK policy

- `node-zalo-bot`: removed
- Third-party Zalo SDK dependencies: none

## Configuration

- `ZALO_BOT_TOKEN` is required in production and optional in development/test.
- Token values are never returned in API payloads, logs, or config validation messages.
- `ZALO_UPDATE_MODE` stays unchanged (`polling`/`webhook`) for future phases.

## HTTP transport contract (Phase 4)

- Base URL: `https://bot-api.zapps.me`
- Tokenized endpoint pattern: `/bot{token}/{method}`
- Implemented method in Phase 4: `getMe` only
- Request timeout: 5 seconds
- Response expectation for `getMe`: JSON envelope with `ok` boolean and `result` object
- Unsuccessful envelope (`ok !== true`) is normalized to safe error categories without leaking token

## getMe identity normalization

`ZaloAdapter` maps `result` to internal `ZaloBotIdentity`:

- required: `id` (`string | number`, normalized to string)
- optional:
  - `name` -> `displayName`
  - `username`
  - `avatar`

Invalid/malformed envelope or identity payload maps to `INVALID_RESPONSE`.

## Connection test behavior

Connection testing performs one bounded `getMe` request and returns:

- `CONNECTED`
- `AUTHENTICATION_FAILED`
- `RATE_LIMITED`
- `NETWORK_ERROR`
- `UPSTREAM_ERROR`
- `INVALID_RESPONSE`

No polling loop or webhook processing is implemented in Phase 4.

## Error handling and redaction

- HTTP/network/timeout/API-envelope failures map to normalized safe error categories.
- Safe metadata includes only non-secret fields (status code, upstream code, retry-after, sanitized request URL).
- Token-bearing URLs are always redacted (`/bot<token>/...` -> `/bot[REDACTED]/...`).

## Admin endpoint

- `POST /admin/zalo/test-connection`
- Protected by session auth + ADMIN RBAC + CSRF/origin guard
- Audited as `ADMIN_ZALO_TEST_CONNECTION`
- Returns normalized safe result only

## Runtime health boundary

- `/health/live` and `/health/ready` do not perform live Zalo API calls.
- Zalo external connectivity is tested explicitly via admin endpoint or optional script.

## Manual live test command

```bash
pnpm zalo:test-connection
```

Requires `ZALO_BOT_TOKEN`; outputs only normalized safe result.

## Planned APIs by later phases

- Phase 5 plan: `getUpdates` polling flow
- Phase 6 plan: `setWebhook`, `testWebhook`, `deleteWebhook`, `getWebhookInfo`, webhook receiver
- Phase 7 plan: `sendMessage`, `sendPhoto`, `sendSticker`, `sendChatAction`, `sendVoice`

These are documented targets only in this phase; not implemented here.
