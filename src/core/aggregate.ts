import type { ObserveRecord, PermissionRecord, RouteRecord, StatsRecord } from "./schema";

export type Source = "observe" | "route" | "permissions";
export type DashboardInput = {
  observe: ObserveRecord[];
  route: RouteRecord[];
  permissions: PermissionRecord[];
  stats: StatsRecord | null;
  malformed: Record<Source, number>;
  sources?: Record<Source, { status: "ok" | "missing" | "error"; path: string; detail?: string }>;
  statsStatus?: { status: "ok" | "unavailable" | "error" | "disabled"; detail?: string; fetchedAt?: string };
  history?: { date: string; stats: StatsRecord }[];
};
type Usage = {
  steps: number;
  tokens: { input: number; output: number; reasoning: number; cache: { read: number; write: number } };
  cost: number;
};
export type FlowEvent = {
  id: string;
  ts: string;
  session: string;
  message: string | null;
  prompt: string | null;
  suggestion: string | null;
  confidence: number | null;
  needsOracle: number | null;
  routeSuggestion: string | null;
  routeConfidence: number | null;
  routeNeedsOracle: number | null;
  decision: string | null;
  reason: string | null;
  contextAgent: string | null;
  classifierModel: string | null;
  executionAgent: null;
  executionModel: null;
  executionProvider: null;
  executionVariant: null;
  tokens: null;
  cost: null;
  fallback: "not detectable";
  latency: number | null;
  errors: string[];
  observe: ObserveRecord | null;
  route: RouteRecord | null;
};
export type DashboardState = {
  events: FlowEvent[];
  permissions: PermissionRecord[];
  agreement: {
    compared: number;
    agreed: number;
    percent: number | null;
    matrix: Record<string, Record<string, number>>;
    histogram: number[];
  };
  usage: {
    models: (Usage & { model: string; provider: string; variant: string })[];
    providers: (Usage & { provider: string })[];
    variants: (Usage & { variant: string })[];
    presets: "not available";
    totals: Usage | null;
  };
  errors: {
    observe: number;
    route: number;
    malformed: Record<Source, number>;
    total: number;
    toolFailures: number | null;
    permissions: Record<string, number>;
  };
  readouts: {
    promptsPerMinute: number;
    agreementPercent: number | null;
    fallbackPercent: null;
    errorPercent: number | null;
    p50Latency: number | null;
    tokensToday: number | null;
  };
  stats: StatsRecord | null;
  history: { date: string; stats: StatsRecord }[];
  sources: DashboardInput["sources"] | null;
  statsStatus: DashboardInput["statsStatus"] | null;
  fallback: "not detectable";
};
const emptyUsage = (): Usage => ({
  steps: 0,
  tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
  cost: 0,
});
function addUsage(to: Usage, from: Usage) {
  to.steps += from.steps;
  to.cost += from.cost;
  to.tokens.input += from.tokens.input;
  to.tokens.output += from.tokens.output;
  to.tokens.reasoning += from.tokens.reasoning;
  to.tokens.cache.read += from.tokens.cache.read;
  to.tokens.cache.write += from.tokens.cache.write;
}
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const key = (session: string, message: string) => JSON.stringify([session, message]);

