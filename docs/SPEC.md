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
