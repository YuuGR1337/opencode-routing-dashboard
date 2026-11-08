import type { DashboardState, FlowEvent } from "./aggregate";
import type { PermissionRecord } from "./schema";

export type FieldRole = "router" | "execution" | "context";

export type EvidenceState =
  | { state: "recorded"; kind: "observe" | "route" | "permissions"; role?: FieldRole }
  | { state: "enriched"; role?: FieldRole }
  | { state: "not_available"; reason: string; role?: FieldRole };

export type FieldKey =
  | "message"
  | "prompt"
  | "suggestion"
  | "confidence"
  | "needsOracle"
  | "decision"
  | "reason"
  | "contextAgent"
  | "classifierModel"
  | "latency"
  | "executionAgent"
  | "executionModel"
  | "executionProvider"
  | "executionVariant"
  | "tokens"
  | "cost"
  | "fallback";

export type EventFieldState = Record<FieldKey, EvidenceState>;

export type SessionScope = {
  sourceId: string | null;
  session: string;
  sent: number;
  retained: number;
  omitted: number;
  evicted: number;
  mayBeIncomplete: boolean;
  sample: true;
  observedSpan: { firstTs: string | null; lastTs: string | null };
};

export type SessionInspection = {
  scope: SessionScope;
  events: FlowEvent[];
  permissions: PermissionRecord[];
  errors: string[];
  fields: EventFieldState[];
};

export type SessionListEntry = {
  sourceId: string | null;
  session: string;
  firstTs: string;
  lastTs: string;
  sent: number;
  errorCount: number;
  permissionCount: number;
};

type ParsedSessionId = { sourceId: string | null; session: string };

function parseSessionId(sessionId: string): ParsedSessionId {
  try {
    const parsed = JSON.parse(sessionId);
    if (Array.isArray(parsed) && parsed.length === 2 && typeof parsed[0] === "string" && typeof parsed[1] === "string") {
      return { sourceId: parsed[0], session: parsed[1] };
    }
  } catch {
    // fall through to treat the whole string as the session id
  }
  return { sourceId: null, session: sessionId };
}

