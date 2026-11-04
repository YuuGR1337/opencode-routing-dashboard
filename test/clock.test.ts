import { expect, test } from "bun:test";
import { aggregate } from "../src/core/aggregate";
import { parseLines } from "../src/core/schema";
import { livePrompts } from "../web/clock";

const now = Date.parse("2026-11-04T02:13:10Z");
async function fixtureEvents() {
  const observe = parseLines("observe", await Bun.file("fixtures/jev-observe.jsonl").text());
  const route = parseLines("route", await Bun.file("fixtures/jev-route.jsonl").text());
  return aggregate(
    {
      observe: observe.records,
      route: route.records,
      permissions: [],
      stats: null,
      malformed: { observe: observe.malformed, route: route.malformed, permissions: 0 },
    },
    now,
  ).events;
}

test("fixture prompts expire as the clock advances without mutating events", async () => {
  const events = await fixtureEvents();
  const snapshot = structuredClone(events);
  expect(livePrompts(events, 0, now)).toEqual({ count: 3, lowerBound: false });
  expect(livePrompts(events, 0, now + 60_000)).toEqual({ count: 0, lowerBound: false });
  expect(events).toEqual(snapshot);
});

test("session-only route exceptions are not prompts, but still establish the oldest sent timestamp", async () => {
  const events = await fixtureEvents();
  const exception = events.find((event) => event.observe === null && event.message === null && event.route !== null);
  if (!exception) throw new Error("missing session-only route exception fixture");
  const timestamp = Date.parse(exception.ts);
  expect(livePrompts([exception], 0, timestamp)).toEqual({ count: 0, lowerBound: false });
  expect(livePrompts([{ ...exception, message: "known-message" }], 0, timestamp)).toEqual({
    count: 1,
    lowerBound: false,
  });
  expect(livePrompts([exception], 1, timestamp + 60_000)).toEqual({ count: 0, lowerBound: false });
});

test("counts the open lower and closed upper boundaries, excluding future and invalid timestamps", async () => {
  const base = (await fixtureEvents()).find((event) => event.observe !== null);
  if (!base) throw new Error("missing fixture event");
  const events = [0, 59_999, 60_000, 60_001, -1].map((age) => ({
    ...base,
    ts: new Date(now - age).toISOString(),
  }));
  events.push({ ...base, ts: "invalid" });
  expect(livePrompts(events, 0, now)).toEqual({ count: 2, lowerBound: false });
});

test("omitted events make the count a lower bound until a sent event reaches the boundary", async () => {
  const base = (await fixtureEvents()).find((event) => event.observe !== null);
  if (!base) throw new Error("missing fixture event");
  const event = (age: number) => ({ ...base, ts: new Date(now - age).toISOString() });
  expect(livePrompts([], 1, now)).toEqual({ count: 0, lowerBound: true });
  expect(livePrompts([{ ...base, ts: "invalid" }], 1, now)).toEqual({ count: 0, lowerBound: true });
  expect(livePrompts([event(10), event(20)], 1, now)).toEqual({ count: 2, lowerBound: true });
  expect(livePrompts([event(10), event(60_000), event(20)], 1, now)).toEqual({ count: 2, lowerBound: false });
  expect(livePrompts([event(10), event(60_001)], 1, now)).toEqual({ count: 1, lowerBound: false });
  expect(livePrompts([event(-1)], 1, now)).toEqual({ count: 0, lowerBound: true });
});
