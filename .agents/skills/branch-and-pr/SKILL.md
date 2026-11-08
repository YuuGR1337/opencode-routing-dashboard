---
name: branch-and-pr
description: Start explicitly approved implementation or documentation work and prepare its PR to develop. Use for branch/PR preparation, not read-only research, proposal triage, or brainstorming.
---

# Branch and PR

## Preflight

1. Confirm the maintainer authorized this scope. An open issue, `Todo`, or a research request is not implementation approval. For issue-backed work, check its body and project `Decision`; resolve missing or conflicting approval before coding. A direct request can authorize a bounded task without an issue; do not approve unrelated proposals or create an issue just to satisfy this workflow.
   If the maintainer explicitly tells you to implement an `Under evaluation` issue, that instruction is the approval: quote it in an issue comment, then set `Decision: Approved` only for the scope they named. Never approve on your own judgment.
   When you start, move the issue's project `Status` to `In Progress` (and post a short start comment with the branch name); if work stops or is blocked, say so and return it to `Todo`. Do not mark `Done` yourself; that follows the maintainer's merge or closure.
2. Read [repository rules](../../../AGENTS.md) and [contribution policy](../../../CONTRIBUTING.md). Inspect `pwd`, `git status --short`, current branch, remotes, and `git worktree list` before changing branches.
3. If there are unrelated local changes, stop and ask how to preserve them. Do not stash, reset, clean, overwrite, or switch them away automatically. Reuse an existing task branch/PR only after confirming its identity and base; do not create duplicates.

## Branch and implement

4. Fetch `origin develop` and verify the starting point. On a clean worktree where `develop` is available, use `git switch develop`, `git pull --ff-only`, then `git switch -c <type>/<issue>-<slug>`. If another worktree owns `develop`, create the task branch directly from the fetched `origin/develop` instead of switching or moving that worktree. Without an issue, use `<type>/<slug>`. Stop on divergence or an unexpected existing branch rather than forcing it.
5. Make small conventional commits. Never commit or push to `develop`/`main`, force-push shared branches, or merge your own PR. Do not move another agent's worktree.
6. Follow [tests-first](../tests-first/SKILL.md) for behavior changes. Update `CHANGELOG.md` `[Unreleased]` and `docs/PLAN.md` as required by the contribution policy; explain any documentation N/A rather than marking unrelated roadmap features complete.

## Verify and open

7. Use focused checks while iterating, then run the final integrated `bun run typecheck`, `bun run lint`, and `bun test` once the writers are reconciled. Include `bun run build` for changed assets/build integration or when required by the task. Record exact commands, exit codes, relevant failures, and skipped checks. Later edits invalidate affected evidence; recheck proportionately without dropping required gates.
8. Prepare the complete body from [the PR template](../../../.github/pull_request_template.md) before creating the PR. Map criteria to evidence, list files and test changes, and distinguish static checks from behavioral evaluation. Use `Closes #<n>` only for an issue whose accepted scope is actually delivered; otherwise use `Related to #<n>` or explain that there is no closing issue. Do not leave `Closes #` as a placeholder.
9. Push only the task branch. Open with `gh pr create --base develop --title "<conventional title>" --body-file <prepared-body-path>`, or update the verified existing PR. Do not publish a provisional body through `--fill-first`. Inspect final-head CI; pending or failed checks are not green acceptance.
   Post a sanitized issue comment when the PR opens (PR link, criteria-to-evidence summary, exact commands with exit statuses, skipped checks). Update it again on blockers or scope changes.
10. Address review on the same branch with new commits and reply with evidence. The maintainer reviews and merges. No tags, release publication, new permissions, or dependency installation is implied by preparing a PR.

See [agent workflow guidance](../../../docs/AGENT_WORKFLOWS.md) for discovery, evaluation cases, and verification ownership.
