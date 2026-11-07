# PLAN

Sign-off requires local checks and green branch CI. Evidence lives in
[VERIFICATION.md](VERIFICATION.md); source limits and remaining issues are
recorded in [KNOWN_ISSUES.md](KNOWN_ISSUES.md).

## Repository collaboration safeguards (#12)

- [x] Align live branch protections and merge settings, restore the task label, track proposals separately from approved work in the repository project, and protect release publication against tags outside `main` history. Live settings and local validation are verified (252 tests; final guard regression rerun: 6 passing tests). Final acceptance requires green [PR #13](https://github.com/crisesarmiento/opencode-routing-dashboard/pull/13) CI and maintainer merge; see [REPOSITORY.md](REPOSITORY.md).

## Proposal intake and private security reports (#14)

- [x] Add a proposal/research form and private security contact link, publish SECURITY.md, enable and verify private vulnerability reporting, and document the safe intake process. YAML structure and local typecheck/lint/252 tests/build verified. No project automation, dependency updates or release is included. Final acceptance requires green PR CI and maintainer merge; the issue chooser is available after the default-branch merge.

## Dependency updates and project intake (#16)

- [x] Configure weekly Bun/GitHub Actions update PRs to `develop` with no auto-merge, verify merged proposal/security files and private reporting, and document native project auto-add. YAML structure, typecheck, lint, 252 tests and build passed locally; final acceptance requires green PR CI. Live auto-add activation/delivery and the first hosted Dependabot run are separate pending verification steps, not implied by merging configuration.

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
