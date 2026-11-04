import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { aggregate, type DashboardInput, type DashboardState } from "../src/core/aggregate";
import { parseLines, parseStats } from "../src/core/schema";
import { DashboardShell, EventDetail } from "../web/App";
import type { ExchangeSource, ExchangeState } from "../web/exchange";
import { EMPTY_FILTERS } from "../web/filters";
import { rememberOptions } from "../web/selection";
import { FilterBar } from "../web/views/FilterBar";

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
const withEvents = (state: DashboardState, events: DashboardState["events"], omitted = 0): DashboardState => ({
  ...state,
  events,
  window: { ...state.window, events: { retained: events.length + omitted, sent: events.length, omitted } },
});
const pick = (state: DashboardState, sessions: string[], tag: Record<string, string>) =>
  withEvents(
    state,
    state.events.filter((e) => sessions.includes(e.session)).map((e) => ({ ...e, ...tag })),
  );
const render = (state: ExchangeState, props: Record<string, unknown> = {}) =>
  renderToStaticMarkup(<DashboardShell state={state} now={NOW} {...props} />);
const rows = (html: string) => (html.match(/data-row="event"/g) ?? []).length;

async function exchange(): Promise<{ combined: ExchangeState; sources: ExchangeSource[] }> {
  const base = await fixtureState();
  const pc = pick(base, ["ses_A1", "ses_B2"], { sourceId: "pc", client: "tui" });
  const orca = pick(base, ["ses_C3"], { sourceId: "orca", client: "orca", directory: "/work/orca-a" });
  const local = pick(base, ["ses_D4"], { sourceId: "local" });
  const sources: ExchangeSource[] = [
    { id: "pc", label: "PC", client: "tui", status: "live", lastSeenAt: "2026-11-04T02:13:09Z", state: pc },
    {
      id: "orca",
      label: "Orca",
      client: "orca",
      status: "stale",
      lastSeenAt: "2026-11-04T02:10:00Z",
      detail: "idle timeout",
      state: orca,
    },
    { id: "local", label: "Local", status: "connecting", state: local },
  ];
  const events = [...pc.events, ...orca.events, ...local.events].sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
  return { combined: { ...withEvents(base, events), exchange: { sources } }, sources };
}

test("no exchange: no source bar, same single-source shell", async () => {
  const html = render(await fixtureState());
  expect(html).not.toContain('aria-label="data source"');
  expect(html).not.toContain('data-source="combined"');
  expect(html).not.toContain("rejected payloads");
  expect(html).not.toContain('<th class="c-src');
});

test("source bar lists combined plus every configured source with health that is not colour only", async () => {
  const { combined } = await exchange();
  const html = render(combined);
  expect(html).toContain('role="radiogroup"');
  expect(html).toContain('aria-label="data source"');
  for (const id of ["combined", "pc", "orca", "local"]) expect(html).toContain(`data-source="${id}"`);
  expect(html).toMatch(/data-source="combined"[^>]*aria-checked="true"/);
  expect(html).toMatch(/data-source="pc"[^>]*aria-checked="false"/);
  expect(html).toMatch(/data-source="orca"[^>]*data-status="stale"/);
  expect(html).toContain("stale");
  expect(html).toContain("connecting");
  expect(html).toContain("last seen");
  expect(html).toContain("idle timeout");
  expect(html).toContain("tui");
  // Stale and connecting use different glyphs from live, so colour is never the only cue.
  expect(html).toMatch(/data-source="pc"[\s\S]*?●/);
  expect(html).toMatch(/data-source="orca"[\s\S]*?◇/);
});

test("combined view shows tagged events with a source column and a source filter", async () => {
  const { combined } = await exchange();
  const html = render(combined);
  expect(rows(html)).toBe(4);
  expect(html).toContain('class="c-src"');
  expect(html).toContain('id="flt-source"');
  expect(html).toContain("any source");
  expect(html).toContain("/work/orca-a");
});

test("a selected source shows only its own state and names the view", async () => {
  const { combined } = await exchange();
  const html = render(combined, { initialView: "orca" });
  expect(rows(html)).toBe(1);
  expect(html).toContain("Review the architecture");
  expect(html).not.toContain("Fix the typo in a comment");
  expect(html).toMatch(/data-source="orca"[^>]*aria-checked="true"/);
  expect(html).toContain("viewing orca");
  expect(html).toContain("stale");
});

