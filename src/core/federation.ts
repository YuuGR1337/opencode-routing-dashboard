import type { DirectoryRule } from "../sources/source-config";
import { aggregate, type DashboardInput, type DashboardState, type FlowEvent, MAX_PAYLOAD_BYTES } from "./aggregate";

export type EventProvenance = {
  directory: string | null;
  client: "Orca" | "TUI" | "service" | "unknown";
  evidence: "observed" | "configured" | "unknown";
  label?: string;
};
export function classifySourceEvent(event: FlowEvent, source: FederationSource): EventProvenance {
  const dir = event.route?.dir ?? event.observe?.dir;
  const directory = typeof dir === "string" ? dir : null;
  const valid = (value: unknown): value is EventProvenance["client"] =>
    value === "Orca" || value === "TUI" || value === "service" || value === "unknown";
  const observed = [event.observe?.client, event.route?.client].filter(valid);
  if (new Set(observed).size > 1) return { directory, client: "unknown", evidence: "unknown" };
  if (observed.length)
    return { directory, client: observed[0]!, evidence: observed[0] === "unknown" ? "unknown" : "observed" };
  const matching = (source.directoryRules ?? [])
    .filter((rule) => {
      const prefix = rule.prefix.replace(/\/+$/, "") || "/";
      return (
        directory !== null &&
        (prefix === "/" ? directory.startsWith("/") : directory === prefix || directory.startsWith(`${prefix}/`))
      );
    })
    .sort((a, b) => b.prefix.replace(/\/+$/, "").length - a.prefix.replace(/\/+$/, "").length)[0];
  if (matching)
    return {
      directory,
      client: matching.client,
      evidence: "configured",
      ...(matching.label && { label: matching.label }),
    };
  if (source.client && source.client !== "unknown") return { directory, client: source.client, evidence: "configured" };
  return { directory, client: "unknown", evidence: "unknown" };
}

export type FederationSource = {
  id: string;
  label: string;
  client?: "Orca" | "TUI" | "service" | "unknown";
  directoryRules?: DirectoryRule[];
  status: "connecting" | "live" | "stale" | "error";
  input: DashboardInput | null;
  epoch?: string;
  lastSeenAt?: string;
  detail?: string;
};
export type FederatedDashboardState = Omit<DashboardState, "events"> & {
  events: (FlowEvent & { sourceId: string; provenance: EventProvenance })[];
};
export type FederatedState = FederatedDashboardState & {
  exchange: { sources: (Omit<FederationSource, "input" | "epoch"> & { state: FederatedDashboardState | null })[] };
};
export function federate(sources: FederationSource[], now = Date.now()): FederatedState {
  const epochs = new Set<string>();
  const active: { id: string; input: DashboardInput }[] = [];
  const budget = Math.floor((MAX_PAYLOAD_BYTES - 65536) / (2 * Math.max(1, sources.length)));
  const namespace = (id: string, input: DashboardInput): DashboardInput => {
    const record = <T extends { session: string }>(r: T) => ({
      ...r,
      session: JSON.stringify([id, r.session]),
      sourceId: id,
    });
    return {
      ...input,
      observe: input.observe.map(record),
      route: input.route.map(record),
      permissions: input.permissions.map(record),
    };
  };
  const sourcesById = new Map(sources.map((source) => [source.id, source]));
  const decorate = (state: DashboardState): FederatedDashboardState => {
    const events = state.events.map((event) => {
      const sourceId = JSON.parse(event.session)[0] as string;
      return { ...event, sourceId, provenance: classifySourceEvent(event, sourcesById.get(sourceId)!) };
    });
    return { ...state, events };
  };
  // Provenance adds bytes after aggregation's detail budget calculation.
  const fit = (state: FederatedDashboardState, maxBytes: number) => {
    let excess = Buffer.byteLength(JSON.stringify(state)) - maxBytes;
    if (excess <= 0) return;
    let removed = 0;
    while (removed < state.events.length && excess > -64) {
      excess -= Buffer.byteLength(JSON.stringify(state.events[removed])) + 1;
      removed++;
    }
    if (removed) {
      state.events = state.events.slice(removed);
      state.window.events.sent = state.events.length;
      state.window.events.omitted = state.window.events.retained - state.events.length;
    }
  };
  const entries = sources.map(({ input, epoch, ...meta }) => {
    const duplicate = !!epoch && epochs.has(epoch);
    if (epoch && !duplicate) epochs.add(epoch);
    if (duplicate) return { ...meta, status: "error" as const, detail: "Duplicate source epoch", state: null };
    if (!input) return { ...meta, state: null };
    const namespaced = namespace(meta.id, input);
    const metaBytes = Buffer.byteLength(JSON.stringify({ ...meta, state: null }));
    const state = decorate(aggregate(namespaced, now, { maxBytes: Math.max(0, budget - metaBytes - 256) }));
    fit(state, Math.max(0, budget - metaBytes - 256));
    if (Buffer.byteLength(JSON.stringify({ ...meta, state })) > budget)
      return { ...meta, status: "error" as const, detail: "Source exceeds payload budget", state: null };
    active.push({ id: meta.id, input: namespaced });
    return { ...meta, state };
  });
  const empty = () => ({ observe: 0, route: 0, permissions: 0 });
  const combined: DashboardInput = {
    observe: [],
    route: [],
    permissions: [],
    stats: null,
    malformed: empty(),
    evicted: empty(),
  };
  for (const { input } of active) {
    combined.observe.push(...input.observe);
    combined.route.push(...input.route);
    combined.permissions.push(...input.permissions);
    for (const key of ["observe", "route", "permissions"] as const) {
      combined.malformed[key] += input.malformed[key];
      combined.evicted![key] += input.evicted?.[key] ?? 0;
    }
  }
  if (active.length === 1 && sources.length === 1) {
    const only = active[0]!.input;
    combined.stats = only.stats;
    combined.history = only.history;
    combined.sources = only.sources;
    combined.statsStatus = only.statsStatus;
    combined.historyStatus = only.historyStatus;
  }
  const state = decorate(aggregate(combined, now, { maxBytes: Math.floor((MAX_PAYLOAD_BYTES - 65536) / 2) }));
  fit(state, Math.floor((MAX_PAYLOAD_BYTES - 65536) / 2));
  return { ...state, exchange: { sources: entries } };
}
