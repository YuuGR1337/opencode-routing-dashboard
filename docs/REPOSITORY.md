# Repository administration

## Collaboration baseline

The default branch is `develop`; work PRs target it. Only release PRs go from
`develop` to `main`. Both branches require:

- A pull request, with zero required external approvals for a sole maintainer.
- The `check` status on an up-to-date branch (`strict: true`).
- Resolved review conversations and linear history.
- Administrator enforcement, no force pushes and no branch deletion.

Stale approvals are dismissed if reviews are used. Only squash merging is
enabled at repository level. Automatic branch deletion remains disabled.
There are no additional rulesets; branch protection supplies these safeguards.
Agents prepare PRs and evidence; the maintainer reviews and merges.
If another reviewer joins, consider requiring one external approval explicitly.

## Tracking work

Use the public [OpenCode Routing Dashboard project](https://github.com/users/crisesarmiento/projects/6),
linked to this repository. It tracks three independent fields:

| Field | Meaning |
| --- | --- |
| Status | `Todo` is backlog; `In Progress` is active work; `Done` requires accepted delivery or research closure. |
| Decision | `Under evaluation` does not authorize implementation; `Approved` records an explicit scope decision. |
| Work type | `feat`, `fix`, `chore`, `test`, `docs`, `refactor`, or `research`. |

Issue labels classify work (`bug`, `task`, `enhancement`, `documentation`, etc.).
Project fields do not replace the issue's goal, criteria, scope and dependencies.
Until native auto-add is enabled and verified using the steps below, add new
issues manually. `Decision` and `Work type` require manual triage; an empty
Decision is not approval. Closing an issue is not a substitute for checking its
acceptance evidence and project fields.

Assign owners when work is claimed. Create version milestones only for approved
release scope; proposals #4–#11 deliberately have no milestone or release date.
Keep version milestones, `package.json`, the changelog and release tags aligned.
No release schedule is implied by adding an issue to the project.

### Native issue intake (maintainer setup)

Auto-add activation is a GitHub web setting, not delivered by merging this file.
No custom Action or new project credential is configured. Activation and live
delivery still need maintainer confirmation.

1. Open project #6, then the top-right **… → Workflows** menu.
2. Select **Auto-add to project → Edit**.
3. Select repository `crisesarmiento/opencode-routing-dashboard`. In the adjacent
   filter, use `is:issue is:open` (the repository is a separate selector).
4. Click **Save and turn on workflow**.
5. Inspect **Item added to project** separately: if enabled, set Status to `Todo`.
   Do not infer implementation approval from automatic status changes.
6. Verify that the next real newly created or updated matching issue appears
   without a manual `item-add`. Record its URL as evidence. Keep approval and work
   type triage manual; do not open a fake vulnerability to test intake.

Enabling auto-add does not bulk-import existing items. Later matching creation
or update events can add them; manually add any existing issues still missing.
The issue-only filter does not add Dependabot or other PRs. Project status
workflows and custom approval fields are distinct from repository CI checks.

Reference: [GitHub auto-add documentation](https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/adding-items-automatically).

## Dependency update proposals

`.github/dependabot.yml` checks existing Bun dependencies and GitHub Actions
weekly on Mondays at 09:00 UTC. Both ecosystems target `develop` and allow at most
three open version-update PRs each, labeled `dependencies` with a `chore` commit
prefix. Bun uses the existing text `bun.lock`; no package manager migration,
dependency installation or version bump is part of this configuration.

The file becomes active on the default branch after merge. Verify the first
Dependabot run in GitHub's dependency graph/update UI and inspect any resulting
PR's target and lockfile changes. Local YAML validation cannot establish that a
hosted updater has run successfully. Dependabot security updates are a separate
feature targeting the default branch (`develop`); their enablement does not
replace this version-update schedule.

Auto-merge remains disabled. All update PRs require protected-branch CI and
maintainer review/merge, including major updates. Before merging, check release
notes and compatibility, update changelog evidence as appropriate, and rerun the
normal checks. Track a separate issue when an update needs product changes.
No private registry credentials or new services are configured.

Reference: [supported ecosystems, including Bun](https://docs.github.com/en/code-security/reference/supply-chain-security/supported-ecosystems-and-repositories).

## Templates, skills and checks

- `.github/ISSUE_TEMPLATE/`: bug/task/proposal forms; blank issues disabled. The `task`
  label must exist for the task form's label assignment.
- `.github/pull_request_template.md`: criteria/evidence, tests-first and completion checks.
- `.agents/skills/`: `branch-and-pr`, `tests-first`, `release` are committed guidance,
  not automatic enforcement by every agent host.
- `.github/workflows/ci.yml`: typecheck, lint and tests supply the required `check` result.
- `.github/workflows/release.yml`: version tags trigger release verification and
  publication. A tag's commit must be an ancestor of `origin/main`, not necessarily
  its current tip. The workflow also checks the package version and reruns checks.

## Private vulnerability reporting

GitHub private vulnerability reporting is enabled. [SECURITY.md](../SECURITY.md)
defines the disclosure route and safe reporting expectations without promising
response deadlines or historical-version support. The issue chooser links to
the private advisory form rather than requesting public vulnerability reports.

This setting is live GitHub state, not enabled by adding `SECURITY.md`. Verify it
with the API command below. Secret scanning, push protection and Dependabot are
separate controls; this change does not reconfigure them or add project automation.

## Verify live settings

These read-only commands inspect GitHub's actual state; local documentation does
not apply remote settings automatically:

```sh
gh api repos/crisesarmiento/opencode-routing-dashboard \
  --jq '{default_branch,allow_squash_merge,allow_merge_commit,allow_rebase_merge}'
gh api repos/crisesarmiento/opencode-routing-dashboard/branches/develop/protection
gh api repos/crisesarmiento/opencode-routing-dashboard/branches/main/protection
gh label list --repo crisesarmiento/opencode-routing-dashboard
gh project field-list 6 --owner crisesarmiento --format json
gh project item-list 6 --owner crisesarmiento --format json
gh api repos/crisesarmiento/opencode-routing-dashboard/milestones
gh api repos/crisesarmiento/opencode-routing-dashboard/private-vulnerability-reporting
```

When changing safeguards, inspect existing rules first, preserve unrelated
restrictions and verify the resulting API response. Do not disable checks or
administrator enforcement to bypass a failed PR. No new credentials, services,
dependencies or release publication are needed to maintain this baseline.
