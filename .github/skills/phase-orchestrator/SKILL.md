# Phase Orchestrator Skill

## Purpose

Coordinate sequential delivery of `MASTER_IMPLEMENTATION_PLAN.md` from Phase 0 through Phase 25. This skill coordinates work; it does not weaken GitHub merge gates and it never substitutes a claimed PASS for actual CI/review evidence.

## Sources of Truth

Read completely before acting:

1. `AGENTS.md`
2. `MASTER_IMPLEMENTATION_PLAN.md`
3. `docs/DEVELOPMENT_WORKFLOW.md`
4. `.github/skills/phase-code-review/SKILL.md`
5. `.github/phase-state.json`

## State

`.github/phase-state.json` records the repository's expected sequential state. It is coordination metadata, not proof that a phase passed. GitHub PR merge state and required checks are authoritative.

Allowed lifecycle:

```text
READY -> IMPLEMENTING -> VERIFYING -> PR_OPEN -> CI_RUNNING -> REVIEWING
REVIEWING -> CHANGES_REQUESTED -> IMPLEMENTING
REVIEWING -> MERGE_READY -> MERGED -> NEXT_PHASE_READY
```

Never set a phase to `MERGED` until GitHub reports its PR merged.

## Main Loop

For current Phase N:

1. Confirm every phase `< N` is merged into `main`.
2. Confirm no different phase PR is active. One phase at a time.
3. Read Phase N requirements/acceptance criteria.
4. Verify authoritative external docs required by the phase.
5. Create `phase/NN-short-slug` from latest `main`.
6. Implement Phase N only plus unavoidable prerequisites.
7. Add/update tests and documentation.
8. Run local verification required by the phase.
9. Fix all local failures.
10. Commit and push.
11. Open PR to `main` with title `Phase N: <phase title>` and repository PR template content.
12. Wait for required GitHub CI checks.
13. On CI failure, inspect actual failures, fix root causes on the same branch, push and repeat.
14. When CI passes, invoke `.github/skills/phase-code-review/SKILL.md` as a fresh adversarial review of the complete diff.
15. If review FAILS, fix every BLOCKER/MAJOR finding on the same branch, rerun CI and rerun review from the beginning.
16. Only when `merge_allowed: true` and GitHub-required checks are green, enable squash auto-merge if permissions/settings allow.
17. Never bypass required checks, branch protection, unresolved blocking review findings or repository policy.
18. Wait for GitHub to report merged.
19. Refresh `main`.
20. Update phase state to the next phase.
21. Continue sequentially through Phase 25.

## Concurrency Rule

At most one implementation phase may be active. Do not create Phase N+1 branch/PR while Phase N is unmerged. A review/fix loop belongs to the same phase branch.

## Review Independence Rule

Even if the same Copilot agent authored the implementation, the review pass must ignore its own summary and inspect the actual complete PR diff, acceptance criteria, tests, migrations, documentation and verification results. Actively search for counterexamples and regressions.

## Stop Conditions

Stop autonomous progression and report the exact blocker if:

- mandatory repository permissions prevent creating/pushing a branch or PR;
- auto-merge/required checks cannot be honored;
- authoritative integration documentation is materially ambiguous;
- a required staging/live credential or environment is unavailable for a mandatory phase check;
- a destructive migration needs a human product/operations decision;
- a BLOCKER cannot be resolved safely;
- Phase 24/25 staging/release criteria fail;
- GitHub reports a merge conflict that cannot be safely resolved without a product/architecture decision.

Never skip a phase to avoid a blocker.

## Production Boundary

Phase 25 may produce and merge a production-ready release candidate after all gates pass. Production deployment itself is not part of the autonomous merge loop. It requires explicit human approval through the repository's protected production deployment process/environment.

## Completion

The autonomous implementation loop is complete only when:

- Phases 0 through 25 are merged sequentially;
- all required CI/review gates passed for each phase;
- Phase 24 staging requirements passed;
- Phase 25 Production Readiness requirements passed;
- a production-ready release candidate exists;
- no known critical admissions-fact hallucination remains.

Then stop and request explicit human production-deployment approval.
