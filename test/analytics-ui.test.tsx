import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { aggregate, type DashboardState, type FlowEvent } from "../src/core/aggregate";
import { DashboardShell } from "../web/App";
import { DEFAULT_PERIOD, type Period, type ServerAnalytics } from "../web/analytics";
import type { ExchangeState } from "../web/exchange";

const NOW = Date.parse("2026-11-04T12:00:00Z");
const MIN = 60_000;
const blank = aggregate({
  observe: [],
  route: [],
  permissions: [],
  stats: null,
  malformed: { observe: 0, route: 0, permissions: 0 },
});
const ev = (id: string, minutesAgo: number, raw: Record<string, unknown> = {}, extra: Partial<FlowEvent> = {}) =>
  ({
    id,
    ts: new Date(NOW - minutesAgo * MIN).toISOString(),
    session: `s_${id}`,
    message: null,
    prompt: id,
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
    executionAgent: null,
    executionModel: null,
    executionProvider: null,
    executionVariant: null,
    tokens: null,
    cost: null,
    fallback: "not detectable",
    latency: null,
    errors: [],
    observe: Object.keys(raw).length ? raw : null,
    route: null,
    ...extra,
  }) as unknown as FlowEvent;
const stateOf = (events: FlowEvent[], extra: Partial<DashboardState> = {}): DashboardState => ({
  ...blank,
  events,
  window: { ...blank.window, events: { retained: events.length, sent: events.length, omitted: 0 } },
  ...extra,
});
const exec = (extra: Record<string, unknown> = {}) => ({ model: "m", provider: "p", ...extra });
const shell = (
  state: ExchangeState,
  drawer: "alerts" | "quota" | "presets",
  extra: { initialPeriod?: Period; initialView?: string } = {},
) => renderToStaticMarkup(<DashboardShell state={state} now={NOW} initialDrawer={drawer} {...extra} />);
const withSources = (
  events: Record<string, FlowEvent[]>,
  analytics?: ServerAnalytics,
  extra: Partial<DashboardState> = {},
) => {
  const sources = Object.entries(events).map(([id, list]) => ({
    id,
    label: id.toUpperCase(),
    status: "live" as const,
    state: stateOf(list, extra),
  }));
  return {
    ...stateOf(Object.values(events).flat(), extra),
    exchange: { sources },
    ...(analytics ? { analytics } : {}),
  } as ExchangeState;
};
const alertSettings = { holdMs: 0, repeatMs: 60000, activeMs: 60000, desktop: false };
const quota = { id: "q1", label: "Plus", provider: "p", metric: "tokens" as const, limit5h: 1000 };
const win = (observed: number | null, status: "estimate" | "partial" | "unknown", limit: number | null) => ({
  from: 0,
  to: NOW,
  limit,
  observed,
  status,
  coverage: { sources: 1, complete: status === "estimate", attributionGaps: status !== "estimate" },
});

test("analytics drawers are reachable from the header with numbered keys 5–7", () => {
  const html = renderToStaticMarkup(<DashboardShell state={blank} now={NOW} />);
  for (const [name, n] of [
    ["alerts", 5],
    ["quota", 6],
    ["presets", 7],
  ] as const)
    expect(html).toMatch(new RegExp(`data-drawer="${name}"[^>]*>[^<]*<sup>${n}</sup>`));
  expect(html).not.toContain('data-badge="alerts"');
});

