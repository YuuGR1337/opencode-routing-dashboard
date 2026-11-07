# 0001: Electron desktop direction with an independent local service

## Status and context

**Direction selected by the maintainer during product discovery, 2026-11-07. Implementation remains under evaluation.** This records the decision behind [#27](https://github.com/crisesarmiento/opencode-routing-dashboard/issues/27), not delivery of an Electron app. The product currently has a React browser interface and a Bun CLI/service with foreground `serve` and `agent` commands.

The maintainer wants a polished cross-platform desktop experience, CLI control of the same service, and safe diagnostics. Rust is of interest for future experimentation but should not require a backend rewrite to package the current product.

## Decision

- Select Electron as the desktop shell direction; preserve React and the separate Bun service initially.
- Keep collection/aggregation and shared state in the observability service, not duplicated in desktop and CLI clients.
- Evaluate CLI invocation for startup/bounded operations and a persistent connection for live state. Exact discovery/control/IPC and version contracts remain open in [#26](https://github.com/crisesarmiento/opencode-routing-dashboard/issues/26).
- Keep harness observation separate from control of our own local service. Do not add harness execution or remote administration as a consequence of desktop packaging.
- Do not commit to a later Electron-to-Tauri or backend-to-Rust migration. Revisit individual components if experimentation demonstrates value.

## Alternatives considered

- **Browser-only:** remains a useful existing access path, but does not alone provide an installable desktop lifecycle.
- **Tauri:** could retain React, use system WebViews and introduce Rust for desktop integration, with Bun as a sidecar. It remains a valid alternative if the decision is revisited, not a required future migration.
- **Immediate Rust backend rewrite:** rejected as a prerequisite; it combines distribution work with a separate runtime migration without established need.

## Consequences and open questions

Electron's main process runs Node.js, not Bun. Packaging Bun, supervising it, handling readiness/version mismatch and attaching to existing instances require explicit work. Define process ownership, window-close behavior, intentional stop versus unreachable state, restart recovery and OS-specific integration before claiming a managed service.

Electron bundles Chromium and Node.js; security updates, renderer isolation, sandboxing, restricted navigation and narrow validated privileged communication matter. Log/source content remains untrusted input. Do not expose arbitrary filesystem, shell or raw IPC capabilities to the renderer.

Target ambition is Linux/macOS/Windows; existing Linux evidence is not verification of desktop packages, macOS, or Windows. The current documented runtime scope is Linux/macOS; adding Windows needs its own compatibility evidence. Signing, distribution, updater policy and lifecycle details are not selected here.

## Authorization and verification

This record does not install dependencies, enable autostart, grant permissions, start services, approve issues, or authorize release/tag/package publication. A bounded packaging proof must test attach/start/readiness/failure/close behavior with anonymized inputs, preserve loopback/security boundaries, and verify owned-process cleanup. Test each packaged platform before claiming support.

References: [Electron process model](https://www.electronjs.org/docs/latest/tutorial/process-model), [Electron security](https://www.electronjs.org/docs/latest/tutorial/security), [Tauri process model](https://v2.tauri.app/concept/process-model/), [Tauri sidecars](https://v2.tauri.app/develop/sidecar/), and [roadmap](../ROADMAP.md).
