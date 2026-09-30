# Phase Code Review Skill

## Purpose

Use this skill after implementation of every phase in `MASTER_IMPLEMENTATION_PLAN.md` and before a phase PR may be approved for merge into `main`.

The reviewer is adversarial: its job is to find defects, missing acceptance criteria, architectural drift, security problems, insufficient tests, unsafe migrations, regressions, undocumented behavior and unverifiable claims. A phase is not approved merely because it compiles.

## Required Inputs

Before reviewing:

1. Read `AGENTS.md` completely.
2. Read `MASTER_IMPLEMENTATION_PLAN.md` completely.
3. Identify the exact phase number from the PR title/body/branch.
4. Read the acceptance criteria for that phase.
5. Inspect the complete PR diff against `main`.
6. Inspect relevant tests and documentation, not only production code.
7. For Zalo behavior, verify against current official Zalo Bot documentation and the installed `node-zalo-bot` API/types.
8. For external libraries/frameworks, use current authoritative documentation when behavior is uncertain.

Never approve based only on the implementation agent's summary.

## Review Dimensions

### 1. Scope and Acceptance Criteria
- All requirements of the current phase are implemented.
- No required acceptance criterion is skipped.
- No material future-phase implementation is introduced without necessity.
- Claims in PR description match actual code.

### 2. Architecture
- Boundaries in `AGENTS.md` are preserved.
- Admin does not directly access the production database.
- Zalo SDK does not leak outside its adapter/module boundary.
- Provider SDKs do not leak into domain/application logic.
- Queue/database/infrastructure details are isolated appropriately.
- No needless abstractions or duplicate domain models are introduced.

### 3. Correctness and Reliability
- Happy path and failure paths are correct.
- Idempotency/retry semantics are safe where applicable.
- Race conditions and duplicate processing are considered.
- Timeouts and graceful shutdown are handled where applicable.
- Error handling preserves useful context without leaking secrets.

### 4. Security and Privacy
Check authentication, authorization, secret handling, injection, SSRF, XSS, CSRF where applicable, unsafe redirects, webhook validation, prompt injection, logging/redaction, dependency risk and unsafe defaults.

Any credential exposure, authorization bypass, critical injection/SSRF, fabricated webhook security or equivalent issue is BLOCKING.

### 5. Database and Migrations
When relevant:
- Prisma schema and migrations agree.
- Migration works from a clean database.
- Existing-data compatibility is considered.
- Destructive migration requires explicit justification and rollback/migration strategy.
- Constraints/indexes match invariants and query patterns.

### 6. Tests
- Tests cover behavior, not implementation trivia.
- Important failure paths are covered.
- Tests are deterministic and do not require paid live AI calls in normal CI.
- Zalo fixtures match current documented structures.
- No assertions were weakened merely to obtain green CI.
- No meaningful tests were deleted without replacement/justification.

### 7. Observability
Where relevant, correlation IDs, structured logs, metrics/traces and health behavior are adequate. Secrets and unnecessary personal content must not be logged.

### 8. Documentation
- Architecture/API/config changes are documented in the appropriate docs.
- `.env.example` is updated for new configuration without real secrets.
- README/runbook changes are made when operator/developer behavior changes.

### 9. Maintainability
- Strict TypeScript is preserved.
- Avoid `any`, unsafe casts and unjustified non-null assertions.
- Naming and module ownership are clear.
- No dead code, debug code, commented-out secrets or temporary bypasses remain.

### 10. Regression and Product Readiness
- Existing phases still satisfy their acceptance criteria.
- Root commands remain valid.
- Build/runtime changes do not silently break earlier functionality.

## Mandatory Verification

Run the repository's actual verification commands. At minimum when available:

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Run phase-specific integration/E2E/evaluation/security checks required by the implementation plan. Never claim a command passed unless it was actually executed.

If a required command cannot run because of missing external credentials/environment, classify it explicitly as `NOT_RUN_EXTERNAL_DEPENDENCY`; do not convert it to PASS. Normal CI must use mocks/fakes where required by the plan.

## Finding Severity

- `BLOCKER`: merge must not happen. Security vulnerability, data-loss risk, broken acceptance criterion, failing required check, critical hallucination, fabricated integration behavior, major architecture violation.
- `MAJOR`: merge must not happen until fixed. Significant correctness/reliability/test/documentation defect.
- `MINOR`: non-blocking improvement with low product risk.
- `NIT`: stylistic/non-functional suggestion.

`PASS` is allowed only when there are zero BLOCKER and zero MAJOR findings and all required merge gates are satisfied.

## Required Review Output

Produce both a human-readable review and this machine-readable block:

```yaml
phase: <number>
verdict: PASS | FAIL
acceptance_criteria: PASS | FAIL
architecture: PASS | FAIL
security: PASS | FAIL
tests: PASS | FAIL
documentation: PASS | FAIL
regression: PASS | FAIL
blocking_findings:
  - severity: BLOCKER | MAJOR
    file: <path or null>
    line: <line or null>
    summary: <short summary>
non_blocking_findings:
  - severity: MINOR | NIT
    file: <path or null>
    line: <line or null>
    summary: <short summary>
verification:
  install: PASS | FAIL | NOT_RUN
  lint: PASS | FAIL | NOT_RUN
  typecheck: PASS | FAIL | NOT_RUN
  test: PASS | FAIL | NOT_RUN
  build: PASS | FAIL | NOT_RUN
merge_allowed: true | false
```

`merge_allowed: true` requires `verdict: PASS`, all phase acceptance criteria satisfied, zero BLOCKER/MAJOR findings, and all required CI checks green.

## Fix Loop

If review FAILS:
1. Do not merge.
2. Post actionable findings on the PR.
3. Return to the same phase branch.
4. Fix findings without disabling checks or weakening tests/types/security.
5. Push changes.
6. Re-run CI.
7. Run this review again from the beginning.

Repeat until PASS or until an external/manual blocker is reached.

## Approval / Auto-Merge Contract

After PASS:
1. Ensure the PR is not draft and targets `main`.
2. Ensure all required GitHub checks are green.
3. Ensure the PR branch follows `phase/<number>-<slug>`.
4. Add the label `phase-review:pass` (create it if repository permissions allow and it does not exist).
5. Enable squash auto-merge; do not bypass required checks or branch protection.

If repository settings do not permit auto-merge, report the exact blocker rather than merging by bypass.

## Production Boundary

Phases 0-24 may auto-merge after all gates pass.

Phase 25 is different: code/configuration/documentation may merge after Production Readiness Review passes, but production deployment requires explicit human approval. Never auto-deploy production solely because this skill returned PASS.
