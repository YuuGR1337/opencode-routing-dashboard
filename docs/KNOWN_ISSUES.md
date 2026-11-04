# Known issues and verification limits

Ranked by impact; none prevents the documented fixture/local workflow.

1. **Source evidence, not execution tracing.** The logs cannot establish the actual delegated agent, execution model, per-message tokens/cost or fallback hits. Context agreement is explicitly labeled; unavailable fields remain unknown. Reading a preset alone cannot resolve this.
2. **OpenCode is an external subprocess boundary.** The app itself uses only loopback/same-origin network access. Download/update/exporter controls apply to its stats child, not to independent OpenCode services or arbitrary third-party plugins. No OS network sandbox is installed. Real user stats were not executed during verification; fixture files and fake executables establish the tested contract.
3. **Large data and transport budgets.** Detail rows are complete newest suffixes under the 16 MiB SSE budget, with explicit omissions. An oversized stats/history-only base is rejected by the transport guard. Full-state replacements can be expensive near the cap. Startup is verified with 10k lines, not unlimited historical files or every configured maximum.
4. **History portability and scope.** Atomic no-overwrite publication requires hard links. Snapshot points retain their own ranges; they are not additive weekly deltas. Byte limits can omit individual snapshots, reported by source status. Exceptional OS file-close failures during refresh were not fault-injected.
5. **Minor live UI edge cases.** Evicting a selected event may remove its drawer without restoring focus. A filter value that disappears from the transmitted window can remain active while its option is absent. Rejected malformed UI payloads are ignored without a visible rejection counter. Normal tested navigation and reconnect paths pass.
6. **External deployment checks not performed.** Linux/Bun/Chromium were exercised. macOS runtime, actual systemd installation and registry publication were not. The local archive/bin and service definitions are verified; this PR does not publish, install a service, bump a version, merge or tag a release.

## Process evidence limits

The first M1 red run failed on the absent parser module rather than an exported behavioral stub. The original append/SSE test was added after its first implementation. Later schema, aggregation, tailing, server-security, transport-size, reconnect, keyboard, clock and snapshot regressions have recorded failing-before/passing-after evidence. No test was weakened, skipped or deleted to obtain green checks; the M4a "not yet implemented" drawer assertion was replaced by the completed-behavior assertion in M4.
