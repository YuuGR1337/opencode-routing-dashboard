---
name: branch-and-pr
description: Create the work branch and open the PR into develop with the template. Use when starting any issue or finishing implementation.
---

# Branch and PR

1. `git switch develop && git pull --ff-only && git switch -c <type>/<issue>-<slug>`.
2. Commit in small conventional commits. Never commit to `develop`/`main`; never force-push shared branches.
3. Before opening: `bun run typecheck && bun run lint && bun test` (paste commands + exit codes).
4. Add a line under `## [Unreleased]` in `CHANGELOG.md` for user-visible changes.
5. `gh pr create --base develop --fill-first` then edit the body with `.github/pull_request_template.md`:
   `Closes #<n>`, criteria → evidence table, failing-before/passing-after test, files touched, tests changed, screenshots if UI.
6. Review feedback: fix in new commits on the same branch; reply to each comment with the commit SHA. Do not merge your own PR.
