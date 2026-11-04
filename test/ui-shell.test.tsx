import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { aggregate, type DashboardInput, type DashboardState } from "../src/core/aggregate";
import { parseLines, parseStats } from "../src/core/schema";
import { DashboardShell, EventDetail } from "../web/App";

const NOW = Date.parse("2026-11-04T02:13:10Z");

async function fixtureInput(): Promise<DashboardInput> {
  const observe = parseLines("observe", await Bun.file("fixtures/jev-observe.jsonl").text());
  const route = parseLines("route", await Bun.file("fixtures/jev-route.jsonl").text());
  const permissions = parseLines("permissions", await Bun.file("fixtures/jev-permissions.jsonl").text());
  return {
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
}
const fixtureState = async (): Promise<DashboardState> => aggregate(await fixtureInput(), NOW);
const render = (state: DashboardState, props: { demo?: boolean; connected?: boolean } = {}) =>
  renderToStaticMarkup(<DashboardShell state={state} {...props} />);

test("renders the switchboard from fixtures with fixed roles and ghost-only wires", async () => {
  const state = await fixtureState();
  const html = render(state);
  for (const role of ["orchestrator", "oracle", "fixer", "explorer", "designer"])
    expect(html).toContain(`data-role="${role}"`);
  expect(html.match(/data-jack="role"/g)).toHaveLength(5);
  // One ghost wire per event that has a suggestion; never an execution cable.
  const withSuggestion = state.events.filter((e) => e.suggestion !== null).length;
  expect(withSuggestion).toBeGreaterThan(0);
  expect(html.match(/data-wire="ghost"/g)).toHaveLength(withSuggestion);
  expect(html).not.toContain('data-wire="exec"');
  // The initial snapshot is a baseline, never an arrival: no motion classes in the first render.
  expect(html).not.toContain('class="token');
  expect(html).not.toMatch(/class="[^"]*\barrive\b/);
  expect(html).toContain("ctx");
  expect(html).toContain("context agreement");
  expect(html).toContain("not detectable");
  expect(html).toContain("Fix the off-by-one bug");
});

test("ticker rows are complete and unavailable execution fields read —", async () => {
  const state = await fixtureState();
  const html = render(state);
  expect(html.match(/data-row="event"/g)).toHaveLength(state.events.length);
  for (const head of ["ts", "session", "message", "suggest", "conf", "oracle", "decision", "reason", "ctx agent"])
    expect(html).toContain(`>${head}<`);
  for (const head of ["exec agent", "exec model", "classifier", "fallback", "latency", "tokens", "cost", "err"])
    expect(html).toContain(`>${head}<`);
  expect(html).toContain("jev-1.13-free");
  expect(html).toContain("TimeoutError");
  expect(html).toContain('data-unavailable="true"');
});

test("readouts state agreement as context agreement and fallback as not detectable", async () => {
  const html = render(await fixtureState());
  expect(html).toContain("prompts/min");
  expect(html).toContain("context agreement");
  expect(html).toContain("50%");
  expect(html).toContain(">fallback<");
  expect(html).toContain("p50 latency");
  expect(html).toContain("tokens today");
  expect(html).toContain("error rate");
  expect(html).not.toMatch(/fallback[^<]*\d+(\.\d+)?%/);
});

test("model rail is aggregate stats explicitly unlinked to calls", async () => {
  const html = render(await fixtureState());
  expect(html).toContain("aggregate stats");
  expect(html).toContain("not linked to calls");
  expect(html).toContain("grok-4.7");
  expect(html).toContain("claude-sonnet-5-5");
  expect(html).toContain("xai");
  // Tool failures carry their own stats range.
  expect(html).toContain("tool failures");
  expect(html).toContain("2026-10-");
});

test("retention window reports newest k of n and omitted/evicted counts", async () => {
  const state = await fixtureState();
  const html = render(state);
  expect(html).toContain(`newest ${state.events.length} of ${state.window.events.retained} retained`);
  const trimmed: DashboardState = {
    ...state,
    window: {
      ...state.window,
      events: { retained: 40, sent: 4, omitted: 36 },
      evicted: { observe: 7, route: 0, permissions: 2 },
    },
  };
  const t = render(trimmed);
  expect(t).toContain("newest 4 of 40 retained");
  expect(t).toContain("36 omitted");
  expect(t).toContain("evicted");
  expect(t).toContain("observe 7");
});

test("malformed counters are labeled process-lifetime", async () => {
  const html = render(await fixtureState());
  expect(html).toContain("malformed (process lifetime)");
});

