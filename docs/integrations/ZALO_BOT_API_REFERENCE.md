# Zalo Bot REST API -- Local Reference for Coding Agents

> Self-contained reference for coding agents that cannot access Zalo
> Platform docs. Verified against official Zalo Bot documentation on
> 2026-10-02. Do not infer missing behavior from Telegram, Zalo OA,
> node-zalo-bot, old SDKs, or unofficial examples.

## 1. Product boundary

This project integrates **Zalo Bot**, not Zalo Official Account (OA).

API host:

`https://bot-api.zaloplatforms.com`

Never use OA contracts such as `X-ZEvent-Signature` for Bot webhooks.
Zalo Bot webhook authentication uses `X-Bot-Api-Secret-Token`.

Do not reintroduce `node-zalo-bot`; call the official REST API directly.

## 2. Common API contract

All calls use HTTPS:

`https://bot-api.zaloplatforms.com/bot<BOT_TOKEN>/<functionName>`

The Bot Token is embedded in the URL. Never log the full request URL,
raw HTTP request objects, or upstream exceptions that may contain it.
Redact token-bearing URLs before logging.

General docs support GET/POST and query string, form-urlencoded, JSON,
or multipart parameters. For this project, preserve the
endpoint-specific **POST + JSON** contracts below.

Use UTF-8. API names are case-sensitive.

Common envelope:

``` ts
interface ZaloApiEnvelope<T> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
}
```

Rules: - Validate every upstream response at runtime. - HTTP 2xx alone
is not application success; inspect `ok`. - Separate transport/HTTP
failure from `ok:false`. - Never expose raw upstream errors to
clients. - Do not invent meanings for undocumented error codes. - Ignore
unknown extra fields safely unless they conflict with required fields.

## 3. Polling vs webhook

Zalo documents two independent and mutually exclusive inbound
mechanisms: 1. `getUpdates` long polling. 2. Webhook.

`getUpdates` does not work while a webhook is configured. To return to
polling, explicitly call `deleteWebhook`.

Official guidance: polling for local/development/testing; webhook for
production.

Project mode:

``` env
ZALO_UPDATE_MODE=polling
# or
ZALO_UPDATE_MODE=webhook
```

`polling`: bot-worker polling ON; bot-api webhook processing OFF.

`webhook`: bot-worker polling OFF; bot-api webhook processing ON.

Never automatically call `setWebhook` or `deleteWebhook` at startup.

## 4. getMe

``` http
POST /bot<BOT_TOKEN>/getMe
Content-Type: application/json

{}
```

No parameters.

Result:

``` ts
interface ZaloBotIdentity {
  id: string;
  account_name: string;
  account_type: string;
  can_join_groups: boolean;
}
```

Use for explicit diagnostics/token checks. Do not call Zalo from
liveness/readiness endpoints.

## 5. getUpdates

``` http
POST /bot<BOT_TOKEN>/getUpdates
Content-Type: application/json

{"timeout": 30}
```

`timeout` is optional; default is 30 seconds. The official parameter
table says String while its official JSON example sends numeric `30`.
Preserve the project's verified representation unless a live contract
test proves otherwise; do not invent a conversion.

Response is a single JSON object similar to webhook data.

No Telegram-style `offset`, `update_id`, cursor, acknowledgement offset,
or batch checkpoint is documented. Do not invent them.

Polling requirements: - only bot-worker owns polling; - one polling
worker per Bot Token unless distributed ownership is explicitly
designed; - sequential async loop; no overlapping calls; - no
`setInterval(async ...)`; - local HTTP abort timeout must exceed Zalo
long-poll timeout; - abort current request during shutdown; - bounded
exponential backoff for transient errors; - reset backoff after
success; - permanent/auth/config errors must not retry forever.

## 6. setWebhook

``` http
POST /bot<BOT_TOKEN>/setWebhook
Content-Type: application/json
```

Required body:

``` json
{
  "url": "https://bot.example.com/webhooks/zalo",
  "secret_token": "<WEBHOOK_SECRET>"
}
```

Both fields are required.

-   `url`: String, HTTPS webhook URL.
-   `secret_token`: String, **8--256 characters**.

Zalo sends this secret in every webhook request as:

`X-Bot-Api-Secret-Token`

Result:

``` ts
interface ZaloWebhookConfigurationResult {
  url: string;
  updated_at: number;
}
```

Example shape:

``` json
{
  "ok": true,
  "result": {
    "url": "https://bot.example.com/webhooks/zalo",
    "updated_at": 1749538250568
  }
}
```

Project config should use a dedicated secret such as:

``` env
ZALO_WEBHOOK_SECRET_TOKEN=<8-to-256-character-secret>
```

Never reuse `ZALO_BOT_TOKEN`. Never expose/log/audit the webhook secret.
Production webhook URL must be HTTPS. Production webhook mode must
reject missing/invalid secret configuration.

## 7. Webhook delivery

Zalo sends:

``` http
POST <configured-webhook-url>
Content-Type: application/json
X-Bot-Api-Secret-Token: <configured-secret-token>
```

The official docs explicitly require verifying the header before
processing.

Required order:

``` text
HTTP body-size protection
-> read X-Bot-Api-Secret-Token
-> authenticate secret
-> runtime payload validation
-> normalize
-> inbound processor
-> acknowledge
```

Missing/incorrect secret must never reach normalization or processing.
Prefer constant-time comparison. Never log expected or received secrets.

Official webhook payload is **one JSON object**, not an array/batch:

``` ts
interface ZaloWebhookEnvelope {
  ok: true;
  result: {
    event_name: string;
    message?: ZaloIncomingMessage;
  };
}
```

Documented events:

``` text
message.text.received
message.image.received
message.sticker.received
message.voice.received
message.unsupported.received
```

Documented message fields include: - `from` (required sender object) -
`chat` (required conversation object) - `text` - `photo` - `caption` -
`sticker` - `url` - `voice_url` - `message_id` (shown in official
message shape/sample) - `date` (shown in official message shape/sample)

`chat.chat_type` values: `PRIVATE`, `GROUP`; GROUP is Beta.

Use `message.chat.id` as the conversation identifier for replies.

### message.unsupported.received

This is a legitimate privacy/compliance event. Zalo may send it instead
of content for certain protected/special categories of sender.

Do not: - classify it as malformed solely because content is absent; -
infer/reconstruct hidden content; - retry to retrieve hidden content.

Keep webhook acknowledgement fast and bounded. Do not perform slow
AI/RAG/business workflows inline.

## 8. deleteWebhook

``` http
POST /bot<BOT_TOKEN>/deleteWebhook
Content-Type: application/json

{}
```

No parameters.

Result:

``` json
{
  "ok": true,
  "result": {
    "url": "",
    "updated_at": 1749538250568
  }
}
```

Do not auto-call it when polling starts.

## 9. getWebhookInfo

``` http
POST /bot<BOT_TOKEN>/getWebhookInfo
Content-Type: application/json

{}
```

No parameters.

Result:

``` json
{
  "ok": true,
  "result": {
    "url": "https://bot.example.com/webhooks/zalo",
    "updated_at": 1749633372026
  }
}
```

Model both `url` and `updated_at`. Application code may derive
`isConfigured = url.length > 0`.

This API does not return the secret.

## 10. testWebhook -- current status

**Important verified finding on 2026-10-02:** the current official Zalo
Bot API Reference navigation does **not** list `testWebhook`. The
previously known `/docs/BOT/apis/testWebhook` page was not retrievable
during this refresh.

Therefore coding agents must **not claim `testWebhook` is a currently
verified official contract**.

If the repository already contains it: - treat it as
legacy/unverified; - do not expand production dependence on it; - do not
fabricate request/response schemas; - do not silently remove it as an
unrelated change; - prefer `getWebhookInfo` plus local endpoint
diagnostics for verified operational checks.

If a human later supplies current official `testWebhook` documentation,
refresh this file first.

## 11. sendMessage

``` http
POST /bot<BOT_TOKEN>/sendMessage
Content-Type: application/json
```

``` ts
interface SendMessageRequest {
  chat_id: string;
  text: string;
  parse_mode?: 'markdown' | 'html';
  text_styles?: Array<{
    start: number;
    len: number;
    st: string[];
  }>;
}
```

`chat_id` and `text` required. Text length: **1--2000 characters**.

Rich text: - `parse_mode`: `markdown` or `html`; - `text_styles`:
explicit style runs; - if both are sent, `parse_mode` wins and
`text_styles` is ignored; - `text_styles.start` and `.len` use UTF-16
code units.

Documented style codes include: `b`, `i`, `u`, `s`, `f_13`, `f_15`,
`f_18`, `f_20`, `c_050a19`, `c_15a85f`, `c_f7b503`, `c_f27806`,
`c_db342e`, `lst_1`, `lst_2`, `ind_1` through `ind_5`.

Do not invent unsupported codes.

Result:

``` ts
interface ZaloSentMessageResult {
  message_id: string;
  date: number;
}
```

## 12. sendPhoto

``` http
POST /bot<BOT_TOKEN>/sendPhoto
```