test("a selected source with no state yet says so instead of showing combined data", async () => {
  const { combined, sources } = await exchange();
  const empty: ExchangeState = {
    ...combined,
    exchange: { sources: sources.map((s) => (s.id === "local" ? { ...s, state: null } : s)) },
  };
  const html = render(empty, { initialView: "local" });
  expect(rows(html)).toBe(0);
  expect(html).toContain("waiting for local");
  expect(html).toContain("connecting");
});

test("an unknown selected source falls back to the combined view", async () => {
  const { combined } = await exchange();
  const html = render(combined, { initialView: "gone" });
  expect(rows(html)).toBe(4);
  expect(html).toMatch(/data-source="combined"[^>]*aria-checked="true"/);
});

test("rejected browser payloads are counted visibly", async () => {
  const state = await fixtureState();
  expect(render(state, { rejected: 0 })).toContain("rejected payloads 0");
  const html = render(state, { rejected: 3 });
  expect(html).toContain("rejected payloads 3");
  expect(html).toMatch(/data-rejected="3"/);
});

test("replay opens at the first event of the focused session and states the sample limits", async () => {
  const base = await fixtureState();
  const one = base.events.map((e) => (e.session === "ses_D4" ? e : { ...e, session: "ses_R" }));
  const state = withEvents(base, one);
  const html = render(state, { initialReplay: true });
  expect(html).toContain('aria-label="session replay"');
  expect(html).toContain("replay 1 of 3");
  for (const label of ["play", "previous event", "next event", "stop replay"])
    expect(html).toContain(`aria-label="${label}"`);
  for (const speed of ["0.5", "1", "2", "4"]) expect(html).toContain(`data-speed="${speed}"`);
  // Call in focus follows the cursor: the oldest event of the session, not the newest row.
  expect(html).toMatch(/call in focus<\/dt><dd class="focus-prompt">Fix the typo in a comment/);
  expect(html).toContain("sample of retained events");
  expect(html).toContain("not durable history");
  expect(html).not.toContain("may be incomplete");
});

test("replay flags an incomplete sample when events were omitted or evicted", async () => {
  const base = await fixtureState();
  const omitted = withEvents(base, base.events, 5);
  expect(render(omitted, { initialReplay: true })).toContain("may be incomplete");
  const evicted: DashboardState = {
    ...base,
    window: { ...base.window, evicted: { observe: 2, route: 0, permissions: 0 } },
  };
  const html = render(evicted, { initialReplay: true });
  expect(html).toContain("may be incomplete");
  expect(html).toContain("evicted 2");
});

test("replay is offered, not started, until asked for", async () => {
  const html = render(await fixtureState());
  expect(html).toContain('aria-label="start replay"');
  expect(html).not.toContain('aria-label="session replay"');
});

test("a sparse bay is shortened and packs a real per-role tally without inventing calls", async () => {
  const base = await fixtureState();
  const html = render(base);
  expect(html).toContain('data-sparse="true"');
  const height = Number(
    html.match(/class="bay-svg"[^>]*height="(\d+)"/)?.[1] ?? html.match(/height="(\d+)"[^>]*class="bay-svg"/)?.[1],
  );
  expect(height).toBeLessThan(400);
  expect(html.match(/data-wire="ghost"/g)).toHaveLength(base.events.filter((e) => e.suggestion !== null).length);
  expect(html.match(/data-tally="role"/g)).toHaveLength(5);
});

test("a full rail keeps the 400 px bay and no tally", async () => {
  const base = await fixtureState();
  const template = base.events[0]!;
  const many = Array.from({ length: 12 }, (_, i) => ({
    ...template,
    id: `many-${i}`,
    ts: new Date(NOW - i * 1000).toISOString(),
  }));
  const html = render(withEvents(base, many));
  expect(html).toContain('data-sparse="false"');
  expect(html).toMatch(/height="400"/);
  expect(html).not.toContain('data-tally="role"');
});

