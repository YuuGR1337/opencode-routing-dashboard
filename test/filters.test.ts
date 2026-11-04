import { expect, test } from "bun:test";
import { aggregate } from "../src/core/aggregate";
import { parseLines } from "../src/core/schema";
import { EMPTY_FILTERS, filterEvents } from "../web/filters";

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
const sessions = (events: Awaited<ReturnType<typeof fixtureEvents>>) => events.map((event) => event.session);

test("empty filters preserve order and do not mutate events or filters", async () => {
  const events = await fixtureEvents();
  const snapshot = structuredClone(events);
  const filters = { ...EMPTY_FILTERS };
  expect(filterEvents(events, filters, now)).toEqual(events);
  expect(events).toEqual(snapshot);
  expect(filters).toEqual(EMPTY_FILTERS);
});

test("exact filters combine using observed role, context agent and classifier model", async () => {
  const events = await fixtureEvents();
  expect(
    sessions(
      filterEvents(
        events,
        {
          ...EMPTY_FILTERS,
          session: "ses_B2",
          role: "fixer",
          agent: "orchestrator",
          model: "jev-1.13-free",
          decision: "injected",
        },
        now,
      ),
    ),
  ).toEqual(["ses_B2"]);
  for (const filters of [
    { session: "ses_b2" },
    { role: "fix" },
    { agent: "fixer" },
    { model: "missing" },
    { decision: "INJECTED" },
  ]) {
    expect(filterEvents(events, { ...EMPTY_FILTERS, session: "ses_B2", ...filters }, now)).toEqual([]);
  }
  expect(sessions(filterEvents(events, { ...EMPTY_FILTERS, errorsOnly: true }, now))).toEqual(["ses_D4", "ses_C3"]);
  expect(sessions(filterEvents(events, { ...EMPTY_FILTERS, errorsOnly: true, model: "jev-1.13-free" }, now))).toEqual([
    "ses_C3",
  ]);
});

test("query searches evidence case-insensitively and handles null fields", async () => {
  const events = await fixtureEvents();
  for (const query of ["OFF-BY-ONE", "SES_b2", "MSG_b2", "FIXER", "ORCHESTRATOR", "JEV-1.13-FREE"]) {
    expect(sessions(filterEvents(events, { ...EMPTY_FILTERS, query }, now))).toContain("ses_B2");
  }
  expect(sessions(filterEvents(events, { ...EMPTY_FILTERS, query: "EXCEPTION:BOOM" }, now))).toEqual(["ses_D4"]);
  expect(sessions(filterEvents(events, { ...EMPTY_FILTERS, query: "TIMEOUTERROR" }, now))).toEqual(["ses_C3"]);
  expect(filterEvents(events, { ...EMPTY_FILTERS, query: "nonexistent" }, now)).toEqual([]);
});

test("time windows include both boundaries, exclude future and invalid dates; all retains them", async () => {
  const [base] = await fixtureEvents();
  if (!base) throw new Error("missing fixture event");
  const events = [0, 300000, 3600000, 86400000, 86400001, -1].map((age) => ({
    ...base,
    session: String(age),
    ts: new Date(now - age).toISOString(),
  }));
  events.push({ ...base, session: "invalid", ts: "invalid" });
  expect(sessions(filterEvents(events, EMPTY_FILTERS, now))).toEqual([
    "0",
    "300000",
    "3600000",
    "86400000",
    "86400001",
    "-1",
    "invalid",
  ]);
  expect(sessions(filterEvents(events, { ...EMPTY_FILTERS, timeRange: "5m" }, now))).toEqual(["0", "300000"]);
  expect(sessions(filterEvents(events, { ...EMPTY_FILTERS, timeRange: "1h" }, now))).toEqual([
    "0",
    "300000",
    "3600000",
  ]);
  expect(sessions(filterEvents(events, { ...EMPTY_FILTERS, timeRange: "24h" }, now))).toEqual([
    "0",
    "300000",
    "3600000",
    "86400000",
  ]);
});
