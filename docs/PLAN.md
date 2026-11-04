# PLAN

Sign-off requires local checks and green branch CI. Evidence lives in
[VERIFICATION.md](VERIFICATION.md); source limits and remaining issues are
recorded in [KNOWN_ISSUES.md](KNOWN_ISSUES.md).

- [x] **M0 Scaffold** – repo, docs, CI (done in initial commit; validated with the complete branch).
- [x] **M1 Parsers** – schemas for the 3 JSONL formats + stats JSON; tests on `fixtures/`; malformed-line counting.
- [x] **M2 Core** – join observe/route by message; agreement matrix; usage per model/provider/variant; error rollups; fallback detection vs `oh-my-opencode-slim.json` active preset (or "not detectable").
- [x] **M3 Live server** – config, tailer, stats poller, SSE endpoint, `/api/state`; integration test (append → SSE < 2 s); bind 127.0.0.1.
- [x] **M4a Design pass** – implement the DESIGN.md switchboard shell, type, color tokens, motion; screenshots reviewed.
- [x] **M4 UI** – React views: Flow, Agreement, Usage, Errors, History; smoke render tests; empty/missing-file states.
- [x] **M5 Ops** – `bin` entry for `bunx`, weekly snapshot job, `contrib/` systemd user unit, README usage + screenshots.
- [x] **M6 Hardening** – rotation/truncation tests, 10k-line perf check (< 1 s), docs pass.

Signed off after local validation and successful branch CI for `8d3f495`:
[check](https://github.com/crisesarmiento/opencode-routing-dashboard/actions/runs/41822906254/job/126550242459).
No registry publication, service installation, merge, version bump or release is part of this sign-off.
