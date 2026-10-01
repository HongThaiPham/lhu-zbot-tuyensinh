# MASTER_IMPLEMENTATION_PLAN.md

## LHU Admissions Zalo Bot — Production Implementation Plan

## 1. Product Goal

Build a production-ready admissions assistant for Lac Hong University (LHU) on Zalo Bot Platform.

The system MUST:
- Answer admissions questions using official LHU admissions information.
- Use `https://tuyensinh.lhu.edu.vn/` as the primary admissions knowledge source.
- Follow current official Zalo Bot Platform documentation as the source of truth.
- Use the official Zalo Bot REST API through an internal HTTP adapter (no third-party Zalo SDK dependency).
- Provide a Next.js administration application.
- Provide a NestJS bot/backend service.
- Support configurable OpenAI-compatible LLM gateways such as OmniRoute and 9Router through Base URL + API key + model configuration.
- Use RAG plus structured admissions data; critical admissions facts must not rely only on free-form LLM generation.
- Support production webhook processing, queues, retries, idempotency, auditability, security, observability, testing, Docker and CI/CD.

Official references:
- Zalo Bot: `https://docs.zaloplatforms.com/docs/BOT`
- LHU Admissions: `https://tuyensinh.lhu.edu.vn/`

Before implementing a Zalo-specific behavior, Copilot MUST verify the current official Zalo Bot documentation. Never invent API fields, event types, limits, endpoints, or behavior.

## 2. Technology Decisions

| Area | Technology |
|---|---|
| Monorepo | pnpm workspaces + Turborepo |
| Admin | Next.js, TypeScript, App Router |
| UI | Tailwind CSS + shadcn/ui |
| Server state | TanStack Query |
| Forms | React Hook Form + Zod |
| Backend | NestJS + TypeScript |
| Zalo | Official Zalo Bot REST API via internal adapter |
| Database | PostgreSQL |
| ORM | Prisma |
| Vector search | pgvector |
| Cache / Queue | Redis + BullMQ |
| Crawler | Cheerio; Playwright only when necessary |
| AI | Provider abstraction; OpenAI-compatible adapter |
| API | REST + OpenAPI |
| Logging | structured logging |
| Tracing | OpenTelemetry |
| Metrics | Prometheus-compatible |
| Deployment | Docker |
| CI/CD | GitHub Actions + GHCR |

Use stable versions compatible with each other at implementation time.

## 3. Target Repository

```text
lhu-zbot-tuyensinh/
├── apps/
│   ├── admin/
│   └── bot-service/
├── packages/
│   ├── database/
│   ├── shared/
│   ├── config/
│   ├── ui/
│   ├── eslint-config/
│   └── typescript-config/
├── docs/
│   ├── PRODUCT_REQUIREMENTS.md
│   ├── ARCHITECTURE.md
│   ├── DATABASE.md
│   ├── ZALO.md
│   ├── AI_PROVIDERS.md
│   ├── RAG.md
│   ├── KNOWLEDGE.md
│   ├── SECURITY.md
│   ├── OBSERVABILITY.md
│   ├── TESTING.md
│   ├── DEPLOYMENT.md
│   └── RUNBOOK.md
├── docker/
├── .github/workflows/
├── pnpm-workspace.yaml
├── turbo.json
├── docker-compose.yml
├── docker-compose.prod.yml
├── .env.example
├── AGENTS.md
└── README.md
```

## 4. High-Level Architecture

```text
Zalo User -> Zalo Bot Platform -> Production Webhook -> NestJS Bot Service
                                                        |
                         Validate -> Idempotency -> Persist -> BullMQ -> ACK
                                                        |
                                                      Worker
                                                        |
                                                Update Dispatcher
                                                        |
                                                Conversation Engine
                                               /                   \
                                      Admissions Engine            RAG
                                               \                   /
                                                AI Orchestrator
                                                        |
                                                 Model Profile
                                                        |
                                                   AI Router
                                               /        |        \
                                         OmniRoute   9Router   Compatible API
                                                        |
                                                Response Formatter
                                                        |
                                         Official Zalo REST API
                                                        |
                                                       Zalo
```

Admin flow: `Browser -> Next.js Admin -> NestJS REST API -> PostgreSQL/Redis/external adapters`. Next.js MUST NOT access production DB directly.

## 5. Core Architecture Rules

Zalo is an infrastructure boundary. Only the Zalo module directly depends on the official REST transport layer. Flow: `Zalo Update -> Adapter -> Internal IncomingMessage -> Application -> Internal BotResponse -> Zalo Formatter -> HTTP transport`.

AI is also an infrastructure boundary. Business code MUST NOT directly call OmniRoute/9Router/provider clients. Define `ChatModelProvider` and `EmbeddingProvider` interfaces and implement `OpenAICompatibleProvider` first.

