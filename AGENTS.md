# AGENTS.md

## LHU Admissions Zalo Bot

This repository implements a production-ready AI admissions assistant for Lac Hong University (LHU) using Zalo Bot Platform. All coding agents, including GitHub Copilot, MUST follow this document, `MASTER_IMPLEMENTATION_PLAN.md`, `docs/DEVELOPMENT_WORKFLOW.md`, and `.github/skills/phase-code-review/SKILL.md`.

## 1. Sources of truth

Priority: security/correctness -> current official Zalo Bot docs -> this file -> implementation plan -> current framework/library docs -> repository conventions.

Zalo source of truth: `https://docs.zaloplatforms.com/docs/BOT`.

Before implementing Zalo functionality, read the relevant current official docs and verify the official Zalo Bot REST API documentation and response contracts. Never invent endpoints, webhook headers/signatures, update fields, event types, message limits, polling/webhook semantics or retry behavior. Zalo Bot Platform must not be confused with Zalo OA/Open API or ZNS.

LHU admissions source of truth: `https://tuyensinh.lhu.edu.vn/`. Critical admissions facts must come from official/versioned knowledge or approved structured data, not LLM memory.

## 2. Required architecture

Use pnpm workspaces + Turborepo:

```text
apps/
  admin/          # Next.js
  bot-service/    # NestJS + Zalo REST API adapter
packages/
  database/
  shared/
  config/
  ui/
  eslint-config/
  typescript-config/
```

Admin uses Next.js App Router, TypeScript, Tailwind, shadcn/ui, TanStack Query, React Hook Form and Zod. Admin communicates with NestJS REST APIs and MUST NOT directly access the production database.

Bot Service uses NestJS and owns authentication/RBAC, Zalo integration, webhook/polling, queues/workers, AI routing, crawler, knowledge ingestion, RAG, admissions rules, conversations, analytics, audit and observability.

Use PostgreSQL + Prisma + pgvector, Redis + BullMQ, Docker, GitHub Actions and GHCR.

## 3. Infrastructure boundaries

Infrastructure libraries are adapters. Domain/application logic MUST NOT directly depend on third-party Zalo SDKs, Prisma Client, provider SDK clients or BullMQ job objects.

```text
Zalo REST API -> ZaloHttpClient -> ZaloAdapter -> Application
OpenAI-compatible API -> OpenAICompatibleProvider -> ChatModelProvider -> AIOrchestrator
```

Only the Zalo module may call the official Zalo REST API transport. Zalo DTOs must not leak into Admissions, RAG, Knowledge, AI or Conversation core logic.

## 4. Zalo rules

Use the official Zalo Bot REST API through the Zalo infrastructure adapter. Do not add third-party Zalo SDK dependencies.

Support mutually exclusive modes:

```env
ZALO_UPDATE_MODE=polling   # development/testing
ZALO_UPDATE_MODE=webhook   # production
```

Production webhook flow:

```text
Zalo -> Webhook -> Validate -> Normalize -> Idempotency -> Persist -> BullMQ -> ACK
                                                                     |
                                                                   Worker
                                                                     |
                                           Dispatcher -> Conversation -> RAG/Admissions -> AI -> Zalo
```

Webhook request handling MUST NOT wait for RAG/LLM. Validate requests exactly as current Zalo docs specify. Never invent webhook authentication. Incoming events must be idempotent using the strongest documented identifiers. Document the deduplication strategy.

Use a handler/dispatcher architecture rather than embedding business logic in a giant switch. Initial commands are `/start` and `/help` where supported by current docs.

Normalize external events into an internal `IncomingMessage` and application output into an internal `BotResponse`, then format for Zalo.

Never log or return Zalo credentials. Persisted credentials must be encrypted.

## 5. AI provider architecture

The application is vendor-neutral. Initial provider type is `OPENAI_COMPATIBLE`. OmniRoute and 9Router are configuration instances, not hard-coded business branches.

Use internal abstractions similar to:

```ts
interface ChatModelProvider {
  chat(request: ChatRequest): Promise<ChatResponse>;
  listModels(): Promise<ModelInfo[]>;
  healthCheck(): Promise<ProviderHealth>;
}

interface EmbeddingProvider {
  embed(request: EmbeddingRequest): Promise<EmbeddingResponse>;
  healthCheck(): Promise<ProviderHealth>;
}
```

