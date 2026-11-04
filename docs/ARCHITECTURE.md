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
