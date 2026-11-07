---
name: release
description: Cut a SemVer release (develop → main + vX.Y.Z tag). Only when the maintainer (Cristian) asks for a release.
---

# Release

## Permission and preflight

1. Require Cristian's explicit release request and distinguish preparation from publication. A request to prepare a release does not authorize an agent to merge, create/push tags, publish packages, or invoke a release workflow.
2. Inspect current directory, worktree, branch, local changes, remote branches and existing tags before mutation. Follow [branch-and-pr](../branch-and-pr/SKILL.md) for dirty worktrees and safe branch reuse. Do not switch another worktree or overwrite an existing release branch/tag.
3. Read [the release policy](../../../CONTRIBUTING.md), `package.json`, and `CHANGELOG.md`; inspect commits since the relevant prior release. If no prior release tag exists, inspect available history and the package/changelog baseline instead of executing a fabricated `vPREV` range. Propose the version and rationale for confirmation; do not infer approval for a particular version from this skill.

## Prepare and verify

4. Apply the documented SemVer policy: `feat` normally implies minor, `fix` patch, and breaking changes major (minor while 0.x). Release scope and maintainer judgment still matter. Reuse an existing preparation only after verifying version, base and PR; otherwise create `chore/release-vX.Y.Z` from current `develop` safely.
5. Move the appropriate `[Unreleased]` entries to the agreed version/date and update `package.json`. Do not modify dependencies or unrelated proposal status. Open the preparation PR to `develop` with exact local checks and final-head CI evidence, using [the PR template](../../../.github/pull_request_template.md).
6. After the maintainer merges preparation, prepare the `develop` → `main` PR titled `release: vX.Y.Z`. Verify its contents and version rather than assuming the branch has not changed. The maintainer merges; an agent does not merge its own PR.

## Publication handoff

7. The maintainer creates the annotated `vX.Y.Z` tag on the intended `main` commit and pushes it. Agents never create or push a release tag unless explicitly instructed to do so for that exact release. Stop if a tag already exists or the intended ref/version is unclear; never replace or force-push it.
8. Inspect the release workflow and resulting notes/assets. The ancestry guard is a technical safeguard, not proof of human authorization. A failed workflow is not publication success and does not authorize a different publishing path. Report what was prepared, merged or published separately, with URLs and remaining manual steps.

See [agent workflow guidance](../../../docs/AGENT_WORKFLOWS.md). Evaluation cases are dry-run reasoning only and must not publish releases.
