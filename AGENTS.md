# AGENTS.md

## Stack
Bun (>=1.2) + TypeScript (strict) + React. Server: `Bun.serve` with SSE. No database; state is derived from files.

## Commands
- `bun install`
- `bun run dev` – server + client with watch
- `bun run start` – production server on 127.0.0.1
- `bun test` – unit + integration tests (fixtures in `fixtures/`)
- `bun run typecheck` – `tsc --noEmit`
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
`bun run typecheck` and `bun test` pass, CI green, README/SPEC updated, PLAN.md box checked.
