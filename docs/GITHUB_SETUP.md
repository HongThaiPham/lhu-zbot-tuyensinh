# GitHub Setup for Autonomous Phase Delivery

This file describes repository settings required for the Phase 0 -> Phase 25 Copilot workflow. Repository settings are enforcement boundaries and cannot be replaced by prompts.

## Verified Repository-Level Settings

The repository should be public or on a GitHub plan that supports the selected branch/ruleset features.

Recommended General -> Pull Requests settings:

- Allow squash merging: ON
- Allow auto-merge: ON
- Automatically delete head branches: ON
- Allow update branch: ON

The autonomous workflow expects these capabilities.

## Actions

Settings -> Actions -> General:

- GitHub Actions: enabled.
- Allow the actions used by repository workflows (`actions/checkout`, `actions/setup-node`, `pnpm/action-setup`, `actions/dependency-review-action`).
- Workflow permissions must be sufficient for the workflows actually used. Keep least privilege; do not grant broad write access merely for convenience.

Normal CI must not contain production credentials or require paid live LLM calls.

## Protect `main`

Configure a ruleset or branch protection targeting `main`.

Required intent:

- Require a pull request before merge.
- Require status checks before merge.
- Require branch to be up to date when appropriate.
- Block force pushes.
- Block deletion.
- Do not allow the autonomous agent to bypass protections.

After Phase 0 creates a real workspace and the checks have run at least once, require these checks by their actual GitHub check names:

- `Repository Policy`
- `Quality Gate`
- `Dependency Review`
- `Phase Review Contract`

Do not require a human PR approval for Phases 0-24 if the desired behavior is fully autonomous phase merging. The repository's automated review contract plus required checks are the merge gates. A human approval gate remains required for production deployment.

## Auto-Merge

Auto-merge must be enabled at repository level. The phase agent may enable squash auto-merge only after:

- current phase acceptance criteria pass;
- required CI checks are green;
- `.github/skills/phase-code-review/SKILL.md` returns PASS;
- there are no BLOCKER/MAJOR findings.

Never use admin bypass to merge a failing PR.

## Copilot Coding Agent

Enable GitHub Copilot Coding Agent for this repository/account and grant only the repository access needed to create branches, push commits and create/update pull requests.

The agent must read:

- `AGENTS.md`
- `MASTER_IMPLEMENTATION_PLAN.md`
- `docs/DEVELOPMENT_WORKFLOW.md`
- `.github/skills/phase-orchestrator/SKILL.md`
- `.github/skills/phase-code-review/SKILL.md`

## Secrets and Variables

Do not add production secrets during early phases merely to make CI pass.

Later staging/live phases may require repository/environment secrets such as Zalo staging credentials, staging database/Redis credentials and provider credentials. Use GitHub Secrets/Environments; never commit them.

Application provider credentials configured by the Admin product remain encrypted application data and are not automatically the same as CI secrets.

## Production Environment

Before production deployment, create a GitHub Environment named:

```text
production
```

Configure deployment protection so production requires explicit human approval. If the GitHub plan supports required reviewers for environments, enable them and prevent self-review where available.

Production credentials belong in the protected production environment, not ordinary repository variables.

## Recommended Staging Environment

Before Phase 24, create:

```text
staging
```

Use staging-only Zalo/provider/database/Redis credentials. Staging must never reuse production credentials where avoidable.

## Initial Verification Checklist

Before starting the autonomous agent:

- [ ] Repository default branch is `main`.
- [ ] Repository is not archived.
- [ ] Auto-merge is enabled.
- [ ] Squash merge is enabled.
- [ ] Delete branch on merge is enabled.
- [ ] GitHub Actions are enabled.
- [ ] Copilot Coding Agent has repository access.
- [ ] `main` protection/ruleset is active.
- [ ] Force pushes to `main` are blocked.
- [ ] Direct merge bypass by the autonomous agent is not allowed.
- [ ] Required checks are configured after their first successful run.
- [ ] Phase 0 starts from `.github/phase-state.json` with `currentPhase: 0` and `status: READY`.

Before Phase 24:

- [ ] `staging` environment exists.
- [ ] Staging credentials are configured.

Before production:

- [ ] `production` environment exists.
- [ ] Production deployment requires human approval.
- [ ] Production secrets are environment-scoped.

## Important Limitation

Repository skills and instructions define agent behavior, but GitHub repository settings enforce it. A long-running autonomous sequence also depends on GitHub Copilot Coding Agent's available task/session orchestration capabilities. If the agent cannot automatically continue after a merged PR, the repository must stop cleanly at the merged phase and the next Copilot task must be dispatched by a supported GitHub mechanism or by the user; never pretend a new task was started.