export function aggregate(input: DashboardInput, now: number = Date.now()): DashboardState {
  // Process by timestamp, independent of source arrival order. A stack gives the nearest unpaired prior observation.
  const records = [
    ...input.observe.map((record) => ({ kind: "observe" as const, record, tie: JSON.stringify(record) })),
    ...input.route.map((record) => ({ kind: "route" as const, record, tie: JSON.stringify(record) })),
  ].sort((a, b) => Date.parse(a.record.ts) - Date.parse(b.record.ts) || cmp(a.kind, b.kind) || cmp(a.tie, b.tie));
  const waiting = new Map<string, ObserveRecord[]>();
  const pairs: { observe: ObserveRecord | null; route: RouteRecord | null }[] = [];
  for (const item of records) {
    if (item.kind === "observe") {
      const o = item.record;
      if (o.message === null) pairs.push({ observe: o, route: null });
      else {
        const k = key(o.session, o.message);
        const stack = waiting.get(k) ?? [];
        stack.push(o);
        waiting.set(k, stack);
      }
    } else {
      const r = item.record;
      const stack = r.message == null ? undefined : waiting.get(key(r.session, r.message));
      pairs.push({ observe: stack?.pop() ?? null, route: r });
    }
  }
  for (const stack of waiting.values()) for (const o of stack) pairs.push({ observe: o, route: null });
  const events: FlowEvent[] = pairs
    .map<FlowEvent>(({ observe: o, route: r }) => {
      const errors: string[] = [];
      if (o?.error != null) errors.push(o.error);
      if (r?.reason?.startsWith("exception:") || r?.reason?.startsWith("jev_error:")) errors.push(r.reason);
      return {
        id: JSON.stringify([o, r]),
        ts: o?.ts ?? r!.ts,
        session: o?.session ?? r!.session,
        message: o?.message ?? r?.message ?? null,
        prompt: o?.prompt ?? r?.prompt ?? null,
        suggestion: o?.answers?.role.choice ?? r?.role ?? null,
        confidence: o?.answers?.role.confidence ?? r?.conf ?? null,
        needsOracle: o?.answers?.needs_oracle.noul ?? r?.needs_oracle ?? null,
        routeSuggestion: r?.role ?? null,
        routeConfidence: r?.conf ?? null,
        routeNeedsOracle: r?.needs_oracle ?? null,
        decision: r?.decision ?? null,
        reason: r?.reason ?? null,
        contextAgent: o?.agent ?? r?.agent ?? null,
        classifierModel: o?.model ?? null,
        executionAgent: null,
        executionModel: null,
        executionProvider: null,
        executionVariant: null,
        tokens: null,
        cost: null,
        fallback: "not detectable",
        latency: o?.latency_ms ?? r?.latency_ms ?? null,
        errors,
        observe: o,
        route: r,
      };
    })
    .sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts) || cmp(a.id, b.id));
  // Identical records are still separate rows with stable distinct ids.
  const ids = new Map<string, number>();
  for (const event of events) {
    const n = ids.get(event.id) ?? 0;
    ids.set(event.id, n + 1);
    event.id = JSON.stringify([event.id, n]);
  }
  let compared = 0,
    agreed = 0;
  const matrix: Record<string, Record<string, number>> = Object.create(null);
  const histogram = Array<number>(10).fill(0);
  for (const e of events) {
    if (e.confidence !== null && e.confidence >= 0 && e.confidence <= 1)
      histogram[Math.min(9, Math.floor(e.confidence * 10))]!++;
    if (e.suggestion !== null && e.contextAgent !== null) {
      compared++;
      if (e.suggestion === e.contextAgent) agreed++;
      const row = (matrix[e.suggestion] ??= Object.create(null));
      row[e.contextAgent] = (row[e.contextAgent] ?? 0) + 1;
    }
  }
  const percent = compared ? (agreed / compared) * 100 : null;
  const models = new Map<string, Usage & { model: string; provider: string; variant: string }>();
  const providers = new Map<string, Usage & { provider: string }>();
  const variants = new Map<string, Usage & { variant: string }>();
  for (const m of input.stats?.models ?? []) {
    const { id: model, providerID: provider, variant } = m.model;
    const k = JSON.stringify([provider, model, variant]);
    if (!models.has(k)) models.set(k, { model, provider, variant, ...emptyUsage() });
    if (!providers.has(provider)) providers.set(provider, { provider, ...emptyUsage() });
    if (!variants.has(variant)) variants.set(variant, { variant, ...emptyUsage() });
    addUsage(models.get(k)!, m);
    addUsage(providers.get(provider)!, m);
    addUsage(variants.get(variant)!, m);
  }
  const totals = input.stats ? emptyUsage() : null;
  if (totals && input.stats) addUsage(totals, input.stats);
  const observeErrors = input.observe.filter((o) => o.error != null).length;
  const routeErrors = input.route.filter(
    (r) => r.reason?.startsWith("exception:") || r.reason?.startsWith("jev_error:"),
  ).length;
  const permissionCounts: Record<string, number> = Object.create(null);
  for (const p of input.permissions) permissionCounts[p.verdict] = (permissionCounts[p.verdict] ?? 0) + 1;
  const toolFailures = input.stats?.tools.totals.failed ?? null;
  const total =
    observeErrors + routeErrors + Object.values(input.malformed).reduce((a, b) => a + b, 0) + (toolFailures ?? 0);
  const latencies = events.flatMap((e) => (e.latency === null ? [] : [e.latency])).sort((a, b) => a - b);
  const mid = Math.floor(latencies.length / 2);
  const p50Latency = latencies.length
    ? latencies.length % 2
      ? latencies[mid]!
      : (latencies[mid - 1]! + latencies[mid]!) / 2
    : null;
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const stats = input.stats;
  const tokensToday =
    stats && stats.range.from === today.getTime() && stats.range.to >= stats.range.from && stats.range.to <= now
      ? stats.tokens.input +
        stats.tokens.output +
        stats.tokens.reasoning +
        stats.tokens.cache.read +
        stats.tokens.cache.write
      : null;
  return {
    events,
    permissions: [...input.permissions],
    agreement: { compared, agreed, percent, matrix, histogram },
    usage: {
      models: [...models.values()],
      providers: [...providers.values()],
      variants: [...variants.values()],
      presets: "not available",
      totals,
    },
    errors: {
      observe: observeErrors,
      route: routeErrors,
      malformed: { ...input.malformed },
      total,
      toolFailures,
      permissions: permissionCounts,
    },
    readouts: {
      promptsPerMinute: events.filter((e) => {
        const t = Date.parse(e.ts);
        return t > now - 60000 && t <= now;
      }).length,
      agreementPercent: percent,
      fallbackPercent: null,
      errorPercent: events.length ? (events.filter((e) => e.errors.length > 0).length / events.length) * 100 : null,
      p50Latency,
      tokensToday,
    },
    stats,
    history: input.history ?? [],
    sources: input.sources ?? null,
    statsStatus: input.statsStatus ?? null,
    fallback: "not detectable",
  };
}
