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
- Bind 127.0.0.1 only; no auth needed; no outbound network.
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
