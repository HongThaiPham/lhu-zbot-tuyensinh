---
name: phase-code-review
description: Adversarially review each phase pull request against repository architecture, security, tests, documentation, regression safety, Docker Compose runtime requirements, and phase acceptance criteria before merge.
---

# Phase Code Review Skill

## Purpose
Use this skill after every implementation phase and before declaring its PR ready to merge. Review the actual diff, not the implementation summary.

## Required Inputs
Read `AGENTS.md`, `MASTER_IMPLEMENTATION_PLAN.md`, `docs/DEVELOPMENT_WORKFLOW.md`, the exact phase acceptance criteria, and the complete PR diff. For Zalo behavior verify current official Zalo Bot documentation and the repository's REST transport contract/tests (no third-party SDK assumptions).

## Review Dimensions

### Scope and architecture
Verify all current-phase requirements, no unjustified future-phase work, Admin-to-NestJS boundary, Zalo/provider adapter boundaries, and repository conventions.

### Docker Compose runtime
Once introduced, the product MUST run as a Compose application. PostgreSQL+pgvector and Redis are containers, never host prerequisites. Verify healthchecks, named persistent volumes, internal networking, dependency readiness, graceful shutdown/restart behavior, environment/secrets configuration, and that database/Redis ports are not publicly exposed in production Compose. Images must not bake credentials.

### Correctness and reliability
Review happy/failure paths, idempotency, retries, races, duplicate processing, timeouts, graceful shutdown and safe errors.

### Security and privacy
Review authentication, authorization, secrets, injection, SSRF, XSS, CSRF where relevant, redirects, webhook validation, prompt injection, logging/redaction, dependencies and container security. Credential exposure, authorization bypass, critical injection/SSRF or fabricated webhook security is BLOCKING.

### Database/migrations
Verify Prisma schema/migrations, clean migration against containerized PostgreSQL+pgvector, existing-data compatibility, destructive-change strategy and indexes/constraints.

### Tests, observability and docs
Require meaningful deterministic tests, documented Zalo fixtures, no paid live AI in normal CI, adequate correlation/logging/metrics/health behavior, updated docs and `.env.example` without real secrets.

### Maintainability/regression
Preserve strict TypeScript and existing phase behavior. Reject weakened checks, dead/debug code, unsafe casts/`any` without justification, and runtime regressions.

## Mandatory Verification
Run the actual repository commands when applicable:

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
docker compose config
```

Once Compose runtime exists, also run the phase-appropriate Compose smoke/integration verification defined by repository docs. Never claim a command passed unless executed. Missing mandatory live credentials/environment is `NOT_RUN_EXTERNAL_DEPENDENCY`, not PASS.

## Severity
- `BLOCKER`: merge prohibited: security/data-loss risk, broken acceptance criterion/check, critical hallucination, fabricated integration behavior, major architecture/runtime violation.
- `MAJOR`: merge prohibited until fixed: significant correctness/reliability/test/docs/runtime defect.
- `MINOR`: non-blocking improvement.
- `NIT`: stylistic suggestion.

PASS requires zero BLOCKER and zero MAJOR findings plus all required gates.

## Required Output
Produce human-readable findings and:

```yaml
phase: <number>
verdict: PASS | FAIL
acceptance_criteria: PASS | FAIL
architecture: PASS | FAIL
runtime_compose: PASS | FAIL | NOT_APPLICABLE
security: PASS | FAIL
tests: PASS | FAIL
documentation: PASS | FAIL
regression: PASS | FAIL
blocking_findings: []
non_blocking_findings: []
verification:
  install: PASS | FAIL | NOT_RUN
  lint: PASS | FAIL | NOT_RUN
  typecheck: PASS | FAIL | NOT_RUN
  test: PASS | FAIL | NOT_RUN
  build: PASS | FAIL | NOT_RUN
  compose_config: PASS | FAIL | NOT_RUN | NOT_APPLICABLE
  compose_smoke: PASS | FAIL | NOT_RUN | NOT_APPLICABLE
merge_allowed: true | false
```

## Fix Loop
On FAIL, do not merge. Fix every BLOCKER/MAJOR on the same phase branch, rerun CI, then rerun this review from the beginning. Never disable or weaken checks to manufacture PASS.

## Merge Contract
After PASS, ensure the PR targets `main` and required GitHub checks are green. Follow GitHub's current Copilot/cloud-agent merge and human-review restrictions. Never bypass branch protection, platform security controls or required human actions. If GitHub requires human review/merge, report the PR as ready rather than pretending it was merged.

## Production Boundary
Phase 25 may reach release-candidate status after Production Readiness Review. Production deployment always requires explicit human approval.
