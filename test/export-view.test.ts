import { expect, test } from "bun:test";
import { aggregate, type DashboardState, type FlowEvent } from "../src/core/aggregate";
import { DEFAULT_PERIOD, type Period } from "../web/analytics";
import type { ExchangeState } from "../web/exchange";
import { exportPlan } from "../web/export";

const NOW = Date.parse("2026-11-04T12:00:00.000Z");
const blank = aggregate({
  observe: [],
  route: [],
  permissions: [],
  stats: null,
  malformed: { observe: 0, route: 0, permissions: 0 },
});
const ev = (id: string, minutesAgo: number) =>
  ({
    id,
    observe: null,
    route: null,
    suggestion: null,
    contextAgent: null,
    latency: null,
    ts: new Date(NOW - minutesAgo * 60_000).toISOString(),
    session: `s_${id}`,
    errors: [],
  }) as unknown as FlowEvent;
const stateOf = (events: FlowEvent[]): DashboardState => ({ ...blank, events });
type S = { id: string; status?: "live" | "stale" | "connecting" | "error"; state?: DashboardState | null };
const exchange = (sources: S[]): ExchangeState => ({
  ...blank,
  exchange: {
    sources: sources.map((s) => ({
      id: s.id,
      label: s.id,
      status: s.status ?? "live",
      state: s.state === undefined ? stateOf([ev(`${s.id}1`, 30)]) : s.state,
    })),
  },
});
const hour: Period = { ...DEFAULT_PERIOD, kind: "1h" };
const custom = (from: string, to: string): Period => ({ kind: "custom", from, to });

test("combined export omits the source and encodes validated ISO instants", () => {
  const plan = exportPlan(exchange([{ id: "pc" }, { id: "orca" }]), "combined", hour, NOW);
  expect(plan.range).toEqual({ from: NOW - 3_600_000, to: NOW });
  expect(plan.sourceId).toBeNull();
  expect(plan.reason).toBeNull();
  expect(plan.links).toEqual({
    md: "/api/export?from=2026-11-04T11%3A00%3A00.000Z&to=2026-11-04T12%3A00%3A00.000Z&format=md",
    csv: "/api/export?from=2026-11-04T11%3A00%3A00.000Z&to=2026-11-04T12%3A00%3A00.000Z&format=csv",
  });
  expect(plan.sources.map((s) => [s.id, s.blocked])).toEqual([
    ["pc", null],
    ["orca", null],
  ]);
});

test("a selected source is passed through, encoded, and only it is checked", () => {
  const state = exchange([{ id: "pc" }, { id: "or ca/1", status: "live" }, { id: "gone", status: "stale" }]);
  const plan = exportPlan(state, "or ca/1", hour, NOW);
  expect(plan.sourceId).toBe("or ca/1");
  expect(plan.links?.md).toContain("&source=or+ca%2F1");
  expect(plan.sources.map((s) => s.id)).toEqual(["or ca/1"]);
  // The server reads URLSearchParams, so the link must round-trip.
  expect(new URL(plan.links!.csv, "http://x").searchParams.get("source")).toBe("or ca/1");
  expect(new URL(plan.links!.csv, "http://x").searchParams.get("format")).toBe("csv");
});

test("a source that is not live blocks the download and says why; no link is offered", () => {
  const state = exchange([{ id: "pc" }, { id: "orca", status: "stale" }, { id: "local", status: "live", state: null }]);
  const all = exportPlan(state, "combined", hour, NOW);
  expect(all.links).toBeNull();
  expect(all.sources.map((s) => [s.id, s.blocked])).toEqual([
    ["pc", null],
    ["orca", "stale"],
    ["local", "no state"],
  ]);
  expect(all.reason).toBe("source unavailable: orca stale · local no state");
  expect(exportPlan(state, "pc", hour, NOW).links).not.toBeNull();
  expect(exportPlan(state, "orca", hour, NOW).links).toBeNull();
});

test("invalid, empty and unbounded ranges produce a reason instead of a link", () => {
  const state = exchange([{ id: "pc" }]);
  expect(exportPlan(state, "combined", custom("", ""), NOW)).toMatchObject({
    range: null,
    links: null,
    reason: "invalid range",
  });
  expect(exportPlan(state, "combined", custom("2026-11-05T00:00", "2026-11-03T00:00"), NOW).reason).toBe(
    "invalid range",
  );
  expect(exportPlan(state, "combined", custom("2026-11-04T10:00", "2026-11-04T10:00"), NOW)).toMatchObject({
    links: null,
    reason: "empty range",
  });
  const none = exportPlan(
    exchange([{ id: "pc", state: stateOf([]) }]),
    "combined",
    { ...DEFAULT_PERIOD, kind: "all" },
    NOW,
  );
  expect(none.links).toBeNull();
  expect(none.reason).toBe("empty range");
});

test("custom ranges are sent as UTC instants and the period is shared with the preset comparison", () => {
  const state = exchange([{ id: "pc" }]);
  const plan = exportPlan(state, "combined", custom("2026-11-03T00:00:00Z", "2026-11-04T00:00:00Z"), NOW);
  expect(plan.links?.md).toContain("from=2026-11-03T00%3A00%3A00.000Z");
  expect(plan.links?.md).toContain("to=2026-11-04T00%3A00%3A00.000Z");
  // All sent events: from the earliest sent event to now.
  const all = exportPlan(state, "combined", { ...DEFAULT_PERIOD, kind: "all" }, NOW);
  expect(all.range).toEqual({ from: NOW - 30 * 60_000, to: NOW });
});

test("a dashboard without an exchange still exports everything", () => {
  const plan = exportPlan({ ...blank, events: [ev("a", 5)] } as ExchangeState, "combined", hour, NOW);
  expect(plan.sourceId).toBeNull();
  expect(plan.sources).toEqual([]);
  expect(plan.links?.md).toStartWith("/api/export?from=");
});
