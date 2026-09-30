---
name: phase-orchestrator
description: Coordinate sequential implementation of the LHU Admissions Zalo Bot from Phase 0 through Phase 25 using one phase per PR, CI, adversarial review, fix loops, and GitHub-enforced merge/human gates.
---

# Phase Orchestrator Skill

## Sources of Truth
Read `AGENTS.md`, `MASTER_IMPLEMENTATION_PLAN.md`, `docs/DEVELOPMENT_WORKFLOW.md`, `.github/skills/phase-code-review/SKILL.md`, and `.github/phase-state.json` before acting.

## Runtime Constraint
The finished product is Docker Compose based. PostgreSQL+pgvector and Redis are container services. Admin, API and worker are containerized application services. Do not introduce host-installed PostgreSQL or Redis as an application prerequisite.

## Phase and Branch Identity
Phase identity comes from the PR title `Phase N: <title>` and the matching master-plan acceptance criteria. GitHub Copilot Cloud Agent must retain the GitHub-managed working branch assigned to the task/session, normally `copilot/*`. It must not change `origin`, add a PAT, or attempt to create/push a custom `phase/*` branch to work around platform restrictions. Human/local agents may use `phase/NN-slug`.

## State
`.github/phase-state.json` is coordination metadata only; GitHub PR/check state is authoritative. Never mark `MERGED` before GitHub reports a merge.

## Main Loop
For Phase N: confirm prior phases are merged; read exact requirements; verify authoritative docs; use the platform-permitted working branch; implement only Phase N; add tests/docs; verify; commit using the platform-supported mechanism; create/update a PR to `main` titled `Phase N: <phase title>`; wait for CI; fix failures; invoke `phase-code-review`; fix all BLOCKER/MAJOR findings and rerun CI/review; then follow GitHub's permitted merge/human-review process. Do not begin Phase N+1 until Phase N is actually merged.

At most one implementation phase may be active. Never skip/combine phases without explicit user authorization. Never bypass branch protection, required checks, Copilot platform restrictions or human gates.

## Stop Conditions
Stop and report the exact blocker when permissions prevent required operations, authoritative integration docs are materially ambiguous, mandatory staging/live credentials are unavailable, a destructive migration needs a human decision, a BLOCKER cannot be resolved safely, Phase 24/25 release criteria fail, a merge conflict requires product/architecture judgment, or GitHub requires a human/new-task action.

## Production Boundary
Phase 25 may produce a production-ready release candidate. Production deployment is outside the autonomous implementation loop and requires explicit human approval.

## Completion
Complete only when Phases 0-25 are merged sequentially, required gates passed, Phase 24 staging and Phase 25 readiness passed, and a production-ready release candidate exists with no known critical admissions-fact hallucination.
