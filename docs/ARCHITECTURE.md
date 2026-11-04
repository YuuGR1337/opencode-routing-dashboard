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
