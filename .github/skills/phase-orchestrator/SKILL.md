---
name: phase-orchestrator
description: Coordinate sequential implementation of the LHU Admissions Zalo Bot from Phase 0 through Phase 25 using one phase per branch and PR, CI, adversarial review, fix loops, and GitHub-enforced merge/human gates.
---

# Phase Orchestrator Skill

## Sources of Truth
Read `AGENTS.md`, `MASTER_IMPLEMENTATION_PLAN.md`, `docs/DEVELOPMENT_WORKFLOW.md`, `.github/skills/phase-code-review/SKILL.md`, and `.github/phase-state.json` before acting.

## Runtime Constraint
The finished product is Docker Compose based. PostgreSQL+pgvector and Redis are container services. Admin, API and worker are containerized application services. Do not introduce host-installed PostgreSQL or Redis as an application prerequisite.

## State
`.github/phase-state.json` is coordination metadata only; GitHub PR/check state is authoritative. Never mark `MERGED` before GitHub reports a merge.

## Main Loop
For Phase N: confirm prior phases are merged; read exact requirements; verify authoritative docs; create `phase/NN-short-slug` from latest `main`; implement only Phase N; add tests/docs; verify; push; open PR; wait for CI; fix CI failures; invoke `phase-code-review`; fix all BLOCKER/MAJOR findings and rerun CI/review; then follow GitHub's permitted merge/human-review process. Do not begin Phase N+1 until Phase N is actually merged.

At most one implementation phase may be active. Never skip/combine phases without explicit user authorization. Never bypass branch protection, required checks, Copilot platform restrictions or human gates.

## Stop Conditions
Stop and report the exact blocker when permissions prevent required operations, authoritative integration docs are materially ambiguous, mandatory staging/live credentials are unavailable, a destructive migration needs a human decision, a BLOCKER cannot be resolved safely, Phase 24/25 release criteria fail, or a merge conflict requires product/architecture judgment.

## Production Boundary
Phase 25 may produce a production-ready release candidate. Production deployment is outside the autonomous implementation loop and requires explicit human approval.

## Completion
Complete only when Phases 0-25 are merged sequentially, required gates passed, Phase 24 staging and Phase 25 readiness passed, and a production-ready release candidate exists with no known critical admissions-fact hallucination.
