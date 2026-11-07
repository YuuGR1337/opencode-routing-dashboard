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
New issues must be added and maintained manually: no project auto-add or status
synchronization has been configured. Closing an issue is not a substitute for
checking its acceptance evidence and project fields.

Assign owners when work is claimed. Create version milestones only for approved
release scope; proposals #4–#11 deliberately have no milestone or release date.
Keep version milestones, `package.json`, the changelog and release tags aligned.
No release schedule is implied by adding an issue to the project.

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