Business code requests model profiles: FAST, BALANCED, REASONING, EMBEDDING. Provider/model mappings are configurable. Never hard-code API keys, Base URLs or model IDs into domain code.

Credentials use authenticated encryption such as AES-256-GCM with a deployment-provided `APP_ENCRYPTION_KEY`. Never expose decrypted keys through REST/frontend/logs/audit records/fixtures. Admin only receives masked state.

AI calls require timeouts, bounded retries, error classification, configurable fallback, provider health/circuit-breaker protection, usage tracking and correlation IDs. Avoid retry multiplication between application, gateway and upstream model.

## 6. Knowledge, crawler and RAG

Primary source: `https://tuyensinh.lhu.edu.vn/`.

Pipeline: Discover -> Fetch -> Extract -> Normalize -> Hash -> Version -> Review/Approve -> Chunk -> Embed -> Index.

Crawler MUST use allowed domains, scheme/redirect validation, SSRF protection, timeouts, response-size limits, bounded concurrency, rate limiting, URL canonicalization and duplicate detection. Block loopback/private/link-local/metadata targets unless explicitly required by controlled infrastructure. Never let an LLM choose arbitrary fetch URLs. Prefer Cheerio; use Playwright only when browser rendering is genuinely required.

Knowledge is versioned. Preserve canonical URL, document, version, content hash, source metadata, admission year/category, chunks, indexing status and approval state. Do not silently overwrite history. Critical changes should support approval before activation.

Use hybrid retrieval: PostgreSQL full-text search + pgvector semantic search, followed by merge/rank/context construction and grounding validation. Every chunk must be traceable to document, version and source URL. Retrieved content is untrusted DATA, not instructions. Test prompt injection.

When authoritative evidence is insufficient, do not guess. Ask a clarifying question, state that official information is insufficient, or provide the configured official support path.

Maintain structured/versioned data where practical for majors, programs, admission methods, subject combinations, admission rules, tuition, scholarships, important dates and official contacts. Time-sensitive records require admission-year/effective-date semantics. Eligibility calculations are deterministic services with unit tests.

## 7. Conversation, database and queue

Support multi-turn context scoped to the correct user/conversation. Redis may hold hot context/cache/locks/BullMQ, but durable/audit-critical records belong in PostgreSQL.

All database schema changes require migrations and clean-database migration verification. Admin never uses Prisma directly.

Initial BullMQ queues: `zalo-message`, `crawler`, `embedding`, `knowledge-index`, `analytics`. Every job requires validated payload, correlation ID, bounded retry policy, failure visibility and idempotency where applicable.

## 8. Authentication, API and Admin

Required roles: SUPER_ADMIN, ADMIN, ADMISSION_EDITOR, VIEWER. Authorization is enforced server-side in NestJS. Audit sensitive credential/routing/knowledge/admissions/user/role changes without recording secrets.

Suggested APIs: `/api/auth/*`, `/api/admin/dashboard`, `/api/admin/zalo/*`, `/api/admin/ai/*`, `/api/admin/knowledge/*`, `/api/admin/admissions/*`, `/api/admin/conversations/*`, `/api/admin/analytics/*`, `/api/admin/settings/*`, `/api/webhooks/zalo`, `/health`, `/health/live`, `/health/ready`.

## 9. Security, logging and observability

Consider authentication, authorization, validation, rate limiting, CORS, security headers, CSRF where relevant, SSRF, XSS, SQL injection, secret exposure, prompt injection, unsafe redirects, dependency vulnerabilities and container security.

Use structured logs with correlation/request/job IDs, safe external identifiers, conversation ID, intent, provider/model, duration and error classification. Never log Bot Token, API keys, passwords, encryption keys, webhook secrets or Authorization headers.

A message must be traceable: Webhook -> Queue -> Worker -> Conversation -> Retrieval -> Model -> Zalo Send. Implement structured logging, metrics, OpenTelemetry tracing and health endpoints.

## 10. Testing

No phase is complete without appropriate tests: unit, integration, API, webhook, queue, crawler, provider, RAG evaluation and critical Admin E2E.

