# AGENTS.md

Rules for every coding agent (OpenCode, Codex, Claude Code, Cursor). If a task conflicts with this file, this file wins; ask in the PR.

## Skills
Process lives in `.agents/skills/<name>/SKILL.md`: `branch-and-pr`, `tests-first`, `release`.
If your agent does not auto-load `.agents/skills` (Claude Code does not), read the matching SKILL.md before starting.

## Git workflow
- Default/integration branch: `develop`. All PRs target `develop` (squash-merge). `main` = releases only (develop → main PR + `vX.Y.Z` tag, maintainer only).
- Branches `<type>/<issue>-<slug>` (`feat|fix|chore|test|docs|refactor`). Never push to `develop`/`main`, never force-push shared branches, never delete branches or push tags unless told.
- Conventional commits; SemVer; update `CHANGELOG.md` `[Unreleased]`. Details: CONTRIBUTING.md.

## Stack
Bun (>=1.2) + TypeScript (strict) + React. Server: `Bun.serve` with SSE. No database; state is derived from files.

## Commands
- `bun install`
- `bun run dev` – server + client with watch
- `bun run start` – production server on 127.0.0.1
- `bun test` – unit + integration tests (fixtures in `fixtures/`)
- `bun run typecheck` – `tsc --noEmit`
- `bun run lint` – Biome
- `bun run build` – bundle client

## Conventions
- Parse every external input (JSONL lines, `opencode stats --json`) at the boundary with a schema; unknown fields are kept, malformed lines are counted and skipped, never crash.
- Pure functions for aggregation in `src/core/`; IO only in `src/server/` and `src/sources/`.
- Bind `127.0.0.1` only. Never send data off the machine. Never read credential files.
- Paths are configurable; never hardcode a username or home.
- Fixtures are anonymized; never commit real prompts or session IDs.
- Small commits, conventional messages (`feat:`, `fix:`, `test:`, `docs:`).

## Design
UI work follows docs/DESIGN.md strictly. UI milestones require Playwright screenshots in docs/screenshots/ reviewed against it.

## Testing
- Every parser and aggregator has unit tests against `fixtures/`.
- One integration test: start server on a random port, append a line to a temp JSONL file, assert it arrives over SSE within 2 s.
- UI: at least smoke render tests for each view.

## Done criteria (per milestone)
`bun run typecheck`, `bun run lint` and `bun test` pass, CI green, docs + CHANGELOG updated, PLAN.md box checked. Bug fix = failing test first; never weaken/skip/delete a test to go green (see `tests-first`).
