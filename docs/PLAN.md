# PLAN

## External evidence contract (#5)

- [x] Research and document the read-only session-linked external evidence contract in `docs/decisions/0002-session-linked-external-evidence.md`: manual triplet association, exact-SHA applicability, five evidence states, human approval `unknown` without an auditable event, freshness/provenance, 13 synthetic cases and separately listed authorization decisions. Documentation only; no code, access, scopes or UI. Provider semantics unverified until an authorized integration step.

## Sessions inspector view (#43)

- [x] Render the read-only Sessions inspector per the approved #41 contract: ninth view (key `9`), session list, detail with scope header, replay-cursor timeline, three evidence-state chips, session-linked permission verdicts, `ROUTER · recommendation, not execution` block, entry from a selected event (`s` / `session` action) and `Esc` detail → list → close. Tests first (26 new render/behavior tests; red run 25 failed / 1 passed before implementation). Isolated Linux Chromium measurement and DEMO captures `docs/screenshots/m43-*` at 1440×900 and 1024×768, including the nine-tab nav fit with the Alerts badge active; the inspector is a stage-only panel so the chrome and ticker stay visible. No new colour, font, motion or dependency; no task identity, #5 or aggregate-stat allocation.

## Session inspection model (#42)

- [x] Add a pure `src/core/session-inspection.ts` model over retained evidence, with tests-first coverage for federated source isolation, eviction/omission coverage, permissions without events, unknown sessions, unavailable execution fields and input immutability. No ingestion/schema change, no UI, no aggregate attribution to sessions. Local typecheck, lint and full test suite pass.

## Lane Bay bounded identity (#33)

- [x] Apply the accepted #39 DESIGN contract to the existing shell, source/navigation/scope rows, switchboard and ticker, with compact focus and responsive columns at both required sizes. Maintainer [scope approval](https://github.com/crisesarmiento/opencode-routing-dashboard/issues/33#issuecomment-6715778224) includes detailed rejected-payload counts in Errors and the compact intake summary in the ticker. Local typecheck/lint/283 tests/build, 208 browser checks, eight reviewed DEMO captures, measured layout, keyboard/actual reduced motion and [implementation-head CI](https://github.com/crisesarmiento/opencode-routing-dashboard/actions/runs/42439710210/job/128606110666) pass. [PR #40](https://github.com/crisesarmiento/opencode-routing-dashboard/pull/40) records final-head CI after this documentation-only sign-off; maintainer review/merge remains separate. Source/filter/selection/replay semantics and aggregate range separation are preserved; no new project dependencies, telemetry, connection-state machine, Settings or persistent inspector. #23 remains open; #24/#25/#27/#31 remain separate.

## Agent workflow guidance and product direction

- [x] Improve the three existing skills, add evidence-contract review and isolated UI verification, validate dry-run case structure and review representative reasoning cases, and document the roadmap/desktop direction. Local typecheck/lint/256 tests/build and implementation-head CI passed; evidence is in VERIFICATION and PR #30. Scope is contributor guidance, tests and documentation only: no runtime/UI changes, external skill installation, feature approval or release. The documentation sign-off reruns final-head CI; maintainer review/merge remains separate.

## Biome patch alignment (PR #21)

- [x] Align the configuration schema with Biome 2.6.5 without changing rule settings or formatting application code. Final acceptance requires local typecheck/lint/tests/build, no schema-version diagnostic and green final PR CI; no runtime or UI change.

## TypeScript 7 CSS compatibility (#22 / PR #20)

- [x] Resolve the exact side-effect stylesheet import without weakening checks. Compiler regression failed before the declaration and passes afterward, accepting the existing stylesheet and rejecting an unresolved stylesheet. Local typecheck/lint/253 tests/build pass; final acceptance requires green PR #20 CI and maintainer merge. No runtime CSS or UI behavior changes.

Sign-off requires local checks and green branch CI. Evidence lives in
[VERIFICATION.md](VERIFICATION.md); source limits and remaining issues are
recorded in [KNOWN_ISSUES.md](KNOWN_ISSUES.md).

## Repository collaboration safeguards (#12)

