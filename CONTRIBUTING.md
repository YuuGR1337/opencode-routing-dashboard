# Contributing

## Branch model
- `develop` – integration branch and **default**. Every PR targets `develop`. Squash-merge only.
- `main` – released code only. Updated by a release PR `develop` → `main`, then a `vX.Y.Z` tag.
- Work branches: `<type>/<issue>-<slug>`, type ∈ `feat`, `fix`, `chore`, `test`, `docs`, `refactor`
  (e.g. `feat/12-sse-tailer`). No issue yet? `<type>/<slug>`.
- Never push directly to `develop` or `main`. No force-push to shared branches. Rebase on `develop` only on real conflicts.
- One issue = one branch = one PR. Keep PRs small (aim < 400 lines of non-test code).

## Issues and planning
- Write issue titles and bodies in English. Use the bug form for defects, the task form for agreed work, and the proposal/research form for ideas still under evaluation. Include a goal, observable acceptance criteria, scope/exclusions and work type. Bugs also need reproduction steps, expected behavior and version.
- Submitting a proposal does not approve implementation, authorize repository access or schedule a release. Use synthetic or anonymized evidence, never secrets, real prompts or real session IDs.
- Report suspected vulnerabilities privately using [SECURITY.md](SECURITY.md), not public issues or PRs.
- Keep issue-linked decisions, scope/authorization changes, research findings, validation results and blockers/next steps in the associated issue as they arise and at handoff, not only in chat. Link sources/versions, PRs and verification evidence; distinguish source review, synthetic tests and runtime results. Publish only sanitized summaries, never raw personal logs, prompts, session IDs or secrets; use a maintainer-reviewed draft if publication is blocked. This record does not grant additional permissions or require creating an issue for every bounded task.
- Open issues are automatically added to the [repository project](https://github.com/users/crisesarmiento/projects/6) as `Todo` when created or updated. Triage `Decision` and `Work type` manually; automatic intake is not approval. If an issue is missing, check the [setup and verification steps](docs/REPOSITORY.md#native-issue-intake-maintainer-setup) before adding it manually.
- Set `Status` (`Todo`, `In Progress`, `Done`), `Decision` (`Under evaluation`, `Approved`) and `Work type`. `Todo` is backlog, not approval to implement. Research is a separate work type, not an approved product feature.
- Claim an issue before implementation and assign its owner. Move approved work to `In Progress`; mark `Done` only after acceptance and merge, or documented research closure.
- Approval and status are separate, and only the maintainer approves. When the maintainer decides to implement an issue, record `Decision: Approved` and the approved scope in the issue (a comment is enough). An agent never sets `Approved` on its own judgment or approves its own work; it may do so only to record an explicit maintainer instruction, quoting it in the issue. Until then the issue stays `Under evaluation` and nothing is implemented.
- Keep `Status` true to the work: `Todo` while it is only backlog, `In Progress` while someone is actively working, `Done` only after acceptance and merge. Agents may move the item they were told to work on to `In Progress` when starting, and back to `Todo` if work stops; they do not mark `Done` without the maintainer's merge or closure decision.
- Leave a short sanitized progress comment at each milestone (work started with the branch name, blocker or scope change, PR opened, review feedback addressed, merged), with the exact commands and exit statuses for any checks reported. Chat-only updates do not count.
- Assign a version milestone only when the maintainer approves scope for that release. Do not invent dates, priorities, owners or release commitments for proposals.
- Link the PR using `Closes #<issue>` and map acceptance criteria to evidence. Update `CHANGELOG.md` and `docs/PLAN.md` in the same PR.
- Use `Closes` only for delivered, accepted issue scope; link proposals with `Related to` when documenting a direction without implementing it. Explicit maintainer requests may authorize bounded work without an issue; do not create or approve unrelated proposals automatically.

Project-specific procedures are in `.agents/skills/`; see [agent workflows](docs/AGENT_WORKFLOWS.md) for canonical paths, verification ownership and dry-run cases. Skills guide agents; they do not grant access, override project policy or replace CI/permission enforcement. Product direction is tracked separately in [the roadmap](docs/ROADMAP.md) and [decision records](docs/decisions/README.md).

## Repository safeguards
- `develop` and `main` require a PR, the `check` CI result on an up-to-date branch, resolved review conversations and linear history. Force pushes and branch deletion are disabled; administrators are subject to protection too.
- Only squash merges are enabled. Zero external approvals are required while there is a sole maintainer: GitHub does not allow authors to approve their own PRs. This does not waive CI or the maintainer's review; agents must not merge their own PRs.
- GitHub settings are external state, not automatically applied by these files. See [repository administration](docs/REPOSITORY.md) for verification and maintenance.
- Dependabot proposes weekly Bun and GitHub Actions updates against `develop`; it does not merge them. Review compatibility, CI and lockfile changes before merging. Track a separate issue if an update needs product changes; adding a bot PR to the project is manual because issue auto-add excludes PRs.

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
