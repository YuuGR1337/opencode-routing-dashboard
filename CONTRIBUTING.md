# Contributing

## Branch model
- `develop` – integration branch and **default**. Every PR targets `develop`. Squash-merge only.
- `main` – released code only. Updated by a release PR `develop` → `main`, then a `vX.Y.Z` tag.
- Work branches: `<type>/<issue>-<slug>`, type ∈ `feat`, `fix`, `chore`, `test`, `docs`, `refactor`
  (e.g. `feat/12-sse-tailer`). No issue yet? `<type>/<slug>`.
- Never push directly to `develop` or `main`. No force-push to shared branches. Rebase on `develop` only on real conflicts.
- One issue = one branch = one PR. Keep PRs small (aim < 400 lines of non-test code).

## Issues and planning
- Write issue titles and bodies in English. Use the bug or task form; include a goal, observable acceptance criteria, scope/exclusions and work type. Bugs also need reproduction steps, expected behavior and version.
- Add each issue to the [repository project](https://github.com/users/crisesarmiento/projects/6). Addition is manual, not automated.
- Set `Status` (`Todo`, `In Progress`, `Done`), `Decision` (`Under evaluation`, `Approved`) and `Work type`. `Todo` is backlog, not approval to implement. Research is a separate work type, not an approved product feature.
- Claim an issue before implementation and assign its owner. Move approved work to `In Progress`; mark `Done` only after acceptance and merge, or documented research closure.
- Assign a version milestone only when the maintainer approves scope for that release. Do not invent dates, priorities, owners or release commitments for proposals.
- Link the PR using `Closes #<issue>` and map acceptance criteria to evidence. Update `CHANGELOG.md` and `docs/PLAN.md` in the same PR.

## Repository safeguards
- `develop` and `main` require a PR, the `check` CI result on an up-to-date branch, resolved review conversations and linear history. Force pushes and branch deletion are disabled; administrators are subject to protection too.
- Only squash merges are enabled. Zero external approvals are required while there is a sole maintainer: GitHub does not allow authors to approve their own PRs. This does not waive CI or the maintainer's review; agents must not merge their own PRs.
- GitHub settings are external state, not automatically applied by these files. See [repository administration](docs/REPOSITORY.md) for verification and maintenance.

## Commits
[Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `docs:`, `test:`, `chore:`, `refactor:`, `perf:`, `ci:`.
`BREAKING CHANGE:` footer or `!` bumps major (minor while < 1.0).

## Tests are guardrails
- Bug fix = failing test first. New behavior = test that would fail without it.
- Never weaken, skip or delete a test to make it pass; change the implementation, or stop and ask in the PR.
- `bun run typecheck`, `bun run lint`, `bun test` must pass locally and in CI.

## Definition of done
1. Acceptance criteria of the issue mapped to a test or manual step in the PR.
2. Typecheck, lint and tests green locally and in CI.
3. Docs (SPEC/DESIGN/ARCHITECTURE/PLAN/CHANGELOG `[Unreleased]`) updated in the same PR, or "N/A: reason".
4. UI changes: screenshots in `docs/screenshots/`, reviewed against `docs/DESIGN.md`.

## Releases (maintainer)
1. On `develop`: move `[Unreleased]` entries to `## [X.Y.Z] - YYYY-MM-DD`, bump `package.json` version (`chore(release): vX.Y.Z`).
2. PR `develop` → `main`, merge.
3. Tag on `main`: `git tag -a vX.Y.Z -m vX.Y.Z && git push origin vX.Y.Z`. The `release` workflow verifies the
   tagged commit belongs to `main` history and the tag matches `package.json`, runs CI and publishes a GitHub Release with the changelog section.
