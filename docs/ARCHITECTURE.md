# Architecture

```
files (*.jsonl) ──tail──▶ sources/ ──parse──▶ core/ (pure reducers) ──▶ store (in-memory)
opencode stats --json ─poll─┘                                            │
snapshots/*.json ──load──┘                                               ▼
                                              server/ Bun.serve 127.0.0.1: /api/state, /api/events (SSE), static UI
                                                                         ▼
                                                    web/ React: Flow · Agreement · Usage · Errors · History
```

- `src/sources/tail.ts` – offset-based tailer (fs.watch + polling fallback; handles truncate/rotate/late create).
- `src/sources/stats.ts` – spawns `opencode stats --json`, interval, timeout, backoff; snapshot writer (weekly).
- `src/core/schema.ts` – line parsers (zod or hand-written guards); `src/core/aggregate.ts` – joins observe+route by `session|message`, computes agreement, usage, errors.
- `src/server/` – HTTP + SSE; full state on connect, deltas after.
- `web/` – React client bundled by `bun build`.
- `src/config.ts` – env/flags, defaults, path expansion.
- `contrib/` – systemd user unit.

## Core evidence model

`aggregate(DashboardInput, now)` is pure and returns JSON-serializable `DashboardState`.
Observe/route records pair by exact session and non-null message, taking the nearest
unpaired prior observation when keys repeat. Source arrival order does not change
the result. Permission records are retained separately. Raw records survive for
inspection; classifier identity and context agent are never relabeled as execution.
Usage totals come from stats, not guessed allocations across messages.

## Live server

The tailer serializes reads and coalesces wakes into one active and one pending
drain. It decodes only complete newline-delimited byte sequences and bounds a
single record to 1 MiB. Polling recovers when directory watching is unavailable.
The server batches changes over 50 ms, retains configurable source windows and
publishes self-contained state replacements over SSE. Slow readers disconnect;
reconnection gets a fresh snapshot. Stats polling starts without delaying the
listener and aborts/reaps its child on timeout or shutdown. The dashboard HTTP listener is
explicitly loopback-only, checks Host, blocks static symlink escape, sends no
CORS headers and uses a self-only CSP. See VERIFICATION.md for the subprocess
network boundary and executable fixture tests.

## Snapshot ownership and packaging

`snapshot` is the only application writer. It captures validated stats, writes a
private temporary file, syncs it and publishes it with an atomic non-replacing
hard link. Concurrent captures keep the first complete snapshot for that local
Monday; temporary files are cleaned up. The optional weekly user timer invokes
this command independently of the HTTP service.

`loadSnapshots` accepts only date-named regular files opened without following
symlinks. History is bounded to 52 snapshots, 1 MiB per file and 2 MiB total.
The server refreshes it every five seconds and exposes `historyStatus` with
malformed/omitted counts. The server never writes snapshots. Static assets are
resolved relative to the package, so the executable works from another working
directory. `prepack` builds the local frontend; the package allowlist includes
only runtime source/assets, licenses, README and optional service examples.

## Final validation boundaries

Each input log path can override the state-directory default independently.
The 10k-line startup test covers a real loopback server and SSE append; an
independent cold process check includes the production command's client build.
The optional portable browser verifier only permits append tests against DEMO
sources in a matching temporary directory, blocks cross-origin requests and
emits machine-readable results. It requires an existing external Playwright
installation rather than adding a project dependency. See KNOWN_ISSUES.md for
unverified deployment/platform boundaries and extreme-volume limitations.

## v0.2 planned boundaries (M7 onward)

```
PC files/stats/snapshots -> headless agent -> SSH tunnel (default) --+
other configured agents -> explicit HTTP/SSE + bearer (nonloopback) +-> Mac/PC dashboard
local readers ---------------------------------------------------+   -> same-origin browser
```

- Local collection is shared by dashboard and agent, not implemented twice. Agent transport returns validated raw records/status/stats/history in bounded full replacements (`epoch`, `seq`); it has no remote-source mode or static UI. Dashboard aggregates each source independently before combining namespaced event views. Existing v0.1 API semantics remain full replacements.
- Remote HTTP/SSE is server-side only. Configuration chooses stable source IDs and explicit endpoints; tokens are resolved from named environment variables, never serialized. Reject URL userinfo/redirects, bound reads before JSON parsing, and enforce connect/idle limits. One abortable connection/retry loop per source preserves stale data through failures.
- Agent security validates explicit bind, Host, bearer authentication, methods and browser-origin headers. Wildcard binds are refused. A non-loopback listener cannot start without a sufficiently strong token. Optional loopback tokens and prompt redaction address multi-user-host exposure. Existing dashboard CSP, same-origin and static-path protections remain.
- Pure source/provenance, quota, preset comparison, alert and report functions belong in `src/core/`; source configuration, preset observation, remote transport and optional notification subprocesses stay in IO modules. No database, new service or dependency is required.
- Source IDs are assigned by dashboard config, never trusted from peers. Event/session joins never cross them. Stats/history preserve source ranges; differing ranges do not produce combined money totals. Quota and presets require timestamped attribution, with explicit partial/unavailable coverage. A current preset is not historical evidence.
- UI remains a switchboard with source selector/health and exchange panels for alerts, quota, comparisons and replay. Replay operates on retained client events, not network replay. Exports use shared pure range/report logic for CLI and HTTP GET.
- Orca shares the OpenCode/Jev state inputs; client provenance requires explicit metadata or configured directory rules, not prompt text. Verified Linux installation details follow below; all paths remain configurable.

