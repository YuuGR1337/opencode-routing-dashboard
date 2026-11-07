# Product roadmap

This is a revisable product direction, not a release schedule, implementation approval, or claim of shipped functionality. Issues and [project fields](REPOSITORY.md) retain their own decisions. `Todo` means backlog; `Under evaluation` does not authorize coding. No owner, version or delivery date is assigned by this document.

## North star

Make recorded harness activity understandable, problems investigable, and configuration comparisons evidence-based: natural to start, technically deep when needed, and honest about unknowns. OpenCode is the first supported source ecosystem; another harness is an ambition to validate, not universal compatibility.

## Chosen directions versus open decisions

- **Direction selected:** keep the routing switchboard central, but explore a new visual identity. The current amber/phosphor palette and maximum-density vocabulary need not survive. Motion should communicate recorded facts, not unproven execution.
- **Direction selected:** Electron for the future desktop app, reusing React and a separate local service. See [the desktop direction record](decisions/0001-desktop-direction.md). No framework/dependency installation is approved by this document.
- **Direction selected:** CLI and app observe/control the same local observability service, not separate copies of business state. This is not permission to execute harness tasks or add remote administrative endpoints.
- **Direction selected:** bounded local diagnostics and isolated DEMO scenarios. Instrumentation has overhead and must be measured, not described as free or as task telemetry.
- **Still open:** exact design, lifecycle/control/security contract, platform support, diagnostic budgets, second harness, external-evidence authorization, and each implementation slice.
- **Not committed:** Rust migration, graph, attributable task budget, rule-management workflow, hosted collaboration, or harness execution.

The existing [DESIGN](DESIGN.md), [SPEC](SPEC.md), and evidence/security limits remain the implementation baseline until explicitly revised. DESIGN now records the accepted Lane Bay contract (#32); the shipped UI keeps the previous identity until its implementation (#33) is approved and lands. Direction selection does not mark all related issues Approved.

## Horizons and evidence gates

| Horizon | User outcome and proposed work | Evidence before calling it delivered | Related issues |
| --- | --- | --- | --- |
| Understand live routing | New identity around a modern switchboard; clear connection/first-use states; guided distinction between suggestion, context and execution unknowns | Same labeled DEMO content across candidate designs; explicit DESIGN decision; empty/partial/error/disconnected states, keyboard and reduced motion at both target sizes; a new-user comprehension check | [#23](https://github.com/crisesarmiento/opencode-routing-dashboard/issues/23), [#24](https://github.com/crisesarmiento/opencode-routing-dashboard/issues/24), [#25](https://github.com/crisesarmiento/opencode-routing-dashboard/issues/25) |
| Operate through CLI and desktop | One local service, lifecycle contract, CLI control, then Electron attach/start experience | Single intended instance; confirmed versus unreachable state; startup/shutdown/ownership/security tests; separately exercised packaged artifacts for every claimed OS | [#26](https://github.com/crisesarmiento/opencode-routing-dashboard/issues/26), [#27](https://github.com/crisesarmiento/opencode-routing-dashboard/issues/27) |
| Investigate and share safely | Improve inspection of retained sessions; policy-first configuration diagnostics export | Source/session boundaries and omissions visible; no task-success inference; allowlist and forbidden-input rejection before reads; no prompts/credentials in exports | [#4](https://github.com/crisesarmiento/opencode-routing-dashboard/issues/4), [#10](https://github.com/crisesarmiento/opencode-routing-dashboard/issues/10) |
| Measure and reproduce alongside earlier work | Local bounded diagnostics; isolated empty/burst/malformed/disconnect/restart scenarios | Opt-in detailed tracing; isolation/privacy/bounds; measured off/on overhead and agreed budgets; measurements labeled by clock, units and process scope | [#28](https://github.com/crisesarmiento/opencode-routing-dashboard/issues/28) |
| Surface defensible signals | Repeated-error rules, fallback-source research, evidence-backed comparison extensions | Triggering evidence, denominators and coverage; verified emitters/contracts before fallback or duration claims; no inference that errors mean stall or agreement means quality | [#6](https://github.com/crisesarmiento/opencode-routing-dashboard/issues/6), [#7](https://github.com/crisesarmiento/opencode-routing-dashboard/issues/7), [#8](https://github.com/crisesarmiento/opencode-routing-dashboard/issues/8) |
| Validate expansion | One second harness with capability-aware semantics; separately evaluate external evidence | Authorized source review and a useful bounded job; not-applicable distinguished from unavailable; manual session/PR/exact-SHA applicability and explicit authorization before integration | [#29](https://github.com/crisesarmiento/opencode-routing-dashboard/issues/29), [#5](https://github.com/crisesarmiento/opencode-routing-dashboard/issues/5) |
| Keep future bets visible | Research fit of failure-linked rules and prerequisites for graphs/task budgets | Scope decision, real identities/attribution and auditable approval/storage prerequisites; no implementation within research | [#9](https://github.com/crisesarmiento/opencode-routing-dashboard/issues/9), [#11](https://github.com/crisesarmiento/opencode-routing-dashboard/issues/11) |

These horizons are not a strict waterfall. Identity exploration and independent connection-state work can overlap. Minimal diagnostics should accompany relevant work, not wait until the app is complete. Second-harness research may start early; a universal adapter platform is not a prerequisite for first-use UX. Session inspection does not require external evidence to be useful.

## First candidate slices

1. Explore the new identity with equivalent populated/empty/partial/error scenarios and record the selected direction before changing the design contract.
2. Clarify connection state and existing empty-state guidance without a broad layout rewrite. Distinguish transport connection, first valid state, retained client data, and source health. Local receipt time is not source freshness.
3. Apply guided hierarchy/vocabulary to the populated switchboard, keeping data limits discoverable and detail intact.
4. Improve retained-session investigation and validate the shared-service contract. Pick further work from observed user friction and evidence readiness, not from feature count.

Each slice needs its own approval, exclusions, observable criteria and verification. The current documentation/skill maintenance PR does not implement any of these product slices.

## Deliberate exclusions and revision

Do not invent execution paths, fallback attempts, parent/child edges, task outcomes, USD costs, subscription limits or per-task consumption. Do not allocate aggregate stats to tasks. Do not equate review approval with a human-approval telemetry event or missing errors with success. Sources without routing must not be forced into a routing visualization.

Revisit the order using user value, comprehension, trust, remaining friction, actual demand, evidence availability, complexity and dependencies. Avoid precise scores or dates without a defensible basis. A new direction or integration requires an explicit decision; a new skill or catalog entry does not supply authorization.

See [PLAN](PLAN.md) for implementation records, [known limits](KNOWN_ISSUES.md) for current gaps, and [agent workflows](AGENT_WORKFLOWS.md) for contributor verification procedures.
