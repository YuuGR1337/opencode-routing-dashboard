# Verification evidence

All fixtures are anonymized. Checks run on the feature branch; no real logs or credential files are used.

## Evidence path

- M1: fixture parsers, malformed and nested-input rejection, unknown-field retention; failing test before implementation.
- M2: deterministic joins, context-only agreement, unavailable execution/fallback fields, stats totals and errors.
- M3: temporary JSONL append reaches a random-port SSE connection within two seconds; late creation, cleanup, loopback binding, poller failure handling.
- M4a/M4: smoke render tests and live fixture screenshots at 1440×900 and 1024×768, reviewed against DESIGN.
- M5: fixture-based snapshot scheduling and loading, CLI help and documented service setup.
- M6: rotation, truncation, partial lines and 10k-line startup; production start, curl state/events, socket inspection and browser loading.

The orchestrator owns milestone-wide typecheck, lint and tests after reconciling writers. Specialists own focused red/green tests. Final CI and runtime evidence supplement, not replace, local tests.

## Milestone results

### M1 — parsers

- Red: `bun test test/schema.test.ts` → exit 1 before the parser module existed (missing implementation; no runtime behavioral red captured at that stage).
- Green: `bun test test/schema.test.ts` → exit 0, 5 tests.
- `bun run typecheck` → exit 0.
- `bun run lint` → exit 0.
- `bun test` → exit 0, 6 tests across 2 files.
- Reviewed source guards and tests: malformed JSON and nested invalid fields reject; unknown fields survive; fixture exception records and optional scores parse.
- `activity` remains an opaque array because its element schema is not documented. PLAN sign-off awaits branch CI, as required by AGENTS.md.
