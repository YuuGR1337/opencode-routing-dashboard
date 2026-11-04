import { expect, test } from "bun:test";
import { aggregate, type DashboardState } from "../src/core/aggregate";
import { decodeEnvelope, decodeMessage } from "../web/live";

const state: DashboardState = aggregate({
  observe: [],
  route: [],
  permissions: [],
  stats: null,
  malformed: { observe: 0, route: 0, permissions: 0 },
});
const source = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  label: id.toUpperCase(),
  status: "live",
  state,
  ...extra,
});
const wrap = (sources: unknown) => ({ state: { ...state, exchange: { sources } }, seq: 1, demo: false });

test("accepts an exchange with per-source state, stale health and a source without state yet", () => {
  const sources = [
    source("pc", { client: "tui", lastSeenAt: "2026-11-04T02:00:00Z" }),
    source("orca", { status: "stale", detail: "idle timeout" }),
    source("local", { status: "connecting", state: null }),
  ];
  const decoded = decodeEnvelope(wrap(sources));
  expect(decoded?.state.exchange?.sources.map((s) => s.id)).toEqual(["pc", "orca", "local"]);
  expect(decoded?.state.exchange?.sources[2]?.state).toBeNull();
  // Flattened HTTP envelopes carry exchange next to the combined state.
  const flat = decodeEnvelope({ ...state, exchange: { sources }, seq: 0, demo: true });
  expect(flat?.state.exchange?.sources).toHaveLength(3);
});

test("the exchange stays optional", () => {
  expect(decodeEnvelope({ state, seq: 1, demo: false })?.state.exchange).toBeUndefined();
  expect(decodeEnvelope({ state: { ...state, exchange: undefined }, seq: 1, demo: false })).not.toBeNull();
});

test("rejects malformed exchange data before rendering", () => {
  const bad: unknown[] = [
    wrap({}),
    wrap([source("pc", { status: "ok" })]),
    wrap([source("pc", { id: 3 })]),
    wrap([source("pc", { id: "" })]),
    wrap([source("pc", { label: null })]),
    wrap([source("pc", { client: 5 })]),
    wrap([source("pc", { lastSeenAt: 5 })]),
    wrap([source("pc", { detail: {} })]),
    wrap([source("pc", { state: {} })]),
    wrap([source("pc", { state: undefined })]),
    wrap([source("pc"), source("pc")]),
    wrap([source("combined")]),
    wrap(Array.from({ length: 33 }, (_, i) => source(`s${i}`))),
    { state: { ...state, exchange: null }, seq: 1, demo: false },
  ];
  for (const item of bad) expect(decodeEnvelope(item)).toBeNull();
});

test("a source's own state is flat: nested exchanges are rejected", () => {
  const nested = { ...state, exchange: { sources: [source("deep")] } };
  expect(decodeEnvelope(wrap([source("pc", { state: nested })]))).toBeNull();
});

test("optional source evidence on events must be strings", () => {
  const event = {
    id: "e1",
    ts: "2026-11-04T02:00:00Z",
    session: "pc:ses",
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
    executionAgent: null,
    executionModel: null,
    executionProvider: null,
    executionVariant: null,
    tokens: null,
    cost: null,
    fallback: "not detectable",
    latency: null,
    errors: [],
    observe: null,
    route: null,
  };
  const withEvents = (events: unknown[]) => ({ state: { ...state, events }, seq: 1, demo: false });
  expect(
    decodeEnvelope(withEvents([{ ...event, sourceId: "pc", directory: "/work/x", client: "tui" }])),
  ).not.toBeNull();
  expect(decodeEnvelope(withEvents([event]))).not.toBeNull();
  for (const key of ["sourceId", "directory", "client"])
    expect(decodeEnvelope(withEvents([{ ...event, [key]: 7 }]))).toBeNull();
});

test("decodeMessage turns undecodable text into a rejection instead of throwing", () => {
  expect(decodeMessage(JSON.stringify({ state, seq: 1, demo: false }))?.seq).toBe(1);
  expect(decodeMessage("{not json")).toBeNull();
  expect(decodeMessage("null")).toBeNull();
  expect(decodeMessage(JSON.stringify({ state: {}, seq: 1, demo: false }))).toBeNull();
});

