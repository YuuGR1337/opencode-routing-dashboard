import type { DashboardState } from "../src/core/aggregate";
import {
  type AlertKind,
  type AlertState,
  type AnalyticsEvent,
  analyze,
  eventsFromState,
  type Quota,
  reduceAlerts,
} from "../src/core/analytics";
import { COMBINED, type ExchangeState } from "./exchange";

type Analysis = ReturnType<typeof analyze>;
export type QuotaRow = Analysis["quotas"][number];
export type SourceCoverage = {
  id: string;
  status?: string;
  included?: boolean;
  retained?: number;
  omitted?: number;
  evicted?: number;
  oldestRetainedTs?: string | null;
  partialReasons: string[];
};
/** What the UI reads from the server's optional `analytics` block. Fields it does not read are not validated. */
export type ServerAnalytics = {
  settings: { quotas: Quota[]; alerts: { holdMs: number; repeatMs: number; activeMs: number; desktop: boolean } };
  result: {
    quotas: QuotaRow[];
    sourceCoverage?: SourceCoverage[];
    presetCoverage?: { partialReasons?: { sourceId: string; reasons: string[] }[] };
  };
  alerts: AlertState[];
  presetStatus?: "unverified";
  notificationStatus?: { ok: boolean; reason?: string };
};

export const PERIOD_KINDS = ["1h", "24h", "7d", "all", "custom"] as const;
export type Period = { kind: (typeof PERIOD_KINDS)[number]; from: string; to: string };
export const DEFAULT_PERIOD: Period = { kind: "24h", from: "", to: "" };
export const PERIOD_LABEL: Record<Period["kind"], string> = {
  "1h": "last 1 h",
  "24h": "last 24 h",
  "7d": "last 7 d",
  all: "all sent events",
  custom: "custom range",
};
export const ALERT_LABEL: Record<AlertKind, string> = {
  "classifier-rate-limit": "Jev classifier rate limit",
  "rate-limit": "execution rate limit",
  quota: "execution quota exhausted",
  fallback: "fallback observed",
};
/** Derived alerts look at this much recent evidence; the server uses its own configured window. */
export const DERIVED_ALERT_WINDOW_MS = 5 * 60_000;

export type AlertRow = {
  sourceId: string;
  kind: AlertKind;
  since: number | null;
  lastFired: number | null;
  active: boolean;
};
export type AlertsView = {
  mode: "server" | "derived";
  rows: AlertRow[];
  active: number;
  settings: ServerAnalytics["settings"]["alerts"] | null;
  notification: { ok: boolean; reason?: string } | null;
  evidence: { sources: number; events: number; withExecution: number };
};
export type QuotaView = {
  mode: "server" | "derived" | "none";
  rows: QuotaRow[];
  configured: Quota[];
  coverage: SourceCoverage[];
};
export type PresetView = {
  range: { from: number; to: number } | null;
  result: Analysis | null;
  sources: { id: string; status: string; detail?: string; changes: number }[];
  events: number;
  omitted: number;
  evicted: number;
  partialReasons: { sourceId: string; reasons: string[] }[];
  coverage: SourceCoverage[];
};

function sourceCoverage(state: ExchangeState, viewId: string): SourceCoverage[] {
  const coverage = state.analytics?.result?.sourceCoverage ?? [];
  return viewId === COMBINED ? coverage : coverage.filter((source) => source.id === viewId);
}

/** Sources whose state the analytics read. A selected source narrows to itself; single-source dashboards are "local". */
function included(state: ExchangeState, viewId: string): { id: string; state: DashboardState | null }[] {
  const sources = state.exchange?.sources;
  if (!sources) return [{ id: "local", state }];
  const one = viewId === COMBINED ? undefined : sources.find((s) => s.id === viewId);
  return (one ? [one] : sources).map((s) => ({ id: s.id, state: s.state }));
}
const present = (state: ExchangeState, viewId: string) =>
  included(state, viewId).filter((s): s is { id: string; state: DashboardState } => s.state !== null);

export function analyticsEvents(state: ExchangeState, viewId: string): AnalyticsEvent[] {
  return present(state, viewId).flatMap((s) => eventsFromState(s.state, s.id));
}

const SPAN = { "1h": 3_600_000, "24h": 86_400_000, "7d": 7 * 86_400_000 } as const;
/** The period as a time range on the page clock. Null when a custom range is empty, unparsable or reversed. */
export function periodRange(
  period: Period,
  events: AnalyticsEvent[],
  now: number,
): { from: number; to: number } | null {
  if (period.kind === "custom") {
    if (!period.from || !period.to) return null;
    const from = Date.parse(period.from);
    const to = Date.parse(period.to);
    return Number.isFinite(from) && Number.isFinite(to) && from <= to ? { from, to } : null;
  }
  if (period.kind === "all") return { from: events.reduce((m, e) => Math.min(m, e.timestamp), now), to: now };
  return { from: now - SPAN[period.kind], to: now };
}

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

