import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../src/config";
import type { DashboardInput } from "../src/core/aggregate";
import { aggregate } from "../src/core/aggregate";
import { classifySourceEvent, federate } from "../src/core/federation";
import { startApp } from "../src/server";

const input = (): DashboardInput => ({
  observe: [
    {
      ts: "2026-01-01T00:00:00Z",
      session: "same",
      message: "same",
      agent: "x",
      prompt: "p",
      model: "m",
      latency_ms: 1,
      error: "x",
    },
  ],
  route: [],
  permissions: [],
  stats: null,
  malformed: { observe: 0, route: 0, permissions: 0 },
});
test("classifies observed clients and longest directory boundary without guessing", () => {
  const event = aggregate(input()).events[0]!;
  const source = {
    id: "pc",
    label: "PC",
    status: "live" as const,
    input: null,
    client: "service" as const,
    directoryRules: [
      { prefix: "/work", client: "TUI" as const },
      { prefix: "/work/orca", client: "Orca" as const, label: "Configured tree" },
    ],
  };
  const withDir = {
    ...event,
    route: {
      ts: "2026-01-01T00:00:00Z",
      session: "s",
      decision: "skipped" as const,
      reason: "exception:x",
      dir: "/work/orca/project",
    },
  };
  expect(classifySourceEvent(withDir, source)).toEqual({
    directory: "/work/orca/project",
    client: "Orca",
    evidence: "configured",
    label: "Configured tree",
  });
  expect(classifySourceEvent({ ...withDir, route: { ...withDir.route, dir: "/work/orca-other" } }, source).client).toBe(
    "TUI",
  );
  expect(classifySourceEvent(event, source)).toEqual({ directory: null, client: "service", evidence: "configured" });
  expect(classifySourceEvent({ ...withDir, route: { ...withDir.route, client: "TUI" } }, source).evidence).toBe(
    "observed",
  );
  expect(
    classifySourceEvent(
      { ...withDir, route: { ...withDir.route, client: "TUI" }, observe: { ...event.observe!, client: "Orca" } },
      source,
    ),
  ).toEqual({ directory: "/work/orca/project", client: "unknown", evidence: "unknown" });
  expect(classifySourceEvent(event, { id: "pc", label: "PC", status: "live", input: null })).toEqual({
    directory: null,
    client: "unknown",
    evidence: "unknown",
  });
});

test("combined and per-source events use their own provenance rules", () => {
  const a = input(),
    b = input();
  a.observe[0]!.dir = "/work/a";
  b.observe[0]!.dir = "/work/a";
  const state = federate([
    { id: "a", label: "A", status: "live", input: a, directoryRules: [{ prefix: "/work", client: "Orca" }] },
    { id: "b", label: "B", status: "live", input: b, client: "TUI" },
  ]);
  expect(state.events.map((event) => (event as any).provenance.client).sort()).toEqual(["Orca", "TUI"]);
  expect((state.exchange.sources[0]!.state!.events[0] as any).provenance.client).toBe("Orca");
  expect((state.exchange.sources[1]!.state!.events[0] as any).provenance.client).toBe("TUI");
});
test("separates colliding source identities and retains stale source data", () => {
  const state = federate([
    { id: "local", label: "Local", status: "live", input: input() },
    { id: "remote", label: "Remote", status: "stale", input: input(), epoch: "a" },
  ]);
  expect(state.events).toHaveLength(2);
  expect(new Set(state.events.map((e) => e.session)).size).toBe(2);
  expect(state.exchange.sources[1]?.status).toBe("stale");
  expect(state.exchange.sources[1]?.state?.events).toHaveLength(1);
});
test("suppresses duplicate peer epochs", () => {
  const state = federate([
    { id: "local", label: "Local", status: "live", input: input() },
    { id: "one", label: "One", status: "live", input: input(), epoch: "same" },
    { id: "two", label: "Two", status: "live", input: input(), epoch: "same" },
  ]);
  expect(state.events).toHaveLength(2);
  expect(state.exchange.sources[2]?.status).toBe("error");
  expect(state.exchange.sources[2]?.state).toBeNull();
});

