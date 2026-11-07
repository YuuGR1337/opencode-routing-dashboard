# Known issues and verification limits

Ranked by impact; none prevents the documented fixture/local workflow.

1. **Source evidence, not execution tracing.** Standard Jev logs cannot establish the actual delegated agent, execution model, per-message tokens/cost or fallback hits. Optional explicit enrichment fields are accepted and validated, but their appearance in fixtures is not a claim that stock OpenCode emits them. Context agreement is explicitly labeled; unavailable fields remain unknown. Reading a preset alone cannot resolve this.
2. **OpenCode is an external subprocess boundary.** The v0.1 app uses loopback/same-origin network access; v0.2 permits only explicitly configured source connections and authenticated explicit non-loopback agents (SSH remains the default). Download/update/exporter controls apply to its stats child, not to independent OpenCode services or arbitrary third-party plugins. No OS network sandbox is installed. v0.2 verified installed OpenCode 2.2.5 help and actual stats output against an isolated empty profile, not real user stats; the same check was repeated with 2.2.6 on 2026-11-07. `--standalone` is supported; unsupported `OPENCODE_PURE` was removed. `OPENCODE_DISABLE_LSP_DOWNLOAD` is still set for the stats child, but its token is absent from both the 2.2.5 and 2.2.6 binaries, so it is not a verified safeguard (follow-up pending). See VERIFICATION.md.
3. **Large data and transport budgets.** Detail rows are complete newest suffixes under the 16 MiB SSE budget, with explicit omissions. Over-budget individual sources are isolated without starving healthy ones. Full-state replacements can be expensive near the cap. Startup/agent/SSE parsing are verified with 10k fixture-derived records, not unlimited historical files or every configured maximum. HTTP reports use UI-budget states and conservatively flag incomplete ranges even when more records remain retained internally; analytics uses cached full retained states.
4. **History portability and scope.** Atomic no-overwrite publication requires hard links. Snapshot points retain their own ranges; they are not additive weekly deltas. Byte limits can omit individual snapshots, reported by source status. Exceptional OS file-close failures during refresh were not fault-injected.
5. **Quota/preset coverage.** Limits are user-supplied and most standard-log quota/fallback values remain partial or unknown. Sampled preset-file selection is not proof that a running process used it; overrides and changes/reversions between polls can be missed. Replay covers retained/transmitted events, not a durable complete session archive.
6. **External deployment checks not performed.** Linux/Bun/Chromium were exercised. macOS runtime, real SSH/Tailscale connectivity, real desktop notifications, actual systemd installation and registry publication were not. The PR bumps the package to 0.2.0 but does not publish, install services, merge or tag a release.

## Additional v0.2 boundaries

- Duplicate-source suppression uses the agent process epoch. It detects two endpoints
  reaching the same running agent, not two independent agent processes reading the
  same files or the dashboard collecting those files locally as well. Configure one
  collector per dataset; otherwise combined event counts can double-count it. Separate
  source stats remain separate and are not summed into combined financial totals.
- Agent prompt redaction removes the known observe/route `prompt` fields only.
  Unknown record fields are preserved by design and are not generally sanitized.
- Agent protocol retention is capped at 10,000 records per log source; larger agent
  retention settings must fail explicitly rather than produce unreadable envelopes.
- Remote requests refuse configured HTTP(S)/ALL proxy variables, even with NO_PROXY.
  This intentionally favors bearer-token isolation over transparent proxy support.
- macOS, real SSH/Tailscale connectivity and real desktop notifications have not yet
  been exercised for v0.2. Loopback fake-agent tests do not establish those deployments.
- Orca Linux launcher/state/worktree metadata was verified, but Jev logs do not
  explicitly identify the client. Directory-prefix/source rules are configured
  classifications, not inferred runtime provenance. Full live launch arguments,
  macOS Orca locations and effective per-process preset overrides remain unverified.

## Process evidence limits

The prior UI issues (eviction focus, orphan filters and rejected-payload counter)
are fixed and covered by the passing 134-check browser run. Sparse patch bay
behavior is captured at both required sizes. Browser temporal/replay/update edge
checks use a controlled canonical-fixture harness; real-agent demo checks are
separately scoped and do not prove all those interactions across physical hosts.

The first M1 red run failed on the absent parser module rather than an exported behavioral stub. The original append/SSE test was added after its first implementation. Later schema, aggregation, tailing, server-security, transport-size, reconnect, keyboard, clock and snapshot regressions have recorded failing-before/passing-after evidence. No test was weakened, skipped or deleted to obtain green checks; the M4a "not yet implemented" drawer assertion was replaced by the completed-behavior assertion in M4.