/** The session's sent events, oldest first. Never mutates the input. */
function sessionTimeline(events: FlowEvent[], session: string): FlowEvent[] {
  return events
    .filter((e) => e.session === session)
    .sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

function recorded(kind: "observe" | "route" | "permissions", role?: FieldRole): EvidenceState {
  return { state: "recorded", kind, role };
}

function notAvailable(reason: string, role?: FieldRole): EvidenceState {
  return { state: "not_available", reason, role };
}

function eventFieldState(event: FlowEvent): EventFieldState {
  const pick = <T>(observeValue: T, routeValue: T): { value: T; kind: "observe" | "route" } | null => {
    if (event.observe !== null && observeValue !== null && observeValue !== undefined) return { value: observeValue, kind: "observe" };
    if (event.route !== null && routeValue !== null && routeValue !== undefined) return { value: routeValue, kind: "route" };
    return null;
  };

  const router = (observeValue: unknown, routeValue: unknown): EvidenceState => {
    const found = pick(observeValue as never, routeValue as never);
    return found ? { state: "recorded", kind: found.kind, role: "router" } : notAvailable("not in Jev logs", "router");
  };

  const context = (observeValue: unknown, routeValue: unknown): EvidenceState => {
    const found = pick(observeValue as never, routeValue as never);
    return found ? { state: "recorded", kind: found.kind, role: "context" } : notAvailable("not in Jev logs", "context");
  };

  return {
    message: event.message !== null ? recorded(event.observe?.message !== undefined && event.observe?.message !== null ? "observe" : "route") : notAvailable("not in Jev logs"),
    prompt: event.prompt !== null ? recorded(event.observe?.prompt !== undefined && event.observe?.prompt !== null ? "observe" : "route") : notAvailable("not in Jev logs"),
    suggestion: router(event.observe?.answers?.role.choice ?? null, event.route?.role ?? null),
    confidence: router(event.observe?.answers?.role.confidence ?? null, event.route?.conf ?? null),
    needsOracle: router(event.observe?.answers?.needs_oracle.noul ?? null, event.route?.needs_oracle ?? null),
    decision: event.route?.decision !== undefined && event.route?.decision !== null
      ? { state: "recorded", kind: "route", role: "router" }
      : notAvailable("not in Jev logs", "router"),
    reason: event.route?.reason !== undefined && event.route?.reason !== null
      ? { state: "recorded", kind: "route", role: "router" }
      : notAvailable("not in Jev logs", "router"),
    contextAgent: context(event.observe?.agent ?? null, event.route?.agent ?? null),
    classifierModel: event.observe?.model !== undefined && event.observe?.model !== null
      ? { state: "recorded", kind: "observe", role: "router" }
      : notAvailable("not in Jev logs", "router"),
    latency: pick(event.observe?.latency_ms ?? null, event.route?.latency_ms ?? null)
      ? { state: "recorded", kind: pick(event.observe?.latency_ms ?? null, event.route?.latency_ms ?? null)!.kind }
      : notAvailable("not in Jev logs"),
    executionAgent: notAvailable("not in Jev logs", "execution"),
    executionModel: notAvailable("not in Jev logs", "execution"),
    executionProvider: notAvailable("not in Jev logs", "execution"),
    executionVariant: notAvailable("not in Jev logs", "execution"),
    tokens: notAvailable("not in Jev logs"),
    cost: notAvailable("not in Jev logs"),
    fallback: notAvailable("not detectable"),
  };
}

export function inspectSession(state: DashboardState, sessionId: string): SessionInspection {
  const { sourceId, session } = parseSessionId(sessionId);
  const targetSession = sessionId;
  const events = sessionTimeline(state.events, targetSession);
  const permissions = state.permissions.filter((p) => p.session === targetSession);
  const errors = events.flatMap((e) => e.errors);

  const timestamps = events.map((e) => e.ts);
  const firstTs = timestamps.length ? timestamps[0]! : null;
  const lastTs = timestamps.length ? timestamps[timestamps.length - 1]! : null;

  const omitted = state.window.events.omitted;
  const evicted = state.window.evicted.observe + state.window.evicted.route;

  const scope: SessionScope = {
    sourceId,
    session,
    sent: events.length,
    retained: state.window.events.retained,
    omitted,
    evicted,
    mayBeIncomplete: omitted > 0 || evicted > 0,
    sample: true,
    observedSpan: { firstTs, lastTs },
  };

  return {
    scope,
    events,
    permissions,
    errors,
    fields: events.map(eventFieldState),
  };
}

export function listSessions(state: DashboardState): SessionListEntry[] {
  const permissionCounts = new Map<string, number>();
  for (const p of state.permissions) {
    permissionCounts.set(p.session, (permissionCounts.get(p.session) ?? 0) + 1);
  }

  const groups = new Map<string, { events: FlowEvent[]; sourceId: string | null; session: string }>();
  for (const event of state.events) {
    const { sourceId, session } = parseSessionId(event.session);
    const key = event.session;
    const existing = groups.get(key);
    if (existing) {
      existing.events.push(event);
    } else {
      groups.set(key, { events: [event], sourceId, session });
    }
  }

  const entries: SessionListEntry[] = [];
  for (const { events, sourceId, session } of groups.values()) {
    const sorted = [...events].sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
    const firstTs = sorted[0]!.ts;
    const lastTs = sorted[sorted.length - 1]!.ts;
    const errorCount = events.reduce((sum, e) => sum + e.errors.length, 0);
    const sessionKey = sorted[0]!.session;
    entries.push({
      sourceId,
      session,
      firstTs,
      lastTs,
      sent: events.length,
      errorCount,
      permissionCount: permissionCounts.get(sessionKey) ?? 0,
    });
  }

  return entries.sort((a, b) => Date.parse(b.lastTs) - Date.parse(a.lastTs));
}
