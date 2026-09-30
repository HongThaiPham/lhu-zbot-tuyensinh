# Development Workflow

## Goal

Deliver `MASTER_IMPLEMENTATION_PLAN.md` sequentially, one phase per pull request, with implementation, automated verification, adversarial code review, fix/re-review and controlled merge.

## Phase State Machine

```text
READY
  -> IMPLEMENTING
  -> VERIFYING
  -> PR_OPEN
  -> CI_RUNNING
  -> REVIEWING
       -> CHANGES_REQUESTED -> IMPLEMENTING
       -> PASS -> MERGE_READY
  -> MERGED
  -> NEXT_PHASE_READY
```

A phase must never be marked complete until its PR is merged into `main`.

## Branch and PR Convention

Branch:

```text
phase/<NN>-<short-slug>
```

Examples:

```text
phase/00-repository-bootstrap
phase/01-configuration-foundation
phase/06-production-webhook
```

PR title:

```text
Phase <N>: <phase title>
```

Every PR body must include:

```markdown
## Phase
Phase N — Name

## Requirements implemented
- ...

## Acceptance criteria
- [ ] ...

## Verification
- `pnpm lint`: PASS/FAIL
- `pnpm typecheck`: PASS/FAIL
- `pnpm test`: PASS/FAIL
- `pnpm build`: PASS/FAIL

## Migrations
None / list

## Security considerations
...

## Observability considerations
...

## Known risks / external blockers
...
```

## Implementation Loop

For Phase N:

1. Update local `main`.
2. Confirm all previous phases are merged.
3. Read `AGENTS.md`, this workflow and Phase N in the master plan.
4. Check current authoritative docs required by the phase.
5. Create `phase/<NN>-<slug>` from current `main`.
6. Implement only Phase N plus unavoidable prerequisites.
7. Add/update tests and docs in the same branch.
8. Run all relevant local verification.
9. Commit/push.
10. Open PR to `main`.
11. Wait for CI.
12. Invoke `.github/skills/phase-code-review/SKILL.md` against the complete PR diff.
13. If FAIL, fix on the same branch and repeat CI + review.
14. If PASS and all required checks are green, enable squash auto-merge.
15. Never bypass required checks/branch protection.
16. After GitHub reports the PR merged, refresh `main` and begin Phase N+1.

## Merge Gates

A phase PR may merge only when all of these are true:

```text
phase acceptance criteria == PASS
phase-code-review verdict == PASS
blocking findings == 0
lint == PASS
typecheck == PASS
tests == PASS
build == PASS
phase-specific required checks == PASS
```

If a check is not applicable, that must be explicitly justified by the phase specification; it must not silently disappear.

## Self-Review Safety

The implementation agent may invoke the review skill, but it must treat review as a fresh adversarial pass:
- inspect the actual diff rather than its own summary;
- rerun verification;
- actively search for counterexamples and failure paths;
- report blocking findings even when it authored the code;
- never edit the review criteria to make its PR pass.

GitHub branch/ruleset protection and required checks are the final enforcement boundary. The agent must never bypass them.

## CI Bootstrap

The repository begins before Phase 0 has created the pnpm workspace. `.github/workflows/ci.yml` therefore contains a bootstrap guard. Once `package.json` and `pnpm-lock.yaml` exist, full CI becomes mandatory automatically.

Phase 0 must leave full CI green.

## External Integrations

Normal PR CI must not require paid/live external services. Use mocks/fakes/test containers as specified. Staging/live validation is required only in phases that explicitly require it.

Never put Zalo Bot Token, provider API keys, encryption keys or production credentials in repository files, workflow YAML, PR bodies, logs or test fixtures. Use GitHub/environment secrets for live staging/release checks.

## Phase 25 / Production

Phase 25 must perform Production Readiness Review including staging E2E, security gate, RAG evaluation, migration/restore validation, observability, rollback/runbook and the full Zalo -> queue -> conversation -> admissions/RAG -> LLM -> Zalo path.

Phase 25's PR may merge when gates pass, but production deployment is a separate action protected by a GitHub Environment named `production` with required human reviewers. The agent must never auto-approve its own production deployment.

## Failure / Stop Conditions

Stop autonomous progression and report a blocker when:
- current official documentation is ambiguous enough that implementation correctness cannot be established;
- required external credentials or repository permissions are unavailable for a phase's mandatory live check;
- a destructive migration requires a product/operations decision;
- a security BLOCKER cannot be resolved safely;
- a required GitHub check cannot be configured/enforced with available permissions;
- staging does not satisfy Phase 24/25 release criteria.

Do not skip a phase to work around a blocker.
