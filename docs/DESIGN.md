# DESIGN

The UI must be beautiful, original, dynamic and fun, and dense. It is explicitly **not** a generic AI dashboard.

## Concept: the Switchboard
Routing is shown as a live telephone-exchange / rail-yard switchboard.
- **Left rail – inputs**: each user message enters as a "call" (a short glowing token) with its timestamp and first words.
- **Middle – the patch bay**: Jev's suggestion is a dashed *ghost wire* to a role jack; the real path is a solid wire
  from the agent jack (orchestrator, oracle, fixer, explorer, designer) to a model jack. Agreement = ghost and real wire land
  on the same role jack (the jack lights). Disagreement = visible kink.
- **Right rail – models**: one jack per provider/model/variant, sized by load. A fallback hit draws the wire
  *through* the skipped first-choice jack, which sparks and dims.
- **Bottom – the ticker tape**: dense, monospaced event log (every field), filterable, clickable to drill down.
- Side drawers: Agreement matrix, Usage, Errors, History (weekly snapshots as a small-multiples strip).

## Typography
- Data/mono: **JetBrains Mono** or **IBM Plex Mono** (tabular numerals everywhere).
- Labels/display: **Space Grotesk** or **Instrument Sans**; condensed caps for jack labels.
- Sizes: 11/12 px for table cells, 13 px body, 20 px numbers in the header readouts. No giant hero text.

## Color system (dark "exchange room", amber phosphor)
- Background `#0E0F0C` (warm near-black), panels `#171914`, hairlines `#2A2D25`.
- Ink `#E8E4D8`, dim ink `#8C8A80`.
- Signal: amber `#FFB000` (live/active), cable teal `#3CC8B4` (real path), ghost `#E8E4D8` at 35% dashed (Jev suggestion).
- States: ok `#7BD88F`, warn `#FFB000`, error `#FF5A3C` (also shown by shape/icon, not color alone).
- Roles get fixed hues: orchestrator amber, oracle `#C792EA` used sparingly only for oracle jacks, fixer teal, explorer `#82AAFF`, designer `#F78C6C`.
- No purple/blue gradients, no glassmorphism, no neon-on-everything. Flat colors, 1 px hairlines, subtle scanline/grain texture at most 3% opacity.

## Motion rules
- New call: token travels the wire in 400–600 ms (ease-out), jack pulses once. Fallback: 120 ms spark.
- Motion encodes data only (arrival, routing, failure); nothing loops idly. Respect `prefers-reduced-motion` (switch to instant + highlight).
- Max 60 fps, animate transform/opacity only; batch bursts (> 10 events/s collapse into a counter).

## Density guidelines
- Every event exposes: ts (local, ms), session, message, Jev role + confidence + needs_oracle, route decision + reason,
  agent, model/provider/variant, fallback (yes/no/unknown), latency, tokens in/out/reasoning/cache, cost, errors.
- Ticker rows 22 px; header readouts: prompts/min, agreement %, fallback %, error %, p50 latency, tokens today.
- Filters: time range, session, role, agent, model, decision, errors only; keyboard shortcuts (`/` search, `f` filters, `j/k` rows, `enter` drill-down, `esc`).
- Drill-down panel: full event JSON, timeline of the session, linked stats.
- Empty/missing-file states are designed (a "silent exchange" with the expected path), not blank.

## Anti-slop rules (hard)
- No default shadcn card grids, no rounded-2xl card wall, no purple gradients, no emoji headers, no "✨ Insights" copy.
- No stock dashboard layout (KPI cards row + two charts). The switchboard is the primary view.
- No placeholder lorem or fake data in the live UI; fixtures only in tests/demo mode labeled "DEMO".
- Charts are custom SVG (or a tiny lib) styled to the system; no default chart-lib theme.
- Copy is terse and technical.

## Verification
Each UI milestone ends with screenshots (Playwright, 1440×900 and 1024×768, live with fixtures replayed) saved to
`docs/screenshots/` and reviewed against this file; list every deviation.

## Evidence-driven deviations (v1)

SPEC's documented evidence limits take precedence over the conceptual execution wiring:
- Draw dashed Jev suggestion wires only. A separate hollow `ctx` jack denotes the recorded context agent; matching jacks indicate **context agreement**, not proven delegation.
- Do not draw solid per-call agent-to-model execution cables. The right rail is explicitly **aggregate stats, unlinked to calls**, sized by steps. No fallback spark is drawn without an observable fallback.
- Fallback reads `not detectable`, with no invented percentage. Execution agent/model/provider/variant, per-message tokens and cost read `—`; classifier model remains a separately labeled field.
- At narrower widths, lower-priority ticker fields may move into the event detail drawer rather than becoming unreadably compressed. Complete raw records remain inspectable there.
- Fixture replay is explicitly labeled `DEMO`; live mode never fills missing sources with fixtures.
- Detail lists show `newest k of n retained` and omitted/evicted counts when bounded. Aggregate readouts describe the retained window, not just visible or transmitted rows. Malformed counters are labeled process-lifetime; stats tool failures display their own stats range.

These are semantic corrections, not permission to relax the palette, typography, density, motion or anti-slop rules.

## M4a review

Reviewed live, empty, event-detail and arrival captures under `docs/screenshots/m4a-*`.
The following layout choices are accepted: an optional call-in-focus readout above
1280 px; drawer navigation in the source-health row; lowercase ticker labels;
orthogonal suggestion wires with a 500 ms arrival token on their final segment;
flat background without optional grain. The ticker renders at most the newest
300 transmitted rows and states the limit. Full transmitted raw records remain
available through event detail. These choices preserve the exchange-room
palette, compact typography, 22 px rows and no-idle-animation constraint.

M4a intentionally leaves view drawers and search/filter shortcuts for M4; they
are disabled and labeled, not presented as working functionality.