export function presetView(state: ExchangeState, viewId: string, period: Period, now: number): PresetView {
  const used = present(state, viewId);
  const events = analyticsEvents(state, viewId);
  const range = periodRange(period, events, now);
  const sources = included(state, viewId).map((s) => ({
    id: s.id,
    status: s.state ? (s.state.presetStatus?.status ?? "unknown") : "no state",
    ...(s.state?.presetStatus?.detail ? { detail: s.state.presetStatus.detail } : {}),
    changes: s.state?.presetChanges?.length ?? 0,
  }));
  const base = {
    sources,
    omitted: sum(used.map((s) => s.state.window.events.omitted)),
    evicted: sum(used.map((s) => s.state.window.evicted.observe + s.state.window.evicted.route)),
    partialReasons: (state.analytics?.result?.presetCoverage?.partialReasons ?? []).filter(
      (item) => viewId === COMBINED || item.sourceId === viewId,
    ),
    coverage: sourceCoverage(state, viewId),
  };
  if (!range) return { range: null, result: null, events: 0, ...base };
  const result = analyze(
    events,
    {
      ...range,
      presetChanges: used.flatMap((s) => (s.state.presetChanges ?? []).map((c) => ({ sourceId: s.id, ...c }))),
      presetCoverage: used.flatMap((s) =>
        s.state.presetStatus?.status === "ok" &&
        s.state.presetStatus.observedFrom !== undefined &&
        s.state.presetStatus.observedTo !== undefined
          ? [{ sourceId: s.id, from: s.state.presetStatus.observedFrom, to: s.state.presetStatus.observedTo }]
          : [],
      ),
    },
    now,
  );
  return {
    range,
    result,
    events: events.filter((e) => e.timestamp >= range.from && e.timestamp <= range.to && e.timestamp <= now).length,
    ...base,
  };
}

/** Quota limits come only from user settings. Without them nothing is shown, never a default. */
export function quotaView(state: ExchangeState, viewId: string, now: number): QuotaView {
  const configured = state.analytics?.settings.quotas ?? [];
  const coverage = sourceCoverage(state, viewId);
  if (configured.length === 0) return { mode: "none", rows: [], configured: [], coverage };
  const only = (rows: QuotaRow[]) => (viewId === COMBINED ? rows : rows.filter((r) => r.sourceId === viewId));
  const server = state.analytics?.result?.quotas;
  if (server) return { mode: "server", rows: only(server), configured, coverage };
  // No server result: estimate from the sent events. No coverage is proven here, so nothing can read "estimate".
  const result = analyze(
    analyticsEvents(state, COMBINED),
    { from: now - SPAN["7d"], to: now, quotas: configured },
    now,
  );
  return { mode: "derived", rows: only(result.quotas), configured, coverage };
}

export function alertsView(state: ExchangeState, viewId: string, now: number): AlertsView {
  const events = analyticsEvents(state, viewId);
  const evidence = {
    sources: present(state, viewId).length,
    events: events.length,
    withExecution: events.filter((e) => e.execution !== null).length,
  };
  const server = state.analytics;
  if (server) {
    const { activeMs } = server.settings.alerts;
    const rows = server.alerts
      .filter((a) => viewId === COMBINED || a.sourceId === viewId)
      .map((a) => ({
        sourceId: a.sourceId,
        kind: a.kind,
        since: a.since,
        lastFired: a.lastFired,
        active: a.lastFired !== null && now - a.lastFired <= activeMs,
      }))
      .sort((a, b) => (b.lastFired ?? b.since ?? 0) - (a.lastFired ?? a.since ?? 0));
    return {
      mode: "server",
      rows,
      active: rows.filter((r) => r.active).length,
      settings: server.settings.alerts,
      notification: server.notificationStatus ?? null,
      evidence,
    };
  }
  // Without the server there is no hold/repeat history: show which explicit evidence appeared recently.
  const recent = events.filter((e) => e.timestamp >= now - DERIVED_ALERT_WINDOW_MS);
  const rows = reduceAlerts(recent, [], { holdMs: 0, repeatMs: 0 }, now)
    .state.map((a) => ({ sourceId: a.sourceId, kind: a.kind, since: null, lastFired: null, active: true }))
    .sort((a, b) => (a.sourceId < b.sourceId ? -1 : a.sourceId > b.sourceId ? 1 : a.kind < b.kind ? -1 : 1));
  return { mode: "derived", rows, active: rows.length, settings: null, notification: null, evidence };
}
