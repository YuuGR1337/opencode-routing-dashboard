import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { loadConfig } from "../src/config";
import { aggregate } from "../src/core/aggregate";
import { startAnalyticsEngine } from "../src/server/analytics";
import { loadAnalyticsSettings } from "../src/sources/analytics";

test("retained source coverage identifies unavailable sources and does not trust truncated detail", async () => {
  const now = Date.parse("2026-01-01T00:00:00Z");
  const state = aggregate({
    observe: [],
    route: [],
    permissions: [],
    stats: null,
    malformed: { observe: 1, route: 0, permissions: 0 },
    evicted: { observe: 2, route: 0, permissions: 0 },
  });
  const engine = startAnalyticsEngine(
    { quotas: [], alerts: { holdMs: 0, repeatMs: 1000, activeMs: 1000, desktop: false } },
    () => [
      { id: "pc", status: "live", state },
      { id: "connecting", status: "connecting", state: null },
    ],
    () => {},
    { now: () => now },
  );
  try {
    expect(engine.snapshot().result.sourceCoverage).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "pc", included: true, evicted: 2 }),
        expect.objectContaining({ id: "connecting", included: false, status: "connecting" }),
      ]),
    );
  } finally {
    await engine.stop();
  }
});

test("analytics uses retained records even when UI detail has been byte-trimmed", async () => {
  const now = Date.parse("2026-01-01T00:00:00Z");
  const observe = Array.from({ length: 10 }, (_, i) => ({
    ts: new Date(now - i).toISOString(),
    session: "s",
    message: `m${i}`,
    agent: "fixer",
    prompt: "x".repeat(200000),
    model: "jev",
    latency_ms: 1,
    error: "failure",
    preset: "fast",
  }));
  const input = {
    observe,
    route: [],
    permissions: [],
    stats: null,
    malformed: { observe: 0, route: 0, permissions: 0 },
  };
  const ui = aggregate(input, now, { maxBytes: 5000 });
  const retained = aggregate(input, now, { maxBytes: Number.MAX_SAFE_INTEGER });
  expect(ui.window.events.omitted).toBeGreaterThan(0);
  const engine = startAnalyticsEngine(
    { quotas: [], alerts: { holdMs: 0, repeatMs: 1000, activeMs: 1000, desktop: false } },
    () => [
      { id: "pc", state: retained, uiOmitted: ui.window.events.omitted },
      { id: "pending", status: "connecting", state: null },
    ],
    () => {},
    { now: () => now },
  );
  try {
    expect(engine.snapshot().result.presets[0]?.count).toBe(10);
    expect(engine.snapshot().result.sourceCoverage[0]).toMatchObject({ retained: 10, omitted: 0, uiOmitted: 10 });
    expect(engine.snapshot().result.sourceCoverage[1]?.included).toBe(false);
  } finally {
    await engine.stop();
  }
});

test("clock-only ticks do not publish unchanged analytics", async () => {
  let now = Date.now();
  let changes = 0;
  const engine = startAnalyticsEngine(
    { quotas: [], alerts: { holdMs: 0, repeatMs: 1000, activeMs: 1000, desktop: false } },
    () => [],
    () => {
      changes++;
    },
    { now: () => now, intervalMs: 5 },
  );
  try {
    now += 1000;
    await Bun.sleep(20);
    expect(changes).toBe(0);
  } finally {
    await engine.stop();
  }
});

test("engine namespaces sampled preset timeline without inferring quota coverage", async () => {
  const now = Date.parse("2026-01-01T00:00:00Z");
  const state = aggregate({
    observe: [],
    route: [],
    permissions: [],
    stats: null,
    malformed: { observe: 0, route: 0, permissions: 0 },
    presetChanges: [{ preset: "fast", at: now - 2000 }],
    presetStatus: { status: "ok", observedFrom: now - 2000, observedTo: now },
  });
  state.events = [
    {
      ts: new Date(now - 1000).toISOString(),
      session: "s",
      contextAgent: null,
      suggestion: null,
      latency: null,
      errors: [],
      observe: null,
      route: null,
    } as never,
  ];
  const engine = startAnalyticsEngine(
    {
      quotas: [{ id: "q", label: "Q", provider: "p", metric: "tokens" }],
      alerts: { holdMs: 0, repeatMs: 1000, activeMs: 1000, desktop: false },
    },
    () => [{ id: "pc", state }],
    () => {},
    { now: () => now },
  );
  try {
    expect(engine.snapshot().presetChanges[0]?.sourceId).toBe("pc");
    expect(engine.snapshot().result.presets[0]?.coverage.sampled).toBe(1);
    expect(engine.snapshot().result.quotas[0]?.fiveHour.status).toBe("unknown");
  } finally {
    await engine.stop();
  }
});