test("filter options that left the window stay selectable and are marked", async () => {
  const state = await fixtureState();
  const known = rememberOptions(rememberOptions(null, [{ ...state.events[0]!, session: "ses_gone" }]), state.events);
  const html = renderToStaticMarkup(
    <FilterBar
      events={state.events}
      filters={{ ...EMPTY_FILTERS, session: "ses_gone" }}
      known={known}
      matched={0}
      onChange={() => {}}
    />,
  );
  expect(html).toMatch(/<option value="ses_gone" selected="">ses_gone · not in window<\/option>/);
  expect(html).toContain("ses_C3");
  expect(html).toContain("1 filter value not in window");
});

test("federated session ids show the plain session in the ticker and filters, raw id stays in the title", async () => {
  const base = await fixtureState();
  const namespaced = withEvents(
    base,
    base.events.map((e) => ({ ...e, session: JSON.stringify(["pc", e.session]), sourceId: "pc" })),
  );
  const html = render(namespaced);
  expect(html).toMatch(/<td class="c-session lo" title="\[&quot;pc&quot;,&quot;ses_A1&quot;\]">ses_A1<\/td>/);
  expect(html).toContain(">ses_A1</option>");
});

const prov = (client: string, evidence: string, directory: string | null = null, label?: string) => ({
  directory,
  client,
  evidence,
  ...(label ? { label } : {}),
});
async function provenanceExchange(): Promise<ExchangeState> {
  const base = await fixtureState();
  const pc = withEvents(
    base,
    base.events
      .filter((e) => e.session === "ses_B2")
      .map((e) => ({ ...e, sourceId: "pc", provenance: prov("TUI", "observed", "/work/pc") })),
  );
  const orca = withEvents(
    base,
    base.events
      .filter((e) => e.session === "ses_C3")
      .map((e) => ({
        ...e,
        sourceId: "orca",
        provenance: prov("Orca", "configured", "/work/orca-a", "orca worktree"),
      })),
  );
  const local = withEvents(
    base,
    base.events
      .filter((e) => e.session === "ses_D4")
      .map((e) => ({ ...e, sourceId: "local", provenance: prov("unknown", "unknown") })),
  );
  const sources: ExchangeSource[] = [
    { id: "pc", label: "PC", client: "TUI", status: "live", state: pc },
    { id: "orca", label: "Orca", client: "Orca", status: "live", state: orca },
    { id: "local", label: "Local", status: "live", state: local },
  ];
  const events = [...pc.events, ...orca.events, ...local.events];
  return { ...withEvents(base, events), exchange: { sources } };
}

test("source client is marked configured unless the records observed it", async () => {
  const html = render(await provenanceExchange());
  expect(html).toMatch(/data-source="orca"[\s\S]*?Orca · configured/);
  // The source-wide setting remains configured even if one individual event recorded its client.
  expect(html).toMatch(/data-source="pc"[\s\S]*?TUI · configured/);
  // A source with no client and only unknown evidence shows no client claim.
  expect(html.match(/data-source="local"[^>]*>[\s\S]*?<\/button>/)![0]).not.toContain('class="client"');
});

test("focus readout and detail say how each client and directory is known", async () => {
  const state = await provenanceExchange();
  const html = render(state, { initialView: "orca" });
  expect(html).toContain("Orca · configured · orca worktree");
  expect(html).toContain("/work/orca-a");
  const orcaEvent = state.exchange!.sources[1]!.state!.events[0]!;
  const detail = renderToStaticMarkup(<EventDetail event={orcaEvent} />);
  expect(detail).toContain("Orca · configured");
  const local = state.exchange!.sources[2]!.state!.events[0]!;
  expect(renderToStaticMarkup(<EventDetail event={local} />)).toContain("unknown");
  expect(render(state, { initialView: "pc" })).toContain("TUI · observed");
});

test("the client filter offers the classified client", async () => {
  const html = render(await provenanceExchange());
  expect(html).toContain('id="flt-client"');
  expect(html).toMatch(/<option value="Orca">Orca<\/option>/);
  expect(html).toMatch(/<option value="TUI">TUI<\/option>/);
});

test("combined exchange with separate stats does not imply the live sources are still pending", async () => {
  const { combined } = await exchange();
  const html = render({ ...combined, sources: null, statsStatus: null });
  expect(html).toContain("source health above");
  expect(html).toContain("stats per source");
  expect(html).not.toContain("waiting for sources");
  expect(html).not.toContain("stats pending");
});
