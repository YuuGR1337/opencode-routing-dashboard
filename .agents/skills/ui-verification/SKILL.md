---
name: ui-verification
description: Verify changed dashboard views and reproduce UI problems with isolated anonymized data, observable SSE readiness, interaction checks and reviewed screenshots. Use for UI behavior/design work, not prose-only documentation or unrestricted inspection of personal sessions.
---

# UI verification

Verify the actual changed experience, not a screenshot that merely looks populated. No dependency installation, real-data access, or new service permission is implied by loading this skill.

## Select and isolate

1. Read [DESIGN](../../../docs/DESIGN.md), [verification contracts](../../../docs/VERIFICATION.md), [known limits](../../../docs/KNOWN_ISSUES.md), and the relevant commands in [README](../../../README.md). Identify the changed user journey and what is not being tested. DESIGN records both the accepted Lane Bay contract and the previous identity that still ships; verify changed UI against the identity its approved scope targets (the previous identity until #33 is approved and lands).
2. Confirm the working directory and worktree before every build/server command. Inspect existing scripts as executable code before trusting a third-party helper; `--help` can also execute code. Do not install tools, read credentials or attach to a personal browser profile.
3. Use existing anonymized fixtures and a newly created OS temporary directory for mutable replay inputs. Never append to tracked fixtures or personal logs. Explicitly select every observe/route/permissions, stats and snapshot path so defaults cannot read a user profile; disable stats spawning or use the documented offline stats file. Disable optional desktop notifications.
4. In a read-only review, do not run a build that writes `dist/` in the checkout without permission. `scripts/demo-exchange.ts` automatically builds there if `dist/index.html` is missing: inspect this precondition before launching it. Use approved existing assets or an approved isolated copy/output, or report that runtime verification is unavailable. In an approved UI implementation task, normal build outputs are allowed within scope. Keep fixtures and paths portable; do not depend on a pre-created agent-specific temporary root.

## Run the matching contract

5. Choose the dataset and harness together, using the documented commands in README and VERIFICATION. `scripts/demo-exchange.ts` uses anonymized multi-source fixtures and real loopback agents; `scripts/verify-ui.mjs` has a controlled canonical-fixture contract. They are not interchangeable. Its exchange sub-harness injects state and stubs EventSource: those checks establish controlled UI behavior, not real multi-source transport. A mismatched fixture assumption is not proof of a product regression: identify it, select the right contract, and do not weaken assertions to hide it. If an approved DESIGN revision changes a presentation contract, update its expectation explicitly alongside that decision while preserving behavioral safeguards; do not silently relax a failing check.
6. Bind only to loopback, select a free port using supported options, and record the instance URL, child-process ownership and output locations. Only contact explicitly configured local fixture endpoints. Do not change proxy/security configuration to bypass a failure. Persistent SSE is expected.
7. Wait for an observable ready state: a validated snapshot with the expected DEMO/source identity and a relevant rendered locator/state. Do not use `networkidle` as the readiness gate, arbitrary sleeps as proof, or transport open as proof of valid data. This is a requirement to verify, not a claim that the existing script covers every readiness condition. Without `--state-dir`, append-dependent checks are skipped; report them. Use the tools already available; lack of a browser tool is a reported verification gap, not authorization to install one.

## Observe and close

8. Run smoke tests for changed views and focused interactions: source/filter selection, event/timeline/replay coherence, keyboard traversal and focus restoration, empty/partial/error/disconnected states, and eviction where relevant. Check reduced motion and non-color status cues. A replay cursor is not durable history; a stopped animation is not necessarily paused live updates. Check live-update pause/resume requirements against the intended accessibility target without claiming compliance from a checklist alone.
9. For visual changes, pass an explicit owned temporary `--screenshots-dir`, open the captures, and copy only reviewed images to repository-root `docs/screenshots/` under the approved task. Inspect existing tracked names before replacing them; the exchange harness uses fixed filenames and otherwise can write into the shared OS temporary root. Capture both 1440×900 and 1024×768: the script's main flow covers 1440×900 only, while its controlled exchange views cover both, so obtain missing viewports separately or report the gap. List approved DESIGN deviations. Inspect console/page/network failures and distinguish expected open SSE/timeouts from real errors. Data-rich fixtures do not prove real execution support.
10. Stop only the instances created for this check, restore owned temporary state as documented, and verify no owned listeners/processes remain. Never kill unrelated processes. Do not claim cleanup or platform support without checking it.
11. Report exact commands, exit codes, assertions and screenshot paths. Separate browser observations, static smoke tests, documented historical results and unverified behavior. Run the final integrated checks after writers reconcile; no screenshots are needed for guidance-only edits. See [agent workflow guidance](../../../docs/AGENT_WORKFLOWS.md).

## Existing harness limits

The exchange harness renders scripted health states; it does not prove real browser disconnect/reconnect transitions. Its pause assertion concerns replay, not live-update pause. The reduced-motion check establishes preference/CSS presence, not that every animation actually stops; test the changed interaction separately. The real-agent demo shifts fixture timestamps and uses zero alert hold time, so its apparent freshness/alert timing is constructed evidence, not a production measurement. Cleanup must be checked, especially after forced termination.
