import { expect, test } from "bun:test";
import { aggregate } from "../src/core/aggregate";
import { parseLines, parseStats } from "../src/core/schema";
import { applyEnvelope, applyLiveEvent, decodeEnvelope } from "../web/live";

const state = aggregate({
  observe: [],
  route: [],
  permissions: [],
  stats: null,
  malformed: { observe: 0, route: 0, permissions: 0 },
});

test("decodes SSE and flattened HTTP envelopes and rejects malformed data", () => {
  expect(decodeEnvelope({ state, seq: 2, demo: true })).toEqual({ state, seq: 2, demo: true });
  expect(decodeEnvelope({ ...state, seq: 0, demo: false })).toEqual({ state, seq: 0, demo: false });
  expect(decodeEnvelope({ state: {}, seq: 1, demo: false })).toBeNull();
  expect(decodeEnvelope({ state, seq: -1, demo: false })).toBeNull();
  expect(decodeEnvelope({ state, seq: 1.5, demo: false })).toBeNull();
  expect(decodeEnvelope({ state, seq: 1, demo: "true" })).toBeNull();
  expect(decodeEnvelope(null)).toBeNull();
});

test("only newer envelopes replace the current state", () => {
  const current = { state, seq: 3, demo: true };
  expect(applyEnvelope(current, { state, seq: 2, demo: false })).toBe(current);
  expect(applyEnvelope(current, { state, seq: 3, demo: false })).toBe(current);
  expect(applyEnvelope(current, { state, seq: 4, demo: false })).toEqual({ state, seq: 4, demo: false });
  expect(applyEnvelope(null, current)).toBe(current);
});

test("reconnect snapshots reset sequence and late HTTP cannot overwrite SSE", () => {
  const previous = { state, seq: 20, demo: false };
  const restarted = { state, seq: 0, demo: true };
  const live = applyLiveEvent({ envelope: previous, sseSeen: true }, restarted, "snapshot");
  expect(live.envelope).toBe(restarted);
  expect(applyLiveEvent(live, previous, "http")).toBe(live);
  expect(applyLiveEvent(live, { ...previous, seq: 0 }, "delta")).toBe(live);
  expect(applyLiveEvent(live, { ...previous, seq: 1 }, "delta").envelope?.seq).toBe(1);
});

test("rejects malformed nested state before rendering", () => {
  const invalid = [
    { ...state, events: [{}] },
    { ...state, permissions: [{}] },
    { ...state, usage: { ...state.usage, models: [{}] } },
    { ...state, usage: { ...state.usage, totals: {} } },
    { ...state, stats: {} },
    { ...state, history: [{ date: "2026-01-01", stats: {} }] },
    { ...state, sources: { observe: {}, route: {}, permissions: {} } },
    { ...state, agreement: { ...state.agreement, matrix: { fixer: null } } },
  ];
  for (const item of invalid) expect(decodeEnvelope({ state: item, seq: 1, demo: false })).toBeNull();
});

test("accepts populated fixture aggregates", async () => {
  const observe = parseLines("observe", await Bun.file("fixtures/jev-observe.jsonl").text());
  const route = parseLines("route", await Bun.file("fixtures/jev-route.jsonl").text());
  const permissions = parseLines("permissions", await Bun.file("fixtures/jev-permissions.jsonl").text());
  const populated = aggregate({
    observe: observe.records,
    route: route.records,
    permissions: permissions.records,
    stats: parseStats(await Bun.file("fixtures/stats.json").json()),
    malformed: { observe: observe.malformed, route: route.malformed, permissions: permissions.malformed },
  });
  expect(decodeEnvelope({ state: populated, seq: 1, demo: true })?.state).toEqual(populated);
});
