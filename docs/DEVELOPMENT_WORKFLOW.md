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

A phase is not complete until its PR is merged into `main`.

## Phase Identity and Branches

The authoritative phase identifier is the PR title:

```text
Phase <N>: <phase title>
```

GitHub Copilot Cloud Agent MUST work on the GitHub-managed branch assigned to its task/session, normally `copilot/*`. It must not change the remote, introduce a PAT, or attempt to create/push a custom `phase/*` branch when the platform does not permit that operation.

Human/local agents may use:

```text
phase/<NN>-<short-slug>
```

Examples: `phase/00-repository-bootstrap`, `phase/01-configuration-foundation`.

Branch names are transport details; phase ordering and acceptance are determined by the PR title, master-plan phase, PR body, CI and review evidence.

Every phase PR body must include:

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
- `docker compose config`: PASS/FAIL/NOT APPLICABLE

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

1. Confirm latest `main` and all previous phases are merged.
2. Read `AGENTS.md`, this workflow and Phase N in the master plan.
3. Check authoritative external docs required by the phase.
4. Use the current agent's permitted working branch. Copilot Cloud Agent keeps its GitHub-managed `copilot/*` branch; human/local agents may create `phase/<NN>-<slug>`.
5. Implement only Phase N plus unavoidable prerequisites.
6. Add/update tests and docs.
7. Run all relevant local verification.
8. Commit using the platform-supported mechanism.
9. Create/update a PR to `main` titled `Phase N: <phase title>`.
10. Wait for CI.
11. Invoke `.github/skills/phase-code-review/SKILL.md` against the complete PR diff.
12. If FAIL, fix on the same PR branch and repeat CI + review.
13. If PASS and all required checks are green, mark/report the phase ready for the merge action permitted by GitHub.
14. Never bypass required checks, branch protection, Copilot platform restrictions or human gates.
15. Only after GitHub reports the PR merged may Phase N+1 begin.

## Merge Gates

A phase PR may merge only when all applicable gates are true:

```text
phase acceptance criteria == PASS
phase-code-review verdict == PASS
blocking findings == 0
lint == PASS
typecheck == PASS
tests == PASS
build == PASS
docker compose checks == PASS where applicable
phase-specific required checks == PASS
```

If a check is not applicable, explicitly justify it; do not silently omit it.

## Self-Review Safety

The implementation agent may invoke the review skill, but must treat review as a fresh adversarial pass: inspect the actual diff, rerun verification, search for counterexamples/failure paths, report blocking findings even when it authored the code, and never edit review criteria to manufacture PASS.

GitHub branch/ruleset protection and required checks are the final enforcement boundary.

## Copilot Cloud Agent Boundary

Do not solve Copilot Cloud Agent branch/authentication restrictions by changing `origin`, embedding credentials, adding PATs or bypassing GitHub controls. If GitHub requires a human merge/review or a new task after merge, stop cleanly at the corresponding READY state and report the required human/platform action.

## CI Bootstrap

Before Phase 0 creates the pnpm workspace, `.github/workflows/ci.yml` uses a bootstrap guard. Once `package.json` and `pnpm-lock.yaml` exist, full CI is mandatory. Phase 0 must leave full CI green.

## External Integrations

Normal PR CI must not require paid/live external services. Use mocks/fakes/test containers as specified. Never put Zalo Bot Token, provider API keys, encryption keys or production credentials in repository files, workflow YAML, PR bodies, logs or fixtures.

## Phase 25 / Production

Phase 25 performs Production Readiness Review including staging E2E, security gate, RAG evaluation, migration/restore validation, observability, rollback/runbook and the full Zalo -> queue -> conversation -> admissions/RAG -> LLM -> Zalo path.

Production deployment is a separate human-approved action. The agent must never auto-approve its own production deployment.

## Failure / Stop Conditions

Stop and report a blocker when authoritative docs are materially ambiguous; mandatory credentials/permissions are unavailable; a destructive migration requires a human decision; a security BLOCKER cannot be safely resolved; a required GitHub gate cannot be enforced; staging fails Phase 24/25 criteria; or the platform requires a human/new task action. Never skip a phase to work around a blocker.