Critical tuition, deadlines, scholarships, methods, eligibility, subject combinations, scores/thresholds and similar facts should use structured/versioned data where practical. LLMs explain authoritative facts; they do not invent them.

## 6. Zalo Runtime and Idempotency

Development uses `ZALO_UPDATE_MODE=polling`; production uses `ZALO_UPDATE_MODE=webhook`. They must never consume simultaneously.

Webhook processing: receive -> validate according to current Zalo docs -> normalize -> deduplicate -> persist -> enqueue -> ACK promptly. Never wait for RAG/LLM.

Persist events with the strongest documented identifiers. If no universal event ID exists, derive the deduplication strategy from documented fields and record it in `docs/ZALO.md`.

## 7. AI Provider Management

Initial provider type: `OPENAI_COMPATIBLE`. OmniRoute and 9Router are configuration instances rather than hard-coded classes when standard compatible behavior applies.

Conceptual provider fields: id, name, slug, type, baseUrl, encryptedApiKey, enabled, priority, timeoutMs, maxRetries, timestamps. Admin supports create/edit, key replacement, enable/disable, test connection, model sync, health and usage. Never return decrypted API keys.

Required model profiles: FAST, BALANCED, REASONING, EMBEDDING. Profile mappings are configurable without rebuilding. Implement bounded application-level fallback and avoid retry multiplication.

## 8. Credentials

Store sensitive configuration encrypted at rest with authenticated encryption such as AES-256-GCM. Root key comes from `APP_ENCRYPTION_KEY`. Never log secrets, expose them through GET APIs, send decrypted keys to Next.js, commit `.env`, or use real secrets in fixtures.

## 9. Knowledge, Crawler and RAG

Primary source: `https://tuyensinh.lhu.edu.vn/`.

Pipeline: Discover -> Fetch -> Extract -> Normalize -> Hash -> Version -> Review/Approve -> Chunk -> Embed -> Index.

Crawler requires domain allowlist, SSRF protection, timeout, bounded concurrency/rate limiting, canonical URL handling, duplicate detection, content hashing, crawl audit and bounded retries. Prefer Cheerio; use Playwright only when useful content requires browser rendering.

Knowledge entities: KnowledgeSource, KnowledgeDocument, DocumentVersion, KnowledgeChunk, CrawlJob. Preserve canonical URL, title, category, admission year, dates when known, hash, approval state and version lineage. Avoid unnecessary re-indexing when content is unchanged.

RAG uses hybrid PostgreSQL full-text + pgvector semantic retrieval, merge/rank, optional rerank, context construction and grounding/provenance checks. If reliable context is insufficient, do not guess.

## 10. Structured Admissions and Conversation

Create structured support for Major, Program, AdmissionMethod, SubjectCombination, AdmissionRule, TuitionFee, Scholarship, ImportantDate and ContactInformation. Time-sensitive records require effective year/date semantics. Eligibility calculations must be deterministic and tested.

Store conversations/messages, relevant extracted context, provider/model metadata, citations/provenance and processing state. Redis may hold hot context; PostgreSQL holds durable records according to retention requirements.

## 11. Admin

Primary navigation:

```text
Dashboard
Zalo Bot: Overview, Configuration, Webhook, Commands, Event Logs, Health
AI: Providers, Models, Model Profiles, Routing, Usage
Knowledge Base: Sources, Documents, Pending Changes, Crawl Jobs, Re-index
Admissions: Majors, Programs, Admission Methods, Admission Rules, Subject Combinations, Tuition, Scholarships, Important Dates, Contact Information
Conversations: Conversations, Messages, Unanswered, Feedback
Analytics
System: Users, Roles, Settings, Audit Logs, Health
```

Required roles: SUPER_ADMIN, ADMIN, ADMISSION_EDITOR, VIEWER. Enforce authorization server-side and audit important administrative mutations.

## 12. API and Queues

Suggested namespaces: `/api/auth/*`, `/api/admin/dashboard`, `/api/admin/zalo/*`, `/api/admin/ai/*`, `/api/admin/knowledge/*`, `/api/admin/admissions/*`, `/api/admin/conversations/*`, `/api/admin/analytics/*`, `/api/admin/settings/*`, `/api/webhooks/zalo`, `/health`, `/health/live`, `/health/ready`.

Initial BullMQ queues: `zalo-message`, `crawler`, `embedding`, `knowledge-index`, `analytics`. Jobs require bounded retry, idempotency, structured errors, correlation IDs and visible failure state.

## 13. Observability and SLO Targets