- [x] Align live branch protections and merge settings, restore the task label, track proposals separately from approved work in the repository project, and protect release publication against tags outside `main` history. Live settings and local validation are verified (252 tests; final guard regression rerun: 6 passing tests). Final acceptance requires green [PR #13](https://github.com/crisesarmiento/opencode-routing-dashboard/pull/13) CI and maintainer merge; see [REPOSITORY.md](REPOSITORY.md).

## Proposal intake and private security reports (#14)

- [x] Add a proposal/research form and private security contact link, publish SECURITY.md, enable and verify private vulnerability reporting, and document the safe intake process. YAML structure and local typecheck/lint/252 tests/build verified. No project automation, dependency updates or release is included. Final acceptance requires green PR CI and maintainer merge; the issue chooser is available after the default-branch merge.

## Dependency updates and project intake (#16)

- [x] Configure weekly Bun/GitHub Actions update PRs to `develop` with no auto-merge, verify merged proposal/security files and private reporting, and document native project auto-add. YAML structure, typecheck, lint, 252 tests and build passed locally; final acceptance requires green PR CI. The maintainer enabled auto-add and issue #18 arrived automatically as Todo; approval/type remain manual. The first hosted Dependabot run is pending default-branch merge and tracked in #18, not implied by merging configuration.

- [x] **M0 Scaffold** – repo, docs, CI (done in initial commit; validated with the complete branch).
- [x] **M1 Parsers** – schemas for the 3 JSONL formats + stats JSON; tests on `fixtures/`; malformed-line counting.
- [x] **M2 Core** – join observe/route by message; agreement matrix; usage per model/provider/variant; error rollups; fallback detection vs `oh-my-opencode-slim.json` active preset (or "not detectable").
- [x] **M3 Live server** – config, tailer, stats poller, SSE endpoint, `/api/state`; integration test (append → SSE < 2 s); bind 127.0.0.1.
- [x] **M4a Design pass** – implement the DESIGN.md switchboard shell, type, color tokens, motion; screenshots reviewed.
- [x] **M4 UI** – React views: Flow, Agreement, Usage, Errors, History; smoke render tests; empty/missing-file states.
- [x] **M5 Ops** – `bin` entry for `bunx`, weekly snapshot job, `contrib/` systemd user unit, README usage + screenshots.
- [x] **M6 Hardening** – rotation/truncation tests, 10k-line perf check (< 1 s), docs pass.

Signed off after local validation and successful branch CI for `8d3f495`:
[check](https://github.com/crisesarmiento/opencode-routing-dashboard/actions/runs/41822906254/job/126550242459).
No registry publication, service installation, merge, version bump or release is part of this sign-off.

## v0.2 — remote sources and exchange tools

Branch `feat/remote-sources-v2` from develop; PR to develop, no merge or tags.
One implementation commit per milestone, tests fail before implementation. SPEC and ARCHITECTURE above define evidence/security constraints before coding.

- [x] **M7 Remote foundation** — validated source configuration, shared local collector, headless agent and mandatory non-loopback authentication, bounded remote full-replacement transport, source identity/health/backoff. Tests: auth/Host/method/origin, redirect/bounds/timeouts/restart/stale/shutdown and cross-source collision. Document verified Orca/OpenCode interfaces and stats flags.
- [x] **M8 Evidence analytics** — explicit/configured client/worktree provenance, observed preset changes and period comparisons, user-configured 5 h/weekly quota estimates, debounced evidence-based alerts and opt-in desktop delivery. Tests: unknown attribution, ranges/overlap, subscription zero-cost, alert timing and preset coverage.
- [x] **M9 Exchange UI and downloads** — combined/source selector and health, alerts/quota/presets panels, synchronized session replay, eviction focus/orphan filters/rejected payload counter/sparse patch bay fixes; shared range reports and GET downloads keep the export panel functional in this commit. Smoke/render and browser behavior tests first; PC + Orca + local fixture demo and screenshots at both required sizes.
- [x] **M10 CLI and delivery** — range Markdown/CSV CLI collection across configured sources, formula safety/unknown coverage evidence, 0.2.0 package bump, README/CHANGELOG/KNOWN_ISSUES/verification matrix, final screenshots and green local checks. PR records final branch CI, actual vs fixture checks and macOS limits.

Pass 1: M7 makes the remote whole work without analytics or UI pretending to be complete.
Pass 2: M8 adds real evidence reducers; M9 integrates and verifies the exchange.
Pass 3: M10 closes report/packaging/docs and final validation. Security and financial correctness are never deferred.

Boxes record completed implementation and local milestone evidence (M7: 131 tests,
M8: 155, M9: 239, M10: 243; final with M11: 246). Final acceptance additionally requires green
CI on the PR head; its result is recorded in the PR, not presumed from local runs.
No release, merge, tag, registry publish or deployment sign-off is implied.

- [x] **M11 Acceptance integration** — expose active alert evidence directly in the ticker as well as the badge/panel, with classifier/provider labels. Tests first and both-size fixture screenshots; final typecheck/lint/246 tests/build and 134 browser checks pass. This closes an original acceptance detail, not a new analytics feature.

- [x] **M12 Portable test setup** — CI exposed eight ENOENT setup failures because new tests assumed this agent environment's pre-created `/tmp/opencode`. Tests now use the OS temporary directory without weakening any assertion; final local checks pass (246 tests). Final head CI remains the PR acceptance gate. No runtime or UI behavior changes.