``` ts
interface SendPhotoRequest {
  chat_id: string;
  photo: string;
  caption?: string;
}
```

`chat_id` and `photo` required. `caption`, when present, is 1--2000
characters.

Result: `{ message_id: string; date: number }`.

## 13. sendSticker

``` http
POST /bot<BOT_TOKEN>/sendSticker
```

``` ts
interface SendStickerRequest {
  chat_id: string;
  sticker: string;
}
```

Both required. Sticker identifier comes from Zalo's sticker
catalog/source; do not treat arbitrary image URLs as sticker IDs.

Result: `{ message_id: string; date: number }`.

## 14. sendChatAction

``` http
POST /bot<BOT_TOKEN>/sendChatAction
```

Stable request:

``` ts
interface SendChatActionRequest {
  chat_id: string;
  action: 'typing';
}
```

Official docs list: - `typing`: available; - `upload_photo`: **coming
soon**.

Do not expose `upload_photo` as stable production behavior yet.

Documented response:

``` json
{"ok": true}
```

Do not require a message result for this endpoint.

## 15. sendVoice

``` http
POST /bot<BOT_TOKEN>/sendVoice
```

``` ts
interface SendVoiceRequest {
  chat_id: string;
  voice_url: string;
}
```

Requirements: - private/1-to-1 only; - group unsupported; - `voice_url`
must be a valid URL ending in `.aac`; - no caption; - current supported
format is `.aac`.

Official caveat: a request using a group chat ID may appear successful
while the message is not delivered. Reject group-targeted voice sends at
the application boundary when chat type is known.

Result: `{ message_id: string; date: number }`.

## 16. Required architecture

One HTTP stack:

``` text
Application/Admin/Dispatcher
-> ZaloService
-> ZaloAdapter
-> ZaloHttpClient
-> Official Zalo Bot REST API
```

Do not create separate Zalo HTTP clients for polling/webhook/outbound.

One inbound pipeline:

``` text
getUpdates --------\
                    -> ZaloUpdateValidator
                    -> ZaloUpdateNormalizer
                    -> ZaloInboundEventProcessor
Webhook -----------/
```

Do not duplicate validator/normalizer/business processing per transport.
Avoid double normalization.

Keep official API DTOs separate from internal domain/application DTOs.

## 17. Runtime validation

All upstream data is untrusted. Runtime-validate: - API envelope; -
`ok`; - required result fields/types; - webhook envelope; - event
name; - required message structures.

Known valid event -\> normalize/process.

Known malformed event -\> reject safely without crashing process.

Unknown future event -\> non-fatal forward-compatible handling.

Extra fields -\> do not leak arbitrary upstream data into domain models.

## 18. Security best practices

### Bot token

`ZALO_BOT_TOKEN` is server-only. Never expose, commit, or log it. Redact
token-bearing URLs.

### Webhook secret

`ZALO_WEBHOOK_SECRET_TOKEN`: - separate from Bot Token; - 8--256
chars; - server-only; - required for production webhook mode; - supplied
to `setWebhook.secret_token`; - verified from
`X-Bot-Api-Secret-Token`; - never returned to clients; - never
logged/audited.

### Webhook boundary

-   POST only;
-   JSON only;
-   HTTPS externally;
-   body-size limit before parsing (project target: 256 KiB);
-   authenticate secret before processing;
-   strict runtime validation;
-   no raw payload logging;
-   bounded acknowledgement latency.

### Privacy

Do not routinely log: - message text; - caption; - image/voice URLs; -
sender display name; - full sender object; - raw webhook body.

Prefer safe metadata: eventName, messageId, chatType, source, supported,
processingStatus.

## 19. Reliability best practices

Use different timeout policies for short API calls and `getUpdates`.

Retries: - transient failures only; - bounded exponential backoff,
e.g. 1s -\> 2s -\> 4s -\> 8s -\> 16s -\> max 30s; - optional jitter; -
no endless retry for permanent auth/config errors.

Do not blindly retry outbound message sends when delivery semantics are
uncertain; duplicate sends are possible.

Shutdown: - stop new polls; - abort active poll; - exit cleanly; - no
unhandled rejection.

Health: - `/health`, `/health/live`, `/health/ready` must not call Zalo.

## 20. Webhook operational best practices

Switching to webhook: 1. deploy receiver; 2. configure valid secret; 3.
verify receiver is reachable; 4. explicitly call `setWebhook`; 5. verify
`getWebhookInfo`; 6. disable polling.

Switching back to polling: 1. explicitly call `deleteWebhook`; 2. verify
`getWebhookInfo.url` is empty; 3. enable only one polling worker.

