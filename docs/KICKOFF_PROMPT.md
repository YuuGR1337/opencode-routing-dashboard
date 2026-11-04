# Kickoff prompt (paste into OpenCode, orchestrator agent, in this repo)

```
/deepwork Build opencode-routing-dashboard end to end in this repository.

Read first, in order: AGENTS.md, CONTRIBUTING.md, .agents/skills/*/SKILL.md (branch-and-pr, tests-first, release), docs/SPEC.md, docs/DESIGN.md, docs/ARCHITECTURE.md, docs/PLAN.md, fixtures/.
They are the source of truth. If they conflict, SPEC.md wins; record the decision in docs/SPEC.md.

Goal: a localhost-only (127.0.0.1) real-time dashboard, Bun + TypeScript (strict) + React, that tails
the JSONL logs and polls `opencode stats --json` exactly as described in SPEC.md, and serves the
views Flow, Agreement, Usage, Errors, History over SSE. Generic for any OpenCode user: every path
and port configurable, no hardcoded usernames.

Working rules:
- Branch model: `develop` is the integration/default branch, `main` is releases only. Start with
  `git switch develop && git pull --ff-only && git switch -c feat/dashboard-v1`. Never commit to or push
  `develop` or `main`, never force-push, never delete branches, never push tags. Follow the
  branch-and-pr and tests-first skills (TDD: failing test first for every parser/aggregator/endpoint/view).
- Work milestone by milestone following docs/PLAN.md (M1..M6). One or more commits per milestone,
  conventional messages. Tick each PLAN.md box only when its done criteria hold.
- Done criteria per milestone: `bun run typecheck`, `bun run lint` and `bun test` exit 0, new behavior has tests
  against fixtures/, docs and CHANGELOG.md [Unreleased] updated. Paste the exact commands and exit codes in your milestone report.
- Parse inputs at the boundary; malformed lines are counted and skipped, never crash. Missing files are
  a normal empty state.
- Integration test required: start the server on a random port, append a line to a temp JSONL, assert it
  arrives over SSE within 2 s. UI: smoke render test per view.
- Real verification before the end: run `bun run start` against fixtures (ORD_STATE_DIR=fixtures),
  curl /api/state and /api/events, confirm it binds only 127.0.0.1 (`ss -ltnp`), and check the UI loads.
- Design: the UI must follow docs/DESIGN.md (switchboard concept, color/type/motion tokens, density,
  anti-slop rules). Do a dedicated design pass (M4a) before the views. No generic card grids, no purple
  gradients, no emoji headers. After each UI milestone, capture Playwright screenshots (1440x900 and
  1024x768, fixtures replayed live) into docs/screenshots/, open and review them against DESIGN.md, and
  fix or record every deviation. Include the screenshots in the PR body.
- Fallback hits: implement detection against the active preset in
  ~/.config/opencode/oh-my-opencode-slim.json only if the data allows it; otherwise show "not detectable"
  and say so in SPEC.md. Do not invent data.
- Security: never read ~/.ssh, .env, auth.json, service.json or any credential store; no outbound network
  from the app; never commit real logs or prompts (fixtures stay anonymized).
- Keep dependencies minimal (React, react-dom, and at most a small schema lib). No database.
- Ask me only if truly blocked (credentials, paid services, irreversible/public actions).

Stop when: all PLAN.md boxes (M1–M6 incl. M4a)  are checked, typecheck and tests pass locally, CI passes on the
branch, and you have opened a pull request with `gh pr create --base develop --head feat/dashboard-v1`
using .github/pull_request_template.md, whose body lists: what was built, how to run it, verification evidence (commands + exit codes,
curl output excerpts), and a ranked known-issues list. Do not merge the PR, do not bump the version or tag a release (release skill is maintainer-only). Then stop and report the PR URL.
```
