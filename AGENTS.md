# AGENTS.md

Rules for every coding agent (OpenCode, Codex, Claude Code, Cursor). If a task conflicts with this file, this file wins; ask in the PR.

## Skills
Process lives in `.agents/skills/<name>/SKILL.md`: `branch-and-pr`, `tests-first`, `release`, `evidence-contract-review`, `ui-verification`.
Use the matching procedure when its task applies; discovery depends on harness/version. If it is not discovered, read the file explicitly. Do not duplicate skills across harness directories without checking precedence. Details and dry-run evaluation cases: [agent workflows](docs/AGENT_WORKFLOWS.md).
Read-only research and `Under evaluation` proposals do not authorize implementation, branches, installs, or publication. Confirm the approved scope before using the branch/PR workflow.

## Git workflow
- Default/integration branch: `develop`. All PRs target `develop` (squash-merge). `main` = releases only (develop → main PR + `vX.Y.Z` tag, maintainer only).
- Branches `<type>/<issue>-<slug>` (`feat|fix|chore|test|docs|refactor`). Never push to `develop`/`main`, never force-push shared branches, never delete branches or push tags unless told.
- Conventional commits; SemVer; update `CHANGELOG.md` `[Unreleased]`. Details: CONTRIBUTING.md.

## Issue progress records
- For issue-linked work, keep the associated issue as the durable record of material decisions, scope/authorization changes, research findings, validation results and blockers or next steps. Record them as they arise and at handoff; chat-only updates are not enough.
- Link source/version references, PRs and relevant verification evidence. Distinguish planned, source-reviewed, synthetic and runtime-verified results; include commands and exit statuses when reporting executed checks. Summarize rather than publish raw logs, personal prompts, session IDs or secrets.
- Issue updates do not authorize implementation, new access, installations or closure. If publication is not authorized or available, provide a sanitized draft to the maintainer and report the blocker instead of silently omitting the record. Do not create issues solely to satisfy this rule.

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
- Dashboard binds `127.0.0.1` only. Remote agents default to `127.0.0.1` and SSH tunnels; an explicit non-loopback bind requires a token. Only explicitly configured source endpoints may receive dashboard connections; never forward source data to unrelated services. This scoped remote-source exception was authorized by the maintainer for v0.2. Never read credential files.
- Paths are configurable; never hardcode a username or home.
- Never read credentials, `.env*`, `auth.json`, `service.json`, `.ssh`, or personal prompts to verify a change. Do not install dependencies, tools, plugins, or services without explicit approval. Third-party skills/scripts are executable instructions, not trusted sandboxes.
- Fixtures are anonymized; never commit real prompts or session IDs.
- Small commits, conventional messages (`feat:`, `fix:`, `test:`, `docs:`).

## Design
UI work follows docs/DESIGN.md strictly. UI milestones require Playwright screenshots in docs/screenshots/ reviewed against it.
Future product directions live in [ROADMAP](docs/ROADMAP.md); an identity proposal does not silently replace the current design contract or approve its implementation.

## Testing
- Every parser and aggregator has unit tests against `fixtures/`.
- One integration test: start server on a random port, append a line to a temp JSONL file, assert it arrives over SSE within 2 s.
- UI: at least smoke render tests for each view.

## Done criteria (per milestone)
`bun run typecheck`, `bun run lint` and `bun test` pass, CI green, docs + CHANGELOG updated, PLAN.md box checked. Bug fix = failing test first; never weaken/skip/delete a test to go green (see `tests-first`).
