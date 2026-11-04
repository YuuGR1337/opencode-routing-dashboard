# PLAN

- [ ] **M0 Scaffold** – repo, docs, CI (done in initial commit except this box).
- [ ] **M1 Parsers** – schemas for the 3 JSONL formats + stats JSON; tests on `fixtures/`; malformed-line counting.
- [ ] **M2 Core** – join observe/route by message; agreement matrix; usage per model/provider/variant; error rollups; fallback detection vs `oh-my-opencode-slim.json` active preset (or "not detectable").
- [ ] **M3 Live server** – config, tailer, stats poller, SSE endpoint, `/api/state`; integration test (append → SSE < 2 s); bind 127.0.0.1.
- [ ] **M4a Design pass** – implement the DESIGN.md switchboard shell, type, color tokens, motion; screenshots reviewed.
- [ ] **M4 UI** – React views: Flow, Agreement, Usage, Errors, History; smoke render tests; empty/missing-file states.
- [ ] **M5 Ops** – `bin` entry for `bunx`, weekly snapshot job, `contrib/` systemd user unit, README usage + screenshots.
- [ ] **M6 Hardening** – rotation/truncation tests, 10k-line perf check (< 1 s), docs pass.
