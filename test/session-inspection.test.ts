import { expect, test } from "bun:test";
import { aggregate, type DashboardInput, type DashboardState } from "../src/core/aggregate";
import {
  inspectSession,
  listSessions,
  type EventFieldState,
  type FieldKey,
  type SessionInspection,
  type SessionListEntry,
} from "../src/core/session-inspection";

const observe = (extra: Partial<DashboardInput["observe"][number]> = {}): DashboardInput["observe"][number] => ({
  ts: "2026-11-04T02:00:00Z",
  session: "s1",
  message: "m1",
  agent: "orchestrator",
  prompt: "p1",
  model: "jev-1.13-free",
  latency_ms: 100,
  status: 200,
  answers: {
    role: { type: "choice", choice: "fixer", confidence: 0.77, probabilities: { fixer: 0.77 } },
    needs_oracle: { type: "noul", noul: 0.22 },
  },
  ...extra,
});

const route = (extra: Partial<DashboardInput["route"][number]> = {}): DashboardInput["route"][number] => ({
  ts: "2026-11-04T02:00:01Z",
  session: "s1",
  message: "m1",
  agent: "orchestrator",
  dir: "/tmp",
  flag: "/tmp/.opencode/jev-route",
  prompt: "p1",
  role: "fixer",
  conf: 0.77,
  needs_oracle: 0.22,
  latency_ms: 50,
  decision: "injected",
  reason: null,
  ...extra,
});

const permission = (extra: Partial<DashboardInput["permissions"][number]> = {}): DashboardInput["permissions"][number] => ({
  ts: "2026-11-04T02:00:02Z",
  session: "s1",
  commands: ["git status"],
  verdict: "allow",
  latency_ms: 30,
  ...extra,
});

const baseInput = (): DashboardInput => ({
  observe: [],
  route: [],
  permissions: [],
  stats: null,
  malformed: { observe: 0, route: 0, permissions: 0 },
});

const stateWith = (patch: Partial<DashboardInput>): DashboardState =>
  aggregate({ ...baseInput(), ...patch });

const field = (fields: EventFieldState, key: FieldKey): EvidenceState => fields[key]!;

test("inspects a session with observe, route and permissions", () => {
  const state = stateWith({
    observe: [observe(), observe({ ts: "2026-11-04T02:00:02Z", message: "m2" })],
    route: [route(), route({ ts: "2026-11-04T02:00:03Z", message: "m2" })],
    permissions: [permission()],
  });

  const result = inspectSession(state, "s1");
  expect(result.events).toHaveLength(2);
  expect(result.permissions).toHaveLength(1);
  expect(result.errors).toEqual([]);
  expect(result.scope.session).toBe("s1");
  expect(result.scope.sourceId).toBeNull();
  expect(result.scope.sent).toBe(2);
  expect(result.scope.sample).toBe(true);
  expect(result.scope.observedSpan.firstTs).toBe("2026-11-04T02:00:00Z");
  expect(result.scope.observedSpan.lastTs).toBe("2026-11-04T02:00:02Z");

  const f = result.fields[0]!;
  expect(field(f, "suggestion")).toEqual({ state: "recorded", kind: "observe", role: "router" });
  expect(field(f, "confidence")).toEqual({ state: "recorded", kind: "observe", role: "router" });
  expect(field(f, "needsOracle")).toEqual({ state: "recorded", kind: "observe", role: "router" });
  expect(field(f, "decision")).toEqual({ state: "recorded", kind: "route", role: "router" });
  expect(field(f, "reason")).toEqual({ state: "not_available", reason: "not in Jev logs", role: "router" });
  expect(field(f, "contextAgent")).toEqual({ state: "recorded", kind: "observe", role: "context" });
  expect(field(f, "classifierModel")).toEqual({ state: "recorded", kind: "observe", role: "router" });
  expect(field(f, "latency")).toEqual({ state: "recorded", kind: "observe" });
});

test("execution, tokens, cost and fallback are always not_available", () => {
  const state = stateWith({
    observe: [observe()],
    route: [route()],
  });

  const f = inspectSession(state, "s1").fields[0]!;
  expect(field(f, "executionAgent")).toEqual({ state: "not_available", reason: "not in Jev logs", role: "execution" });
  expect(field(f, "executionModel")).toEqual({ state: "not_available", reason: "not in Jev logs", role: "execution" });
  expect(field(f, "executionProvider")).toEqual({ state: "not_available", reason: "not in Jev logs", role: "execution" });
  expect(field(f, "executionVariant")).toEqual({ state: "not_available", reason: "not in Jev logs", role: "execution" });
  expect(field(f, "tokens")).toEqual({ state: "not_available", reason: "not in Jev logs" });
  expect(field(f, "cost")).toEqual({ state: "not_available", reason: "not in Jev logs" });
  expect(field(f, "fallback")).toEqual({ state: "not_available", reason: "not detectable" });
});

test("errors include observe and route errors", () => {
  const state = stateWith({
    observe: [observe({ error: "TimeoutError" })],
    route: [route({ reason: "jev_error:bad" })],
  });
  const result = inspectSession(state, "s1");
  expect(result.errors).toContain("TimeoutError");
  expect(result.errors).toContain("jev_error:bad");
});

