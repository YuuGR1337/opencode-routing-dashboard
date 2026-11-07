# Changelog

All notable changes to this project are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning: [SemVer](https://semver.org/).

## [Unreleased]

### Maintenance
- Complete the collaboration baseline: squash-only protected PRs, current CI and resolved conversations for administrators too, a task label, and an explicit proposal/approval project workflow without mandatory external reviews for a sole maintainer.
- Guard release publication against tags outside `main` history, with local Git regression coverage; document issue planning and repository administration.

### Added in 0.2.0
- M7: read-only headless agents, SSH-first remote sources, explicit authenticated non-loopback binds, bounded HTTP/SSE collection, reconnect health and namespaced source identities.
- M8: user-configured subscription quota estimates, evidence-aware preset comparisons, sampled slim config timelines, debounced alerts and opt-in desktop notifications.
- M9: source selection and health, exchange analytics panels and retained-session replay synchronized with Call in focus.
- M10: source/range-aware Markdown and CSV reports through CLI and GET downloads, with formula escaping and explicit incomplete-range coverage.

### Security in 0.2.0
- Refuse wildcard agent binds, require strong bearer tokens outside loopback, reject browser-origin agent requests and prevent redirect/proxy credential forwarding.
- Bound remote records, snapshots and stream frames; isolate over-budget sources without starving healthy ones. Tokens remain server-side environment references, never browser state.

### Fixed in 0.2.0
- M12: use OS temporary directories in tests instead of assuming the agent's pre-created `/tmp/opencode`, so clean CI environments can run the unchanged assertions.
- M11: expose active alert evidence directly in the ticker, scoped to the selected source and linked to the existing alert panel.
- Support differing SSH tunnel ports in the agent Host check and reject incompatible agent retention settings before startup.
- Verify installed OpenCode 2.2.5 stats output in an isolated empty profile; retain supported `--standalone` and remove unsupported `OPENCODE_PURE`.
- Restore focus on selected-event eviction, retain orphaned filter choices, expose rejected UI payload counts and adapt sparse patch bays.

### Evidence limits in 0.2.0
- Missing execution, fallback and per-message usage remain unknown. Preset-file samples are not proof of runtime selection; classifier rate limits are distinct from execution-provider limits. No subscription limits are invented.

### Added
- M1: validated, unknown-field-preserving parsers for observe, route, permissions and stats; malformed JSONL counting and fixture tests.
- M2: deterministic message joins, context agreement matrix and confidence histogram, usage breakdowns, permission/error rollups and honest unavailable-data readouts.
- M3: configurable loopback HTTP/SSE server, rotation-safe JSONL tailing, bounded stats polling, offline stats-file mode and source health states.
- M4a: switchboard shell with local IBM Plex Mono/Instrument Sans fonts, ghost suggestion wires, context jacks, aggregate model rail, dense ticker, raw event drawer and fixture replay screenshots.
- M4: Flow, Agreement, Usage, Errors and History drawers; pure event filters, search/keyboard navigation, session timeline and fixture-backed smoke tests for every view.
- M5: atomic non-overwriting weekly snapshots, bounded live History loading, one-shot snapshot CLI, package-relative assets and optional systemd user service/timer examples.
- M6: individually configurable log paths, 10k-line startup/SSE checks, shutdown regression coverage and a portable same-origin browser verifier with safe demo-only burst checks.

### Fixed
- Prompt-rate readouts now exclude session-only route exceptions; page-clock windows expire without new source events, and focused buttons retain their native Enter behavior.

### Clarified
- Execution agent/model, fallback and per-message usage cannot be inferred from the supplied logs; agreement is explicitly context-only.

## [0.1.0] - 2026-11-03
### Added
- Project scaffold: SPEC, DESIGN, ARCHITECTURE, PLAN, fixtures, CI, kickoff prompt.
- Repo conventions: branch model, PR/issue templates, agent skills, release workflow.
