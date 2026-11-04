import { describe, expect, test } from "bun:test";
import fixture from "../fixtures/analytics.json";
import { aggregate } from "../src/core/aggregate";
import { type AnalyticsEvent, analyze, classifyProvenance, eventsFromState, reduceAlerts } from "../src/core/analytics";

const now = Date.parse("2026-01-08T12:00:00Z");
const event = (extra: Partial<AnalyticsEvent> = {}): AnalyticsEvent => ({
  timestamp: now - 1000,
  sourceId: "pc",
  session: "s",
  contextAgent: "fixer",
  role: "fixer",
  latency: 10,
  errors: [],
  execution: null,
  preset: null,
  client: null,
  directory: null,
  ...extra,
});

describe("analytics", () => {
  test("adapts only validated explicit execution and never classifier model", () => {
    const state = aggregate({
      observe: [],
      route: [],
      permissions: [],
      stats: null,
      malformed: { observe: 0, route: 0, permissions: 0 },
    });
    state.events = [
      {
        ts: new Date(now).toISOString(),
        session: "s",
        contextAgent: null,
        suggestion: null,
        latency: null,
        errors: [],
        classifierModel: "classifier",
        observe: {
          execution: { model: "m", provider: "p", cost: 0, tokens: { input: 2, output: 3 } },
          preset: "fast",
          client: "Orca",
        },
        route: { dir: "/work" },
      } as never,
    ];
    const [e] = eventsFromState(state, "pc");
    expect(e?.execution?.model).toBe("m");
    expect(e?.execution?.cost).toBe(0);
    expect(classifyProvenance(e!)).toEqual({
      source: { value: "pc", provenance: "configured" },
      client: { value: "Orca", provenance: "observed" },
      directory: { value: "/work", provenance: "observed" },
    });
    (state.events[0]!.observe as Record<string, unknown>).execution = { model: "m", provider: "p", fallback: "yes" };
    expect(eventsFromState(state, "pc")[0]?.execution).toBeNull();
  });
  test("quota windows and preset metrics preserve unknown attribution and zero cost", () => {
    const execution = { model: "m", provider: "p", tokens: { input: 2, output: 3 }, cost: 0, fallback: false };
    const result = analyze(
      [
        event({ execution, preset: "fast" }),
        event({ timestamp: now - 6 * 3600000, execution, preset: "fast", latency: 30 }),
        event({ preset: "fast" }),
      ],
      {
        from: now - 7 * 3600000,
        to: now,
        quotas: [{ id: "q", label: "Plan", provider: "p", metric: "tokens", limit5h: 100 }],
        coverage: [{ sourceId: "pc", from: now - 7 * 86400000, to: now, complete: true }],
      },
      now,
    );
    expect(result.quotas[0]?.fiveHour.observed).toBe(5);
    expect(result.quotas[0]?.fiveHour.status).toBe("partial");
    expect(result.quotas[0]?.weekly.observed).toBe(10);
    expect(result.presets[0]?.cost).toBe(0);
    expect(result.presets[0]?.coverage.execution).toBe(2);
    expect(result.presets[0]?.p50Latency).toBe(10);
    expect(analyze([event()], { from: now - 1e4, to: now, quotas: [] }, now).presets).toEqual([]);
  });
  test("anonymized execution fixture attributes token counts", () => {
    const result = analyze(
      [event({ execution: fixture.execution })],
      {
        from: now - 10000,
        to: now,
        quotas: [{ id: "q", label: "Plan", provider: "fixture-provider", metric: "tokens" }],
      },
      now,
    );
    expect(result.quotas[0]?.fiveHour.observed).toBe(5);
    expect(result.quotas[0]?.fiveHour.status).toBe("partial");
  });
  test("preset observations do not apply backwards and provenance can be configured", () => {
    const result = analyze(
      [event(), event({ timestamp: now - 2000 })],
      {
        from: now - 3000,
        to: now,
        quotas: [],
        presetChanges: [{ sourceId: "pc", preset: "fast", at: now - 1500 }],
        presetCoverage: [{ sourceId: "pc", from: now - 1500, to: now }],
      },
      now,
    );
    expect(result.presets[0]?.count).toBe(1);
    expect(result.presetCoverage.unattributed).toBe(1);
    expect(classifyProvenance(event(), "TUI").client).toEqual({ value: "TUI", provenance: "configured" });
  });
  test("overlapping coverage is not usage, and sources stay separate", () => {
    const x = { model: "m", provider: "p", tokens: { input: 4, output: 1 } };
    const result = analyze(
      [event({ execution: x }), event({ sourceId: "other", execution: x })],
      {
        from: now - 10000,
        to: now,
        quotas: [{ id: "q", label: "Q", provider: "p", metric: "tokens" }],
        coverage: [
          { sourceId: "pc", from: now - 5 * 3600000, to: now, complete: true },
          { sourceId: "pc", from: now - 3600000, to: now, complete: true },
        ],
      },
      now,
    );
    expect(result.quotas.map((q) => q.fiveHour.observed)).toEqual([5, 5]);
    expect(result.quotas.map((q) => q.fiveHour.status)).toEqual(["estimate", "partial"]);
  });
  test("alerts hold, repeat and clear without unknown firing", () => {
    const settings = { holdMs: 1000, repeatMs: 5000 };
    const e = event({ errors: ["HTTP 429"] });
    const first = reduceAlerts([e], [], settings, now);
    expect(first.fired).toHaveLength(0);
    const second = reduceAlerts([e], first.state, settings, now + 1000);
    expect(second.fired).toHaveLength(1);
    expect(second.fired[0]?.kind).toBe("classifier-rate-limit");
    expect(reduceAlerts([e], second.state, settings, now + 2000).fired).toHaveLength(0);
    expect(reduceAlerts([event()], second.state, settings, now + 3000).state).toEqual([]);
  });
  test("classifier errors and explicit provider evidence stay separate", () => {
    const settings = { holdMs: 0, repeatMs: 1000 };
    expect(reduceAlerts([event({ errors: ["line429", "quota exhausted"] })], [], settings, now).fired).toEqual([]);
    const e = event({ execution: { model: "m", provider: "p", status: 429, error: "quota exhausted" } });
    expect(reduceAlerts([e], [], settings, now).fired.map((a) => a.kind)).toEqual(["rate-limit", "quota"]);
  });
});
