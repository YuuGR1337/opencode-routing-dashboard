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

### M4a — switchboard shell

- Shell red: `bun test test/ui-shell.test.tsx` → exit 1, 13 failures against throwing component and placeholder CSS. Green: same command → exit 0, 13 tests.
- Client red/green: `bun test test/client.test.ts` → exit 1 before decode/reconnect behavior; final focused run exit 0, 5 tests. A reconnect snapshot resets the sequence baseline and a late HTTP response cannot overwrite SSE.
- `bun run typecheck` → exit 0.
- `bun run lint` → exit 0, including scripts after expanding Biome's include scope.
- `bun test` → exit 0, 56 tests across 9 files (11.81 s).
- `bun run build` → exit 0.
- Clean build screenshots: `m4a-{empty,live,detail}-{1440x900,1024x768}.png` and `m4a-arrival-motion-1440x900.png`. Fixture files were replayed live into a temporary directory with `ORD_DEMO=true` and `ORD_STATS_FILE=fixtures/stats.json`.
- Opened/reviewed live screenshots at both sizes after the final clean build; empty/detail/arrival layouts were also reviewed, with no rendering changes in the recapture. Approved deviations are listed in DESIGN.md.
- Browser evidence: used IBM Plex Mono and Instrument Sans weights load locally, no CSP errors, failed requests, page errors or favicon 404s in captures. Arrival evidence is a mid-motion screenshot and observed motion-element counts 0 → 3 → 0, not a frame-rate benchmark.

### M4 — views and filtering

- View red: `bun test test/views.test.tsx` → exit 1, 18 behavioral failures against stubs/missing M4 behavior.
- Focused green: `bun test test/views.test.tsx test/ui-shell.test.tsx test/filters.test.ts` → exit 0, 35 tests.
- Filters red: `bun test test/filters.test.ts` → exit 1 against stub; green → exit 0, 4 tests.
- `bun run typecheck` → exit 0; `bun run lint` → exit 0; `bun test` → exit 0, 78 tests across 11 files (11.86 s); `bun run build` → exit 0.
- Existing shell assertion that drawers were disabled until M4 was replaced with the stronger completed-behavior assertion that buttons are enabled and correctly associated with drawers. No other tests weakened, skipped or deleted.
- Designer's 90 browser checks passed across both viewport sizes: filters/search/clear/time range/errors, shortcuts, row detail, focus restoration and drawer switching. No console/page errors or failed requests.
- Opened/reviewed all five view screenshots at both sizes. Sixteen M4 captures include detail, matching filter and no-match filter states. Approved layout adaptations are in DESIGN.md.
- Populated History is unit-tested using explicit demo-fixture snapshots; its runtime source and populated screenshots remain M5 work. Timeout detail counts explicitly describe sent events, not the entire retained window.
- Gate regressions: `node /tmp/m4a/gate.mjs http://127.0.0.1:47853 docs/screenshots <temporary-state-dir>` → exit 1, 8/19 checks before the fixes; same script after correction → exit 0, 19/19. The checks cover Enter on focused buttons and time-window expiration with Playwright's clock and no new SSE delta. Red console output was observed, not retained as a separate file.
- Final focused green: `bun test test/views.test.tsx test/ui-shell.test.tsx test/filters.test.ts test/clock.test.ts` → exit 0, 41 tests. The pure clock excludes session-only route exceptions from prompt counts.
- Final reconciled checks: `bun run typecheck` → exit 0; `bun run lint` → exit 0; `bun test` → exit 0, 84 tests across 12 files (11.87 s); `bun run build` → exit 0.
- All sixteen M4 screenshots were recaptured with the source-backed final readout, `last 60 s`. The 90-check interaction script passed again. Lower-bound readout markup is unit-tested, not separately screenshotted.

### M5 — snapshots and operations

- Snapshot red: `bun test test/snapshots.test.ts` → exit 1 against stub. Green: `bun test test/snapshots.test.ts test/server.test.ts` → exit 0, 13 tests.
- CLI red: `bun test test/cli.test.ts` → exit 1, 3 expected behavior failures before command implementation; green → exit 0, 4 tests.
- History-status boundary regression: `bun test test/client.test.ts -t 'malformed nested'` → exit 1 before validation, then `bun test test/client.test.ts` → exit 0, 5 tests.
- `bun run typecheck` → exit 0; `bun run lint` → exit 0; `bun test` → exit 0, 98 tests across 14 files (12.02 s); `bun run build` → exit 0.
- `bun pm pack --destination /tmp/opencode --quiet` → exit 0. Reviewed archive inventory and executable permissions: runtime source, built assets, fonts/licenses and systemd examples included; fixtures/tests/node_modules/secrets excluded. Version stays 0.1.0; no registry publish, service install or release occurred.
- History is loaded from actual temporary snapshot files. The current-week file was produced by `bun run snapshot -- --snapshot-dir /tmp/m5/snapshots --stats-file fixtures/stats.json` → exit 0. Older points are explicitly synthetic anonymized demo clones, not real history.
- Screenshots `m5-history-{empty,populated}-{1440x900,1024x768}.png` were captured from a normal source-backed build with fixture replay and reviewed. No console/network/CSP errors. Source path, snapshot counts, individual ranges and absence of inferred weekly deltas are visible; a later copy-only clarification says ranges *may* differ or overlap.
- Roundtrip, concurrent no-overwrite publication, schema/date/symlink validation, byte/count caps, missing directory, fixture snapshot command and live server history refresh are tested. Timer cleanup exists but has no dedicated M5 assertion; add to final hardening if materially changed.
