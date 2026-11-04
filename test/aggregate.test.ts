import { expect, test } from "bun:test";
import { aggregate, MAX_PAYLOAD_BYTES } from "../src/core/aggregate";
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
  expect(state.errors.total).toBe(3);
  expect(state.usage.totals?.cost).toBe(435.43);
  expect(state.readouts.fallbackPercent).toBeNull();
  expect(state.readouts.tokensToday).toBeNull();
  expect(JSON.parse(JSON.stringify(state))).toEqual(state);
});

test("default-size state fits SSE limit without prompts embedded in event ids", async () => {
  const data = await input();
  const prompt = "p".repeat(200);
  const observe = Array.from({ length: 10000 }, (_, i) => ({ ...data.observe[0]!, message: `message_${i}`, prompt }));
  const route = Array.from({ length: 10000 }, (_, i) => ({
    ...data.route[0]!,
    message: `message_${i}`,
    prompt: "r".repeat(120),
  }));
  const permissions = Array.from({ length: 10000 }, (_, i) => data.permissions[i % data.permissions.length]!);
  const state = aggregate({ ...data, observe, route, permissions });
  const bytes = new TextEncoder().encode(JSON.stringify({ state, seq: 1, demo: true })).length;
  console.log(`default-size payload bytes: ${bytes}`);
  expect(state.events[0]!.id).not.toContain(prompt);
  expect(bytes).toBeLessThan(16 * 1024 * 1024);
});

test("duplicate tuple ids are unique and deterministic regardless of input order", async () => {
  const data = await input();
  const observe = [data.observe[0]!, { ...data.observe[0]!, prompt: "different" }, data.observe[0]!];
  const state = aggregate({ ...data, observe, route: [] });
  const reversed = aggregate({ ...data, observe: [...observe].reverse(), route: [] });
  expect(new Set(state.events.map((event) => event.id)).size).toBe(3);
  expect(state.events).toEqual(reversed.events);
  expect(state.events.every((event) => !event.id.includes("different"))).toBe(true);
});

test("bounded details retain newest complete suffixes while aggregates cover all input", async () => {
  const data = await input();
  const observe = Array.from({ length: 30 }, (_, i) => ({
    ...data.observe[0]!,
    message: `m${i}`,
    prompt: "é".repeat(200),
  }));
  const route = Array.from({ length: 30 }, (_, i) => ({ ...data.route[0]!, message: `m${i}` }));
  const permissions = Array.from({ length: 30 }, (_, i) => ({
    ...data.permissions[i % 3]!,
    ts: new Date(1793750000000 + i * 1000).toISOString(),
  })).reverse();
  const evicted = { observe: 11, route: 12, permissions: 13 };
  const args = { ...data, observe, route, permissions, evicted };
  const now = 1793759000000;
  const full = aggregate(args, now, { maxBytes: 128 * 1024 * 1024 });
  const bounded = aggregate(args, now, { maxBytes: 10000 });
  expect(MAX_PAYLOAD_BYTES).toBe(16 * 1024 * 1024);
  expect(bounded.events.length).toBeGreaterThan(0);
  expect(bounded.permissions.length).toBeGreaterThan(0);
  expect(bounded.events.length).toBeLessThan(full.events.length);
  expect(bounded.events).toEqual(full.events.slice(-bounded.events.length));
  expect(bounded.permissions).toEqual(full.permissions.slice(-bounded.permissions.length));
  expect(bounded.window).toEqual({
    events: {
      retained: full.events.length,
      sent: bounded.events.length,
      omitted: full.events.length - bounded.events.length,
    },
    permissions: {
      retained: full.permissions.length,
      sent: bounded.permissions.length,
      omitted: full.permissions.length - bounded.permissions.length,
    },
    evicted,
    maxBytes: 10000,
  });
  expect(bounded.events.at(-1)?.observe).toEqual(full.events.at(-1)?.observe);
  expect(bounded.events.at(-1)?.route).toEqual(full.events.at(-1)?.route);
  expect(bounded.agreement).toEqual(full.agreement);
  expect(bounded.errors).toEqual(full.errors);
  expect(bounded.usage).toEqual(full.usage);
  expect(bounded.readouts).toEqual(full.readouts);
  expect(new TextEncoder().encode(JSON.stringify(bounded)).length).toBeLessThanOrEqual(10000);
});

test("oversized base returns no rows and retains aggregate metadata", async () => {
  const data = await input();
  const state = aggregate(data, 0, { maxBytes: 1 });
  expect(state.events).toEqual([]);
  expect(state.permissions).toEqual([]);
  expect(state.window.events).toEqual({ retained: 4, sent: 0, omitted: 4 });
  expect(state.window.permissions).toEqual({ retained: 3, sent: 0, omitted: 3 });
  expect(state.window.evicted).toEqual({ observe: 0, route: 0, permissions: 0 });
  expect(state.agreement.compared).toBe(2);
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
