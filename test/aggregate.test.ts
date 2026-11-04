import { expect, test } from "bun:test";
import { aggregate } from "../src/core/aggregate";
import { parseLines, parseStats } from "../src/core/schema";

async function input() {
  const observe = parseLines("observe", await Bun.file("fixtures/jev-observe.jsonl").text());
  const route = parseLines("route", await Bun.file("fixtures/jev-route.jsonl").text());
  const permissions = parseLines("permissions", await Bun.file("fixtures/jev-permissions.jsonl").text());
  return {
    observe: observe.records,
    route: route.records,
    permissions: permissions.records,
    stats: parseStats(await Bun.file("fixtures/stats.json").json()),
    malformed: { observe: observe.malformed, route: route.malformed, permissions: permissions.malformed },
  };
}

test("aggregates fixture evidence without inventing execution", async () => {
  const data = await input();
  const state = aggregate(data, Date.parse("2026-11-04T02:13:10Z"));
  expect(state.events).toHaveLength(4);
  expect(state.agreement).toMatchObject({ compared: 2, agreed: 1, percent: 50 });
  expect(state.agreement.histogram).toHaveLength(10);
  expect(state.events.find((e) => e.message === "msg_B2")).toMatchObject({
    confidence: 0.77,
    routeConfidence: 0.85,
    contextAgent: "orchestrator",
    executionAgent: null,
    executionModel: null,
    fallback: "not detectable",
  });
  expect(state.permissions).toHaveLength(3);
  expect(state.errors).toMatchObject({
    observe: 1,
    route: 1,
    malformed: { observe: 1, route: 0, permissions: 0 },
    toolFailures: 87,
  });
  expect(state.usage.totals?.cost).toBe(435.43);
  expect(state.readouts.fallbackPercent).toBeNull();
  expect(state.readouts.tokensToday).toBeNull();
  expect(JSON.parse(JSON.stringify(state))).toEqual(state);
});

test("joins only exact non-null keys, pairs nearest prior records and retains duplicates", async () => {
  const data = await input();
  const o = data.observe[0]!;
  const r = data.route[0]!;
  const obs = (session: string, message: string | null, ts: string) => ({ ...o, session, message, ts });
  const route = (session: string, message: string, ts: string) => ({ ...r, session, message, ts });
  const t = (s: number) => `2026-11-04T02:12:${String(s).padStart(2, "0")}.000Z`;
  const state = aggregate({
    ...data,
    observe: [
      obs("a|b", "c", t(1)),
      obs("a", "b|c", t(2)),
      obs("x", null, t(3)),
      obs("x", "m", t(4)),
      obs("x", "m", t(5)),
    ],
    route: [route("x", "m", t(6)), route("x", "m", t(7)), route("a|b", "c", t(8)), route("x", "m", t(9))],
  });
  expect(state.events).toHaveLength(6);
  expect(state.events.find((e) => e.route?.ts === t(6))?.observe?.ts).toBe(t(5));
  expect(state.events.find((e) => e.route?.ts === t(7))?.observe?.ts).toBe(t(4));
  expect(state.events.find((e) => e.session === "a" && e.message === "b|c")?.route).toBeNull();
  expect(state.events.find((e) => e.message === null)?.route).toBeNull();
  expect(state.events.find((e) => e.route?.ts === t(9))?.observe).toBeNull();
  const reversed = aggregate({ ...data, observe: [...data.observe].reverse(), route: [...data.route].reverse() });
  expect(reversed.events).toEqual(aggregate(data).events);
});

test("handles ten thousand records", async () => {
  const data = await input();
  const observe = Array.from({ length: 10000 }, (_, i) => ({ ...data.observe[0]!, message: `m${i}` }));
  const route = Array.from({ length: 10000 }, (_, i) => ({ ...data.route[0]!, message: `m${i}` }));
  const start = performance.now();
  expect(aggregate({ ...data, observe, route }).events).toHaveLength(10000);
  expect(performance.now() - start).toBeLessThan(3000);
});