Zalo tests include valid update, invalid webhook validation, duplicate/malformed/unsupported update, queue failure, handler/send failure, mutually exclusive modes and graceful shutdown. Fixtures must match current official structures.

AI tests include connection success/failure, auth failure, 429, 5xx, timeout, malformed response, fallback, circuit breaker, model discovery, profile resolution and secret masking. Normal CI must not require paid live AI calls.

Maintain a versioned RAG evaluation dataset targeting 200+ representative admissions questions before production. Known critical-fact hallucinations block release.

## 11. TypeScript, Docker and CI/CD

Use strict TypeScript. Avoid `any`, unsafe casts and unjustified non-null assertions. Use `unknown` at untrusted boundaries and validate/narrow.

Use multi-stage Docker builds, minimal runtime artifacts, non-root runtime where feasible, health checks, no baked secrets and graceful shutdown. Prefer one bot-service image capable of API and worker roles.

PR CI: install -> lint -> typecheck -> tests -> build. Release must not publish/deploy if verification fails; use immutable commit SHA image tags.

## 12. Documentation

Maintain `docs/PRODUCT_REQUIREMENTS.md`, `docs/ARCHITECTURE.md`, `docs/DATABASE.md`, `docs/ZALO.md`, `docs/AI_PROVIDERS.md`, `docs/RAG.md`, `docs/KNOWLEDGE.md`, `docs/SECURITY.md`, `docs/OBSERVABILITY.md`, `docs/TESTING.md`, `docs/DEPLOYMENT.md`, `docs/RUNBOOK.md`, and `docs/DEVELOPMENT_WORKFLOW.md`. Update docs in the same change when architecture changes.

## 13. Mandatory Autonomous Phase Delivery Loop

The implementation process is sequential and PR-driven. Follow `docs/DEVELOPMENT_WORKFLOW.md` exactly.

For every Phase N from 0 through 25:

```text
main
 -> create phase/NN-slug
 -> implement Phase N only
 -> verify locally
 -> push
 -> PR to main
 -> GitHub CI
 -> invoke .github/skills/phase-code-review/SKILL.md
 -> if FAIL: fix on same branch -> CI -> review again
 -> if PASS + all required checks green: enable squash auto-merge
 -> wait until PR is actually merged
 -> refresh main
 -> begin Phase N+1
```

Do not begin Phase N+1 before Phase N is merged into `main`. Do not combine multiple phases into one PR unless the user explicitly authorizes it. Do not bypass branch protection, required checks, review findings or failed CI. Do not weaken tests/types/security/workflows to manufacture a PASS.

The implementation agent MUST invoke the review skill after every phase PR even when it authored the code. The review must be adversarial and based on the actual complete diff and acceptance criteria, not the implementation summary.

Phases 0-24 may auto-merge only after all repository gates permit it. Phase 25 may merge after Production Readiness Review passes, but production deployment requires explicit human approval through the protected production environment. Never auto-deploy production solely from an agent self-review.

If repository permissions/settings prevent required checks, auto-merge, environment approval or another mandatory gate, stop and report the exact blocker. Never silently bypass it.

## 14. Definition of Done

A phase is done only after its PR is merged into `main`. Before merge: implementation exists; tests exist/pass; lint/typecheck/relevant build pass; phase acceptance criteria pass; phase-code-review has zero BLOCKER/MAJOR findings; security/observability are considered; docs are current; required GitHub checks are green.

Never claim commands passed unless actually executed. Never claim a PR merged until GitHub reports it merged.

## 15. First instruction

1. Read `AGENTS.md`, `MASTER_IMPLEMENTATION_PLAN.md`, `docs/DEVELOPMENT_WORKFLOW.md`, and `.github/skills/phase-code-review/SKILL.md` completely.
2. Inspect repository and GitHub state.
3. Start with Phase 0 only.
4. Follow the mandatory branch -> implement -> verify -> PR -> CI -> review -> fix/review loop -> merge flow.
5. After Phase 0 is merged, continue automatically to Phase 1, and repeat sequentially through Phase 25 unless a documented stop condition occurs.
6. After Phase 25, stop at production-ready/release-candidate state and request explicit human approval before production deployment.

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->