test("analytics config flag overrides environment", () => {
  expect(loadConfig({ ORD_ANALYTICS_CONFIG: "a.json" }, []).analyticsConfigFile).toBe("a.json");
  expect(loadConfig({ ORD_ANALYTICS_CONFIG: "a.json" }, ["--analytics-config=b.json"]).analyticsConfigFile).toBe(
    "b.json",
  );
});

test("engine holds, repeats, expires and bounds fired alerts without inventing coverage", async () => {
  let now = Date.parse("2026-01-01T00:00:00Z");
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
      errors: ["HTTP 429"],
      observe: null,
      route: null,
    } as never,
  ];
  const engine = startAnalyticsEngine(
    {
      quotas: [{ id: "q", label: "plan", provider: "p", metric: "messages" }],
      alerts: { holdMs: 10, repeatMs: 10, activeMs: 2000, desktop: false },
    },
    () => [{ id: "pc", state }],
    () => {},
    { now: () => now, intervalMs: 5 },
  );
  try {
    expect(engine.snapshot().alerts).toHaveLength(0);
    now += 11;
    await Bun.sleep(15);
    expect(engine.snapshot().alerts).toHaveLength(1);
    now += 11;
    await Bun.sleep(15);
    expect(engine.snapshot().alerts).toHaveLength(2);
    for (let i = 0; i < 105; i++) {
      now += 11;
      await Bun.sleep(6);
    }
    expect(engine.snapshot().alerts).toHaveLength(100);
    expect(engine.snapshot().result.quotas[0]?.fiveHour.status).toBe("unknown");
    now += 3000;
    await Bun.sleep(15);
    expect(engine.snapshot().alerts).toHaveLength(100);
    const lastFired = engine.snapshot().alerts.at(-1)?.lastFired;
    now += 100;
    await Bun.sleep(15);
    expect(engine.snapshot().alerts).toHaveLength(100);
    expect(engine.snapshot().alerts.at(-1)?.lastFired).toBe(lastFired);
  } finally {
    await engine.stop();
  }
});

test("rejects sensitive ancestor and resolved symlink paths before reading", async () => {
  const dir = await mkdtemp("/tmp/opencode/check-");
  try {
    const restricted = join(dir, ".ssh");
    await mkdir(restricted);
    await writeFile(join(restricted, "settings.json"), "{}");
    await symlink(restricted, join(dir, "alias"));
    await expect(loadAnalyticsSettings(join(restricted, "settings.json"))).rejects.toThrow();
    await expect(loadAnalyticsSettings(join(dir, "alias", "settings.json"))).rejects.toThrow();
    const normal = join(dir, "settings.json");
    await writeFile(normal, JSON.stringify({ presetPath: join(restricted, "slim.json") }));
    await expect(loadAnalyticsSettings(normal)).rejects.toThrow();
    await writeFile(normal, JSON.stringify({ presetPath: join(dir, "alias", "slim.json") }));
    await expect(loadAnalyticsSettings(normal)).rejects.toThrow();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("notification bursts are coalesced and stop aborts the active notification", async () => {
  let now = Date.parse("2026-01-01T00:00:00Z");
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
      errors: ["HTTP 429"],
      observe: null,
      route: null,
    } as never,
  ];
  let calls = 0;
  let aborted = false;
  const engine = startAnalyticsEngine(
    { quotas: [], alerts: { holdMs: 0, repeatMs: 1, activeMs: 10000, desktop: true } },
    () => [{ id: "pc", state }],
    () => {},
    {
      now: () => now,
      intervalMs: 5,
      notify: async (_alert, signal) => {
        calls++;
        return await new Promise((resolve) =>
          signal.addEventListener(
            "abort",
            () => {
              aborted = true;
              resolve({ ok: false });
            },
            { once: true },
          ),
        );
      },
    },
  );
  now += 10;
  await Bun.sleep(25);
  expect(calls).toBe(1);
  await engine.stop();
  expect(aborted).toBe(true);
  expect(calls).toBe(1);
});
