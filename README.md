# opencode-routing-dashboard

A real-time, local-first switchboard for [OpenCode](https://opencode.ai) routing:
Jev suggestions, recorded context agents, route decisions, aggregate model usage and errors.
It does not invent execution agents, per-message model usage or fallback events that the logs cannot establish.

## Why

Multi-agent setups such as [oh-my-opencode-slim](https://github.com/alvinunreal/oh-my-opencode-slim)
spread work across roles (orchestrator, oracle, fixer, explorer, designer) and providers with
fallback chains. Without a view of what really happened, you can't tell whether a preset is good,
whether quota is burned in the wrong place, or whether the router agrees with the orchestrator.

## Status

Implementation progress is tracked in [docs/PLAN.md](docs/PLAN.md).
See [docs/SPEC.md](docs/SPEC.md) for source formats and evidence limits,
[docs/DESIGN.md](docs/DESIGN.md) for the switchboard system and
[docs/VERIFICATION.md](docs/VERIFICATION.md) for checks and screenshots.
Ranked limitations and process-evidence gaps are listed in [docs/KNOWN_ISSUES.md](docs/KNOWN_ISSUES.md).

## Run locally

Requires Bun >= 1.2. OpenCode is optional when using an offline stats file or disabling stats.

```sh
bun install --frozen-lockfile
bun run start
# open http://127.0.0.1:4777
```

`start` builds local assets and starts the server; `dev` watches server code after an initial client build.
After editing frontend code, rerun `bun run build` and refresh the browser. No public listener is opened by default.

### PC agent → Mac dashboard

On the PC, run the read-only agent (no frontend required):

```sh
bun src/cli.ts agent --port 4318
```

On the Mac, open a tunnel using your own SSH host alias, then run the dashboard:

```sh
ssh -N -L 4319:127.0.0.1:4318 pc
# In another terminal:
bun src/cli.ts serve --config sources.json
```

`sources.json` is an array of explicitly configured endpoints. The local source is
always available; IDs must be unique and cannot be `local`.

```json
[
  { "id": "pc", "label": "PC", "endpoint": "http://127.0.0.1:4319" }
]
```

The tunnel is the default: the agent still listens only on the PC's loopback.
Optional direct Tailscale access uses `agent --bind YOUR_TAILSCALE_IP --token-env ORD_AGENT_TOKEN`
and a source with `"tokenEnv": "ORD_AGENT_TOKEN"`. Set a strong token of at least
32 characters in the launching shell on both machines; never put it in the JSON,
a URL or a committed file. The app does not read dotenv or credential files.
Wildcard binds are refused, and a non-loopback agent cannot start without a token.
The dashboard itself always listens on loopback.

Remote collection fails closed if `HTTP_PROXY`, `HTTPS_PROXY` or `ALL_PROXY`
(including lowercase variants) is configured. Bun can otherwise forward bearer
headers to that proxy, even for loopback. Launch the dashboard/export with those
variables unset; `NO_PROXY` is not treated as a verified bypass by the app.

Loopback is accessible to other users of the same machine, including at either end
of a tunnel. Use a token on loopback too when that matters. Source records can
contain prompt excerpts: `agent --redact-prompts true` removes the known observe/route
`prompt` fields, but is not a general sanitizer of arbitrary unknown record fields.
Agents accept only headless requests and expose no static frontend or remote proxy.
Do not expose them through an untrusted public reverse proxy.

### Configuration

Flags override environment variables. Run `bun src/cli.ts --help` for CLI options.

| Environment | Flag | Default |
|---|---|---|
| `ORD_STATE_DIR` | `--state-dir` | `~/.local/state/opencode` |
| `ORD_OBSERVE_PATH` | `--observe-path` | `<state-dir>/jev-observe.jsonl` |
| `ORD_ROUTE_PATH` | `--route-path` | `<state-dir>/jev-route.jsonl` |
| `ORD_PERMISSIONS_PATH` | `--permissions-path` | `<state-dir>/jev-permissions.jsonl` |
| `ORD_PORT` | `--port` | `4777` |
| `ORD_STATS_INTERVAL` | `--stats-interval` | `60` seconds |
| `ORD_STATS_COMMAND` | `--stats-command` | `opencode` executable, no shell |
| `ORD_STATS_FILE` | `--stats-file` | unset; validated JSON file instead of CLI |
| `ORD_STATS_ENABLED` | `--stats-enabled` | `true` |
| `ORD_SNAPSHOT_DIR` | `--snapshot-dir` | `<state-dir>/snapshots` |
| `ORD_MAX_RECORDS` | `--max-records` | `10000` per log source |
| `ORD_DEMO` | `--demo` | `false`; explicit fixture-replay label |
| `ORD_CONFIG` | `--config` | unset; explicit JSON array of remote sources |
| `ORD_LOCAL_SOURCE_CONFIG` | `--local-source-config` | unset; local client/directory classification JSON |
| `ORD_BIND` | `--bind` | `127.0.0.1`; agent only for non-loopback |
| `ORD_TOKEN_ENV` | `--token-env` | unset; name of the agent token environment variable |
| `ORD_REDACT_PROMPTS` | `--redact-prompts` | `false`; known agent prompt fields only |
| `ORD_ANALYTICS_CONFIG` | `--analytics-config` | unset; explicit quota/alert settings JSON |

Paths support `~`. Missing log files are a normal silent-exchange state; the tailer notices later creation.
The app never reads credential files. OpenCode stats runs as a standalone child with catalog/update/LSP
downloads and telemetry exporters disabled; this is not an OS network sandbox for third-party plugins
or unrelated OpenCode processes. Offline mode avoids spawning OpenCode entirely.

### Anonymized demo

For PC + Orca + local through two real headless agents and one dashboard:

```sh
bun run build
bun scripts/demo-exchange.ts --live
# open http://127.0.0.1:4788; Ctrl-C stops all three servers
```

The script uses anonymized `fixtures/exchange/`, shifts timestamps together and
keeps generated files in a temporary directory. Every view is labeled DEMO.
Its sample quota limits are explicitly fictional demo settings, not Claude,
ChatGPT or Grok subscription limits. No service is installed.

```sh
ORD_STATE_DIR=fixtures ORD_STATS_FILE=fixtures/stats.json ORD_DEMO=true bun run start
```

For arrivals over SSE, start with an empty temporary directory and replay fixtures into it:

```sh
demo_dir="$(mktemp -d)"
ORD_STATE_DIR="$demo_dir" ORD_STATS_FILE=fixtures/stats.json ORD_DEMO=true bun run start
# In another terminal, substitute the temporary directory printed/selected above:
bun scripts/replay.ts --dir /path/to/empty-demo-dir --interval-ms 500
```

Replay refuses existing output files. Demo data stays local and is visibly labeled.

### Verification

```sh
bun run typecheck
bun run lint
bun test
bun run build
```

Optional browser verification uses an already available Playwright installation and Chromium;
neither is a project dependency. Point `PLAYWRIGHT_MODULE_PATH` at its module entry file if needed:

```sh
PLAYWRIGHT_MODULE_PATH=/path/to/playwright/index.mjs CHROMIUM_PATH=/path/to/chromium \
  node scripts/verify-ui.mjs --url http://127.0.0.1:4777 --report /path/to/ui-report.json
```

Pass `--state-dir /path/to/temporary-demo-dir` to enable burst/render-limit append checks.
The verifier refuses writes unless the server is explicitly in DEMO mode and all source paths
match a temporary directory outside the repository. Do not point it at real logs.

The test suite uses anonymized fixtures and temporary directories, including a real random-port
append-to-SSE integration test. Readouts explicitly distinguish retained log windows, lifetime
malformed counts and the independent stats range. Byte-bounded detail windows report omissions;
full raw records remain inspectable for displayed events.

## Views

- **Flow:** live suggestion switchboard, recorded context jacks, aggregate model rail and filterable ticker.
- **Agreement:** context-only confusion matrix and confidence histogram; not a delegation success metric.
- **Usage:** models, providers and variants, with separate stats-range totals and reported costs.
- **Errors:** classifier/route failures, lifetime malformed counters, stats tool failures and permission verdicts.
- **History:** weekly stats snapshots; each point retains its own source range.
- **Sources:** combined or individual PC/Orca/local inputs, health and client/directory evidence. Configured labels are not proof of runtime client identity.
- **Alerts / Quota / Presets:** debounced evidence alerts, user-limit estimates and period comparison with source coverage. Unknown execution metrics remain unavailable.
- **Replay:** play/pause, stepping and speed over a retained session, synchronized with Call in focus.
- **Export:** period downloads in Markdown/CSV for the selected source or all sources.

Shortcuts: `/` search, `f` filters, `s` sources, `j`/`k` rows, `Enter` details, `1`–`8` drawers, `Esc` close. Replay controls also expose keyboard hints.
The detail drawer preserves raw records and a session timeline of transmitted events.

![Fixture replay switchboard](docs/screenshots/m4-flow-1440x900.png)

![Context agreement at 1024×768](docs/screenshots/m4-agreement-1024x768.png)

![Multi-source fixture exchange](docs/screenshots/m9-real-combined-1440x900.png)

![Quota estimates and source coverage](docs/screenshots/m9-real-quota-1024x768.png)

## Weekly history

### Range reports

```sh
bun src/cli.ts export --from 2026-10-26 --to 2026-11-01 --format md \
  --stats-file fixtures/stats.json --state-dir fixtures
# Use --format csv for spreadsheet import; redirect stdout yourself if desired.
# Add --config sources.json to include all configured remote sources.
```

Date-only endpoints include the complete final UTC day; date-time endpoints are
exact instants with an exclusive upper bound. Events are filtered by that range.
Stats keep their own reported range and are never allocated to individual calls;
overlapping history snapshots are not summed. Reports include retention/omission
coverage and source identity. Unknown values are not zero; CSV formula-leading
text is escaped. A CLI export fails explicitly if a configured remote source
cannot provide its initial snapshot, rather than silently omitting it.

### Quota and alert settings

Pass `--analytics-config analytics.json` to load a bounded, explicit settings file:

```json
{
  "quotas": [],
  "alerts": { "holdMs": 0, "repeatMs": 60000, "activeMs": 60000, "desktop": false }
}
```

Each quota entry requires `id`, `label`, `provider` and `metric` (`tokens` or
`messages`), with optional `model`, `limit5h` and `limitWeekly`. Supply your own
subscription limits; none are bundled for Claude Pro, ChatGPT Plus or Grok.
Usage is an estimate from attributable timestamped evidence, with partial/unknown
coverage shown explicitly. Aggregate sliding stats cannot establish a 5-hour
window or per-preset consumption. Current Jev-only logs generally lack execution
attribution, so unavailable quota/fallback values are expected, not zero usage.

`holdMs` delays sustained alerts, `repeatMs` limits repeats and `activeMs` defines
how long recorded evidence remains active. `desktop: true` opts into local
`notify-send` (Linux) or `osascript` (macOS), when available. Notification text does
not forward prompt excerpts. No additional notification service is installed.

Set optional `presetPath` to the explicit slim JSON/JSONC file on the machine
running that collector. For remote presets, pass the settings file to the PC
agent with `--analytics-config`; the Mac receives observations through the agent.
Only the file's top-level `preset` is sampled; project/environment overrides and
the running process's effective selection are not resolved. Changes are recorded
from monitoring start, and changes/reversions between samples can be missed.

To distinguish Orca from TUI sessions within one PC source, add `directoryRules`
to that source: each rule has an absolute `prefix`, `client` (Orca/TUI/service)
and optional `label`. Match uses the longest prefix at a directory-segment
boundary; no prefixes are guessed. The observed directory remains visible, while
the client classification is explicitly configured. Missing/conflicting evidence
is unknown. Two separate agents reading the same logs can double-count records;
use one collector per dataset.

The same rules work without an agent on the PC itself: pass
`--local-source-config local-source.json` containing only `client` and/or
`directoryRules`. For example, configure your actual Orca workspace prefix with
`client: "Orca"` in a directory rule. There is no endpoint or token in this file;
the local source is not duplicated. Keep all unverified directories unclassified.

### Snapshot capture

Capture once from OpenCode or an explicit offline stats file:

```sh
bun run snapshot
# Offline example, writes only to the selected snapshot directory:
ORD_STATS_FILE=fixtures/stats.json ORD_SNAPSHOT_DIR=/path/to/snapshots bun run snapshot
```

The filename is the local Monday of the capture week. An existing week is never overwritten.
Atomic publication requires a filesystem supporting hard links (normal Linux/macOS local filesystems).
Unsupported filesystems fail explicitly without replacing an existing snapshot or leaving a partial final file.
The server only reads snapshots and refreshes History periodically. Up to 52 newest valid snapshots
fit within file/total byte limits; malformed and omitted counts are visible in source status.
Each snapshot keeps its own stats range, so overlapping ranges are not additive weekly totals.

## Package and optional systemd user units

```sh
bun pm pack --destination /path/to/output
```

The archive includes an executable `opencode-routing-dashboard` bin, server source, built assets,
local fonts/licenses and the units in `contrib/systemd/`. It excludes fixtures and tests. This PR
does not publish a registry package: `bunx opencode-routing-dashboard` is the intended published
entry point, not a claim that this branch is available on the registry.

For an installed executable on Linux, copy the three example units into your user systemd directory,
adjust their `PATH` and optional `ORD_*` environment settings, then explicitly enable the desired units:

```sh
mkdir -p ~/.config/systemd/user
cp contrib/systemd/opencode-routing-dashboard* ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now opencode-routing-dashboard.service
systemctl --user enable --now opencode-routing-dashboard-snapshot.timer
```

The snapshot timer uses `OnCalendar=weekly` and `Persistent=true`. Both services need Bun and the
dashboard executable on their service `PATH`, and matching snapshot/state settings. No service is
installed or enabled by the app. macOS can run the CLI directly; systemd units are Linux-only.

## License

MIT