Generate/propagate `correlation_id` through webhook -> queue -> worker -> conversation -> retrieval -> LLM -> Zalo send. Log structured safe metadata, never secrets or unnecessary personal content.

Metrics include webhook/failures, queue depth/failures, messages processed, provider latency/failure, model usage, retrieval latency, unanswered count and crawl/index status.

Initial internal targets: webhook application ACK p95 < 300ms; non-AI internal response p95 < 1s; RAG retrieval p95 < 500ms under expected load; end-to-end AI response target p95 < 8s provider-dependent; availability target >= 99.9%; known critical admissions fact hallucinations tolerated: 0.

# Implementation Phases

## Phase 0 — Repository Bootstrap

Tasks: initialize pnpm workspace and Turborepo; create Next.js `apps/admin`; create NestJS `apps/bot-service`; create only required shared packages; root lint/typecheck/test/build scripts; `.editorconfig`, `.gitignore`, `.env.example`; README and docs skeleton.

Acceptance: `pnpm install`, `pnpm lint`, `pnpm typecheck`, `pnpm build` succeed; both apps run locally. Do not proceed if baseline is broken.

## Phase 1 — Configuration Foundation

Typed environment configuration, startup validation, dev/test/prod configuration, fail-fast production secrets and documentation. Invalid required config prevents startup without printing secret values.

## Phase 2 — Database Foundation

PostgreSQL, pgvector, Prisma package, migrations, seed framework and DB health check. A fresh database must be reproducible entirely from migrations, including CI.

## Phase 3 — Authentication, RBAC and Audit

User/role models, authentication/session strategy, password security, NestJS guards/decorators, audit service and Admin login. Unauthorized access is rejected; role checks are tested; important mutations are audited.

## Phase 4 — Zalo REST API Integration

Before coding, read current official Zalo Bot docs for API calling and `getMe`. Implement `ZaloHttpClient` + adapter, connection/identity health test, and safe error mapping against official response contracts. No third-party Zalo SDKs; tests use mocks/fakes; no invented methods.

## Phase 5 — Development Polling Mode

Implement documented official `getUpdates` polling flow, dispatcher, `/start`, `/help`, text/unknown handlers, graceful shutdown and mutual exclusion with webhook mode.

## Phase 6 — Production Webhook

Implement endpoint, exact current documented webhook validation, event persistence, idempotency, enqueue, prompt ACK and Admin webhook operations (`setWebhook`, `testWebhook`, `deleteWebhook`, `getWebhookInfo`) only where documented. Duplicate events cannot duplicate responses; LLM is never called in webhook request lifecycle.

## Phase 7 — Update Dispatcher and Message Sending

Implement normalized `IncomingMessage`, handler registry, normalized `BotResponse`, formatter and documented official Zalo send APIs (`sendMessage`, `sendPhoto`, `sendSticker`, `sendChatAction`, `sendVoice`). Zalo DTOs do not leak into core modules and formatting respects current limits.

## Phase 8 — Zalo Admin

Implement Overview, configuration, test connection, webhook management, health and event logs. Secrets never return decrypted; UI shows current runtime state.

## Phase 9 — AI Provider Core

Implement provider interfaces, `OpenAICompatibleProvider`, encrypted credentials, provider CRUD, health test, model discovery/sync and usage persistence. Base URL + API key configuration supports OmniRoute/9Router-compatible endpoints without rebuild.

## Phase 10 — Model Profiles and Routing

Implement FAST/BALANCED/REASONING/EMBEDDING profiles, resolver, routing, bounded fallback, circuit breaker and usage metadata. Callers request profiles rather than hard-coded vendor/model.

## Phase 11 — LHU Crawler

Implement source management, allowlist, fetcher, Cheerio extractor, optional Playwright fallback, canonicalization, hashing/versioning, crawl queue and Admin controls. Official pages ingest; arbitrary private/internal URLs are blocked; unchanged content is detected.

## Phase 12 — Knowledge Management

Implement source/document/version/chunk models, preview, diff, approve/reject/disable, indexing state and Admin screens. Content is traceable to official URL/version and critical updates can be reviewed.

## Phase 13 — Embeddings and Indexing

Implement embedding provider, EMBEDDING profile, chunker, embedding jobs, pgvector persistence and reindex. Reindex is resumable/idempotent; incompatible embedding changes require explicit reindex.

## Phase 14 — RAG

Implement query normalization, FTS, vector retrieval, hybrid ranking, context builder, provenance and confidence policy. Insufficient evidence triggers safe fallback.

## Phase 15 — Structured Admissions Engine

Implement structured entities, CRUD Admin screens, year/effective-date handling, deterministic eligibility/rule services and validation. Critical calculations are unit tested and stale year data is not silently presented as current.

