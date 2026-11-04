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
listener and aborts/reaps its child on timeout or shutdown. The HTTP listener is
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
