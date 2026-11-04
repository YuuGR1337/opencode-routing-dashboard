# Contributing

## Branch model
- `develop` – integration branch and **default**. Every PR targets `develop`. Squash-merge only.
- `main` – released code only. Updated by a release PR `develop` → `main`, then a `vX.Y.Z` tag.
- Work branches: `<type>/<issue>-<slug>`, type ∈ `feat`, `fix`, `chore`, `test`, `docs`, `refactor`
  (e.g. `feat/12-sse-tailer`). No issue yet? `<type>/<slug>`.
- Never push directly to `develop` or `main`. No force-push to shared branches. Rebase on `develop` only on real conflicts.
- One issue = one branch = one PR. Keep PRs small (aim < 400 lines of non-test code).

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
   tag matches `package.json`, runs CI and publishes a GitHub Release with the changelog section.
