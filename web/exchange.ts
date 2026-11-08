import { aggregate, type DashboardState, type FlowEvent } from "../src/core/aggregate";
import type { ServerAnalytics } from "./analytics";
import type { StateKind } from "./views/parts";

// Structural UI types for the federation contract. The server's top-level state is the combined view.
export type ExchangeStatus = "connecting" | "live" | "stale" | "error";
export type ExchangeSource = {
  id: string;
  label: string;
  client?: string;
  status: ExchangeStatus;
  lastSeenAt?: string;
  detail?: string;
  state: DashboardState | null;
};
export type ExchangeState = DashboardState & { exchange?: { sources: ExchangeSource[] }; analytics?: ServerAnalytics };
export type ClientBasis = "observed" | "configured" | "unknown";
export type SourceEvidence = {
  sourceId?: string;
  directory?: string;
  client?: string;
  /** How the client is known: recorded by the event, configured for the source or its directory, or unknown. */
  basis?: ClientBasis;
  label?: string;
};
const CLIENTS = ["Orca", "TUI", "service", "unknown"];
export const BASES: readonly ClientBasis[] = ["observed", "configured", "unknown"];

export const COMBINED = "combined";
export const EXCHANGE_STATUSES: readonly ExchangeStatus[] = ["connecting", "live", "stale", "error"];
export const SOURCE_ICON: Record<ExchangeStatus, StateKind> = {
  connecting: "connecting",
  live: "live",
  stale: "stale",
  error: "error",
};
export const SOURCE_CLASS: Record<ExchangeStatus, string> = {
  connecting: "dim",
  live: "ok",
  stale: "warn",
  error: "err",
};

export type ResolvedView = {
  id: string;
  label: string;
  state: DashboardState;
  source: ExchangeSource | null;
  /** The selected source has not delivered any state yet. */
  waiting: boolean;
};

/**
 * Source/directory/client evidence of an event. The server's `provenance` wins; plain top-level fields are accepted
 * as an additive older shape. A client of "unknown" is kept as a value but never presented as a claim.
 */
export function evidence(event: FlowEvent): SourceEvidence {
  const e = event as FlowEvent & SourceEvidence & { provenance?: Record<string, unknown> };
  const out: SourceEvidence = {};
  if (typeof e.sourceId === "string") out.sourceId = e.sourceId;
  if (typeof e.directory === "string") out.directory = e.directory;
  if (typeof e.client === "string") out.client = e.client;
  const p = e.provenance;
  if (p && typeof p === "object") {
    if (typeof p.directory === "string") out.directory = p.directory;
    if (typeof p.client === "string" && CLIENTS.includes(p.client)) out.client = p.client;
    if (typeof p.evidence === "string" && (BASES as readonly string[]).includes(p.evidence))
      out.basis = p.evidence as ClientBasis;
    if (typeof p.label === "string") out.label = p.label;
  }
  return out;
}

/** "Orca · configured · orca worktree", or "unknown", or the bare client for events without a stated basis. */
export function clientText(tag: SourceEvidence): string | null {
  if (tag.client === undefined) return null;
  if (tag.client === "unknown" || tag.basis === "unknown") return "unknown";
  return [tag.client, tag.basis, tag.label].filter(Boolean).join(" · ");
}

/** The source-level client is configured; a single observed event does not establish it for the whole source. */
export function sourceClientText(source: ExchangeSource): string | null {
  if (!source.client || source.client === "unknown") return null;
  return `${source.client} · configured`;
}

/** Used while a selected source has delivered no state. Never shown as data, only as an empty frame. */
export const EMPTY_STATE: DashboardState = aggregate({
  observe: [],
  route: [],
  permissions: [],
  stats: null,
  malformed: { observe: 0, route: 0, permissions: 0 },
});

/**
 * Picks what the shell renders. Combined is the server's top-level state. A selected source shows only its own
 * state; nothing is merged or summed across sources. An unknown id falls back to combined.
 */
export function resolveView(state: ExchangeState, viewId: string): ResolvedView {
  const source = state.exchange?.sources.find((s) => s.id === viewId) ?? null;
  if (!source) return { id: COMBINED, label: COMBINED, state, source: null, waiting: false };
  return {
    id: source.id,
    label: source.label,
    state: source.state ?? EMPTY_STATE,
    source,
    waiting: source.state === null,
  };
}
