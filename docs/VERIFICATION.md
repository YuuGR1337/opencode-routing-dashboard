# Verification evidence

All fixtures are anonymized. Checks run on the feature branch; no real logs or credential files are used.

## Lane Bay bounded identity (#33)

Scope approval: [maintainer decision](https://github.com/crisesarmiento/opencode-routing-dashboard/issues/33#issuecomment-6715778224), after accepted DESIGN revision [#39](https://github.com/crisesarmiento/opencode-routing-dashboard/pull/39). The detailed browser-payload rejection counter belongs in Errors; the ticker retains a compact intake summary. No parser, aggregator, server, source, transport contract, dependency or font change is included.

### Tests-first and integrated checks

- Initial focused red: `bun --no-env-file test test/lane-bay.test.tsx test/ui-shell.test.tsx test/views.test.tsx` → exit 1, 35 pass / 17 fail on the new presentation/behavior assertions. Focused green after implementation: exit 0, 52 pass. Later focused reds cover aggregate source attribution, focus error/context fields, responsive containment, long-title access, model bars and the event-row focus target; each passed after its bounded correction.
- Existing presentation tests explicitly adopt the accepted token values, state SVG shapes, ticker column tiers and aggregate wording. The ticker-alert helper now locates the outer ticker section rather than the relocated inner keyboard target; its alert-scope assertions are unchanged. No test was deleted, skipped or weakened. The font-size ceiling remains.
- Reconciled local checks: `bun --no-env-file run typecheck` → exit 0; `bun --no-env-file run lint` → exit 0; `bun --no-env-file test` → exit 0, **283 pass / 0 fail / 40 files**; `bun --no-env-file scripts/build.ts` → exit 0; `git diff --check` → exit 0. Direct build invocation prevents automatic dotenv loading. Implementation-head CI is a separate gate recorded on the PR; later documentation-only sign-off reuses unchanged runtime evidence.

### Isolated browser verification

The canonical fixture server uses fresh temporary copies of the three JSONL files and `stats.json`, an empty temporary HOME, explicit observe/route/permissions/stats/snapshot paths, `ORD_DEMO=true`, `ORD_PORT=0`, and `bun --no-env-file src/cli.ts` against the completed build. Only loopback is bound; no OpenCode stats child or personal browser profile is used. The maintainer separately authorized temporary **Playwright 1.65.0** under `/tmp/opencode`, installed with lifecycle scripts disabled and isolated npm configuration; the project dependency manifest/lockfile is unchanged. Existing `/usr/bin/chromium` is used; no browser is installed.

Executed command (owned paths abbreviated, not personal data):

```sh
PLAYWRIGHT_MODULE_PATH=<temporary-tools>/node_modules/playwright/index.mjs \
CHROMIUM_PATH=/usr/bin/chromium \
node scripts/verify-ui.mjs --url http://127.0.0.1:37931 \
  --state-dir <temporary-canonical-state> \
  --screenshots-dir /tmp/opencode/ord-m33-evidence/screenshots-reconciled \
  --report /tmp/opencode/ord-m33-evidence/ui-reconciled.json --exchange yes
```

- **Exit 0, 208 passed / 0 failed / 0 skipped.** Canonical and controlled-exchange datasets remain separate. The Lane Bay controlled snapshots validate before reaching the intended rendered state; they do not establish real source transport. Combined controlled state now clears all stats-derived usage/model/tool totals, not only `stats`, preventing false financial evidence. Selected PC retains its own stats; Orca/local unknown stats remain unknown.
- First browser pass: exit 1, 187/198 passed, exposing real filter/bay clipping plus harness assumptions. Second pass: exit 1, 192/196 passed. These were not accepted captures. Reconciliation fixed stale rail-width expectations, below-viewport text checks, asynchronous focus/counter assertions and a false-positive Tab check. The latter exposed a genuine focus-target gap: `#ticker` now names the event-row scroll region after the filters. A final harness attempt exposed its missing explicit `j` selection precondition; after adding that action, the complete run above passed.
- Covered: source/filter resets and selection/replay coherence; drawers, raw detail and Escape focus return; actual Tab traversal to event rows and selected-row 2 px ring; rejected-payload detail in Errors; role/evidence separation; responsive columns, full rows and controls; long ticker disclosures reachable at both scroll extremes by keyboard; actual arrival animation under normal/reduced motion; fonts/CSP and console/page/network checks. Normal title overflow is intentional containment, not hidden evidence.
- Design review opened all eight final `docs/screenshots/m33-{populated,empty,partial,error}-{1440x900,1024x768}.png` captures. DEMO is visible throughout. Measured chrome is 162 px; stage is 490/398 px with grid tracks 300/840/300 and 256/536/232; ticker is 248/208 px, filters 26/52 px, data rows 22 px, 8/5 complete visible rows. Separate isolated alert measurements are 468/376 px stage and 270/230 px ticker. The aggregate frame is inset 4 px inside its grid track.
- Intentional adaptations: scrollable bay body preserves access to all five role jacks/tally rows; replay/focus/legend do not shrink; long compact focus lines and the 24 px ticker title scroll horizontally. The title retains its own keyboard stop; event rows follow filters. Redundant narrow scope diagnostic text can exceed the strip width; the full stats limitation remains visible in the aggregate rail. Timestamps remain local, with a timezone tooltip rather than a false UTC suffix.
- Owned canonical servers were stopped; `ss -ltnp '( sport = :36669 or sport = :36741 or sport = :37931 )'` → exit 0, no listeners. Temporary reports stay outside the repository; only reviewed screenshots are committed.

### Separate real loopback demo transport

`node /tmp/opencode/validate-demo-transport.mjs` → exit 0. This owned temporary verifier started `bun --no-env-file scripts/demo-exchange.ts --port 0 --live --duration 25 --keep` with isolated HOME/XDG and verified `dist/index.html` already existed, so no implicit build occurred. The valid DEMO snapshot contained local/PC/Orca (4/8/5 events), PC and local stats with distinct ranges, Orca stats disabled, and no combined financial sum. A real PC-agent append increased its count from 8 to 9 over dashboard SSE. Shutdown exit 0; no owned listeners remained. Summary: `/tmp/opencode/ord-m33-evidence/demo-transport.json`. Initial diagnostic helper errors are not used as successful evidence.

**Limits:** controlled error/connecting/stale screenshots are not a real browser disconnect/reconnect test (#24). The real demo establishes loopback fixture transport, not physical hosts or runtime delegation. No macOS, screen-reader, accessibility-compliance, general comprehension or production-performance claim follows. New-user comprehension remains unrun. #23 stays open; #24/#25/#27/#31 remain independent.

## OpenCode 2.2.6 baseline check (2026-11-07)

Maintainer decision: use the installed, newest OpenCode 2.2.6 as the verification baseline. Same method as the 2.2.5 check, run against the compiled `@opencode/cli` 2.2.6 binary (the mise wrapper script was bypassed for the token scan).

- `opencode --version` → `opencode v2.2.6`, exit 0. `stats --help` → exit 0 and lists `--json`, `--models`, `--tools`, `--cost`; global `--standalone` is still documented as a private server instead of the background service.
- Binary `OPENCODE_*` token list: 54 entries, the 2.2.5 list plus `OPENCODE_FLAGS`. `OPENCODE_PURE` is still absent. `OPENCODE_DISABLE_MODELS_FETCH` and `OPENCODE_DISABLE_AUTOUPDATE` are present. **`OPENCODE_DISABLE_LSP_DOWNLOAD` is absent in both 2.2.5 and 2.2.6**; the 2.2.5 check above did not report this. It was then removed from the stats child, using the same tests-first procedure as `OPENCODE_PURE` (see below).
- Ran `stats --json --models --tools --cost --standalone` with `env -i`, a fresh empty HOME, all XDG roots in a new temporary directory and the three child variables set. Exit 0 within a 25-second `timeout`. `parseStats` accepted the 505-byte output: sessions 0, steps 0, models 0, with the same top-level keys as SPEC. The temporary directory was then deleted.
- `debug paths` (portable `~` notation) → exit 0. The output is identical to 2.2.5 and matches ARCHITECTURE.md.
- Retry telemetry source comparison v2.2.5 (`9bbb8ce`) → v2.2.6 (`dc2ffcf`): the `session.retry.scheduled` schema, the retry runner, the `SessionRetry` hook type and the SSE event handler are unchanged. `model-retry.ts` adds a separate retry budget of up to 1 h for network-unreachable failures. Details are in issue #6.
- LSP-variable removal: red `bun test test/stats.test.ts` → exit 1, 5 pass / 1 fail, because the child still received the variable (`Expected: false`, `Received: true`). After it was removed and any inherited value stripped, the same command passed (see the fix PR). The stats child now sets only `OPENCODE_DISABLE_MODELS_FETCH` and `OPENCODE_DISABLE_AUTOUPDATE`; both are present in the binary, though their runtime effect is not otherwise verified.
- As before, this verifies the executable and its empty-profile contract, **not real user statistics**. No credentials, real prompts, user session IDs or personal logs were read, and no provider was called.

## Agent guidance and roadmap maintenance (2026-11-07)

This change adds contributor procedures, documentation and static artifact tests only. It does not implement the proposed identity, Electron app, service lifecycle, diagnostics, multi-harness integration, or evidence features; it grants no new access and installs no external skill/dependency.

- Structural red: copy the final `test/agent-guidance.test.ts` into an isolated pre-change `origin/develop` artifact tree and run `bun --no-env-file test test-agent-guidance.test.ts` there → exit 1, three failures on missing new skills/docs/cases. The original first capture also showed absent artifacts but its shell pipeline recorded the wrong status; it is not used as exit-code evidence. The isolated rerun records the actual exit 1. This is an artifact-contract red, not a runtime behavioral regression.
- Reconciled green: `bun --no-env-file run typecheck` → exit 0; `bun --no-env-file run lint` → exit 0; `bun --no-env-file test` → exit 0, **256 tests / 39 files**, no failures; `bun --no-env-file scripts/build.ts` → exit 0; `git diff --check` → exit 0. The build invokes the same script as `bun run build` directly so automatic dotenv loading stays disabled in the Bun invocation.
- The three new Bun tests check canonical skill metadata, existing local Markdown targets, and ten dry-run case structures/settings/graders. They do not prove YAML support beyond the checked subset, external-link availability, automatic skill discovery, model compliance, safety enforcement, or skill effectiveness.
- Isolated guard probes: a copy of the final public guidance artifacts passes the three focused tests (exit 0); removing required whitespace from a prompt-setting separator fails (exit 1), and removing a required case directory fails (exit 1). These probes mutate only an owned temporary copy, not working files. Final focused run passes all three tests (exit 0).
- [Qualitative evaluation](AGENT_EVALUATION.md): two paired reasoning scenarios, with and without explicit skill loading; the UI lane was revalidated after procedural clarification. Both baselines already identified important safety boundaries. The skill-informed UI response named more repository-specific harness limits, but the small, partly guided sample establishes no general performance gain. Other cases and automatic triggering remain unverified. A static local viewer was generated from the four responses with existing skill-creator tooling; no server or additional dependency was needed, and no human viewer-feedback round is claimed.
- Procedure review checked the existing verifier and demo scripts: canonical/exchange dataset separation, implicit demo builds, simulated EventSource coverage, viewport gaps, fixed screenshot names, replay versus live pause, and reduced-motion assertion limits are now explicit. No new browser/desktop runtime, screenshot, accessibility-compliance, or cross-platform validation was performed for this guidance-only change. Existing runtime evidence below is historical, not a fresh run.
- Final-head CI and maintainer merge remain separate gates, recorded on the PR. No release/tag is created and no proposal is marked Approved by this maintenance work.
- Implementation-head CI passed for `e39272112a771af509751d01070c37b88e4d3d25`: [check run](https://github.com/crisesarmiento/opencode-routing-dashboard/actions/runs/42415764719/job/128533386721). PLAN sign-off changes only documentation; focused guidance checks are revalidated and final-head CI is checked again on PR #30. The unchanged runtime/test-code evidence above is reused, not presented as a second full local run.

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

The original v0.1 verification used `--standalone`, feature-specific download controls and `OPENCODE_PURE`. The v0.2 installed-build check below confirms `--standalone` but finds no support for `OPENCODE_PURE`, which is now removed. Feature-specific controls and exporter stripping are not an OS network sandbox.

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

### M6 — final hardening

- Source-path red: config/server tests failed before the new overrides. `bun test test/config.test.ts test/server.test.ts test/performance.test.ts` → exit 0, 16 tests after implementation.
- Core prompt-count regression: `bun test test/aggregate.test.ts -t 'fixture evidence'` → exit 1 (4 instead of 3); `bun test test/aggregate.test.ts` → exit 0, 7 tests after excluding session-only exceptions.
- `bun test test/performance.test.ts` → exit 0; focused startApp-to-HTTP measurement 86.49 ms, under 1000 ms, 10k fixture-derived records. Snapshot is below 16 MiB and a new append arrives within 1900 ms.
- Independent cold-process check: `ORD_STATE_DIR=<temporary-10000-lines> ORD_STATS_ENABLED=false ORD_PORT=0 bun run start` → exit 0, 175.99 ms from spawn through build/start to parsed HTTP state, retained/sent 10000. Result saved during verification to `/tmp/opencode/ord-cold-start.json`.
- Portable verifier syntax/help and Biome → exit 0. Its first real run exposed a test-only assumption about Escape clearing a search field; corrected without force-clicking a disabled button. Real read-only and append runs then passed.
- Final reconciled checks: `bun run typecheck` → exit 0; `bun run lint` → exit 0; `bun test` → exit 0, 103 tests across 15 files (12.56 s); `bun run build` → exit 0; `git diff --check` → exit 0.

## Real production-command verification

Started the actual command with `ORD_STATE_DIR=fixtures ORD_STATS_FILE=fixtures/stats.json ORD_DEMO=true ORD_PORT=47877 bun run start` (no real user logs or CLI stats).

- `curl --fail http://127.0.0.1:47877/api/state` → exit 0: `events: 4`, context agreement `50`, malformed observe `1`, log diagnostics total `3`; stats initially load asynchronously rather than delaying the listener.
- `curl --fail http://127.0.0.1:47877/` → exit 0, HTTP 200. `/main.js` and `/assets/fonts.css` → exit 0, HTTP 200.
- `curl --max-time 2 -N http://127.0.0.1:47877/api/events` → exit 28, **expected** for a deliberately open SSE stream. Received 7805 bytes beginning `event: snapshot`; parsed envelope `seq: 1`, `demo: true`, `events: 4`. Snapshot assertion → exit 0.
- `ss -ltnp 'sport = :47877'` → exit 0: `LISTEN ... 127.0.0.1:47877 ... users:(("bun",...))`; no wildcard or IPv6 listener.

Final browser verification used a separate temporary copy of fixtures and the same `bun run start` command, not tracked fixture mutation:

```sh
PLAYWRIGHT_MODULE_PATH=<existing-playwright>/index.mjs CHROMIUM_PATH=/usr/bin/chromium \
  node scripts/verify-ui.mjs --url http://127.0.0.1:47878 \
  --state-dir <temporary-demo-directory> --report /tmp/opencode/ord-final-ui.json
```

- Exit 0; **32 passed, 0 failed, 0 skipped**, including views, filters, focused-button Enter, page-clock expiration without deltas, local fonts/CSP, same-origin requests, reduced-motion CSS, >10/s burst collapse and the 300-row render limit.
- After the verifier's 320 synthetic demo appends: state curl exit 0, `events: 324`, stats status `ok`, usage cost `435.43`, tool failures `87`, malformed observe `1`, permissions retained `3`. No real data was written.
- Both verification process groups were stopped. `ss -ltnp '( sport = :47877 or sport = :47878 )'` → exit 0, no listeners.
- Final operations/security gate: PASS after read-only review of atomic persistence, loader bounds, source overrides, package-relative assets and shutdown. Ranked limitations and process evidence gaps are in KNOWN_ISSUES.md.

## Branch CI and milestone sign-off

`gh pr checks 2 --watch --fail-fast` → exit 0, 1 check passed / 0 failed for implementation head `8d3f49554448b4af17b3eaea8bd82a02eeb1ea49`.
[CI check](https://github.com/crisesarmiento/opencode-routing-dashboard/actions/runs/41822906254/job/126550242459).
Only after that success were all M0–M6 (including M4a) boxes signed off in PLAN.md.
The final sign-off commit changes documentation only; the same full local code evidence remains valid.

## v0.2 real OpenCode 2.2.5 check (2026-11-04)

- Installed `opencode --version` → `opencode v2.2.5`, exit 0. `stats --help` → exit 0 and lists `--json`, `--models`, `--tools`, `--cost`; global `--standalone` is documented as a private server instead of the background service.
- The installed build's `OPENCODE_*` binary token list contains no `OPENCODE_PURE`. Removed it from the child environment rather than claiming an unverified safety control.
- Red regression: `bun test test/stats.test.ts` → exit 1, unsupported variable present (`expected false, received true`). After removal: exit 0, 6 tests.
- Executed the real binary with the exact child arguments `stats --json --models --tools --cost --standalone`, a fresh empty HOME and all XDG roots under `/tmp/opencode`, `env -i`, and the three feature-specific download-disable variables. Exit 0 within a 25-second deadline. `parseStats` accepted the output: sessions 0, steps 0, models 0.
- This verifies the installed executable and empty-profile response contract, **not real user statistics**, subscription limits, populated service behavior, installed user plugins, or an OS-enforced no-network guarantee. No credential files, real prompts or user session IDs were read.

### Real Orca provenance check

- Read-only inspection of the installed Orca 1.4.247 launcher chain and relevant bundled agent/database-discovery code, plus worktree metadata, established the Linux paths documented in ARCHITECTURE.md. No services or configuration were changed.
- Jev log field inspection established that client identity is absent; prompt mentions of Orca were not used as classification evidence. No real log records, prompt text, session IDs or credentials are committed or included in the demo.
- The shared-state/directory mapping is verified; a full live argv trace, remote Mac SSH/Tailscale session, effective per-process slim preset and macOS paths are not verified.

### M7 — remote foundation

- Tests-first agent/config, remote validation/reconnect, federation identity and directory-provenance tests failed against behavioral stubs before implementation. Gate regressions then failed for tunneled Host ports, unsupported retention, proxy forwarding and per-source payload isolation before their fixes.
- Source-reviewed and runtime-probed security gate: PASS after SSH Host, proxy fail-closed, retention, history budgets and incremental SSE corrections. No token is returned in public state; a fake-proxy subprocess regression observes zero proxy hits.
- Reconstructed the M7-only staged tree under `/tmp/opencode` (excluding later analytics/UI/report work) and verified the actual milestone artifact: `bun run typecheck` exit 0, `bun run lint` exit 0, `bun test` exit 0 (**131 tests / 19 files**), `bun run build` exit 0. Two staging-only formatting differences were corrected before the passing run.
- Real agent test uses 10,000 fixture-derived records: HTTP source, initial SSE snapshot and appended delta pass; a focused run measured 387 ms append-to-delta. This is a point measurement, not unlimited-history or multi-machine performance evidence.
- Remote 10k SSE parsing, redirect refusal, oversized HTTP/SSE/history, timeout, abort, epoch replacement, stale retention, source collisions and duplicate endpoint suppression are fixture/fake-peer tests, not real SSH or Tailscale deployment tests.

### M8 — evidence analytics

- Behavioral red/green tests cover explicit execution metadata, source/window quota gaps, preset attribution, hold/repeat/expiry, settings and bounded notification subprocesses. Preset JSONC monitor and engine/cache tests also failed before their implementations.
- Review corrections: analytics now uses retained records instead of UI-trimmed detail and lists every configured source's coverage; classifier rate limits are distinct from execution-provider alerts; sampled preset selection never asserts runtime use or quota coverage. The second correctness review passed. A subsequent cache regression test proves unchanged input does not reaggregate on clock ticks; mutable collectors explicitly invalidate it.
- Verified the M8-only staged tree under `/tmp/opencode`, excluding later UI/reports: `bun run typecheck` exit 0, `bun run lint` exit 0, `bun test` exit 0 (**155 tests / 25 files**), `bun run build` exit 0.
- Desktop notification commands are tested with injected runners, not an actual desktop notification on either OS. Preset schema was checked against upstream source, not every installed config override or running process. Coverage remains partial/unknown without attributable execution evidence; no real subscription limits were measured.

### M9 — exchange UI and GET reports

- UI tests-first cover source selection/health and provenance, replay cursor/step/speed, sparse layout, orphan options, selection eviction and rejected payload counts. Existing four-drawer smoke assertions were strengthened to eight working drawers, not removed or skipped.
- GET report endpoint and shared report module had recorded behavioral red runs (404/stubs). Tests cover invalid ranges/formats/sources, unavailable sources, HEAD/Host/method guards, CSV formula escaping, separately ranged stats and explicit range completeness. The final review also required local provenance rules; local config/parser/server regressions failed first and now classify configured Orca directories without a duplicate loopback agent.
- Verified the M9-only staged tree, including functional UI downloads but excluding CLI export/version delivery: typecheck/lint/tests/build all exit 0, **239 tests / 34 files**.
- Parent independently ran the committed verifier against a temporary copy of the canonical `fixtures/` JSONL and real server, with append checks enabled: **134 passed, 0 failed, 0 skipped**, exit 0. Report: `/tmp/opencode/ord-ui-final-report.json`. This exercises play/pause/speed/stepping, synchronized focus, eviction, orphan filters, rejection counter, reduced motion, temporal expiry, burst/render limits, exports, fonts/CSP and both exchange viewport sizes. Process stopped; socket check confirms no remaining listener.
- Command: `PLAYWRIGHT_MODULE_PATH=<existing-playwright>/index.mjs CHROMIUM_PATH=/usr/bin/chromium node scripts/verify-ui.mjs --url http://127.0.0.1:47911 --state-dir <temporary-copy-of-canonical-fixtures> --screenshots-dir <temporary-output> --report <report.json>`. Use the canonical fixtures: the controlled exchange harness explicitly uses their anonymized session names/timestamps, not arbitrary multi-source demo input.
- A separate real-agent demo smoke (two headless agents plus local collector from `scripts/demo-exchange.ts`) passed **39 checks, 0 failed, 2 explicitly skipped**, exit 0: source switching, health, client evidence, panels, coverage, Markdown GET, replay start/stop and no overflow/errors. It does not exercise play/speed/eviction under real remote updates; those are covered by the controlled harness above. Trying the canonical verifier directly on the different demo dataset produced 8 fixture-assumption failures; they were not hidden or weakened. Rerunning against its correct canonical fixture contract passed all 134 checks.
- Rebuilt assets and recaptured 14 `m9-real-*` source-backed fixture screenshots, plus 30 deterministic edge-state captures, in both required sizes. Parent opened and reviewed representative final combined/Orca/replay/quota/presets/alerts/export/sparse views against DESIGN.md. All screenshots are anonymized DEMO data; “real” refers to transport, not user data.

### M10 — CLI and final delivery

- CLI export had a failing-before subprocess test; final coverage includes local and configured fake-agent collection, required-token failures, range parsing, stdout-only reports and cleanup. The CLI starts no HTTP server and writes no report files.
- Final reconciled working tree: `bun run typecheck` exit 0, `bun run lint` exit 0, `bun test` exit 0 (**243 tests / 35 files**), `bun run build` exit 0, `git diff --check` exit 0. The first version-bump run found the old scaffold's 0.1.0 assertion; it now explicitly requires requested 0.2.0, and CLI tests also require equality with package.json. No guardrail was weakened or skipped.
- `bun pm pack --destination /tmp/opencode --quiet` exit 0. Reviewed 0.2.0 archive inventory: runtime source, built local assets/fonts, licenses, README and optional existing systemd examples only; no fixtures, tests, real logs or credential files. No registry publication or service installation occurred.
- Final architectural/security review passed, including the local-provenance correction. macOS, physical Mac↔PC SSH/Tailscale, actual desktop notifications and real subscription limits remain unverified. See KNOWN_ISSUES for epoch deduplication scope, partial evidence, sampled presets and incomplete report ranges.
- Branch CI is a separate final gate recorded on the PR head. Local validation does not claim CI success in advance. The PR targets develop and is not merged; no tags are created.

### M11 — acceptance integration

- Final acceptance audit found active alerts were visible in the badge/panel but not directly in the ticker. Added the missing ticker strip using the same validated alert view, without a new detector or side effect.
- Red: `bun test test/ticker-alerts.test.tsx` exit 1 (1 pass, 2 behavioral failures). Green: exit 0, 3 tests (source/kind labels, selected-source scope, absence when unknown/inactive). Real-agent DEMO browser checks confirm the strip, panel button and selected-source behavior; screenshots at both required sizes were opened/reviewed against DESIGN.
- Final reconciled checks after M11: typecheck exit 0, lint exit 0, **246 tests / 36 files** exit 0, build exit 0, diff-check exit 0. Parent reran the committed canonical-fixture browser verifier with append and exchange checks: **134 passed / 0 failed / 0 skipped**, exit 0; report `/tmp/opencode/ord-ui-m11-report.json`. Test server was stopped by cleanup.
- M11 is a separate acceptance milestone/commit because the earlier milestones were already published; no shared history was rewritten. Final CI status is recorded in PR #3.

### M12 — clean-runner test portability

- First final-head CI (`1c84a14`) failed: [run 41871192389](https://github.com/crisesarmiento/opencode-routing-dashboard/actions/runs/41871192389/job/126718390416), **238 passed / 8 failed**. All eight failures were `ENOENT` from `mkdtemp('/tmp/opencode/...')`: that directory is pre-created in this development-agent environment but not a clean GitHub runner.
- The fix uses the OS temporary directory for those test fixtures, rather than creating an agent-specific directory in CI or weakening assertions. Runtime/UI code is unchanged, so the prior 134-check browser and screenshot evidence remains valid.
- Six test files changed only imports and eight temporary-directory prefixes. Focused run: 28 tests pass. Parent final run after reconciliation: typecheck/lint/**246 tests, 36 files**/build/diff-check all exit 0. Final head CI is rerun on PR #3; no browser rerun is needed for this test-only correction.
