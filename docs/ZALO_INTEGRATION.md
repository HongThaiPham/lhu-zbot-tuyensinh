# Zalo Integration (Phase 6)

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
- Note: these endpoints were DNS-unreachable from this sandbox runtime during verification, so implementation remains constrained to documented Phase 5 behavior and mocked transport tests.

## Architecture boundary

Phases 4-6 use direct official REST integration (no third-party SDK):

`AdminZaloController -> AdminZaloService -> ZaloService -> ZaloAdapter -> OfficialZaloHttpClient -> Zalo Bot REST API`

`apps/bot-service/src/zalo` is the only module that owns this external transport boundary.

## Third-party SDK policy

- Third-party Zalo SDK dependencies: none

## Configuration

- `ZALO_BOT_TOKEN` is required in production and optional in development/test.
- Token values are never returned in API payloads, logs, or config validation messages.
- `ZALO_UPDATE_MODE` controls mutually exclusive runtime mode (`polling`/`webhook`).
- `ZALO_POLL_TIMEOUT_SECONDS` controls Zalo long-poll timeout for `getUpdates`.
- `ZALO_WEBHOOK_URL` stores the public callback URL for webhook lifecycle management.

## HTTP transport contract (Phases 4-6)

- Base URL: `https://bot-api.zaloplatforms.com`
- Tokenized endpoint pattern: `/bot{token}/{method}`
- Implemented methods:
  - `getMe` (Phase 4)
  - `getUpdates` (Phase 5)
  - `setWebhook` (Phase 6)
  - `testWebhook` (Phase 6)
  - `deleteWebhook` (Phase 6)
  - `getWebhookInfo` (Phase 6)
- Method: `POST /bot<BOT_TOKEN>/getMe` (empty JSON object body)
- Method: `POST /bot<BOT_TOKEN>/getUpdates` (JSON body includes optional `timeout`)
- Method: `POST /bot<BOT_TOKEN>/setWebhook` (JSON body includes `url`)
- Method: `POST /bot<BOT_TOKEN>/testWebhook` (empty JSON object body)
- Method: `POST /bot<BOT_TOKEN>/deleteWebhook` (empty JSON object body)
- Method: `POST /bot<BOT_TOKEN>/getWebhookInfo` (empty JSON object body)
- Request timeout: 5 seconds
- Polling timeout model:
  - Zalo long-poll timeout uses `ZALO_POLL_TIMEOUT_SECONDS` (default `30`).
  - Local HTTP abort timeout is `ZALO_POLL_TIMEOUT_SECONDS + 5 seconds` safety margin.
- Response expectation for `getMe`: JSON envelope with `ok` boolean and `result` object
- Response expectation for `getUpdates`: JSON envelope with `ok` boolean and runtime-validated `result`
- Unsuccessful envelope (`ok !== true`) is normalized to safe error categories without leaking token

## getMe identity normalization

`ZaloAdapter` maps `result` to internal `ZaloBotIdentity`:

- required:
  - `id` -> `id`
  - `account_name` -> `accountName`
  - `account_type` -> `accountType`
  - `can_join_groups` -> `canJoinGroups`

Invalid/malformed envelope or identity payload maps to `INVALID_RESPONSE`.

## Connection test behavior

Connection testing performs one bounded `getMe` request and returns:

- `CONNECTED`
- `AUTHENTICATION_FAILED`
- `RATE_LIMITED`
- `NETWORK_ERROR`
- `UPSTREAM_ERROR`
- `INVALID_RESPONSE`

## Polling loop behavior (Phase 5)

- Runs only in `bot-worker` and only when `ZALO_UPDATE_MODE=polling`
- Does not run in `bot-api`
- Uses a sequential async loop with no overlapping polls
- Uses bounded exponential backoff (`1s -> 2s -> 4s -> 8s -> 16s -> 30s` max) and resets after successful polls
- Graceful shutdown aborts in-flight long poll and prevents starting another poll
- Polling/webhook coexistence is not attempted; non-retryable polling failures emit safe operator guidance to remove webhook or switch to webhook mode

## Webhook behavior (Phase 6)

- Public endpoint: `POST /webhooks/zalo`
- Webhook requests are only processed when `ZALO_UPDATE_MODE=webhook`
- In polling mode, webhook requests are acknowledged without processing
- Supported webhook payloads are JSON object or JSON array and are runtime validated before normalization
- No custom signature mechanism is applied because the current official BOT docs do not document one in this implementation baseline
- Shared inbound pipeline:
  - `Webhook payload -> ZaloUpdateValidator -> ZaloUpdateNormalizer -> ZaloInboundEventProcessor`
  - `getUpdates` polling reuses the same validator/normalizer/processor classes

## Error handling and redaction

- HTTP/network/timeout/API-envelope failures map to normalized safe error categories.
- Safe metadata includes only non-secret fields (status code, upstream code, retry-after, sanitized request URL).
- Token-bearing URLs are always redacted (`/bot<token>/...` -> `/bot[REDACTED]/...`).

## Admin endpoint

- `POST /admin/zalo/test-connection`
- Protected by session auth + ADMIN RBAC + CSRF/origin guard
- Audited as `ADMIN_ZALO_TEST_CONNECTION`
- Returns normalized safe result only
- Phase 6 adds:
  - `GET /admin/zalo/webhook` (`ADMIN_ZALO_GET_WEBHOOK_INFO`)
  - `POST /admin/zalo/webhook` (`ADMIN_ZALO_SET_WEBHOOK`)
  - `POST /admin/zalo/webhook/test` (`ADMIN_ZALO_TEST_WEBHOOK`)
  - `DELETE /admin/zalo/webhook` (`ADMIN_ZALO_DELETE_WEBHOOK`)

## Runtime health boundary

- `/health/live` and `/health/ready` do not perform live Zalo API calls.
- Zalo external connectivity is tested explicitly via admin endpoint or optional script.

## Event validation + normalization boundary (Phase 5)

`getUpdates -> raw unknown payload -> ZaloUpdateValidator -> ZaloUpdateNormalizer -> internal ZaloInboundEvent -> processor`

- Supported event names:
  - `message.text.received`
  - `message.image.received`
  - `message.sticker.received`
  - `message.voice.received`
  - `message.unsupported.received`
- Unknown event names do not crash the worker; they are normalized as unsupported metadata events.
- Normalized events include metadata only and do not leak raw payload fields.

## Manual live test command

```bash
pnpm zalo:test-connection
```

Requires `ZALO_BOT_TOKEN`; outputs only normalized safe result.

## Planned APIs by later phases

- Phase 7 plan: `sendMessage`, `sendPhoto`, `sendSticker`, `sendChatAction`, `sendVoice`