test("same session id in two sources stays isolated via federated ids", () => {
  const local = stateWith({
    observe: [observe({ ts: "2026-11-04T02:00:00Z", session: "same" })],
  });
  const remote = stateWith({
    observe: [observe({ ts: "2026-11-04T02:00:01Z", session: "same" })],
  });

  // Simulate federation namespace without importing federation (pure model).
  const localEvent = { ...local.events[0]!, session: JSON.stringify(["local", "same"]) };
  const remoteEvent = { ...remote.events[0]!, session: JSON.stringify(["remote", "same"]) };
  const combined: DashboardState = {
    ...local,
    events: [localEvent, remoteEvent],
    permissions: [],
  };

  const localResult = inspectSession(combined, JSON.stringify(["local", "same"]));
  const remoteResult = inspectSession(combined, JSON.stringify(["remote", "same"]));

  expect(localResult.events).toHaveLength(1);
  expect(remoteResult.events).toHaveLength(1);
  expect(localResult.scope.sourceId).toBe("local");
  expect(remoteResult.scope.sourceId).toBe("remote");
  expect(localResult.events[0]!.ts).toBe("2026-11-04T02:00:00Z");
  expect(remoteResult.events[0]!.ts).toBe("2026-11-04T02:00:01Z");
});

test("omitted or evicted events mark the session as possibly incomplete", () => {
  const state = stateWith({
    observe: [observe()],
    route: [route()],
  });
  state.window.events.omitted = 3;
  state.window.evicted.observe = 2;

  const result = inspectSession(state, "s1");
  expect(result.scope.omitted).toBe(3);
  expect(result.scope.evicted).toBe(2);
  expect(result.scope.mayBeIncomplete).toBe(true);
});

test("permissions without events are still linked", () => {
  const state = stateWith({
    observe: [],
    route: [],
    permissions: [permission()],
  });
  const result = inspectSession(state, "s1");
  expect(result.events).toEqual([]);
  expect(result.permissions).toHaveLength(1);
  expect(result.scope.sent).toBe(0);
  expect(result.scope.mayBeIncomplete).toBe(false);
});

test("unknown session returns an empty result without throwing", () => {
  const state = stateWith({ observe: [observe()] });
  const result = inspectSession(state, "missing");
  expect(result.events).toEqual([]);
  expect(result.permissions).toEqual([]);
  expect(result.errors).toEqual([]);
  expect(result.scope.sent).toBe(0);
});

test("aggregate stats or presets never produce enriched field state", () => {
  const stats = {
    range: { from: Date.parse("2026-11-04T00:00:00Z"), to: Date.parse("2026-11-04T23:59:59Z") },
    sessions: 1,
    subagents: 0,
    prompts: 1,
    steps: 5,
    tokens: { input: 100, output: 50, reasoning: 10, cache: { read: 0, write: 0 } },
    cost: 0.001,
    tools: { mode: "all", totals: { calls: 0, succeeded: 0, failed: 0, unfinished: 0 }, usage: [] },
    activeDays: 1,
    streak: 1,
    activity: [],
    models: [{ model: { id: "m", providerID: "p", variant: "v" }, steps: 5, tokens: { input: 100, output: 50, reasoning: 10, cache: { read: 0, write: 0 } }, cost: 0.001 }],
  };
  const state = stateWith({
    observe: [observe()],
    route: [route()],
    stats,
    presetChanges: [{ preset: "default", at: Date.parse("2026-11-04T00:00:00Z") }],
  });

  for (const f of inspectSession(state, "s1").fields) {
    for (const [key, value] of Object.entries(f) as [FieldKey, EvidenceState][]) {
      if (value.state === "enriched") {
        expect.fail(`field ${key} was incorrectly classified as enriched`);
      }
    }
  }
});

test("session list has one entry per source/session with newest last-event first", () => {
  const a = stateWith({
    observe: [observe({ ts: "2026-11-04T02:00:00Z", session: "a" })],
  });
  const b = stateWith({
    observe: [observe({ ts: "2026-11-04T02:00:02Z", session: "b" })],
    route: [route({ ts: "2026-11-04T02:00:03Z", session: "b", reason: "exception:fail" })],
  });
  const c = stateWith({
    permissions: [permission({ ts: "2026-11-04T02:00:01Z", session: "a" })],
  });
  const combined: DashboardState = {
    ...a,
    events: [...a.events, ...b.events],
    permissions: c.permissions,
  };

  const list = listSessions(combined);
  expect(list.map((e) => e.session)).toEqual(["b", "a"]);
  const bEntry = list.find((e) => e.session === "b")!;
  expect(bEntry.errorCount).toBe(1);
  expect(bEntry.permissionCount).toBe(0);
  const aEntry = list.find((e) => e.session === "a")!;
  expect(aEntry.permissionCount).toBe(1);
});

test("session list never merges sessions from different sources", () => {
  const local = stateWith({ observe: [observe({ ts: "2026-11-04T02:00:00Z", session: "shared" })] });
  const remote = stateWith({ observe: [observe({ ts: "2026-11-04T02:00:01Z", session: "shared" })] });
  const combined: DashboardState = {
    ...local,
    events: [
      { ...local.events[0]!, session: JSON.stringify(["local", "shared"]) },
      { ...remote.events[0]!, session: JSON.stringify(["remote", "shared"]) },
    ],
    permissions: [],
  };

  const list = listSessions(combined);
  expect(list).toHaveLength(2);
  expect(new Set(list.map((e) => e.sourceId)).size).toBe(2);
});

test("inspectSession and listSessions never mutate the input state", () => {
  const state = stateWith({
    observe: [observe()],
    route: [route()],
    permissions: [permission()],
  });
  const eventsBefore = [...state.events];
  const permissionsBefore = [...state.permissions];

  inspectSession(state, "s1");
  listSessions(state);

  expect(state.events).toEqual(eventsBefore);
  expect(state.permissions).toEqual(permissionsBefore);
});
