import { expect, test } from "bun:test";
import { aggregate, type DashboardState, type FlowEvent } from "../src/core/aggregate";
import {
  alertsView,
  analyticsEvents,
  DEFAULT_PERIOD,
  type Period,
  periodRange,
  presetView,
  quotaView,
  type ServerAnalytics,
} from "../web/analytics";
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
// Raw records carry unknown fields (execution, preset, client). eventsFromState reads them through its own validators.
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
const withSources = (
  sources: { id: string; state: DashboardState | null; status?: "live" | "stale" }[],
  analytics?: ServerAnalytics,
): ExchangeState => ({
  ...blank,
  exchange: { sources: sources.map((s) => ({ id: s.id, label: s.id, status: s.status ?? "live", state: s.state })) },
  ...(analytics ? { analytics } : {}),
});
const custom = (from: string, to: string): Period => ({ kind: "custom", from, to });

test("analytics events come from each source's own state, or only the selected one", () => {
  const state = withSources([
    { id: "pc", state: stateOf([ev("a", 5), ev("b", 4)]) },
    { id: "orca", state: stateOf([ev("c", 3)]) },
    { id: "local", state: null },
  ]);
  const all = analyticsEvents(state, "combined");
  expect(all.map((e) => e.sourceId).sort()).toEqual(["orca", "pc", "pc"]);
  expect(analyticsEvents(state, "orca").map((e) => e.sourceId)).toEqual(["orca"]);
  expect(analyticsEvents(state, "local")).toEqual([]);
  // Single-source dashboards have no exchange: the state is the local source.
  expect(analyticsEvents(stateOf([ev("x", 1)]), "combined").map((e) => e.sourceId)).toEqual(["local"]);
});

test("period ranges follow the page clock; invalid custom ranges are refused, not guessed", () => {
  const events = analyticsEvents(withSources([{ id: "pc", state: stateOf([ev("a", 90), ev("b", 10)]) }]), "combined");
  expect(periodRange({ ...DEFAULT_PERIOD, kind: "1h" }, events, NOW)).toEqual({ from: NOW - 60 * MIN, to: NOW });
  expect(periodRange({ ...DEFAULT_PERIOD, kind: "24h" }, events, NOW)).toEqual({ from: NOW - 24 * 60 * MIN, to: NOW });
  expect(periodRange({ ...DEFAULT_PERIOD, kind: "7d" }, events, NOW)).toEqual({
    from: NOW - 7 * 24 * 60 * MIN,
    to: NOW,
  });
  expect(periodRange({ ...DEFAULT_PERIOD, kind: "all" }, events, NOW)).toEqual({ from: NOW - 90 * MIN, to: NOW });
  expect(periodRange({ ...DEFAULT_PERIOD, kind: "all" }, [], NOW)).toEqual({ from: NOW, to: NOW });
  expect(periodRange(custom("2026-11-04T10:00:00Z", "2026-11-04T11:00:00Z"), events, NOW)).toEqual({
    from: Date.parse("2026-11-04T10:00:00Z"),
    to: Date.parse("2026-11-04T11:00:00Z"),
  });
  expect(periodRange(custom("", "2026-11-04T11:00:00Z"), events, NOW)).toBeNull();
  expect(periodRange(custom("nope", "2026-11-04T11:00:00Z"), events, NOW)).toBeNull();
  expect(periodRange(custom("2026-11-04T11:00:00Z", "2026-11-04T10:00:00Z"), events, NOW)).toBeNull();
});

