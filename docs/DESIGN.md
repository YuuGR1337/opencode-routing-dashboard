# DESIGN

The UI must be beautiful, original, dynamic and fun, and dense. It is explicitly **not** a generic AI dashboard.

## Contract status

- **Accepted in merged PR [#39](https://github.com/crisesarmiento/opencode-routing-dashboard/pull/39):** the **Lane Bay** contract below (issue [#32](https://github.com/crisesarmiento/opencode-routing-dashboard/issues/32), parent [#23](https://github.com/crisesarmiento/opencode-routing-dashboard/issues/23); maintainer decisions recorded in [the #32 comment](https://github.com/crisesarmiento/opencode-routing-dashboard/issues/32#issuecomment-6714423966)). It is the target for UI work in #33.
- **#33 has separate [bounded-scope approval](https://github.com/crisesarmiento/opencode-routing-dashboard/issues/33#issuecomment-6715778224).** This implementation applies that slice; the previously shipped UI uses amber-phosphor until #33 lands. This approval does not extend to the deferred items below or the rest of #23.
- The sections "Previous identity" and the M4a/M4/M9/M11 reviews at the end describe what ships today. They stay as the historical record and as the baseline for any UI work done before #33.
- **Layout measured in isolated Linux Chromium for #33.** The layout table below records DOM measurements against anonymized DEMO inputs, not just static mockup arithmetic. Contrast ratios are **computed with the WCAG formula on token hex pairs; they are not an accessibility audit.** Keyboard, focus, reduced motion and rendering rules are the contract; executed checks and their limits are recorded separately in [VERIFICATION](VERIFICATION.md).
- Mockups behind this contract are static drawings labeled `DEMO · STATIC MOCKUP · PROPOSAL`, built from the anonymized fixtures. They are referenced from the #32 issue comments and are not committed.

## Concept: the Switchboard

Routing is shown as a live switchboard. A modern look is allowed; the telephone-exchange / rail-yard imagery is inspiration, not a requirement.
- **Left rail – calls**: each user message enters as a "call" with its timestamp, the suggested role (shape + name + confidence) and its first words.
- **Middle – the patch bay**: Jev's suggestion is a dashed *ghost wire* to a role jack (orchestrator, oracle, fixer, explorer, designer). A separate hollow `ctx` ring beside each jack marks the **recorded context agent**. Agreement = the suggestion jack and the ctx ring are the same role. Disagreement is stated in text (`differs`) and drawn as a dotted bracket.
- **Right rail – aggregate**: one entry per provider/model/variant from the stats file, sized by steps, explicitly **not linked to calls**.
- **Bottom – the ticker tape**: dense, monospaced event log, filterable, clickable to drill down.
- Drawers (nav row, keys 1–8): Agreement, Usage, Errors, History, Alerts, Quota, Presets, Export.
- Not drawn in v1 (evidence limits, see "Evidence-driven deviations"): per-call agent→model cables and fallback sparks.

## Typography (Lane Bay)

Fonts stay the existing local files (`web/assets/fonts.css`): **Instrument Sans** (labels, prompts, notes) and **IBM Plex Mono** (data, tabular numerals everywhere). No new fonts, files or dependencies.

| Step | Size | Use |
| --- | --- | --- |
| xs | **11 px** (floor, nothing smaller) | caps labels, notes, ticker cells, meta lines, jack counts |
| sm | 12 / 12.5 px | views nav; rail prompts at ≤1280 px |
| md | 13 px | body, rail prompts at ≥1440 px, focus prompt |
| lg | 15 px bold | wordmark, readout values |

- Wordmark: sentence case, ink, 15 px bold (was amber caps 13 px). Readout values 15 px (was 20 px). All six readouts stay, each with its note.
- Caps labels are 11 px bold with letter spacing. No giant hero text.

## Color system (Lane Bay: graphite, flat)

| Token | Hex | Role | Replaces | Contrast on bg / panel / panel2 *(computed)* |
| --- | --- | --- | --- | --- |
| `--bg` | `#0B0D10` | app background | `#0E0F0C` | n/a |
| `--panel` | `#10131A` | header, rails | `#171914` | n/a |
| `--panel2` | `#171B24` | selected row, raised card (new) | selection used `--panel` | n/a |
| `--line` | `#232831` | hairlines | `#2A2D25` | 1.3:1, decorative separators only |
| `--ink` | `#E7EAEF` | primary text | `#E8E4D8` | 16.1 / 15.4 / 14.3 |
| `--dim` | `#8590A0` | secondary text | `#8C8A80` | 6.0 / 5.7 / 5.3 |
| `--dim2` | `#5B6473` | **non-text only**: idle rings, dashed frame (new) | n/a | 3.3 / 3.1 / **2.9**; never text, never on `--panel2` |
| `--sel` | `#C8F169` | selection bar, focus ring, selected wire origin (new) | `--amber` for selection/focus | 15.0 / 14.4 / 13.3 |
| `--warn` | `#F2B548` | warning, stale, connecting, **DEMO band fill**, `NOT LINKED TO CALLS` label | `#FFB000` | 10.6 / 10.2 / 9.4 |
| `--ok` | `#5FD9A0` | live, ok | `#7BD88F` | 11.0 / 10.5 / 9.8 |
| `--err` | `#FF6B5B` | error, link down | `#FF5A3C` | 7.0 / 6.6 / 6.2 |
| `--ghost` | ink at **45%** (`#6E7074` on bg) | dashed Jev suggestion wire | ink at 35% | 3.9 on bg (35% was 2.8) |

- **Role hues:** orchestrator `#E8C26A` (moved off amber so it no longer shares a hue with warning/DEMO; 11.4 / 10.9 / 10.1). The other four keep their previous hues: oracle `#C792EA` (used sparingly, 8.1 / 7.7 / 7.2), fixer `#3CC8B4` (9.4 / 8.9 / 8.3), explorer `#82AAFF` (8.5 / 8.1 / 7.5), designer `#F78C6C` (8.3 / 7.9 / 7.3).
- **Role shapes** identify roles without hue: orchestrator diamond, oracle hexagon, fixer circle, explorer square, designer pentagon. They appear in jacks, rail rows and ticker cells.
- **Recorded context** is a hollow ring in ink (lit 2 px with a centre dot when it matches the selected call). There is no accent colour for it, because a cyan ring collided with the fixer teal.
- `--amber` is retired as a general token (split into `--sel` and `--warn`). `--teal` is unused: no real path is drawn in v1.
- **DEMO band:** solid, full width, `--warn` fill, dark text (10.6:1), 18 px. Prominence is deliberate.
- Flat colors and 1 px hairlines only. No purple/blue gradients, no glassmorphism, no glow, no shadows, no grain, no neon-on-everything.

### States use icon shape + word, colour only reinforces

| State | Icon | Word | Colour |
| --- | --- | --- | --- |
| live / ok | filled disc | `live`, `ok` | `--ok` |
| connecting | dashed ring | `connecting` | `--warn` |
| stale | half-filled disc | `stale` | `--warn` |
| missing / not confirmed | hollow ring | `missing`, `last known live` | `--dim` or `--warn` |
| link down | ring with ✕ | `link down` | `--err` |
| error | triangle with `!` | error name, e.g. `TimeoutError` | `--err` |

## Layout, density and responsive hierarchy

Top to bottom: **DEMO band → header readouts → source bar → views nav → scope strip → stage (calls | patch bay | aggregate) → ticker.**

| Element | 1440×900 | 1024×768 |
| --- | --- | --- |
| DEMO band | 18 px | same |
| Header (wordmark + six readouts + link) | 56 px | same |
| Source bar / views nav / scope strip | 34 / 28 / 26 px | same |
| Chrome above the stage | 162 px | 162 px |
| Stage columns (calls / bay / aggregate) | 300 / 840 / 300 | 256 / 536 / 232 |
| Call rail rows | 40 px | **36 px** |
| Ticker: title 24 + filters 26 + header 22 + rows 22 each | 248 px for 8 rows | 208 px for 5 rows, with two filter rows |
| Stage height | 490 px | 398 px |
| Active alert row | +22 px | +22 px |

- **22 px ticker rows hold.** Panel titles 24 px, filter rows 26 px. Gap/padding base is 4 px; inherited component heights (22/24/26) are kept.
- The ticker height is sized so no half row shows at the two target viewports. With an active alert it grows to 270 / 230 px and the stage shrinks to 468 / 376 px, retaining 8 / 5 full data rows. Without an exchange source bar, chrome is 34 px shorter and that space belongs to the stage. Aggregate column measurements are grid tracks; the dashed panel has a 4 px inset on each side.
- **Measured #33 containment adaptations:** the bay body scrolls internally when all roles and the sparse tally cannot fit alongside replay, focus and legend; those controls and notes do not shrink. All five roles/tally rows remain reachable without dropping calls. Long compact focus lines scroll horizontally. The 24 px ticker title also scrolls horizontally with keyboard focus and arrow keys when full counts/intake/hints exceed the viewport; no disclosure is removed. Only prompt cells use ellipsis.
- **Readouts:** prompts/min, context agreement, fallback (`n/d`), error rate, p50 latency, tokens today, each with its note (`last 60 s`, `6 of 8 compared`, `not detectable`, `retained window`, `stats range ≠ today`). No metric is added or dropped. Optional note on p50: `classifier · retained window` (the value is the classifier latency from observe/route records).
- **Clipping fixes (required by this contract):**
  - Patch-bay title is short (`PATCH BAY · suggestion vs recorded context`); the legend lives in the bay foot as two lines that may wrap.
   - The source-health row is split into single-line concerns: views nav row; scope strip with file lamps; intake text in the ticker title. At ≥1440 the intake line keeps the existing full text; at ≤1280 it becomes `intake: malformed N · rejected N`. **The detailed `rejected payloads` count lives in the Errors drawer**, per the [#33 scope approval](https://github.com/crisesarmiento/opencode-routing-dashboard/issues/33#issuecomment-6715778224); reuse the existing counter without adding a metric or changing ingestion.
  - Row counter (`N of M sent`) sits in a fixed, never-truncated right slot. Filters keep every existing control and wrap to two rows at ≤1280; if anything truncates it is the scope label.
  - **Call in focus is never hidden.** At ≥1440 it stays in the bay as today. At ≤1280 a **compact two-line call in focus** sits in the bay foot (suggestion + conf, ctx agent and `same role`/`differs`, decision, classifier latency, exec agent/model `—`, fallback `not detectable`). The full record stays in the detail drawer (`Enter`). This replaces hiding the panel at ≤1280.
  - Latency and prompt stay visible at ≤1280; reason, oracle, classifier, fallback and session are what moves to detail there.

## Navigation and terminology

- **Source bar:** keeps its radiogroup behaviour (combined + per-source, arrow keys). Only the look changes: pill radios with state icon + word; `last seen` is shown at ≥1440 and kept in the tooltip at ≤1280.
- **Views nav:** its own text-tab row with the existing digits 1–8, never wrapping. Alerts shows ▲ plus the count when active. No new views, no sidebar, no Settings, no theme selector.
- **Scope strip:** one line that states the viewed source, its state, last event time and the retained count, e.g. `viewing pc · live · last event 02:03:35 UTC · 8 calls retained`, plus file lamps (`observe ok · route ok · permissions ok · stats ok`; `stats missing`; `no files read yet`; `last known:` under link down). Counts must reuse the existing sent/retained values; this adds no metric and no connection-state machine (transport state belongs to #24).

| Term | Contract |
| --- | --- |
| `link live` / `link down` | unchanged (transport) |
| `ctx agent` | unchanged; legend: "recorded context agent, not proof of delegation" |
| `exec agent/model` | one column reading `—` (was two columns that always read `—`) |
| `differs` | text label on the dotted bracket between the suggestion jack and the ctx ring; replaces the plain kink |
| aggregate rail | panel `AGGREGATE · stats only`, label `NOT LINKED TO CALLS` in `--warn` caps |

## Selected-call detail

Fields, in order: suggestion + conf; needs oracle; decision + reason; ctx agent; ctx vs suggestion (`same role` / `differs`); classifier + latency; exec agent/model `—`; fallback `not detectable`; tokens/cost `—`. Error rows show `suggestion — classifier failed`, `failure <name>`, `latency <n> ms` with the error icon. The selected call is a 2 px `--sel` bar with a `--panel2` fill in the rail and the ticker. Selected is not the same as focused (see Keyboard).

## Ticker tape

- Title `TICKER TAPE · newest k of n retained`, intake text, and the existing key hints. Active alerts are one 22 px row above the filters.
- **Columns by tier:**
  - Always: ts, src, suggest (shape + role), conf, decision, ctx agent (ring + role), exec agent/model `—`, latency, error, prompt.
  - ≥1440 only: session, oracle, reason, classifier, fallback.
  - **Detail drawer only: message, tokens, cost.** They always read `—` in v1, so removing the columns hides no data.
- Ellipsis is allowed on prompt cells only; the full text stays in the detail drawer.
- Rows are 22 px. The ticker renders at most the newest 300 transmitted rows and says so (unchanged from M4a).

## Aggregate stats are separate

The aggregate rail has a dashed `--dim2` frame, the `NOT LINKED TO CALLS` label, its own `stats range … to …` and `source …`, then one entry per model (name, variant chip, a bar sized by steps, `N steps · $cost`) and totals. Missing or pending stats read `stats not received · nothing estimated` / `stats pending`, with models, steps and cost `—`. It never feeds per-call metrics, and `tokens today` stays `—` when the stats range is not today.

## Motion rules

- New call: token travels the wire in 400–600 ms (ease-out), jack pulses once. Fallback: 120 ms spark (only if a fallback is ever observable).
- Motion encodes data only (arrival, routing, failure); nothing loops idly. Respect `prefers-reduced-motion` (switch to instant + highlight, with `--sel` as the highlight; the token is static).
- Max 60 fps, animate transform/opacity only; batch bursts (> 10 events/s collapse into a counter).
- The new identity adds no motion. Any added motion needs measured evidence before it is specified.

## Keyboard and focus (intent, not runtime-verified)

- Existing keys unchanged: `/` search, `f` filters, `j/k` rows, `enter` drill-down, `1`–`8` views, `esc`.
- **Focus ring:** 2 px `--sel`, 1 px offset, on every control and on the active ticker row while the event-row scroll region holds focus. That container keeps no outline of its own, so the row indicator must be explicit. `#ticker` names this inner region after the filters, not the outer layout section.
- Source radios: arrow keys move the choice, as today. Escape behaviour (search blur, drawer close) is unchanged.
- Tab order: source bar → views nav → existing bay/replay controls → scrollable ticker title → ticker filters → event rows. The extra title stop preserves keyboard access to long disclosures; the row stop follows the filters. No focus trap or roving views navigation is introduced.

## Density guidelines

- Every event exposes: ts (local, ms), session, message, Jev role + confidence + needs_oracle, route decision + reason, agent, model/provider/variant, fallback (yes/no/unknown), latency, tokens in/out/reasoning/cost, errors. Fields that do not fit a column are in the detail drawer, which holds the full raw record.
- Header readouts: the six above. Ticker rows 22 px.
- Filters: time range, source, session, role, ctx agent, classifier, decision, errors only; keyboard shortcuts as above.
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
- Cover populated, empty, partial and error/disconnected states at both sizes, with DEMO visible. Link-down must come from a real disconnect, not only a drawn state (see #24).
- Layout values above must stay backed by browser measurements. The token assertion in `test/ui-shell.test.tsx` ("stylesheet follows DESIGN tokens") is updated explicitly with the accepted identity in #33; do not weaken or skip it. The font-size ceiling check (≤ 20 px) still holds.
- A new-user comprehension exercise (protocol drafted for #32) has not been run. Comprehension is unknown until it is.

## Evidence-driven deviations (v1)

SPEC's documented evidence limits take precedence over the conceptual execution wiring:
- Draw dashed Jev suggestion wires only. A separate hollow `ctx` jack denotes the recorded context agent; matching jacks indicate **context agreement**, not proven delegation.
- Do not draw solid per-call agent-to-model execution cables. The right rail is explicitly **aggregate stats, unlinked to calls**, sized by steps. No fallback spark is drawn without an observable fallback.
- Fallback reads `not detectable`, with no invented percentage. Execution agent/model/provider/variant, per-message tokens and cost read `—`; classifier model remains a separately labeled field.
- At narrower widths, lower-priority ticker fields may move into the event detail drawer rather than becoming unreadably compressed. Complete raw records remain inspectable there.
- Fixture replay is explicitly labeled `DEMO`; live mode never fills missing sources with fixtures.
- Detail lists show `newest k of n retained` and omitted/evicted counts when bounded. Aggregate readouts describe the retained window, not just visible or transmitted rows. Malformed counters are labeled process-lifetime; stats tool failures display their own stats range.

These are semantic corrections, not permission to relax the palette, typography, density, motion or anti-slop rules.

## Deferred / out of contract

Not part of this contract; each needs its own approval.
- **Curved (bezier) wires.** Orthogonal wires stay (M4a); no evidence yet that curves help. Separate approval.
- **Persistent right-hand inspector** merging call in focus and aggregate stats. Structural panel relocation. Separate approval.
- **Light theme / theme selector.** Not in this contract; a separate decision (visual preferences are coordinated in #31).
- **Crosspoint matrix** (exploration B). Separate approval; may suit the Agreement drawer, not the main screen.
- **B ideas** (`HOW TO READ` block, source list with a status word, hatched aggregate label, sidebar navigation): routed to [#25](https://github.com/crisesarmiento/opencode-routing-dashboard/issues/25) for consideration with guided reading. None is part of this contract.
- **Rejected:** a cyan context ring (hue collides with fixer teal); the full softened role-hue set (only orchestrator moves).
- **Out of scope here:** connection-state behaviour (#24), guided-reading content (#25), desktop packaging (#27), new metrics, execution cables, new fonts or dependencies.

## Previous identity (shipped until #33 lands)

These values describe the UI as shipped today. `web/styles.css` and `test/ui-shell.test.tsx` still use them.

### Typography
- Data/mono: **JetBrains Mono** or **IBM Plex Mono** (tabular numerals everywhere).
- Labels/display: **Space Grotesk** or **Instrument Sans**; condensed caps for jack labels.
- Sizes: 11/12 px for table cells, 13 px body, 20 px numbers in the header readouts. No giant hero text.

### Color system (dark "exchange room", amber phosphor)
- Background `#0E0F0C` (warm near-black), panels `#171914`, hairlines `#2A2D25`.
- Ink `#E8E4D8`, dim ink `#8C8A80`.
- Signal: amber `#FFB000` (live/active), cable teal `#3CC8B4` (real path), ghost `#E8E4D8` at 35% dashed (Jev suggestion).
- States: ok `#7BD88F`, warn `#FFB000`, error `#FF5A3C` (also shown by shape/icon, not color alone).
- Roles get fixed hues: orchestrator amber, oracle `#C792EA` used sparingly only for oracle jacks, fixer teal, explorer `#82AAFF`, designer `#F78C6C`.
- No purple/blue gradients, no glassmorphism, no neon-on-everything. Flat colors, 1 px hairlines, subtle scanline/grain texture at most 3% opacity.

## Historical reviews (previous amber identity)

The M4a, M4, M9 and M11 reviews below describe the previous amber-phosphor identity. That identity remains what the shipped UI shows until #33 lands. They are kept as the historical record; where they conflict with the Lane Bay contract above, the contract governs UI work done under #33.

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

## M4 review

Flow, Agreement, Usage, Errors and empty History were reviewed at both target
viewports (`docs/screenshots/m4-*`). M4 replaces the disabled M4a navigation
with working drawers, filters and keyboard controls. Accepted adaptations:
right-side overlays are 640–720 px wide with internal view tabs and close;
filters stay visible in the ticker, whose height becomes 244 px / 192 px;
Escape from search blurs and allows the browser's native query-clear behavior;
the narrow filter-scope label may truncate, while the ticker retains the full
scope label. These choices preserve visible DEMO labeling, 22 px data rows,
local fonts and the switchboard as the primary view.

## M9 review

Reviewed source-backed fixture captures `m9-real-*` (PC agent, Orca agent and
local collector) plus deterministic edge-state `m9-*` harness captures at
1440×900 and 1024×768. “real” names the real transport in this demo, not real
user data. Combined, configured Orca provenance, replay, quota/presets and sparse
bay captures preserve the phosphor palette, local typography, 22 px rows,
hairlines, ghost-only routing and the exchange as the primary view.

Accepted adaptations:
- Source lamps occupy a separate compact row, with glyphs and text for live,
  stale, connecting and error. Source-wide client labels remain configured.
- Alerts, quota, presets and export use the existing drawers and keys 5–8.
  Quota bars are small SVGs; unknown/partial evidence is textual, not a
  fabricated zero or execution cable. Combined model totals stay unavailable.
- Sparse bays compress real call spacing and add role counts, never dummy calls.
  Replay places a compact transport at the bay's lower edge and uses one cursor
  for the wire, selection, timeline and Call in focus; its retained sample and
  non-durable nature are visible. Narrow layouts retain details in the drawer.
- Orphaned filter values remain visibly selectable; eviction restores focus to
  the ticker; rejected payload count lives in the source-health strip. These are
  behavioral corrections, not visual departures from the switchboard system.
- Preset columns label Jev latency/context agreement and recorded/estimated
  attribution. File samples cannot prove runtime selection. Report controls
  share the period picker and use same-origin GET downloads only.

No new palette, card grid, glass effect, idle animation or UI dependency was added.

## M11 acceptance review

Opened/reviewed `m11-alert-ticker-{1440x900,1024x768}.png`, captured with the
source-backed DEMO agents. The active-alert strip uses the existing 22 px row,
hairlines, amber glyph/source labels and precise classifier/execution text.
It belongs to the ticker, opens the existing alert drawer, follows source
selection and disappears without active evidence. No idle motion or new visual
system is introduced; the one-row increase in ticker controls is accepted.
