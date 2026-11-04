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

### M2 — pure aggregation

- Red: `bun test test/aggregate.test.ts` → exit 1, 3 behavioral failures against `Not implemented`.
- Green: `bun test test/aggregate.test.ts` → exit 0, 3 tests.
- `bun run typecheck` → exit 0.
- `bun run lint` → exit 0.
- `bun test` → exit 0, 9 tests across 3 files.
- Fixtures establish context agreement 1/2 (50%), 87 tool failures, cost 435.43, separate observe/route confidence, retained null-key rows and unavailable execution/fallback fields. Repeated-key pairing and separator collisions are tested.
- The 10k join test passes; full server startup under one second remains an M6 runtime claim, not established by this unit test. PLAN sign-off awaits CI.

### M3 — live pipeline

- Tailer red: `bun test test/tail.test.ts` → exit 1 against stub; burst-queue regression also failed before correction (1000 distinct promises).
- Tailer green: `bun test test/tail.test.ts` → exit 0, 9 tests, including bounded/coalesced drains, split UTF-8, rotation, truncation and late creation.
- Config/stats/server initial red: `bun test test/config.test.ts test/stats.test.ts test/server.test.ts` → exit 1 against stubs. The original append/SSE test was added after implementation; later startup, kill/reap, argument/env and isolation regressions were verified failing before their fixes.
- `bun run typecheck` → exit 0.
- `bun run lint` → exit 0 after an import-order correction.
- `bun test` → exit 0, 33 tests across 7 files (11.64 s).
- Integration covers a random-port real server and temp JSONL append delivered over SSE within 1900 ms. A separate idle SSE check exceeds Bun's default ten-second timeout; the server disables that timeout explicitly.
- Static symlink escape, hostile Host, noncooperative stats runner, child SIGTERM resistance, stale timestamp retention and CLI network-control flags are covered.
- Gate regressions: default-size transport test failed at 32,300,476 bytes, then 19,891,585 after compact IDs; it passes unchanged at 16,771,931 bytes after explicit bounded detail windows. Tool failures no longer contaminate the log-diagnostics total.
- Retention regression: `bun test test/server.test.ts -t 'source retention'` → exit 1 before eviction bookkeeping, then exit 0 after correction.
- After gate corrections: `bun run typecheck` → exit 0; `bun run lint` → exit 0; `bun test` → exit 0, 38 tests across 7 files (11.78 s).

### OpenCode subprocess boundary

Source inspection of OpenCode's stats handler shows a local stats API call. Ensuring a standalone OpenCode server can otherwise initiate catalog downloads. The dashboard's child runs with `--standalone`, `OPENCODE_DISABLE_MODELS_FETCH=1`, `OPENCODE_DISABLE_AUTOUPDATE=1`, `OPENCODE_PURE=1`, `OPENCODE_DISABLE_LSP_DOWNLOAD=1`, and no `OTEL_EXPORTER_*` environment variables.

These are child-process controls, not an OS network sandbox or control of unrelated OpenCode services. Installed plugins and upstream CLI behavior remain external trust boundaries; fixture/file mode never spawns the CLI. No stats were executed on real user data during verification.
