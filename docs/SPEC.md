# SPEC

## Goal
Local, real-time view of OpenCode routing for any user. Read-only over local files and the `opencode` CLI.

## Functional requirements
1. **Live prompt flow**: per user message: time, session, Jev suggestion (role, confidence, needs_oracle), route decision (injected/skipped + reason), agent that ran, model + variant, latency.
2. **Jev vs slim agreement**: % of messages where the suggested role equals the delegated/active agent; confusion matrix by role; confidence histogram.
3. **Usage per model / provider / variant** from `opencode stats --json` (steps, tokens, cost), plus per-preset if a preset label is available.
4. **Errors**: Jev errors/timeouts, malformed lines, tool failures (from stats), permission gate verdicts.
5. **Fallback hits**: detect if possible (model differs from the role's first choice in the active preset of `oh-my-opencode-slim.json`); otherwise show "not detectable".
6. **History**: weekly snapshots of `opencode stats --json` stored as `YYYY-MM-DD.json`; trend view.
7. Live updates via file tailing (handle append, truncation, rotation, file created later) pushed over SSE.

## Design
The UI follows [DESIGN.md](DESIGN.md) (switchboard concept, max density, anti-slop rules). Deviations must be recorded there.

## Non-functional
- Dashboard binds 127.0.0.1 only. Agents default to loopback/SSH; explicit non-loopback binds require tokens. Only explicitly configured source endpoints may receive outbound connections. No telemetry or unrelated destinations, and no wildcard binds.
- Start < 1 s on 10k log lines; tolerate missing files.
- Config via env/flags; Linux + macOS.

## Data sources (formats observed 2026-11-03, opencode 2.2.5)
Default dir: `~/.local/state/opencode/`. See `fixtures/` for anonymized samples.

### jev-observe.jsonl
```json
{"ts":"ISO8601","session":"ses_…","message":"msg_…|null","agent":"orchestrator|null","prompt":"first 200 chars","model":"jev-1.13-free","status":200,
 "answers":{"role":{"type":"choice","choice":"fixer","confidence":0.77,"probabilities":{"orchestrator":0.2,"explorer":0,"fixer":0.77,"designer":0,"oracle":0.03}},
            "needs_oracle":{"type":"noul","noul":0.22}},"latency_ms":379}
```
On failure: `error` string instead of `answers`; `status` may be missing.

### jev-route.jsonl
```json
{"ts":"ISO8601","session":"ses_…","message":"msg_…","agent":"orchestrator","dir":"/path","flag":"/path/.opencode/jev-route","prompt":"first 120 chars",
 "role":"fixer","conf":0.77,"needs_oracle":0.22,"decision":"injected|skipped","reason":"role_orchestrator|low_conf:0.77|jev_error:…|null","latency_ms":379}
```
Exceptions log only `{ts, session, decision:"skipped", reason:"exception:…"}`.

### jev-permissions.jsonl
```json
{"ts":"ISO8601","session":"ses_…","commands":["git status"],"scores":{"reversible":0.68,"routine":0.95},"verdict":"ask:low-score|ask:gate|ask:risk-list|allow…","latency_ms":330}
```
`scores` is optional.

### `opencode stats --json [--days N] [--models] [--tools] [--cost]`
Top-level keys: `range{from,to}` (epoch ms), `sessions`, `subagents`, `prompts`, `steps`,
`tokens{input,output,reasoning,cache{read,write}}`, `cost`, `tools{mode,totals{calls,succeeded,failed,unfinished},usage[{name,calls,succeeded,failed,unfinished,durationP50}]}`,
`activeDays`, `streak`, `activity`, `models[{model{id,providerID,variant},steps,tokens{…},cost}]`.
Subscription providers (e.g. `claude-code`) report `cost: 0`.

### Not available (as of opencode 2.2.5)
No explicit fallback event in logs; agent-per-step is not in Jev logs (only the session's agent at context time).

## Evidence limits and implementation decisions
- Actual delegated agent, execution model/provider/variant, per-message tokens and cost are **not available** in the supplied logs. The observe `model` is the classifier model, not the execution model. Render unavailable fields explicitly; never attribute aggregate stats to a message.
- Agreement uses only a recorded context agent and is labeled **context agreement**, not delegated-agent agreement. Its denominator excludes missing suggestions or missing agents. Routing injection is a recommendation, not proof that the suggested agent ran.
- Fallback hits are **not detectable** with these sources: even a preset's first choice cannot establish a fallback without an execution model linked to the message. Do not read the active preset merely to fabricate a comparison; show `not detectable` and no numeric fallback rate.
- Join observe and route only when both session and non-null message match. Null-message observations and session-only exceptions remain separate events rather than being guessed into a match.
- Missing log files are normal empty states. Malformed records count separately by source; unknown valid fields survive parsing and remain available for inspection.
- The SPEC takes precedence where the requested display implies evidence the documented sources do not contain. These limits preserve the read-only, evidence-based goal rather than inventing execution data.

## Live transport and retention
- `/api/state` returns the current dashboard state and a monotonic process-local `seq`. `/api/events` starts with `event: snapshot` and then `event: delta`; each event's data is `{state, seq}`. Deltas intentionally carry the complete replacement state, not a partial merge, so reconnects and batched changes cannot leave a client with mismatched aggregates. No cross-restart replay is promised.
- Retain at most `ORD_MAX_RECORDS` records per log source (default 10000). Flow/context agreement and log-error readouts describe that retained window; stats describe their own explicit range. Never present those as a shared timeframe.
- `errors.total` includes retained observe/route errors and process-lifetime malformed counts, clearly labeled as log diagnostics. Stats tool failures are a separate range-labeled readout, not added to that total. Malformed counters reset only when the dashboard process restarts.
- Rotation and detected truncation restart reading the replacement contents; repeated records are retained, not silently deduplicated. An overwrite that recreates the prior byte size entirely between polls cannot reliably be detected by an offset-based tailer.
- `ORD_STATS_FILE` is an explicit fixture/offline input alternative to invoking the CLI. Tests and screenshots use this mode; missing files remain an observable source state, not generated demo data.
- Detail lists are byte-bounded newest contiguous suffixes of the retained events and permissions; complete raw records are kept for every displayed row. `window` reports retained, sent and omitted detail counts, source-eviction counters, and the payload budget. Aggregates still describe the full retained source window, not only transmitted detail rows. The SSE limit is 16 MiB with envelope headroom; an oversized stats/history-only base remains an explicit transport error rather than truncated JSON.
- The UI clock refreshes temporal filters and prompts/min every five seconds even without source updates. A prompt requires an observation or known message; a session-only routing exception is not counted as a user prompt. The 60-second UI count is marked as a lower bound when omitted detail rows could contain additional recent prompts.

## Weekly snapshots
- Snapshot names use the local Monday date of the capture week, `YYYY-MM-DD.json`. A week is captured at most once; existing snapshots are never overwritten. Values retain the CLI's own stats range rather than implying non-overlapping weekly usage.
- `snapshot` is an explicit one-shot writer; the supplied optional user timer schedules it weekly. The HTTP server reads snapshots but never writes them.
- Publish validated snapshots atomically from a private temporary file without replacing an existing destination. Invalid stats never produce a snapshot.
- History loading accepts only valid date-named regular files, ignores temporary files and rejects symlinks. Keep at most 52 newest valid snapshots with per-file and total byte budgets. The API exposes malformed/omitted snapshot counts and source status rather than silently claiming complete history.

## v0.2 acceptance contract (M7 onward)

### Remote sources
- Headless `agent` reads the same JSONL, stats and snapshots, exposing bounded HTTP/SSE only. It serves no UI and cannot recursively configure remote sources. All listeners preserve Host checks, GET/HEAD-only access, client/payload limits and no CORS; dashboard retains CSP.
- Default PC agent bind is 127.0.0.1. A Mac uses `ssh -N -L 4319:127.0.0.1:4318 pc` and configures `http://127.0.0.1:4319`. Optional Tailscale requires an explicit concrete address and mandatory bearer token; wildcard addresses are forbidden. Tokens may also protect loopback, which is accessible to other local users.
- An explicitly selected JSON configuration contains N sources with unique IDs, labels, endpoints, optional client/directory rules and token environment-variable references. Never store tokens inline, read dotenv/credential files, expose secrets to the browser, follow redirects or send data to unconfigured endpoints.
- Agents expose parsed source records as bounded full replacement envelopes with process epoch and sequence. Dashboard revalidates inputs, namespaces event/session identities by configured source ID and never joins sources. Gaps/restarts reconnect to a complete snapshot; no durable SSE replay is promised.
- One connection per source; bounded exponential retry with jitter, idle/connect timeouts and abortable shutdown. Disconnected sources retain last data marked stale with last-seen/retry health. Source count, SSE events and bodies are bounded. Per-source detail budgets prevent starvation.
- Fail closed before remote requests if HTTP_PROXY, HTTPS_PROXY or ALL_PROXY (upper/lowercase) is configured. Do not assume NO_PROXY prevents Bun from forwarding bearer headers; do not mutate the process environment as a bypass.
- Configured source selection includes PC, Orca, local and combined views, health and per-source filters. Distinct stats ranges remain distinct: never manufacture cross-source financial/quota totals or silently correct remote timestamps.

### Evidence and analytics
- Session directory/worktree comes from observed metadata; Orca/TUI/service labels require explicit metadata or configured source/directory classification, labeled as such. Otherwise show unknown. Installed Orca paths/launch evidence must be verified and documented; unverified paths remain configurable.
- Read the active slim preset only from an explicitly selected non-secret config path. Timestamp changes while monitoring; never assign the current preset to historical events. Compare recorded preset labels or actually observed intervals, showing coverage.
- New panels compare presets over a period: context agreement, latency p50/p95, errors, fallback, tokens and cost. Missing execution/fallback/per-message usage evidence stays unavailable with a reason; classifier identity is not execution identity and aggregate stats cannot be allocated to calls/presets.
- Quota subscriptions (Claude Pro, ChatGPT Plus, Grok or custom labels) have user-supplied limits only, never invented defaults. Rolling 5 h and weekly token/message estimates require timestamped attributable records or stats exactly covering the requested window/metric. Partial/unknown evidence is explicit; never difference sliding stats or sum overlapping snapshots. Subscription cost zero is not quota zero.
- Alerts derive only from explicit rate-limit, quota-exhaustion or fallback evidence, with configurable hold/debounce and minimum repeat interval. Unknown never fires. UI ticker/panel are always available; desktop notifications are opt-in (`notify-send` Linux, `osascript` macOS), argument-array based, and failures cannot crash ingestion.

### Replay, exports and existing issues
- Replay is a client cursor over a retained past session: play/pause/speed, event stepping, timeline and Call in focus share one cursor. Expose retention/omission limits; replay is not durable transport history.
- UI GET downloads and CLI `export --from --to --format md|csv` report validated ranges. Keep source identity, range and coverage; exclude out-of-range events and label separately ranged stats. Unknown CSV cells are empty with status/reason. Escape formula-leading cells. Server downloads never write report files.
- Restore focus after selected-event eviction; retain/reconcile orphaned filter options; visibly count rejected browser payloads; adapt sparse patch bay spacing without invented calls. Verify real OpenCode 2.2.5 stats flags and remove unsupported flags/environment controls.
- Tests first; multi-source PC + Orca + local fixtures; smoke tests per view; Playwright screenshots at 1440×900 and 1024×768. Typecheck/lint/tests/build and CI must pass. PR distinguishes real runtime evidence from fixtures and explicitly declares macOS unverified unless exercised.
