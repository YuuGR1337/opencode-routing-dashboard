import { expect, test } from "bun:test";
import type { DashboardState, FlowEvent } from "../src/core/aggregate";
import { bayLayout } from "../web/bay";
import { nextSpeed, replayCoverage, replayDelay, SPEEDS, sessionTimeline, stepIndex } from "../web/replay";
import { nearestSurvivor, optionList, rememberOptions } from "../web/selection";
import { ROLES } from "../web/views/format";

const ev = (id: string, ts: string, session: string, extra: Partial<FlowEvent> = {}): FlowEvent => ({
  id,
  ts,
  session,
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
  ...extra,
});
const win = (omitted: number, evicted = 0): DashboardState["window"] => ({
  events: { retained: 10, sent: 10 - omitted, omitted },
  permissions: { retained: 0, sent: 0, omitted: 0 },
  evicted: { observe: evicted, route: 0, permissions: 0 },
  maxBytes: 1000,
});

test("session timeline is the session's sent events in time order, ties by id", () => {
  const events = [
    ev("c", "2026-11-04T02:00:02Z", "s1"),
    ev("x", "2026-11-04T02:00:01Z", "s2"),
    ev("b", "2026-11-04T02:00:01Z", "s1"),
    ev("a", "2026-11-04T02:00:00Z", "s1"),
  ];
  expect(sessionTimeline(events, "s1").map((e) => e.id)).toEqual(["a", "b", "c"]);
  expect(sessionTimeline(events, "none")).toEqual([]);
  // The input is never reordered in place.
  expect(events.map((e) => e.id)).toEqual(["c", "x", "b", "a"]);
});

test("replay delay follows recorded gaps divided by speed, clamped to 120–1500 ms", () => {
  const t = (ms: number) => new Date(Date.parse("2026-11-04T02:00:00Z") + ms).toISOString();
  expect(replayDelay(t(0), t(1000), 1)).toBe(1000);
  expect(replayDelay(t(0), t(1000), 4)).toBe(250);
  expect(replayDelay(t(0), t(1000), 0.5)).toBe(1500);
  expect(replayDelay(t(0), t(10), 1)).toBe(120);
  expect(replayDelay(t(0), t(3_600_000), 1)).toBe(1500);
  // Out-of-order or unparsable timestamps never stall or spin.
  expect(replayDelay(t(1000), t(0), 1)).toBe(120);
  expect(replayDelay("nope", t(0), 1)).toBe(400);
});

test("stepping clamps at both ends and tolerates an empty timeline", () => {
  expect(stepIndex(0, -1, 3)).toBe(0);
  expect(stepIndex(1, 1, 3)).toBe(2);
  expect(stepIndex(2, 1, 3)).toBe(2);
  expect(stepIndex(0, 1, 0)).toBe(0);
});

test("speed steps through the fixed list and stops at the ends", () => {
  expect([...SPEEDS]).toEqual([0.5, 1, 2, 4]);
  expect(nextSpeed(1, 1)).toBe(2);
  expect(nextSpeed(4, 1)).toBe(4);
  expect(nextSpeed(0.5, -1)).toBe(0.5);
  expect(nextSpeed(2, -1)).toBe(1);
});

test("replay coverage never claims completeness when events were omitted or evicted", () => {
  const timeline = [ev("a", "2026-11-04T02:00:00Z", "s1"), ev("b", "2026-11-04T02:00:01Z", "s1")];
  expect(replayCoverage(timeline, win(0))).toEqual({ inSession: 2, omitted: 0, evicted: 0, mayBeIncomplete: false });
  expect(replayCoverage(timeline, win(3)).mayBeIncomplete).toBe(true);
  expect(replayCoverage(timeline, win(0, 7))).toEqual({ inSession: 2, omitted: 0, evicted: 7, mayBeIncomplete: true });
});

test("nearest survivor prefers the following neighbour, then the preceding one, else nothing", () => {
  const order = ["a", "b", "c", "d"];
  expect(nearestSurvivor(order, "b", new Set(["a", "c", "d"]))).toBe("c");
  expect(nearestSurvivor(order, "b", new Set(["a", "d"]))).toBe("d");
  expect(nearestSurvivor(order, "d", new Set(["a", "b"]))).toBe("b");
  expect(nearestSurvivor(order, "b", new Set(["b"]))).toBe("b");
  expect(nearestSurvivor(order, "b", new Set())).toBeNull();
  expect(nearestSurvivor(order, "zzz", new Set(["a"]))).toBeNull();
});

test("option memory keeps values that left the window and is stable when nothing changes", () => {
  const first = rememberOptions(null, [
    ev("1", "2026-11-04T02:00:00Z", "s1", { suggestion: "fixer", decision: "injected" }),
    ev("2", "2026-11-04T02:00:01Z", "s2", { classifierModel: "m1", contextAgent: "orchestrator" }),
  ]);
  expect(first.session).toEqual(["s1", "s2"]);
  expect(first.role).toEqual(["fixer"]);
  expect(first.model).toEqual(["m1"]);
  const second = rememberOptions(first, [ev("3", "2026-11-04T02:00:02Z", "s3")]);
  expect(second.session).toEqual(["s1", "s2", "s3"]);
  expect(second.role).toEqual(["fixer"]);
  expect(rememberOptions(second, [ev("4", "2026-11-04T02:00:03Z", "s3")])).toBe(second);
});

test("option list marks orphaned values, keeps the active one and never duplicates fixed values", () => {
  const items = optionList(["s1", "s2"], ["s2"], "s9");
  expect(items).toEqual([
    { value: "s1", label: "s1 · not in window", gone: true },
    { value: "s2", label: "s2", gone: false },
    { value: "s9", label: "s9 · not in window", gone: true },
  ]);
  // Fixed values keep their order and come first; others follow sorted.
  const roles = optionList(["zeta"], ["fixer", "custom"], "", ROLES);
  expect(roles.map((r) => r.value)).toEqual([...ROLES, "custom", "zeta"]);
  expect(roles.filter((r) => r.gone).map((r) => r.value)).toEqual(["zeta"]);
});

test("a full rail keeps the original patch bay geometry", () => {
  const full = bayLayout(10, 10);
  expect(full.height).toBe(400);
  expect(full.sparse).toBe(false);
  expect(full.jackY("orchestrator")).toBe(40);
  expect(full.jackY("designer")).toBe(360);
});

test("a sparse rail packs the jacks toward the calls and shortens the bay", () => {
  for (const calls of [0, 1, 2, 4]) {
    const bay = bayLayout(calls, 10);
    expect(bay.sparse).toBe(true);
    expect(bay.height).toBeLessThan(400);
    const ys = ROLES.map((r) => bay.jackY(r));
    for (let i = 1; i < ys.length; i++) expect(ys[i]! - ys[i - 1]!).toBeGreaterThanOrEqual(44);
    expect(ys[0]!).toBeGreaterThanOrEqual(20);
    expect(ys[4]! + 24).toBeLessThanOrEqual(bay.height);
    // Wires start at row centres (40 px each); the bay must still contain every call row.
    expect(bay.height).toBeGreaterThanOrEqual(calls * 40);
  }
});