## Phase 16 — Conversation Engine

Implement conversations/messages, short-lived context, entity extraction, follow-up context and response pipeline. Multi-turn questions retain relevant context scoped per user/conversation.

## Phase 17 — Grounding and AI Guardrails

Implement authoritative system instructions, retrieved-content-as-data rule, prompt-injection defense, source sufficiency checks, conflict/freshness policy and support fallback. Include malicious retrieved-content tests.

## Phase 18 — Analytics and Feedback

Implement unanswered questions, feedback, top intents/majors, handoff rate, AI usage, provider/model latency/failure and Admin dashboard. Metrics must not expose secrets and should reveal knowledge gaps.

## Phase 19 — Observability

Implement structured logging, correlation IDs, OpenTelemetry, metrics, queue visibility and health/live/ready. One message must be traceable end-to-end.

## Phase 20 — Security Hardening

Review authentication/RBAC, secret encryption, SSRF, rate limiting, validation, headers, CORS, dependency vulnerabilities, container user, webhook security, prompt injection, audit and log redaction. Document and resolve/disposition high/critical findings.

## Phase 21 — Testing and Evaluation

Required: unit, integration, API, webhook, queue, provider mocks, crawler, RAG evaluation, structured admissions tests and basic Admin E2E. Build a representative admissions evaluation dataset targeting 200+ questions. Evaluate retrieval recall, groundedness, factual/citation correctness, safe fallback and critical hallucinations. Known critical-fact hallucinations block release.

## Phase 22 — Docker

Create optimized multi-stage Admin and Bot Service images, non-root runtime where feasible, Compose development infrastructure, production reference deployment and API/worker roles. Suggested `BOT_SERVICE_ROLE=api|worker|all`. Fresh Docker deployment and health checks must work.

## Phase 23 — CI/CD

PR: install -> lint -> typecheck -> unit/integration tests -> build -> security/dependency checks. Main/release: verify -> build images -> push GHCR -> staging process -> smoke tests -> controlled production deployment. Failed tests cannot publish production releases; use immutable commit tags.

## Phase 24 — Staging

Use a real staging Zalo Bot where available. Test webhook lifecycle, duplicate/malformed events, queue failure/retry, provider outage/fallback, crawler, RAG, multi-turn, permissions, secret replacement and load/latency. Produce a staging report.

## Phase 25 — Production Readiness

Before go-live verify current Zalo docs, production webhook, polling disabled, webhook validation, idempotency, queue behavior, encrypted credentials, OmniRoute/9Router-compatible configuration, official LHU knowledge, versioning/approval, structured data, RAG provenance, safe fallback, prompt-injection evaluation, RBAC/audit, observability, backups/restores, CI/CD, runbook, rollback and release evaluation thresholds.

# Production Checklist

- [ ] Current Zalo Bot documentation reviewed.
- [ ] Official Zalo REST API integration verified.
- [ ] Production webhook verified.
- [ ] Polling disabled in production.
- [ ] Webhook validation verified.
- [ ] Idempotency verified.
- [ ] Queue retry/failure behavior verified.
- [ ] Zalo credentials encrypted.
- [ ] AI credentials encrypted.
- [ ] OmniRoute/9Router-compatible configurations tested.
- [ ] Official LHU content indexed.
- [ ] Knowledge versioning/approval operational.
- [ ] Critical structured admissions data reviewed.
- [ ] RAG provenance operational.
- [ ] Low-confidence fallback operational.
- [ ] Prompt-injection evaluation passed.
- [ ] Admin RBAC and audit verified.
- [ ] Metrics/logs/traces verified.
- [ ] Backup and restore procedure tested.
- [ ] CI/CD passing.
- [ ] Runbook and rollback procedure completed/tested.
- [ ] Release evaluation thresholds passed.
- [ ] No known critical admissions fact hallucination.

# Definition of Done

A feature/phase is not complete merely because it compiles. For each phase: implementation exists; tests exist/pass; lint/typecheck pass; relevant build passes; documentation is updated; security implications are considered; errors are observable; acceptance criteria are verified.

At the end of each phase Copilot MUST summarize changes, list important files/migrations, run required verification commands, report failures honestly, fix failures before proceeding and update this plan when implementation realities require a documented decision. Do not mark unverified work complete.

# Initial Instruction to GitHub Copilot

Read `AGENTS.md` and `MASTER_IMPLEMENTATION_PLAN.md` completely. Inspect the repository. Start with Phase 0 only. Present a concise Phase 0 implementation plan, implement Phase 0 completely, add required tests/configuration/documentation, run all Phase 0 verification commands, fix every failure and report actual results. Do not begin Phase 1 until Phase 0 satisfies all acceptance criteria.
