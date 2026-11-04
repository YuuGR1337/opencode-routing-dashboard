import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { aggregate } from "../src/core/aggregate";
import { parseLines } from "../src/core/schema";
import { DashboardShell } from "../web/App";
import type { ExchangeState } from "../web/exchange";

const NOW = Date.parse("2026-11-04T12:00:00Z");

async function fixtureState(): Promise<ExchangeState> {
  const observe = parseLines("observe", await Bun.file("fixtures/exchange/pc/jev-observe.jsonl").text());
  const route = parseLines("route", await Bun.file("fixtures/exchange/pc/jev-route.jsonl").text());
  const permissions = parseLines("permissions", await Bun.file("fixtures/exchange/pc/jev-permissions.jsonl").text());
  const state = aggregate({
    observe: observe.records,
    route: route.records,
    permissions: permissions.records,
    stats: null,
    malformed: { observe: observe.malformed, route: route.malformed, permissions: permissions.malformed },
  });
  return {
    ...state,
    exchange: {
      sources: [
        { id: "pc", label: "PC", status: "live", state },
        { id: "orca", label: "Orca", status: "live", state },
      ],
    },
    analytics: {
      settings: { quotas: [], alerts: { holdMs: 0, repeatMs: 60000, activeMs: 60000, desktop: false } },
      result: { quotas: [] },
      alerts: [
        { sourceId: "pc", kind: "classifier-rate-limit", since: NOW - 2000, lastFired: NOW - 1000 },
        { sourceId: "orca", kind: "rate-limit", since: NOW - 3000, lastFired: NOW - 2000 },
        { sourceId: "pc", kind: "fallback", since: NOW - 120000, lastFired: NOW - 120000 },
      ],
    },
  };
}

const render = (state: ExchangeState, initialView?: string) =>
  renderToStaticMarkup(<DashboardShell state={state} now={NOW} initialView={initialView} />);
const ticker = (html: string) =>
  html.slice(html.indexOf('id="ticker"'), html.indexOf("</section>", html.indexOf('id="ticker"')));

test("ticker exposes active source and distinct classifier and execution evidence with an alerts panel button", async () => {
  const html = ticker(render(await fixtureState()));
  expect(html).toContain('aria-label="active alerts"');
  expect(html).toContain("pc");
  expect(html).toContain("Jev classifier rate limit");
  expect(html).toContain("orca");
  expect(html).toContain("execution rate limit");
  expect(html).not.toContain("fallback observed");
  expect(html).toContain('aria-controls="drawer-alerts"');
  expect(html).toContain("▲");
});

test("ticker follows selected source and never shows other sources' alerts", async () => {
  const html = ticker(render(await fixtureState(), "orca"));
  expect(html).toContain("execution rate limit");
  expect(html).not.toContain("Jev classifier rate limit");
});

test("ticker hides the alert strip when evidence is unknown or no alert is active", async () => {
  const state = await fixtureState();
  const analytics = state.analytics!;
  expect(ticker(render({ ...state, analytics: { ...analytics, alerts: [] } }))).not.toContain(
    'aria-label="active alerts"',
  );
  expect(
    ticker(
      render({
        ...state,
        analytics: { ...analytics, alerts: [{ sourceId: "pc", kind: "fallback", since: NOW, lastFired: null }] },
      }),
    ),
  ).not.toContain('aria-label="active alerts"');
});
