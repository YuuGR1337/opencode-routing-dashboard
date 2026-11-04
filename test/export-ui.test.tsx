import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { aggregate, type DashboardState, type FlowEvent } from "../src/core/aggregate";
import { DashboardShell } from "../web/App";
import { DEFAULT_PERIOD, type Period } from "../web/analytics";
import type { ExchangeState } from "../web/exchange";

const NOW = Date.parse("2026-11-04T12:00:00.000Z");
const blank = aggregate({
  observe: [],
  route: [],
  permissions: [],
  stats: null,
  malformed: { observe: 0, route: 0, permissions: 0 },
});
const ev = (id: string): FlowEvent =>
  ({
    id,
    observe: null,
    route: null,
    message: null,
    prompt: null,
    suggestion: null,
    confidence: null,
    needsOracle: null,
    routeSuggestion: null,
    routeConfidence: null,
    routeNeedsOracle: null,
    decision: null,
    reason: null,
    contextAgent: null,
    classifierModel: null,
    latency: null,
    ts: new Date(NOW - 30 * 60_000).toISOString(),
    session: `s_${id}`,
    errors: [],
  }) as unknown as FlowEvent;
const stateOf = (events: FlowEvent[]): DashboardState => ({ ...blank, events });
const exchange = (sources: { id: string; status?: "live" | "stale" }[]): ExchangeState => ({
  ...blank,
  exchange: {
    sources: sources.map((s) => ({
      id: s.id,
      label: s.id.toUpperCase(),
      status: s.status ?? "live",
      state: stateOf([ev(s.id)]),
    })),
  },
});
const render = (state: ExchangeState, extra: { initialPeriod?: Period; initialView?: string } = {}) =>
  renderToStaticMarkup(<DashboardShell state={state} now={NOW} initialDrawer="export" {...extra} />);
const drawer = (html: string) => html.slice(html.indexOf('id="drawer-export"'));
const hrefs = (html: string) =>
  [...drawer(html).matchAll(/<a [^>]*class="dl"[^>]*href="([^"]+)"/g)].map((m) => m[1]!.replaceAll("&amp;", "&"));
const hour = { ...DEFAULT_PERIOD, kind: "1h" } as Period;

test("export is the eighth drawer, reachable from the header and key 8", () => {
  const html = renderToStaticMarkup(<DashboardShell state={blank} now={NOW} />);
  expect(html).toMatch(/data-drawer="export"[^>]*>[^<]*<sup>8<\/sup>/);
});

test("export offers Markdown and CSV links for the combined view, same-origin and URL encoded", () => {
  const html = render(exchange([{ id: "pc" }, { id: "orca" }]), { initialPeriod: hour });
  expect(html).toContain('id="drawer-export"');
  expect(hrefs(html)).toEqual([
    "/api/export?from=2026-11-04T11%3A00%3A00.000Z&to=2026-11-04T12%3A00%3A00.000Z&format=md",
    "/api/export?from=2026-11-04T11%3A00%3A00.000Z&to=2026-11-04T12%3A00%3A00.000Z&format=csv",
  ]);
  const panel = drawer(html);
  expect(panel).toMatch(/data-format="md"/);
  expect(panel).toMatch(/data-format="csv"/);
  expect(panel).not.toMatch(/href="https?:/);
  expect(panel).not.toContain("<form");
  expect(panel).not.toMatch(/method=/i);
  expect(panel).toContain("all sources");
  expect(panel).toContain("2026-11-04T11:00:00.000Z");
});

test("a selected source narrows the report to that source", () => {
  const html = render(exchange([{ id: "pc" }, { id: "orca" }]), { initialPeriod: hour, initialView: "orca" });
  for (const href of hrefs(html)) expect(new URL(href, "http://x").searchParams.get("source")).toBe("orca");
  expect(hrefs(html)).toHaveLength(2);
  expect(drawer(html)).toMatch(/source[^<]*<\/dt><dd>orca/);
});

test("the export range is the preset comparison period", () => {
  const html = render(exchange([{ id: "pc" }]), {
    initialPeriod: { kind: "custom", from: "2026-11-03T00:00", to: "2026-11-04T00:00" },
  });
  expect(drawer(html)).toContain('id="preset-from"');
  expect(drawer(html)).toContain('id="preset-to"');
  const url = new URL(hrefs(html)[0]!, "http://x");
  expect(Date.parse(url.searchParams.get("from")!)).toBe(Date.parse("2026-11-03T00:00"));
  expect(Date.parse(url.searchParams.get("to")!)).toBe(Date.parse("2026-11-04T00:00"));
});

test("a source that is not live blocks the links and the panel says which", () => {
  const html = render(exchange([{ id: "pc" }, { id: "orca", status: "stale" }]), { initialPeriod: hour });
  const panel = drawer(html);
  expect(hrefs(html)).toEqual([]);
  expect(panel).toContain("source unavailable: orca stale");
  expect(panel.match(/class="dl off"[^>]*data-format="(md|csv)"/g)).toHaveLength(2);
  expect(panel).toContain('aria-disabled="true"');
  // The live source can still be exported on its own.
  expect(
    hrefs(
      render(exchange([{ id: "pc" }, { id: "orca", status: "stale" }]), { initialPeriod: hour, initialView: "pc" }),
    ),
  ).toHaveLength(2);
});

test("an invalid range offers no download", () => {
  const html = render(exchange([{ id: "pc" }]), {
    initialPeriod: { kind: "custom", from: "2026-11-05T00:00", to: "2026-11-03T00:00" },
  });
  expect(hrefs(html)).toEqual([]);
  expect(drawer(html)).toContain("invalid range");
});