const window5 = {
  from: 0,
  to: 10,
  limit: 100,
  observed: 5,
  status: "partial",
  coverage: { sources: 1, complete: false, attributionGaps: true },
};
const analytics = {
  settings: {
    quotas: [{ id: "q", label: "Plus", provider: "p", metric: "tokens", limit5h: 100 }],
    alerts: { holdMs: 0, repeatMs: 60000, activeMs: 60000, desktop: false },
  },
  result: {
    quotas: [
      {
        id: "q",
        label: "Plus",
        provider: "p",
        metric: "tokens",
        sourceId: "pc",
        fiveHour: window5,
        weekly: { ...window5, limit: null, observed: null, status: "unknown" },
      },
    ],
    sourceCoverage: [{ id: "pc", partialReasons: ["source not live"] }],
  },
  alerts: [{ sourceId: "pc", kind: "fallback", since: 1, lastFired: null }],
  presetChanges: [],
  notificationStatus: { ok: false, reason: "notification failed" },
};
const withAnalytics = (value: unknown) => ({ state: { ...state, analytics: value }, seq: 1, demo: false });

test("accepts the optional analytics block the server publishes", () => {
  expect(decodeEnvelope(withAnalytics(analytics))?.state.analytics?.alerts).toHaveLength(1);
  expect(decodeEnvelope(withAnalytics(undefined))).not.toBeNull();
});

test("rejects malformed analytics before the panels read it", () => {
  const bad: unknown[] = [
    null,
    {},
    { ...analytics, settings: { ...analytics.settings, quotas: {} } },
    { ...analytics, settings: { ...analytics.settings, alerts: { ...analytics.settings.alerts, holdMs: "0" } } },
    { ...analytics, settings: { ...analytics.settings, alerts: { ...analytics.settings.alerts, desktop: 1 } } },
    { ...analytics, result: { quotas: [{ id: "q" }] } },
    { ...analytics, result: { quotas: [{ ...analytics.result.quotas[0], fiveHour: { ...window5, status: "ok" } }] } },
    { ...analytics, result: { quotas: [{ ...analytics.result.quotas[0], weekly: { ...window5, observed: "5" } }] } },
    { ...analytics, result: { ...analytics.result, sourceCoverage: [{ id: "pc" }] } },
    { ...analytics, alerts: [{ sourceId: "pc", kind: "nope", since: 1, lastFired: null }] },
    { ...analytics, alerts: [{ sourceId: "pc", kind: "fallback", since: "1", lastFired: null }] },
    { ...analytics, alerts: {} },
    { ...analytics, notificationStatus: { ok: "no" } },
  ];
  for (const item of bad) expect(decodeEnvelope(withAnalytics(item))).toBeNull();
});

test("optional event provenance is validated when present", () => {
  const event = {
    id: "e1",
    ts: "2026-11-04T02:00:00Z",
    session: '["pc","ses"]',
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
    executionAgent: null,
    executionModel: null,
    executionProvider: null,
    executionVariant: null,
    tokens: null,
    cost: null,
    fallback: "not detectable",
    latency: null,
    errors: [],
    observe: null,
    route: null,
    sourceId: "pc",
  };
  const withProvenance = (provenance: unknown) => ({
    state: { ...state, events: [{ ...event, provenance }] },
    seq: 1,
    demo: false,
  });
  const good = { directory: "/work/x", client: "Orca", evidence: "configured", label: "orca worktree" };
  expect(decodeEnvelope(withProvenance(good))).not.toBeNull();
  expect(decodeEnvelope(withProvenance({ directory: null, client: "unknown", evidence: "unknown" }))).not.toBeNull();
  for (const bad of [
    null,
    "Orca",
    { ...good, evidence: "guessed" },
    { ...good, client: "Mac" },
    { ...good, directory: 7 },
    { ...good, label: 7 },
    { client: "Orca", evidence: "configured" },
  ])
    expect(decodeEnvelope(withProvenance(bad))).toBeNull();
});

test("validates optional preset monitoring before rendering source analytics", () => {
  const valid = {
    ...state,
    presetChanges: [{ preset: "fast", at: 100 }],
    presetStatus: { status: "ok", observedFrom: 50, observedTo: 150 },
  };
  expect(decodeEnvelope(wrap([source("pc", { state: valid })]))).not.toBeNull();
  for (const invalid of [
    { ...state, presetChanges: {} },
    { ...state, presetChanges: [{ preset: "fast", at: "now" }] },
    { ...state, presetStatus: { status: "invalid" } },
    { ...state, presetStatus: { status: "ok", observedFrom: "bad" } },
  ])
    expect(decodeEnvelope(wrap([source("pc", { state: invalid })]))).toBeNull();
});