test("never pairs observations and routes from different sources", () => {
  const local = input();
  const remote = input();
  remote.observe = [];
  remote.route = [
    {
      ts: "2026-01-01T00:00:01Z",
      session: "same",
      message: "same",
      agent: "x",
      dir: "d",
      flag: "f",
      prompt: "p",
      role: "x",
      conf: 1,
      needs_oracle: 0,
      latency_ms: 1,
      decision: "injected",
      reason: null,
    },
  ];
  const state = federate([
    { id: "local", label: "Local", status: "live", input: local },
    { id: "peer", label: "Peer", status: "live", input: remote },
  ]);
  expect(state.events).toHaveLength(2);
  expect(state.events.every((event) => !(event.observe && event.route))).toBe(true);
});

test("isolates oversized base without losing a healthy source or presenting partial stats", async () => {
  const stats = await Bun.file("fixtures/stats.json").json();
  const bad = input();
  bad.history = [{ date: "2026-01-01", stats: { ...stats, extra: "x".repeat(5 * 1024 * 1024) } }];
  const good = input();
  good.stats = stats;
  const state = federate([
    { id: "local", label: "Local", status: "live", input: good },
    { id: "bad", label: "Bad", status: "live", input: bad },
  ]);
  expect(state.exchange.sources[1]?.state).toBeNull();
  expect(state.exchange.sources[1]?.detail).toBe("Source exceeds payload budget");
  expect(state.exchange.sources[1]?.status).toBe("error");
  expect(state.exchange.sources[0]?.state).not.toBeNull();
  expect(state.events).toHaveLength(1);
  expect(state.stats).toBeNull();
  expect(Buffer.byteLength(JSON.stringify(state))).toBeLessThan(16 * 1024 * 1024);
});

test("uses explicit clock consistently across source and combined state", () => {
  const source = input();
  const now = Date.parse("2026-01-01T00:00:30Z");
  const state = federate([{ id: "local", label: "Local", status: "live", input: source }], now);
  expect(state.readouts.promptsPerMinute).toBe(1);
  expect(state.exchange.sources[0]?.state?.readouts.promptsPerMinute).toBe(1);
  expect(
    federate([{ id: "local", label: "Local", status: "live", input: source }], now + 120000).readouts.promptsPerMinute,
  ).toBe(0);
});

test("dashboard connects configured aliases, reports duplicate epoch and retains stale data", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ord-federation-"));
  const remoteInput = input();
  remoteInput.observe[0]!.dir = "/work/orca/project";
  const envelope = { version: 1, epoch: "same-peer", seq: 1, input: remoteInput };
  const peer = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: (request) =>
      new URL(request.url).pathname === "/api/source"
        ? Response.json(envelope)
        : new Response("", { headers: { "content-type": "text/event-stream" } }),
  });
  const configPath = join(dir, "sources.json");
  await writeFile(
    configPath,
    JSON.stringify(
      ["one", "two"].map((id) => ({
        id,
        label: id,
        endpoint: `http://127.0.0.1:${peer.port}`,
        directoryRules: [{ prefix: "/work/orca", client: "Orca" }],
      })),
    ),
  );
  const app = await startApp(
    loadConfig({ ORD_CONFIG: configPath, ORD_STATE_DIR: dir, ORD_PORT: "0", ORD_STATS_ENABLED: "false" }, []),
  );
  try {
    let state: any;
    for (let i = 0; i < 100; i++) {
      state = await (await fetch(`${app.url}/api/state`)).json();
      if (state.exchange.sources[2].status === "error" && state.exchange.sources[1].status === "stale") break;
      await Bun.sleep(20);
    }
    expect(state.exchange.sources[1].status).toBe("stale");
    expect(state.exchange.sources[1].state.events).toHaveLength(1);
    expect(state.exchange.sources[1].state.events[0].provenance).toEqual({
      directory: "/work/orca/project",
      client: "Orca",
      evidence: "configured",
    });
    expect(state.exchange.sources[2].status).toBe("error");
    expect(state.events).toHaveLength(1);
  } finally {
    await app.stop();
    peer.stop(true);
    await rm(dir, { recursive: true, force: true });
  }
});
