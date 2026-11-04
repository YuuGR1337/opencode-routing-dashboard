# Changelog

All notable changes to this project are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning: [SemVer](https://semver.org/).

## [Unreleased]

### Added in 0.2.0
- M7: read-only HTTP/SSE agents, explicit remote source configuration, SSH-first authenticated transport, per-source health/retry and configured Orca directory provenance.

### Fixed in 0.2.0
- Verify OpenCode 2.2.5 stats flags; retain supported --standalone and remove unsupported OPENCODE_PURE.

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
