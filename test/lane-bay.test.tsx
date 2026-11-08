import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { aggregate, type DashboardInput, type DashboardState } from "../src/core/aggregate";
import { parseLines, parseStats } from "../src/core/schema";
import { DashboardShell } from "../web/App";
import { bayLayout } from "../web/bay";
import type { ExchangeState } from "../web/exchange";
import { ErrorsView } from "../web/views/ErrorsView";
import { FlowView } from "../web/views/FlowView";
import { StateIcon } from "../web/views/parts";

// Lane Bay identity (docs/DESIGN.md, issue #33). Static-markup and stylesheet checks only: pixel values marked
// [re-measure] in DESIGN need a browser and are not asserted here.

const NOW = Date.parse("2026-11-04T02:13:10Z");

async function fixtureState(): Promise<DashboardState> {
  const observe = parseLines("observe", await Bun.file("fixtures/jev-observe.jsonl").text());
  const route = parseLines("route", await Bun.file("fixtures/jev-route.jsonl").text());
  const permissions = parseLines("permissions", await Bun.file("fixtures/jev-permissions.jsonl").text());
  const input: DashboardInput = {
    observe: observe.records,
    route: route.records,
    permissions: permissions.records,
    stats: parseStats(await Bun.file("fixtures/stats.json").json()),
    malformed: { observe: observe.malformed, route: route.malformed, permissions: permissions.malformed },
    sources: {
      observe: { status: "ok", path: "/state/jev-observe.jsonl" },
      route: { status: "ok", path: "/state/jev-route.jsonl" },
      permissions: { status: "ok", path: "/state/jev-permissions.jsonl" },
    },
    statsStatus: { status: "ok" },
  };
  return aggregate(input, NOW);
}
const shell = (state: ExchangeState, props: Record<string, unknown> = {}) =>
  renderToStaticMarkup(<DashboardShell state={state} now={NOW} {...props} />);
const flow = (state: DashboardState, selected: string | null) =>
  renderToStaticMarkup(
    <FlowView
      state={state}
      rows={[...state.events].reverse()}
      selected={selected}
      arrived={new Set()}
      burst={0}
      filterBar={null}
      filterNote={null}
      onSelect={() => {}}
    />,
  );
const between = (html: string, open: string, close: string) => {
  const from = html.indexOf(open);
  expect(from).toBeGreaterThanOrEqual(0);
  const to = html.indexOf(close, from);
  return html.slice(from, to < 0 ? undefined : to);
};

const SHAPES = {
  orchestrator: "diamond",
  oracle: "hexagon",
  fixer: "circle",
  explorer: "square",
  designer: "pentagon",
} as const;