test("empty and missing sources render a silent exchange with expected paths", async () => {
  const empty = aggregate(
    {
      observe: [],
      route: [],
      permissions: [],
      stats: null,
      malformed: { observe: 0, route: 0, permissions: 0 },
      sources: {
        observe: { status: "missing", path: "/x/jev-observe.jsonl" },
        route: { status: "missing", path: "/x/jev-route.jsonl" },
        permissions: { status: "error", path: "/x/jev-permissions.jsonl", detail: "EACCES" },
      },
      statsStatus: { status: "unavailable", detail: "opencode not found" },
    },
    NOW,
  );
  const html = render(empty);
  expect(html).toContain("silent exchange");
  expect(html).toContain("/x/jev-observe.jsonl");
  expect(html).toContain("/x/jev-route.jsonl");
  expect(html).toContain("EACCES");
  expect(html).toContain("opencode not found");
  expect(html).not.toContain('data-wire="ghost"');
  expect(html).not.toContain("NaN");
});

test("state before the first snapshot does not crash", () => {
  const blank = aggregate({
    observe: [],
    route: [],
    permissions: [],
    stats: null,
    malformed: { observe: 0, route: 0, permissions: 0 },
  });
  const html = render(blank);
  expect(html).toContain("silent exchange");
  expect(html).toContain("waiting for sources");
});

test("DEMO marker only appears when demo is set; link state only when known", async () => {
  const state = await fixtureState();
  expect(render(state)).not.toContain("DEMO");
  expect(render(state, { demo: true })).toContain("DEMO");
  expect(render(state, { connected: false })).toContain("link down");
  expect(render(state, { connected: true })).toContain("link live");
  expect(render(state)).not.toContain("link down");
});

test("drawer navigation is visible but unavailable until M4", async () => {
  const html = render(await fixtureState());
  for (const name of ["Agreement", "Usage", "Errors", "History"]) expect(html).toContain(name);
  expect(html.match(/<button[^>]*data-drawer[^>]*disabled/g)).toHaveLength(4);
  expect(html).toContain("M4");
});

test("markup never uses inline styles (CSP)", async () => {
  const html = render(await fixtureState(), { demo: true, connected: true });
  expect(html).not.toMatch(/\sstyle=/);
  expect(html).not.toContain("<style");
});

test("event detail exposes every field and the raw records", async () => {
  const state = await fixtureState();
  const event = state.events.find((e) => e.message === "msg_B2");
  expect(event).toBeDefined();
  const html = renderToStaticMarkup(<EventDetail event={event!} />);
  for (const field of [
    "session",
    "message",
    "prompt",
    "suggestion",
    "confidence",
    "needsOracle",
    "routeSuggestion",
    "routeConfidence",
    "decision",
    "reason",
    "contextAgent",
    "classifierModel",
    "executionAgent",
    "executionModel",
    "executionProvider",
    "executionVariant",
    "tokens",
    "cost",
    "fallback",
    "latency",
  ])
    expect(html).toContain(`>${field}<`);
  expect(html).toContain("not detectable");
  expect(html).toContain("raw observe");
  expect(html).toContain("raw route");
  expect(html).toContain("&quot;probabilities&quot;");
  expect(html).toContain("not attributable");
  const orphan = state.events.find((e) => e.observe === null);
  if (orphan) expect(renderToStaticMarkup(<EventDetail event={orphan} />)).toContain("no observe record");
});

test("stylesheet follows DESIGN tokens, local fonts and motion rules", async () => {
  const css = await Bun.file("web/styles.css").text();
  for (const token of [
    "#0E0F0C",
    "#171914",
    "#2A2D25",
    "#E8E4D8",
    "#8C8A80",
    "#FFB000",
    "#3CC8B4",
    "#7BD88F",
    "#FF5A3C",
  ])
    expect(css.toUpperCase()).toContain(token);
  for (const role of ["#C792EA", "#82AAFF", "#F78C6C"]) expect(css.toUpperCase()).toContain(role);
  expect(css).toContain("--row: 22px");
  expect(css).toContain("prefers-reduced-motion");
  expect(css).not.toMatch(/infinite/);
  expect(css).not.toMatch(/backdrop-filter|linear-gradient|radial-gradient/);
  expect(css).not.toMatch(/https?:\/\//);
  const sizes = [...css.matchAll(/font-size:\s*(\d+)px/g)].map((m) => Number(m[1]));
  expect(sizes.length).toBeGreaterThan(0);
  expect(Math.max(...sizes)).toBeLessThanOrEqual(20);
  const faces = await Bun.file("web/assets/fonts.css").text();
  expect(css).not.toContain("@font-face");
  expect(faces).not.toMatch(/https?:|data:/);
  const urls = [...faces.matchAll(/url\(\.\/fonts\/([^)]+)\)/g)].map((m) => m[1]!);
  expect(urls.length).toBeGreaterThanOrEqual(4);
  for (const file of urls) expect(existsSync(`web/assets/fonts/${file}`)).toBe(true);
  expect(existsSync("web/assets/fonts/IBMPlexMono-OFL.txt")).toBe(true);
  expect(existsSync("web/assets/fonts/InstrumentSans-OFL.txt")).toBe(true);
});