test("preset comparison uses the chosen period, recorded presets, and says what is unavailable", () => {
  const pc = stateOf([
    ev("old", 3000, { preset: "fast" }, { suggestion: "fixer", contextAgent: "fixer", latency: 10 }),
    ev("a", 30, { preset: "fast" }, { suggestion: "orchestrator", contextAgent: "orchestrator", latency: 100 }),
    ev("b", 20, { preset: "fast" }, { suggestion: "fixer", contextAgent: "orchestrator", latency: 300 }),
  ]);
  const orca = stateOf([
    ev(
      "c",
      10,
      { preset: "deep", execution: exec({ tokens: { input: 10, output: 5 }, fallback: false }) },
      { suggestion: "oracle", contextAgent: "oracle", latency: 50 },
    ),
    ev("d", 5, {}, { latency: 70 }),
  ]);
  const state = withSources([
    { id: "pc", state: pc },
    { id: "orca", state: orca },
  ]);
  const view = presetView(state, "combined", { ...DEFAULT_PERIOD, kind: "1h" }, NOW);
  expect(view.events).toBe(4);
  const fast = view.result!.presets.find((p) => p.preset === "fast")!;
  expect(fast).toMatchObject({
    count: 2,
    contextAgreement: 0.5,
    p50Latency: 200,
    fallback: null,
    tokens: null,
    cost: null,
  });
  expect(fast.coverage.explicit).toBe(2);
  const deep = view.result!.presets.find((p) => p.preset === "deep")!;
  expect(deep).toMatchObject({ count: 1, tokens: 15, fallback: 0 });
  // The event without a recorded preset stays unattributed instead of inheriting one.
  expect(view.result!.presetCoverage).toEqual({ total: 4, attributed: 3, unattributed: 1 });
  // A wider period brings the old event in.
  const wide = presetView(state, "combined", { ...DEFAULT_PERIOD, kind: "7d" }, NOW);
  expect(wide.result!.presets.find((p) => p.preset === "fast")!.count).toBe(3);
  // A single source only compares its own events.
  expect(
    presetView(state, "orca", { ...DEFAULT_PERIOD, kind: "1h" }, NOW).result!.presets.map((p) => p.preset),
  ).toEqual(["deep"]);
});

test("preset comparison reports sample limits and per-source preset file status", () => {
  const limited = stateOf([ev("a", 5, { preset: "fast" })], {
    window: {
      ...blank.window,
      events: { retained: 9, sent: 1, omitted: 8 },
      evicted: { observe: 2, route: 1, permissions: 0 },
    },
    presetStatus: { status: "missing", detail: "no such file" },
    presetChanges: [{ preset: "fast", at: NOW - 100 * MIN }],
  });
  const view = presetView(
    withSources([{ id: "pc", state: limited }]),
    "combined",
    { ...DEFAULT_PERIOD, kind: "1h" },
    NOW,
  );
  expect(view.omitted).toBe(8);
  expect(view.evicted).toBe(3);
  expect(view.sources).toEqual([{ id: "pc", status: "missing", detail: "no such file", changes: 1 }]);
  const none = presetView(
    withSources([{ id: "pc", state: stateOf([ev("a", 5)]) }]),
    "combined",
    { ...DEFAULT_PERIOD, kind: "1h" },
    NOW,
  );
  expect(none.result!.presets).toEqual([]);
  expect(none.result!.presetCoverage.unattributed).toBe(1);
  expect(presetView(withSources([]), "combined", custom("x", "y"), NOW)).toMatchObject({ range: null, result: null });
});

test("observed preset intervals are used only inside the observed coverage", () => {
  const at = NOW - 30 * MIN;
  const state = stateOf([ev("in", 20), ev("before", 40)], {
    presetStatus: { status: "ok", observedFrom: at - 5 * MIN, observedTo: NOW },
    presetChanges: [{ preset: "slim", at }],
  });
  const view = presetView(withSources([{ id: "pc", state }]), "combined", { ...DEFAULT_PERIOD, kind: "1h" }, NOW);
  const slim = view.result!.presets.find((p) => p.preset === "slim")!;
  expect(slim.count).toBe(1);
  expect(slim.coverage.sampled).toBe(1);
  expect(slim.coverage.sampledAttribution).toContain("unverified");
  expect(view.result!.presetCoverage.unattributed).toBe(1);
});

test("quotas are never invented: nothing configured means nothing shown", () => {
  const state = withSources([
    { id: "pc", state: stateOf([ev("a", 1, { execution: exec({ tokens: { input: 1, output: 1 } }) })]) },
  ]);
  expect(quotaView(state, "combined", NOW)).toEqual({ mode: "none", rows: [], configured: [], coverage: [] });
});

const settings = (quotas: ServerAnalytics["settings"]["quotas"]): ServerAnalytics["settings"] => ({
  quotas,
  alerts: { holdMs: 0, repeatMs: 60000, activeMs: 60000, desktop: false },
});
const quota = { id: "q1", label: "Plus", provider: "p", metric: "tokens" as const, limit5h: 1000 };
const window5 = {
  from: 0,
  to: NOW,
  limit: 1000,
  observed: 20,
  status: "partial" as const,
  coverage: { sources: 2, complete: false, attributionGaps: true },
};
const row = (sourceId: string | null) => ({
  ...quota,
  sourceId,
  fiveHour: window5,
  weekly: { ...window5, limit: null, observed: null, status: "unknown" as const },
});