test("role shapes: every jack, rail row and ticker suggestion carries its role shape", async () => {
  const state = await fixtureState();
  const html = shell(state);
  for (const [role, shape] of Object.entries(SHAPES))
    expect(html).toMatch(new RegExp(`data-role="${role}" data-jack="role"[\\s\\S]*?data-shape="${shape}"`));
  // Ticker suggest cells: shape and role name together, so the role is readable without hue.
  const suggested = state.events.filter((e) => e.suggestion !== null);
  expect(suggested.length).toBeGreaterThan(0);
  for (const e of suggested) {
    const shape = SHAPES[e.suggestion as keyof typeof SHAPES];
    expect(html).toMatch(new RegExp(`class="c-suggest r-${e.suggestion}"[^>]*>[\\s\\S]*?data-shape="${shape}"`));
  }
  // Call rail rows carry the suggested role's shape too.
  const rail = between(html, 'class="call-list"', "</ol>");
  expect(rail.match(/data-shape="/g)?.length ?? 0).toBeGreaterThanOrEqual(suggested.length);
  // Shapes are decoration for sighted users; they never replace the role name.
  expect(html).toContain('data-shape="diamond" aria-hidden="true"');
});

test("ctx agent in the ticker is a hollow ring plus the role name", async () => {
  const state = await fixtureState();
  const html = shell(state);
  const withCtx = state.events.filter((e) => e.contextAgent !== null);
  expect(withCtx.length).toBeGreaterThan(0);
  expect(html.match(/data-ctx-ring="true"/g)?.length).toBe(withCtx.length);
  for (const e of withCtx) expect(html).toContain(`>${e.contextAgent}</span>`);
});

test("views nav and scope strip are separate rows; the scope strip states source, calls and file lamps", async () => {
  const state = await fixtureState();
  const html = shell(state);
  const nav = between(html, '<nav class="views-nav"', "</nav>");
  expect(nav.match(/data-drawer="/g)).toHaveLength(8);
  const strip = between(html, 'class="scope-strip"', "</div>");
  expect(strip).not.toContain("data-drawer");
  expect(html.indexOf('class="views-nav"')).toBeLessThan(html.indexOf('class="scope-strip"'));
  for (const lamp of ["observe ok", "route ok", "permissions ok", "stats ok"]) expect(strip).toContain(lamp);
  expect(strip).toContain(`${state.window.events.retained} calls retained`);
  // The strip reuses sent/retained values; it adds no malformed/permissions counters (those moved to the ticker title).
  expect(strip).not.toContain("malformed");
});

test("scope strip names the viewed source, its state and the last event time in an exchange", async () => {
  const base = await fixtureState();
  const state: ExchangeState = {
    ...base,
    exchange: {
      sources: [
        { id: "pc", label: "PC", client: "tui", status: "live", lastSeenAt: "2026-11-04T02:13:09Z", state: base },
      ],
    },
  };
  const html = shell(state, { initialView: "pc" });
  const strip = between(html, 'class="scope-strip"', "</div>");
  expect(strip).toContain("viewing pc · live · last event ");
  expect(strip).toContain(`${base.window.events.retained} calls retained`);
});

test("source bar keeps radios with state icon and word; last seen sits in its own removable span", async () => {
  const base = await fixtureState();
  const state: ExchangeState = {
    ...base,
    exchange: {
      sources: [
        { id: "pc", label: "PC", status: "live", lastSeenAt: "2026-11-04T02:13:09Z", state: base },
        { id: "orca", label: "Orca", status: "stale", lastSeenAt: "2026-11-04T02:10:00Z", state: base },
      ],
    },
  };
  const html = shell(state);
  expect(html).toContain('role="radiogroup"');
  expect(html).toMatch(/data-source="pc"[^>]*>[\s\S]*?class="status">live</);
  expect(html).toMatch(/data-source="orca"[^>]*>[\s\S]*?class="status">stale</);
  expect(html).toContain('class="last-seen');
  expect(html).toMatch(/data-source="pc"[^>]*title="[^"]*last seen/);
  // The viewing text moved to the scope strip; the source bar has no trailing readout.
  expect(between(html, 'class="exchange-bar"', "</div></div>")).not.toContain("viewing");
});

test("ticker rows are the sequential focus target after filters", async () => {
  const html = shell(await fixtureState());
  expect(html).toMatch(/<section class="panel ticker" aria-label="ticker tape">/);
  expect(html).toMatch(
    /<div class="ticker-scroll" id="ticker" tabindex="0" role="region" aria-label="ticker event rows">/,
  );
  expect(html.indexOf('class="filters"')).toBeLessThan(html.indexOf('class="ticker-scroll" id="ticker"'));
});

test("ticker tiers: always-visible columns, wide-only columns, and detail-only fields", async () => {
  const html = shell(await fixtureState());
  const head = between(html, "<thead>", "</thead>");
  const cell = (label: string) => head.match(new RegExp(`<th class="([^"]*)">${label}</th>`));
  for (const label of [
    "ts",
    "suggest",
    "conf",
    "decision",
    "ctx agent",
    "exec agent/model",
    "latency",
    "err",
    "prompt",
  ]) {
    const m = cell(label);
    expect(m).not.toBeNull();
    expect(m![1]).not.toMatch(/\blo\b/);
  }
  for (const label of ["session", "oracle", "reason", "classifier", "fallback"]) {
    const m = cell(label);
    expect(m).not.toBeNull();
    expect(m![1]).toMatch(/\blo\b/);
  }
  // message, tokens, cost and the two exec columns leave the ticker; the detail drawer keeps them.
  for (const gone of ["message", "tokens", "cost", "exec agent", "exec model"]) expect(cell(gone)).toBeNull();
  // One exec cell reading —, never a value.
  expect(html.match(/class="c-exec"[^>]*><span data-unavailable="true"[^>]*>—<\/span>/g)?.length).toBeGreaterThan(0);
  // Same number of cells per row as header columns.
  const cols = head.match(/<th /g)!.length;
  const firstRow = between(html, 'data-row="event"', "</tr>");
  expect(firstRow.match(/<td /g)).toHaveLength(cols);
});

test("ticker title carries the intake text in a full and a short form; rejected detail moves to Errors", async () => {
  const state = await fixtureState();
  const m = state.errors.malformed;
  const html = shell(state, { rejected: 3 });
  const title = between(html, '<h2 class="panel-title ticker-title"', "</h2>");
  expect(title).toContain("newest ");
  expect(title).toContain("retained");
  expect(title).toContain("malformed (process lifetime)");
  expect(title).toContain("rejected payloads 3");
  expect(title).toContain('data-rejected="3"');
  expect(title).toContain(`intake: malformed ${m.observe + m.route + m.permissions} · rejected 3`);
  // Source rows no longer carry the intake counters.
  expect(between(html, 'class="scope-strip"', "</div>")).not.toContain("rejected");
  // The detailed rejected count lives in the Errors drawer.
  const drawer = shell(state, { rejected: 3, initialDrawer: "errors" });
  const errors = between(drawer, 'id="drawer-errors"', "</aside>");
  expect(errors).toContain("rejected payloads");
  expect(errors).toMatch(/data-rejected="3"/);
  const alone = renderToStaticMarkup(<ErrorsView state={state} rejected={0} />);
  expect(alone).toContain("rejected payloads");
  expect(alone).toMatch(/data-rejected="0"/);
  // Without a browser counter (no live link) nothing is claimed.
  expect(renderToStaticMarkup(<ErrorsView state={state} />)).not.toContain("rejected payloads");
  expect(shell(state)).not.toContain("rejected");
});

test("call in focus: full readout stays; a compact two-line one sits in the bay foot", async () => {
  const state = await fixtureState();
  const agreeing = state.events.find((e) => e.suggestion !== null && e.suggestion === e.contextAgent);
  const differing = state.events.find(
    (e) => e.suggestion !== null && e.contextAgent !== null && e.suggestion !== e.contextAgent,
  );
  expect(agreeing).toBeDefined();
  expect(differing).toBeDefined();
  for (const [e, word, other] of [
    [agreeing!, "same role", "differs"],
    [differing!, "differs", "same role"],
  ] as const) {
    const html = flow(state, e.id);
    expect(html).toContain('class="focus"');
    const compact = between(html, 'class="focus-compact"', "</div>");
    expect(compact).toContain(word);
    expect(compact).not.toContain(other);
    expect(compact).toContain(`${e.suggestion}`);
    expect(compact).toContain(`ctx ${e.contextAgent}`);
    expect(compact).toContain("exec —");
    expect(compact).toContain("fallback not detectable");
    expect(compact.match(/class="focus-line"/g)).toHaveLength(2);
    // The bay foot holds it, after the replay/legend slots, never inside the hidden-at-narrow full readout.
    expect(html.indexOf('class="focus-compact"')).toBeGreaterThan(html.indexOf('class="bay-body"'));
    expect(between(html, 'class="focus"', "</dl>")).not.toContain("focus-compact");
  }
  // Compact line never claims execution fields.
  const html = flow(state, agreeing!.id);
  expect(between(html, 'class="focus-compact"', "</div>")).not.toMatch(/exec (agent|model) [a-z]/i);
});

test("a differing ctx agent is stated as text on the dotted bracket", async () => {
  const state = await fixtureState();
  const differing = state.events.find(
    (e) => e.suggestion !== null && e.contextAgent !== null && e.suggestion !== e.contextAgent,
  );
  const same = state.events.find((e) => e.suggestion !== null && e.suggestion === e.contextAgent);
  expect(flow(state, differing!.id)).toMatch(/<text class="differs-label"[^>]*>differs<\/text>/);
  expect(flow(state, same!.id)).not.toContain('class="differs-label"');
});

test("patch bay title is short and the legend lives in the foot", async () => {
  const html = flow(await fixtureState(), null);
  const title = between(html, '<h2 class="panel-title">patch bay', "</h2>");
  expect(title).toContain("suggestion vs recorded context");
  expect(title).not.toContain("dashed");
  expect(title).not.toContain("no execution path recorded");
  const foot = between(html, 'class="panel-foot dim bay-legend"', "</p>");
  expect(foot).toContain("dashed = Jev suggestion");
  expect(foot).toContain("recorded context agent, not proof of delegation");
  expect(foot).toContain("no execution path recorded");
});

test("aggregate rail: AGGREGATE · stats only, NOT LINKED TO CALLS label, own stats range", async () => {
  const html = flow(await fixtureState(), null);
  const rail = between(html, 'aria-label="models"', "</section>");
  expect(rail).toContain("aggregate");
  expect(rail).toContain("stats only");
  expect(rail).toMatch(/class="rail-note[^"]*"[^>]*>not linked to calls</);
  expect(rail).toContain("stats range ");
  expect(rail).toContain("grok-4.7");
});

test("aggregate rail names the stats source: selected source, single source, never a summed combined", async () => {
  const base = await fixtureState();
  const entry = (id: string, label: string) => ({
    id,
    label,
    status: "live" as const,
    lastSeenAt: "2026-11-04T02:13:09Z",
    state: base,
  });
  const rail = (html: string) => between(html, 'aria-label="models"', "</section>");
  const two: ExchangeState = { ...base, exchange: { sources: [entry("pc", "PC"), entry("orca", "Orca")] } };
  // A selected source: the rail says whose stats these are.
  expect(rail(shell(two, { initialView: "orca" }))).toContain("source orca");
  expect(rail(shell(two, { initialView: "pc" }))).toContain("source pc");
  expect(rail(shell(two, { initialView: "pc" }))).not.toContain("source orca");
  // Combined with several sources: no source is named and nothing is claimed as summed.
  const combined = rail(shell(two));
  expect(combined).toContain("stats stay per source");
  expect(combined).toContain("nothing summed");
  expect(combined).not.toMatch(/source (pc|orca)/);
  // Combined with exactly one configured source carries that source's stats (federation), so it is named.
  const one: ExchangeState = { ...base, exchange: { sources: [entry("pc", "PC")] } };
  expect(rail(shell(one))).toContain("source pc");
  // No exchange: the single stats origin is the stats tool.
  expect(rail(shell(base))).toContain("source opencode stats --json");
  // Components outside the shell stay unlabeled unless told.
  expect(rail(flow(base, null))).not.toContain("source ");
});

test("call in focus follows the selected-call contract: ctx vs suggestion and ordered fields", async () => {
  const state = await fixtureState();
  const agreeing = state.events.find((e) => e.suggestion !== null && e.suggestion === e.contextAgent)!;
  const differing = state.events.find(
    (e) => e.suggestion !== null && e.contextAgent !== null && e.suggestion !== e.contextAgent,
  )!;
  const full = (html: string) => between(html, 'class="focus"', "</dl>");
  expect(full(flow(state, agreeing.id))).toContain("<dt>ctx vs suggestion</dt><dd>same role</dd>");
  expect(full(flow(state, differing.id))).toContain("<dt>ctx vs suggestion</dt><dd>differs</dd>");
  const labels = [...full(flow(state, agreeing.id)).matchAll(/<dt>([^<]+)<\/dt>/g)].map((m) => m[1]);
  const order = [
    "suggest",
    "needs oracle",
    "decision",
    "ctx agent",
    "ctx vs suggestion",
    "classifier",
    "latency",
    "exec agent/model",
    "fallback",
    "tokens / cost",
  ];
  const at = order.map((l) => labels.indexOf(l));
  expect(at.every((i) => i >= 0)).toBe(true);
  expect([...at].sort((a, b) => a - b)).toEqual(at);
  // The two exec rows became one that reads —; tokens / cost read — too.
  expect(full(flow(state, agreeing.id))).toMatch(/<dt>exec agent\/model<\/dt><dd data-unavailable="true">—<\/dd>/);
  expect(full(flow(state, agreeing.id))).toMatch(/<dt>tokens \/ cost<\/dt><dd data-unavailable="true">—<\/dd>/);
});

test("error rows say the classifier failed, name the failure and keep the recorded latency", async () => {
  const state = await fixtureState();
  const failed = state.events.find((e) => e.errors.length > 0 && e.suggestion === null && e.latency !== null)!;
  expect(failed).toBeDefined();
  const html = flow(state, failed.id);
  const full = between(html, 'class="focus"', "</dl>");
  expect(full).toMatch(/<dt>suggest<\/dt><dd>— classifier failed<\/dd>/);
  expect(full).toContain(`<dt>failure</dt>`);
  expect(full).toContain(failed.errors.join(" | "));
  expect(full).toContain(`<dt>latency</dt><dd>${failed.latency} ms</dd>`);
  const compact = between(html, 'class="focus-compact"', "</div>");
  expect(compact).toContain("classifier failed");
  expect(compact).toContain(`failure ${failed.errors[0]}`);
  expect(compact).toContain(`classifier ${failed.latency}ms`);
  expect(compact).toContain('data-glyph="error"');
  // A healthy call shows no failure row and no failure claim.
  const ok = state.events.find((e) => e.errors.length === 0 && e.suggestion !== null)!;
  const okHtml = flow(state, ok.id);
  expect(between(okHtml, 'class="focus"', "</dl>")).not.toContain("<dt>failure</dt>");
  expect(between(okHtml, 'class="focus-compact"', "</div>")).not.toContain("failed");
  // A failure with no recorded latency says so instead of inventing one.
  const noLatency = state.events.find((e) => e.errors.length > 0 && e.latency === null)!;
  expect(between(flow(state, noLatency.id), 'class="focus"', "</dl>")).toContain("<dt>latency</dt><dd>—</dd>");
});

test("the scope strip says its clock is the browser's local time", async () => {
  const html = shell(await fixtureState());
  const strip = between(html, 'class="scope-strip"', "</div>");
  expect(strip).toMatch(/class="viewing" title="[^"]*local time/);
  // The visible clock is never relabeled UTC; the zone name only appears in the tooltip (it may itself be "UTC").
  expect(strip.replace(/title="[^"]*"/g, "")).not.toContain("UTC");
});

test("header: sentence-case wordmark and all six readouts", async () => {
  const html = shell(await fixtureState());
  expect(html).toContain('class="brand-name">Routing exchange<');
  for (const label of ["prompts/min", "context agreement", "fallback", "error rate", "p50 latency", "tokens today"])
    expect(html).toContain(`>${label}<`);
});

test("stylesheet: Lane Bay graphite tokens, role hues, focus and evidence styling", async () => {
  const css = await Bun.file("web/styles.css").text();
  const up = css.toUpperCase();
  const root = css.slice(css.indexOf(":root"), css.indexOf("}", css.indexOf(":root")));
  const token = (name: string) =>
    root
      .match(new RegExp(`--${name}:\\s*([^;]+);`))?.[1]
      ?.trim()
      .toLowerCase();
  expect(token("bg")).toBe("#0b0d10");
  expect(token("panel")).toBe("#10131a");
  expect(token("panel2")).toBe("#171b24");
  expect(token("line")).toBe("#232831");
  expect(token("ink")).toBe("#e7eaef");
  expect(token("dim")).toBe("#8590a0");
  expect(token("dim2")).toBe("#5b6473");
  expect(token("sel")).toBe("#c8f169");
  expect(token("warn")).toBe("#f2b548");
  expect(token("ok")).toBe("#5fd9a0");
  expect(token("err")).toBe("#ff6b5b");
  expect(token("ghost")).toMatch(/45%/);
  // Amber is retired as a token; the old amber and warm graphite hexes are gone.
  expect(root).not.toContain("--amber");
  expect(root).not.toContain("--teal");
  for (const old of ["#FFB000", "#0E0F0C", "#171914", "#2A2D25", "#E8E4D8", "#8C8A80", "#FF5A3C", "#7BD88F"])
    expect(up).not.toContain(old);
  expect(css).not.toContain("var(--amber)");
  // Orchestrator moves off amber; the other four hues stay.
  expect(css).toMatch(/\.r-orchestrator\s*\{\s*--c:\s*#e8c26a/i);
  for (const hue of ["#C792EA", "#3CC8B4", "#82AAFF", "#F78C6C"]) expect(up).toContain(hue);
  // Focus ring: 2 px --sel with a 1 px offset, and an explicit active-row indicator while the ticker holds focus.
  expect(css).toMatch(/:focus-visible\s*\{\s*outline:\s*2px solid var\(--sel\);\s*outline-offset:\s*1px/);
  expect(css).toMatch(/\.ticker-scroll:focus[^{]*\.row\.sel[^{]*\{[^}]*outline:\s*2px solid var\(--sel\)/);
  // Selection is a 2 px --sel bar on a --panel2 fill in the rail and the ticker.
  expect(css).toMatch(/\.call\.sel\s*\{[^}]*border-left-color:\s*var\(--sel\)[^}]*background:\s*var\(--panel2\)/);
  expect(css).toMatch(/\.row\.sel td\s*\{[^}]*background:\s*var\(--panel2\)/);
  // DEMO band: solid --warn fill, dark text, 18 px.
  expect(css).toMatch(/\.demo-band\s*\{[^}]*height:\s*18px[^}]*background:\s*var\(--warn\)/);
  // Readouts 15 px, wordmark 15 px bold ink.
  expect(css).toMatch(/\.readout-value\s*\{[^}]*font:\s*700 15px/);
  expect(css).toMatch(/\.brand-name\s*\{[^}]*font:\s*700 15px[^}]*color:\s*var\(--ink\)/);
  // Aggregate rail is a dashed --dim2 frame with a --warn label.
  expect(css).toMatch(/\.models\s*\{[^}]*border:\s*1px dashed var\(--dim2\)/);
  expect(css).toMatch(/\.rail-note\s*\{[^}]*color:\s*var\(--warn\)/);
  // --dim2 is non-text only.
  expect(css).not.toMatch(/(^|[^-])color:\s*var\(--dim2\)/m);
  // Flat: no shadows, no glow.
  expect(css).not.toMatch(/box-shadow|text-shadow|drop-shadow/);
  // Ghost wire stays dashed.
  expect(css).toMatch(/\.ghost\s*\{[^}]*stroke-dasharray/);
});

test("stylesheet: narrow tiers show the compact focus and the short intake; wide tiers the opposite", async () => {
  const css = await Bun.file("web/styles.css").text();
  expect(css).toMatch(/\.focus-compact\s*\{\s*display:\s*none/);
  expect(css).toMatch(/\.intake-short\s*\{\s*display:\s*none/);
  const narrow = [...css.matchAll(/@media \(max-width: 1280px\)\s*\{([\s\S]*?)\n\}/g)].map((m) => m[1]).join("\n");
  expect(narrow).toMatch(/\.focus-compact\s*\{[^}]*display:\s*block/);
  expect(narrow).toMatch(/\.intake-short\s*\{[^}]*display:\s*inline/);
  expect(narrow).toMatch(/\.intake-full\s*\{[^}]*display:\s*none/);
  expect(narrow).toMatch(/\.last-seen[^{]*\{[^}]*display:\s*none/);
  // The full call-in-focus panel still hides at narrow widths (the compact one replaces it).
  expect(narrow).toMatch(/\.focus\s*\{[^}]*display:\s*none/);
  // The views nav never wraps; the counter slot is never truncated.
  expect(css).toMatch(/\.views-nav\s*\{[^}]*flex-wrap:\s*nowrap/);
  expect(css).toMatch(/\.filters \.scope\s*\{[^}]*flex:\s*none/);
});

test("stage columns follow DESIGN: 300/1fr/300 wide, 256/1fr/232 narrow (1024 leaves a 536 px bay)", async () => {
  const css = await Bun.file("web/styles.css").text();
  expect(css).toMatch(/\.stage\s*\{[^}]*grid-template-columns:\s*300px minmax\(0, 1fr\) 300px/);
  const narrow = [...css.matchAll(/@media \(max-width: 1280px\)\s*\{([\s\S]*?)\n\}/g)].map((m) => m[1]).join("\n");
  expect(narrow).toMatch(/\.stage\s*\{[^}]*grid-template-columns:\s*256px minmax\(0, 1fr\) 232px/);
  expect(narrow).not.toMatch(/210px|240px/);
  // 1024 - 256 - 232: the bay SVG must fit exactly that, and its widest label must fit inside it.
  const bay = bayLayout(10, 10);
  expect(1024 - 256 - 232).toBe(536);
  expect(bay.width).toBeLessThanOrEqual(536);
  const LABEL_ROOM = 120; // "orchestrator" in 11 px caps with letter spacing, plus its jack count line
  expect(bay.ctxX + 16 + LABEL_ROOM).toBeLessThanOrEqual(bay.width);
  expect(css).toMatch(/\.bay-main\s*\{[^}]*width:\s*536px/);
  expect(css).toMatch(/\.bay-svg\s*\{[^}]*width:\s*536px/);
});

test("narrow bay rows follow the 36 px call rail so wires stay level with their calls", () => {
  const wide = bayLayout(10, 10);
  const narrow = bayLayout(10, 10, 36);
  expect(wide.rowH).toBe(40);
  expect(wide.height).toBe(400);
  expect(narrow.rowH).toBe(36);
  expect(narrow.height).toBe(360);
  for (const layout of [wide, narrow]) {
    // Every jack and its label stay inside the drawing.
    for (const role of ["orchestrator", "oracle", "fixer", "explorer", "designer"] as const)
      expect(layout.jackY(role) + 30).toBeLessThanOrEqual(layout.height);
  }
  // Sparse rails keep their packed jacks at both row heights.
  expect(bayLayout(3, 10, 36).sparse).toBe(true);
  expect(bayLayout(3, 10, 36).height).toBeLessThan(360);
});

test("state icons: six distinct shapes, each next to its word; link down is ring with ✕, not the error triangle", () => {
  const html = (kind: Parameters<typeof StateIcon>[0]["kind"]) => renderToStaticMarkup(<StateIcon kind={kind} />);
  const kinds = ["live", "connecting", "stale", "missing", "down", "error"] as const;
  const shapes = new Set(kinds.map(html));
  expect(shapes.size).toBe(6);
  for (const kind of kinds) expect(html(kind)).toContain(`data-state="${kind}"`);
  expect(html("live")).toMatch(/<circle[^>]*class="solid"/); // filled disc
  expect(html("connecting")).toContain("stroke-dasharray"); // dashed ring
  expect(html("stale")).toMatch(/<path[^>]*class="solid"/); // half-filled disc
  expect(html("missing")).not.toMatch(/solid|stroke-dasharray|<line|<path|<polygon/); // hollow ring
  expect(html("down").match(/<line/g)).toHaveLength(2); // ring with x
  expect(html("down")).toContain("<circle");
  expect(html("down")).not.toContain("<polygon");
  expect(html("error")).toContain("<polygon"); // triangle with !
  expect(html("error")).toContain("<line"); // the ! stroke
});

test("source pills, scope lamps, link state and event errors use the state icons next to words", async () => {
  const base = await fixtureState();
  const entry = (id: string, status: "live" | "stale" | "connecting" | "error") => ({
    id,
    label: id,
    status,
    lastSeenAt: "2026-11-04T02:13:09Z",
    state: base,
  });
  const state: ExchangeState = {
    ...base,
    exchange: {
      sources: [entry("a", "live"), entry("b", "stale"), entry("c", "connecting"), entry("d", "error")],
    },
  };
  const html = shell(state, { connected: false });
  const pill = (id: string) => between(html, `data-source="${id}"`, "</button>");
  expect(pill("a")).toContain('data-state="live"');
  expect(pill("b")).toContain('data-state="stale"');
  expect(pill("b")).toContain(">stale<");
  expect(pill("c")).toContain('data-state="connecting"');
  expect(pill("c")).toContain(">connecting<");
  expect(pill("d")).toContain('data-state="error"');
  // Link down: ring with ✕ plus the words, never the triangle that means "error".
  const link = between(html, 'class="link err"', "</header>");
  expect(link).toContain('data-state="down"');
  expect(link).not.toContain('data-state="error"');
  expect(link).toContain("link down");
  expect(shell(state, { connected: true })).toMatch(/class="link ok"[^>]*>[\s\S]*?data-state="live"[\s\S]*?link live/);
  // File lamps carry the live disc next to `observe ok` and so on.
  expect(between(html, 'class="scope-strip"', "</div>")).toMatch(/data-state="live"[\s\S]*?observe ok/);
  // Event errors in the ticker keep the error triangle, with the failure name beside it.
  expect(between(html, '<td class="c-err"', "</td>")).toContain('data-state="error"');
  // No bare text triangle stands in for an error or a link state any more in these places.
  expect(pill("d")).not.toContain("▲");
  expect(link).not.toContain("▲");
});

test("bounded stage keeps chrome fixed and roles reachable through bay scrolling", async () => {
  const css = await Bun.file("web/styles.css").text();
  expect(css).toMatch(/\.bay-body\s*\{[^}]*flex:\s*1[^}]*min-height:\s*0[^}]*overflow:\s*auto/);
  expect(css).toMatch(/\.panel-title\s*\{[^}]*flex-shrink:\s*0/);
  expect(css).toMatch(/\.filters\s*\{[^}]*flex-shrink:\s*0/);
  expect(css).toMatch(/\.focus-row dt\s*\{[^}]*width:\s*116px/);
  expect(css).toMatch(/\.c-exec\s*\{[^}]*width:\s*110px/);
});

test("long ticker disclosures stay keyboard reachable in the 24px scrolling title", async () => {
  const base = await fixtureState();
  const state = { ...base, window: { ...base.window, events: { retained: 320, sent: 320, omitted: 0 } } };
  const html = shell(state, { rejected: 12 });
  expect(html).toMatch(
    /<h2 class="panel-title ticker-title" tabindex="0" aria-label="ticker summary and intake[^\"]*"/,
  );
  expect(html).toContain("newest 320 of 320 retained");
  expect(html).toContain("malformed (process lifetime)");
  expect(html).toContain("rejected payloads 12");
  expect(html).toContain("enter detail · 1-8 views · esc close");
  const css = await Bun.file("web/styles.css").text();
  expect(css).toMatch(/\.ticker-title\s*\{[^}]*display:\s*flex[^}]*overflow-x:\s*auto/);
  expect(css).toMatch(/\.ticker-title > span\s*\{[^}]*flex:\s*none/);
});

test("aggregate model bars use existing steps proportionally; missing stats estimate no bars", async () => {
  const base = await fixtureState();
  const models = base.usage.models.slice(0, 2);
  expect(models).toHaveLength(2);
  const state = {
    ...base,
    usage: {
      ...base.usage,
      models: [
        { ...models[0]!, steps: 100 },
        { ...models[1]!, steps: 25 },
      ],
    },
  };
  const rail = between(flow(state, null), 'aria-label="models"', "</section>");
  expect(rail).toMatch(/class="model-step-bar"[^>]*aria-label="100 steps"[^>]*><rect[^>]*width="160"/);
  expect(rail).toMatch(/class="model-step-bar"[^>]*aria-label="25 steps"[^>]*><rect[^>]*width="40"/);
  expect(rail).toContain("total ");
  const missing = { ...base, stats: null, usage: { ...base.usage, models: [], totals: null } };
  expect(flow(missing, null)).not.toContain('class="model-step-bar"');
  expect(flow(missing, null)).toContain("total —");
});

test("the new identity adds no motion", async () => {
  const css = await Bun.file("web/styles.css").text();
  expect([...css.matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1]).sort()).toEqual(["arrive", "pulse", "travel"]);
  expect(css).not.toMatch(/transition\s*:/);
  expect(css).not.toMatch(/infinite/);
});