test("alerts panel derives from explicit evidence and keeps classifier and execution apart", () => {
  const state = withSources({
    pc: [
      ev("jev", 1, {}, { errors: ["HTTP 429 from classifier"] }),
      ev("exec", 1, { execution: exec({ status: 429 }) }),
      ev("plain", 1),
    ],
  });
  const html = shell(state, "alerts");
  expect(html).toContain('id="drawer-alerts"');
  expect(html).toContain('data-mode="derived"');
  expect(html).toContain("derived in browser");
  expect(html).toContain("Jev classifier rate limit");
  expect(html).toContain("execution rate limit");
  expect(html.match(/data-alert="/g)).toHaveLength(2);
  expect(html).toContain("events analysed 3");
  expect(html).toContain("with execution evidence 1");
  expect(html).toMatch(/data-badge="alerts"[^>]*>[^<]*2</);
});

test("alerts panel without evidence says nothing fired and why execution alerts cannot", () => {
  const html = shell(withSources({ pc: [ev("a", 1)] }), "alerts");
  expect(html).toContain("no alert evidence");
  expect(html).toContain("with execution evidence 0");
  expect(html).not.toContain("data-alert=");
  expect(html).not.toContain('data-badge="alerts"');
});

test("server alerts show hold/repeat settings, history and desktop opt-in state", () => {
  const analytics: ServerAnalytics = {
    settings: { quotas: [], alerts: { ...alertSettings, holdMs: 5000, desktop: true } },
    result: { quotas: [] },
    alerts: [{ sourceId: "pc", kind: "fallback", since: NOW - 3000, lastFired: NOW - 1000 }],
    notificationStatus: { ok: false, reason: "notification failed" },
  };
  const html = shell(withSources({ pc: [ev("a", 1)] }, analytics), "alerts");
  expect(html).toContain('data-mode="server"');
  expect(html).toContain("fallback observed");
  expect(html).toContain("hold 5 s");
  expect(html).toContain("repeat 60 s");
  expect(html).toContain("desktop notifications on");
  expect(html).toContain("notification failed");
  expect(html).toMatch(/data-badge="alerts"[^>]*>[^<]*1</);
});

test("quota panel with nothing configured shows how to configure it and no numbers", () => {
  const html = shell(
    withSources({ pc: [ev("a", 1, { execution: exec({ tokens: { input: 5, output: 5 } }) })] }),
    "quota",
  );
  expect(html).toContain('id="drawer-quota"');
  expect(html).toContain("no quotas configured");
  expect(html).toContain("--analytics-config");
  expect(html).not.toContain("data-quota=");
});

test("quota rows show limits as configured, unknown as unknown, and never a combined total", () => {
  const row = (sourceId: string, five: ReturnType<typeof win>, weekly: ReturnType<typeof win>) => ({
    ...quota,
    sourceId,
    fiveHour: five,
    weekly,
  });
  const analytics: ServerAnalytics = {
    settings: { quotas: [quota], alerts: alertSettings },
    result: {
      quotas: [
        row("pc", win(250, "estimate", 1000), win(null, "unknown", null)),
        row("orca", win(20, "partial", 1000), win(0, "estimate", null)),
      ],
    },
    alerts: [],
  };
  const html = shell(withSources({ pc: [ev("a", 1)], orca: [ev("b", 1)] }, analytics), "quota");
  expect(html.match(/data-quota="/g)).toHaveLength(2);
  expect(html).toContain("Plus");
  expect(html).toContain("250 / 1,000");
  expect(html).toMatch(/data-window="5h"[^>]*data-status="partial"/);
  expect(html).toMatch(/data-window="weekly"[^>]*data-status="unknown"/);
  expect(html).toContain("limit not set");
  expect(html).toContain("unknown · coverage not proven");
  expect(html).toContain("attribution gaps");
  expect(html).toContain("cost 0 is not quota 0");
  expect(html.slice(html.indexOf('id="drawer-quota"')).toLowerCase()).not.toContain("total");
  // Only measured values draw a bar.
  expect(html.match(/data-quota-bar="/g)).toHaveLength(2);
});

test("a selected source shows only its own quota rows", () => {
  const row = (sourceId: string) => ({
    ...quota,
    sourceId,
    fiveHour: win(1, "estimate", 10),
    weekly: win(1, "estimate", 10),
  });
  const analytics: ServerAnalytics = {
    settings: { quotas: [quota], alerts: alertSettings },
    result: { quotas: [row("pc"), row("orca")] },
    alerts: [],
  };
  const html = shell(withSources({ pc: [ev("a", 1)], orca: [ev("b", 1)] }, analytics), "quota", {
    initialView: "orca",
  });
  expect(html.match(/data-quota="/g)).toHaveLength(1);
  expect(html).toContain('data-source-id="orca"');
});

test("presets panel compares recorded presets over the chosen period with explicit unavailable fields", () => {
  const state = withSources({
    pc: [
      ev("a", 30, { preset: "fast" }, { suggestion: "orchestrator", contextAgent: "orchestrator", latency: 100 }),
      ev("b", 20, { preset: "fast" }, { suggestion: "fixer", contextAgent: "orchestrator", latency: 300 }),
      ev("c", 10, { preset: "deep", execution: exec({ tokens: { input: 10, output: 5 } }) }, { latency: 50 }),
      ev("x", 3000, { preset: "fast" }),
    ],
  });
  const html = shell(state, "presets", { initialPeriod: { ...DEFAULT_PERIOD, kind: "1h" } });
  expect(html).toContain('id="drawer-presets"');
  expect(html).toContain('id="preset-period"');
  for (const label of ["last 1 h", "last 24 h", "last 7 d", "all sent events", "custom range"])
    expect(html).toContain(label);
  expect(html).toMatch(/<option value="1h" selected="">last 1 h<\/option>/);
  expect(html.match(/data-preset="/g)).toHaveLength(2);
  expect(html).toMatch(/data-preset="fast"[\s\S]*?50%/);
  expect(html).toContain("200ms");
  expect(html).toMatch(/data-preset="deep"[\s\S]*?15/);
  // fast has no execution evidence: fallback, tokens and cost are unavailable, not zero.
  expect(html).toMatch(/data-preset="fast"[\s\S]*?data-unavailable="true"/);
  expect(html).toContain("explicit 2");
  expect(html).toContain("classifier model is not execution identity");
  expect(html).not.toContain('id="preset-from"');
});

test("custom period shows its range inputs and reports an invalid range instead of guessing", () => {
  const state = withSources({ pc: [ev("a", 5, { preset: "fast" })] });
  const good = shell(state, "presets", {
    initialPeriod: { kind: "custom", from: "2026-11-04T10:00", to: "2026-11-04T12:00" },
  });
  expect(good).toContain('id="preset-from"');
  expect(good).toContain('id="preset-to"');
  expect(good).not.toContain("invalid range");
  const bad = shell(state, "presets", {
    initialPeriod: { kind: "custom", from: "2026-11-04T12:00", to: "2026-11-04T10:00" },
  });
  expect(bad).toContain("invalid range");
  expect(bad).not.toContain("data-preset=");
});

test("presets panel without recorded presets explains the evidence state per source", () => {
  const state = withSources({ pc: [ev("a", 5)], orca: [ev("b", 5)] }, undefined, {});
  const withStatus: ExchangeState = {
    ...state,
    exchange: {
      sources: state.exchange!.sources.map((s) => ({
        ...s,
        state: s.state && {
          ...s.state,
          presetStatus: {
            status: s.id === "pc" ? "missing" : "unconfigured",
            detail: s.id === "pc" ? "no such file" : undefined,
          },
        },
      })),
    },
  };
  const html = shell(withStatus, "presets");
  expect(html).toContain("no preset recorded in this period");
  expect(html).toContain("unattributed 2");
  expect(html).toContain("preset file missing");
  expect(html).toContain("no such file");
  expect(html).toContain("preset file unconfigured");
  expect(html).not.toContain("data-preset=");
});

test("estimated preset attribution is labelled as estimated and unverified", () => {
  const at = NOW - 30 * MIN;
  const state = withSources({ pc: [ev("in", 20)] });
  const withPreset: ExchangeState = {
    ...state,
    exchange: {
      sources: state.exchange!.sources.map((s) => ({
        ...s,
        state: s.state && {
          ...s.state,
          presetStatus: { status: "ok" as const, observedFrom: at - 5 * MIN, observedTo: NOW },
          presetChanges: [{ preset: "slim", at }],
        },
      })),
    },
  };
  const html = shell(withPreset, "presets", { initialPeriod: { ...DEFAULT_PERIOD, kind: "1h" } });
  expect(html).toContain('data-preset="slim"');
  expect(html).toContain("estimated 1");
  expect(html).toContain("sampled file selection · runtime use unverified");
});

test("preset sample limits are stated when events were omitted or evicted", () => {
  const state = withSources({ pc: [ev("a", 5, { preset: "fast" })] }, undefined, {
    window: {
      ...blank.window,
      events: { retained: 9, sent: 1, omitted: 8 },
      evicted: { observe: 2, route: 0, permissions: 0 },
    },
  });
  const html = shell(state, "presets", { initialPeriod: { ...DEFAULT_PERIOD, kind: "1h" } });
  expect(html).toContain("8 omitted from payload");
  expect(html).toContain("evicted 2");
  expect(html).toContain("sent events only");
});

test("quota and presets expose source coverage and missing-source reasons", () => {
  const analytics: ServerAnalytics = {
    settings: { quotas: [quota], alerts: alertSettings },
    result: {
      quotas: [],
      sourceCoverage: [
        {
          id: "pc",
          status: "live",
          included: true,
          retained: 12,
          omitted: 2,
          evicted: 1,
          oldestRetainedTs: "2026-11-04T10:00:00Z",
          partialReasons: ["retained event details omitted"],
        },
        {
          id: "orca",
          status: "stale",
          included: false,
          retained: 0,
          omitted: 0,
          evicted: 0,
          oldestRetainedTs: null,
          partialReasons: ["source unavailable"],
        },
      ],
    },
    alerts: [],
  };
  const state = withSources({ pc: [ev("a", 1, { preset: "fast" })], orca: [] }, analytics);
  for (const name of ["quota", "presets"] as const) {
    const html = shell(state, name);
    expect(html).toContain("source coverage");
    expect(html).toContain("source unavailable");
    expect(html).toContain("retained event details omitted");
    expect(html).toContain("retained 12");
    expect(html).toContain("omitted 2");
    expect(html).toContain("evicted 1");
    expect(html).toContain("stale");
  }
  const only = shell(state, "quota", { initialView: "pc" });
  expect(only).not.toContain("source unavailable");
});
