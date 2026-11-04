import type { DashboardState } from "./aggregate";

export type Client = "Orca" | "TUI" | "service";
export type Execution = {
  model: string;
  provider: string;
  tokens?: { input: number; output: number };
  cost?: number;
  fallback?: boolean;
  status?: number;
  error?: string;
};
export type AnalyticsEvent = {
  timestamp: number;
  sourceId: string;
  session: string;
  contextAgent: string | null;
  role: string | null;
  latency: number | null;
  errors: string[];
  execution: Execution | null;
  preset: string | null;
  client: Client | null;
  directory: string | null;
};
export type Quota = {
  id: string;
  label: string;
  provider: string;
  model?: string;
  metric: "tokens" | "messages";
  limit5h?: number;
  limitWeekly?: number;
};
export type AnalyticsSettings = {
  from: number;
  to: number;
  quotas?: Quota[];
  presetChanges?: { sourceId: string; preset: string; at: number }[];
  coverage?: { sourceId: string; from: number; to: number; complete: boolean }[];
  presetCoverage?: { sourceId: string; from: number; to: number }[];
};
const obj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const nonnegative = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;
const client = (v: unknown): v is Client => v === "Orca" || v === "TUI" || v === "service";
function execution(v: unknown): Execution | null {
  if (
    !obj(v) ||
    !str(v.model) ||
    !str(v.provider) ||
    (v.cost !== undefined && !nonnegative(v.cost)) ||
    (v.fallback !== undefined && typeof v.fallback !== "boolean") ||
    (v.status !== undefined &&
      (!Number.isInteger(v.status) || (v.status as number) < 100 || (v.status as number) > 599)) ||
    (v.error !== undefined && (typeof v.error !== "string" || v.error.length > 4096))
  )
    return null;
  if (v.tokens !== undefined && (!obj(v.tokens) || !nonnegative(v.tokens.input) || !nonnegative(v.tokens.output)))
    return null;
  return {
    model: v.model,
    provider: v.provider,
    ...(v.cost !== undefined ? { cost: v.cost as number } : {}),
    ...(v.fallback !== undefined ? { fallback: v.fallback as boolean } : {}),
    ...(v.status !== undefined ? { status: v.status as number } : {}),
    ...(v.error !== undefined ? { error: v.error as string } : {}),
    ...(v.tokens !== undefined
      ? { tokens: { input: (v.tokens as { input: number }).input, output: (v.tokens as { output: number }).output } }
      : {}),
  };
}
// Conflicting records are not silently assigned to either source of evidence.
function unique<T>(values: T[]): T | null {
  if (!values.length) return null;
  const first = JSON.stringify(values[0]);
  return values.every((v) => JSON.stringify(v) === first) ? values[0]! : null;
}
export function eventsFromState(state: DashboardState, sourceId: string): AnalyticsEvent[] {
  return state.events.flatMap((e) => {
    const timestamp = Date.parse(e.ts);
    if (!Number.isFinite(timestamp)) return [];
    const raw: Record<string, unknown>[] = [e.observe, e.route].filter((v): v is NonNullable<typeof v> => v !== null);
    const executions = raw.filter((r) => r.execution !== undefined).map((r) => execution(r.execution));
    const presets = raw.filter((r) => r.preset !== undefined).map((r) => (str(r.preset) ? r.preset : null));
    const clients = raw.filter((r) => r.client !== undefined).map((r) => (client(r.client) ? r.client : null));
    return [
      {
        timestamp,
        sourceId,
        session: e.session,
        contextAgent: e.contextAgent,
        role: e.suggestion,
        latency: e.latency,
        errors: e.observe?.status === 429 ? [...e.errors, "HTTP 429"] : e.errors,
        execution: unique(executions),
        preset: unique(presets),
        client: unique(clients),
        directory: str(e.route?.dir) ? e.route.dir : null,
      },
    ];
  });
}
export function classifyProvenance(e: AnalyticsEvent, sourceClient?: Client) {
  return {
    source: { value: e.sourceId, provenance: "configured" as const },
    client: e.client
      ? { value: e.client, provenance: "observed" as const }
      : sourceClient
        ? { value: sourceClient, provenance: "configured" as const }
        : { value: null, provenance: "unknown" as const },
    directory: e.directory
      ? { value: e.directory, provenance: "observed" as const }
      : { value: null, provenance: "unknown" as const },
  };
}
function covered(
  source: string,
  from: number,
  to: number,
  coverage: NonNullable<AnalyticsSettings["coverage"]>,
): boolean {
  let end = from;
  for (const c of coverage
    .filter((c) => c.sourceId === source && c.complete && c.to >= from && c.from <= to)
    .sort((a, b) => a.from - b.from)) {
    if (c.from > end) break;
    end = Math.max(end, c.to);
    if (end >= to) return true;
  }
  return false;
}
function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  values.sort((a, b) => a - b);
  const pos = (values.length - 1) * p,
    lo = Math.floor(pos),
    hi = Math.ceil(pos);
  return values[lo]! + (values[hi]! - values[lo]!) * (pos - lo);
}
export function analyze(events: AnalyticsEvent[], settings: AnalyticsSettings, now: number) {
  const valid = events.filter((e) => Number.isFinite(e.timestamp) && e.timestamp <= now);
  const sources = [...new Set([...valid.map((e) => e.sourceId), ...(settings.coverage ?? []).map((c) => c.sourceId)])];
  const quotas = (settings.quotas ?? []).flatMap((q) =>
    (sources.length ? sources : [null]).map((sourceId) => {
      const window = (duration: number, limit: number | undefined) => {
        const from = now - duration;
        const within = valid.filter((e) => e.sourceId === sourceId && e.timestamp > from && e.timestamp <= now);
        const matched = within.filter(
          (e) => e.execution?.provider === q.provider && (!q.model || e.execution.model === q.model),
        );
        const measured = matched.filter((e) => q.metric === "messages" || e.execution?.tokens !== undefined);
        const observed = measured.reduce(
          (sum, e) => sum + (q.metric === "messages" ? 1 : e.execution!.tokens!.input + e.execution!.tokens!.output),
          0,
        );
        const gaps = within.some((e) => !e.execution) || measured.length !== matched.length;
        const complete = sourceId !== null && covered(sourceId, from, now, settings.coverage ?? []);
        return {
          from,
          to: now,
          limit: limit ?? null,
          observed: measured.length ? observed : complete && !gaps ? 0 : null,
          status:
            complete && !gaps ? ("estimate" as const) : measured.length ? ("partial" as const) : ("unknown" as const),
          coverage: { sources: sources.length, complete, attributionGaps: gaps },
        };
      };
      return { ...q, sourceId, fiveHour: window(5 * 3600000, q.limit5h), weekly: window(7 * 86400000, q.limitWeekly) };
    }),
  );
  const inRange = valid.filter((e) => e.timestamp >= settings.from && e.timestamp <= settings.to);
  const groups = new Map<string, { event: AnalyticsEvent; sampled: boolean }[]>();
  let unattributed = 0;
  for (const e of inRange) {
    const prior = (settings.presetChanges ?? [])
      .filter((c) => c.sourceId === e.sourceId && c.at <= e.timestamp && Number.isFinite(c.at))
      .sort((a, b) => b.at - a.at);
    const preset =
      e.preset ??
      (prior[0] &&
      (settings.presetCoverage ?? []).some(
        (c) => c.sourceId === e.sourceId && c.from <= prior[0]!.at && c.to >= e.timestamp,
      )
        ? prior[0].preset
        : undefined);
    if (!preset) {
      unattributed++;
      continue;
    }
    const group = groups.get(preset) ?? [];
    group.push({ event: e, sampled: !e.preset });
    groups.set(preset, group);
  }
  const presets = [...groups].map(([preset, items]) => {
    const rows = items.map((item) => item.event);
    const comparisons = rows.filter((e) => e.contextAgent !== null && e.role !== null);
    const exec = rows.filter((e) => e.execution !== null);
    const withFallback = exec.filter((e) => e.execution!.fallback !== undefined);
    const withTokens = exec.filter((e) => e.execution!.tokens !== undefined);
    const withCost = exec.filter((e) => e.execution!.cost !== undefined);
    return {
      preset,
      count: rows.length,
      contextAgreement: comparisons.length
        ? comparisons.filter((e) => e.contextAgent === e.role).length / comparisons.length
        : null,
      errors: rows.filter((e) => e.errors.length > 0).length,
      p50Latency: percentile(
        rows.flatMap((e) => (nonnegative(e.latency) ? [e.latency] : [])),
        0.5,
      ),
      p95Latency: percentile(
        rows.flatMap((e) => (nonnegative(e.latency) ? [e.latency] : [])),
        0.95,
      ),
      fallback: withFallback.length ? withFallback.filter((e) => e.execution!.fallback).length : null,
      tokens: withTokens.length
        ? withTokens.reduce((n, e) => n + e.execution!.tokens!.input + e.execution!.tokens!.output, 0)
        : null,
      cost: withCost.length ? withCost.reduce((n, e) => n + e.execution!.cost!, 0) : null,
      coverage: {
        sampled: items.filter((item) => item.sampled).length,
        explicit: items.filter((item) => !item.sampled).length,
        sampledAttribution: "estimated file selection; runtime use unverified" as const,
        explicitAttribution: "explicit recorded preset" as const,
        execution: exec.length,
        fallback: withFallback.length,
        tokens: withTokens.length,
        cost: withCost.length,
        agreement: comparisons.length,
      },
    };
  });
  return {
    quotas,
    presets,
    presetCoverage: { total: inRange.length, attributed: inRange.length - unattributed, unattributed },
    range: { from: settings.from, to: settings.to },
  };
}
export type AlertKind = "classifier-rate-limit" | "rate-limit" | "quota" | "fallback";
export type AlertState = { sourceId: string; kind: AlertKind; since: number; lastFired: number | null };
export function reduceAlerts(
  events: AnalyticsEvent[],
  previous: AlertState[],
  settings: { holdMs: number; repeatMs: number },
  now: number,
): { state: AlertState[]; fired: AlertState[] } {
  const active = new Map<string, { sourceId: string; kind: AlertKind }>();
  for (const e of events) {
    if (e.timestamp > now) continue;
    const kinds: AlertKind[] = [];
    const rateLimit = (s: string) =>
      /\b(?:http|status(?: code)?)\s*[:=]?\s*429\b|\brate[ -]?limit(?:ed|ing)?\b/i.test(s);
    if (e.errors.some(rateLimit)) kinds.push("classifier-rate-limit");
    if (e.execution?.status === 429 || (e.execution?.error && rateLimit(e.execution.error))) kinds.push("rate-limit");
    if (
      e.execution?.error &&
      /quota.{0,30}(?:exhaust|exceed|limit)|(?:exhaust|exceed).{0,30}quota/i.test(e.execution.error)
    )
      kinds.push("quota");
    if (e.execution?.fallback === true) kinds.push("fallback");
    for (const kind of kinds) active.set(JSON.stringify([e.sourceId, kind]), { sourceId: e.sourceId, kind });
  }
  const fired: AlertState[] = [];
  const state = [...active.values()].map((a) => {
    const old = previous.find((p) => p.sourceId === a.sourceId && p.kind === a.kind);
    const next: AlertState = { ...a, since: old?.since ?? now, lastFired: old?.lastFired ?? null };
    if (
      now - next.since >= Math.max(0, settings.holdMs) &&
      (next.lastFired === null || now - next.lastFired >= Math.max(0, settings.repeatMs))
    ) {
      next.lastFired = now;
      fired.push({ ...next });
    }
    return next;
  });
  return { state, fired };
}