Never process polling and webhook simultaneously for the same bot.

## 21. Admin best practices

Webhook management is privileged.

Protect using existing project controls: - `SessionAuthGuard` -
`RolesGuard` - ADMIN role - `CsrfOriginGuard`

Audit actor/action/safe result metadata.

Never audit Bot Token, webhook secret, raw payload, or raw upstream
errors.

Do not expose a generic arbitrary-Zalo-function endpoint. Use typed
operations.

## 22. Testing requirements

No live Zalo network in CI.

HTTP contract tests: - exact method/path/body; - envelope validation; -
malformed response; - `ok:false`; - HTTP failure; - token redaction.

Webhook tests: - valid secret accepted; - missing/wrong secret
rejected; - invalid secret never reaches processor; - valid single
object; - array rejected; - malformed envelope rejected; - all
documented events; - `message.unsupported.received` accepted; - unknown
event non-fatal; - mode gating; - oversized body rejected before
controller; - secrets/content absent from logs.

Polling tests: - polling mode only; - no overlap; - timeout
forwarding; - backoff; - success reset; - permanent failure safe stop; -
shutdown cancellation.

Outbound tests: - exact contracts; - sendMessage 1--2000; - parse mode
enum/conflict policy; - sendPhoto caption 1--2000; - sendChatAction only
stable `typing`; - sendVoice `.aac`; - reject group voice when chat type
known; - token redaction.

## 23. Project phase mapping

Phase 4: - getMe - common REST client - envelope validation - token
redaction

Phase 5: - getUpdates - long polling - shared inbound
validator/normalizer/processor - mode gating

Phase 6: - setWebhook - deleteWebhook - getWebhookInfo - POST
/webhooks/zalo - `X-Bot-Api-Secret-Token` verification - admin webhook
management

`testWebhook`: legacy/unverified unless refreshed official documentation
is supplied.

Phase 7: - sendMessage - sendPhoto - sendSticker - sendChatAction -
sendVoice - outbound application abstraction

Do not mix Phase 7 commands/AI/RAG into Phase 6.

## 24. Agent rules

1.  Use this file when direct Zalo docs are unavailable.
2.  Never reintroduce `node-zalo-bot`.
3.  Never infer from Telegram or Zalo OA.
4.  Never invent offset/cursor/update IDs.
5.  Never invent webhook batch delivery.
6.  Verify `X-Bot-Api-Secret-Token` before processing.
7.  Never expose/log secrets.
8.  Never routinely log raw inbound messages.
9.  Polling and webhook are mutually exclusive.
10. Keep one shared inbound normalized pipeline.
11. Keep one official REST HTTP client.
12. Never auto-set/delete webhook at startup.
13. Health checks do not depend on Zalo.
14. No live Zalo calls in CI.
15. Unknown future events must not crash the process.
16. `upload_photo` chat action is not stable while docs say coming soon.
17. Do not claim `testWebhook` is currently official without refreshed
    documentation.
18. Preserve endpoint-specific POST contracts.
19. If this file conflicts with newly supplied official docs, stop and
    report the conflict rather than guessing.

## 25. Official sources used for this snapshot

-   https://docs.zaloplatforms.com/docs/BOT/call_api
-   https://docs.zaloplatforms.com/docs/BOT/create_bot
-   https://docs.zaloplatforms.com/docs/BOT/apis/getMe
-   https://docs.zaloplatforms.com/docs/BOT/apis/getUpdates
-   https://docs.zaloplatforms.com/docs/BOT/apis/setWebhook
-   https://docs.zaloplatforms.com/docs/BOT/apis/deleteWebhook
-   https://docs.zaloplatforms.com/docs/BOT/apis/getWebhookInfo
-   https://docs.zaloplatforms.com/docs/BOT/apis/sendMessage
-   https://docs.zaloplatforms.com/docs/BOT/apis/sendPhoto
-   https://docs.zaloplatforms.com/docs/BOT/apis/sendSticker
-   https://docs.zaloplatforms.com/docs/BOT/apis/sendChatAction
-   https://docs.zaloplatforms.com/docs/BOT/apis/sendVoice
-   https://docs.zaloplatforms.com/docs/BOT/webhook
-   https://docs.zaloplatforms.com/docs/BOT/best-practices/build-your-bot

## 26. Refresh policy

Snapshot verified: **2026-10-02**.

Before future transport/security/API changes, refresh against official
docs. Verify API navigation, methods, request fields/types, response
fields, webhook authentication, event names, added/removed APIs, then
update contract tests.

Never silently preserve stale behavior only because old tests expect it.