### Verification ownership
Runtime lane: fake-agent auth/Host/method/origin/redirect/bounds/reconnect/stop tests and source identity collisions. Analytics lane: fixture-based range/unknown/overlap/debounce/CSV-injection tests. Designer: view smoke tests and both screenshot sizes. Integrator: reconcile artifacts, broad checks once per pass, review screenshots, runtime evidence matrix and branch CI. macOS requires a real runner; Linux evidence does not substitute for it.

### Slim preset evidence

Official upstream source (`alvinunreal/oh-my-opencode-slim`, `master`) defines the
top-level optional string `preset` and map `presets` in `src/config/schema.ts`.
`src/config/loader.ts` strips BOM and JSONC comments/trailing commas, supports
environment interpolation, merges user configuration followed by ancestor-to-nearest
project overrides, and applies preset overrides. `src/tools/preset-switch.ts`
documents effective precedence as environment, then project, then global selection.
Sources: [schema](https://github.com/alvinunreal/oh-my-opencode-slim/blob/master/src/config/schema.ts),
[loader](https://github.com/alvinunreal/oh-my-opencode-slim/blob/master/src/config/loader.ts),
[switch](https://github.com/alvinunreal/oh-my-opencode-slim/blob/master/src/tools/preset-switch.ts).

The dashboard observes only an explicitly selected non-secret preset config file.
Its timeline starts when monitoring begins, with timestamped file observations;
it is not proof of the effective preset of every OpenCode process. Unresolved
environment interpolation and unconfigured project/environment overrides remain
unknown. Preset-monitor coverage does not establish execution/quota coverage.

### Orca/OpenCode installation evidence (Linux, 2026-11-04)

Read-only discovery found Orca 1.4.247. Its CLI shim is
`~/.config/orca/linux-orca-cli-shim/orca`, which dispatches through
`~/.cache/orca/appimage/launcher/orca-ide` and an `installed` symlink into a
versioned AppImage cache. The bundled `resources/bin/orca-ide` launches
`app.asar.unpacked/out/cli/index.js` with Electron's `ELECTRON_RUN_AS_NODE=1`.
The cache hash/version is installation-specific, not an application default.
Orca's installed agent-command logic sets `OPENCODE_DISABLE_AUTOUPDATE=true`
for its `opencode`/`opencode2` clients. This verifies the launcher chain and
agent setting, not every argument of an arbitrary user's live OpenCode process.

`orca worktree list --json` exposes agent provenance (`createdWithAgent:
"opencode2"`, `creatorProvenance.kind: "host"`) and worktree directories.
Orca logs were located at `~/.config/orca/logs/` (`daemon.log`,
`main.trace.ndjson*`); these are research evidence only, not dashboard inputs.
The dashboard never scrapes terminal text or prompt strings to infer a client.

Installed OpenCode 2.2.5 reports these paths through `debug paths`:

| Kind | Observed default (portable home notation) |
| --- | --- |
| data | `~/.local/share/opencode` |
| state / Jev JSONL | `~/.local/state/opencode` |
| config | `~/.config/opencode` |
| cache | `~/.cache/opencode` |
| application logs | `~/.local/share/opencode/log` |
| database | `~/.local/share/opencode/opencode.db` (or `OPENCODE_DB`) |
| repositories / storage | `~/.local/share/opencode/repos`, `~/.local/share/opencode/storage` |

Orca's installed database-discovery code agrees with the data/DB defaults and
honors `XDG_DATA_HOME`/`OPENCODE_DB`. The dashboard does **not** read that DB,
Orca logs or OpenCode credentials: its inputs remain configurable Jev JSONL,
stats and validated snapshots. The observed Jev logs have no client field;
Orca mentioned in prompt text is not client evidence. `route.dir` identifies
the observed directory. Configure source `client` or explicit directory-prefix
rules for Orca/TUI/service classification and label those as configured.
Sessions in Orca worktrees therefore appear through the same shared logs,
whether viewed on the PC or through its agent on a Mac.

These are verified Linux installation paths, not macOS defaults or guarantees
for other Orca/OpenCode packages. All input paths and endpoints remain explicit
configuration; macOS and remote deployment paths are unverified.