test("server quota rows are shown per source and never summed", () => {
  const analytics: ServerAnalytics = {
    settings: settings([quota]),
    result: { quotas: [row("pc"), row("orca")] },
    alerts: [],
  };
  const state = withSources(
    [
      { id: "pc", state: stateOf([]) },
      { id: "orca", state: stateOf([]) },
    ],
    analytics,
  );
  const all = quotaView(state, "combined", NOW);
  expect(all.mode).toBe("server");
  expect(all.rows.map((r) => r.sourceId)).toEqual(["pc", "orca"]);
  expect(quotaView(state, "orca", NOW).rows.map((r) => r.sourceId)).toEqual(["orca"]);
});

test("configured quotas without a server result are analysed from sent events, with honest status", () => {
  const events = [ev("a", 10, { execution: exec({ tokens: { input: 300, output: 100 } }) }), ev("b", 5, {})];
  const state = withSources([{ id: "pc", state: stateOf(events) }], {
    settings: settings([quota]),
    result: undefined as never,
    alerts: [],
  });
  const view = quotaView(state, "combined", NOW);
  expect(view.mode).toBe("derived");
  const five = view.rows[0]!.fiveHour;
  expect(five).toMatchObject({ observed: 400, limit: 1000, status: "partial" });
  expect(view.rows[0]!.weekly.limit).toBeNull();
});

test("derived alerts come only from explicit rate-limit, quota or fallback evidence", () => {
  const events = [
    ev("quiet", 1, {}, { latency: 5000 }),
    ev("jev", 1, {}, { errors: ["HTTP 429 from classifier"] }),
    ev("exec", 1, { execution: exec({ status: 429 }) }),
    ev("quota", 1, { execution: exec({ error: "quota exhausted for plan" }) }),
    ev("fb", 1, { execution: exec({ fallback: true }) }),
    ev("stale", 30, { execution: exec({ status: 429 }) }),
  ];
  const view = alertsView(withSources([{ id: "pc", state: stateOf(events) }]), "combined", NOW);
  expect(view.mode).toBe("derived");
  expect(view.rows.map((r) => r.kind).sort()).toEqual(["classifier-rate-limit", "fallback", "quota", "rate-limit"]);
  expect(view.rows.every((r) => r.sourceId === "pc" && r.lastFired === null && r.since === null && r.active)).toBe(
    true,
  );
  expect(view.active).toBe(4);
  expect(view.evidence).toEqual({ sources: 1, events: 6, withExecution: 4 });
  expect(view.settings).toBeNull();
  // Unknown never fires.
  expect(
    alertsView(withSources([{ id: "pc", state: stateOf([ev("q", 1, {}, { latency: 9999 })]) }]), "combined", NOW).rows,
  ).toEqual([]);
});

test("server alerts keep their hold/repeat history, newest first, filtered by source", () => {
  const analytics: ServerAnalytics = {
    settings: settings([]),
    result: { quotas: [] },
    alerts: [
      { sourceId: "pc", kind: "rate-limit", since: NOW - 10 * MIN, lastFired: NOW - 9 * MIN },
      { sourceId: "orca", kind: "fallback", since: NOW - 2000, lastFired: NOW - 1000 },
    ],
    notificationStatus: { ok: false, reason: "notification failed" },
  };
  const state = withSources(
    [
      { id: "pc", state: stateOf([]) },
      { id: "orca", state: stateOf([]) },
    ],
    analytics,
  );
  const view = alertsView(state, "combined", NOW);
  expect(view.mode).toBe("server");
  expect(view.rows.map((r) => [r.sourceId, r.active])).toEqual([
    ["orca", true],
    ["pc", false],
  ]);
  expect(view.active).toBe(1);
  expect(view.settings).toEqual({ holdMs: 0, repeatMs: 60000, activeMs: 60000, desktop: false });
  expect(view.notification).toEqual({ ok: false, reason: "notification failed" });
  expect(alertsView(state, "pc", NOW).rows.map((r) => r.sourceId)).toEqual(["pc"]);
});
