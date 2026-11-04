import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../src/config";
import { aggregate } from "../src/core/aggregate";
import { analyze } from "../src/core/analytics";
import { federate } from "../src/core/federation";
import { startAgent } from "../src/server/agent";
import { parsePresetConfig, startPresetMonitor } from "../src/sources/presets";
import { parseRemoteEnvelope } from "../src/sources/remote";

test("JSONC parser respects quoted comments, escapes, trailing commas and unresolved environment", () => {
  expect(parsePresetConfig('\ufeff{"preset":"http://x/\\"a", // comment\n "other":[1,],}')).toBe('http://x/"a');
  expect(parsePresetConfig('{"preset":"{env:FOO}"}')).toBeNull();
  expect(() => parsePresetConfig('{"preset":"x",/*')).toThrow();
});

test("monitor samples startup and changes, reports missing and does not invent history", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ord-presets-"));
  const path = join(dir, "slim.json");
  const seen: { changes: { preset: string; at: number }[]; status: { status: string } }[] = [];
  let monitor: Awaited<ReturnType<typeof startPresetMonitor>> | undefined;
  try {
    await writeFile(path, '{"preset":"one"}');
    monitor = await startPresetMonitor(path, (value) => seen.push(value), { intervalMs: 5 });
    expect(seen.at(-1)?.changes.map((x) => x.preset)).toEqual(["one"]);
    await writeFile(path, '{"preset":"two"}');
    await Bun.sleep(30);
    expect(seen.at(-1)?.changes.map((x) => x.preset)).toEqual(["one", "two"]);
    await rm(path);
    await Bun.sleep(30);
    expect(seen.at(-1)?.status.status).toBe("missing");
  } finally {
    await monitor?.stop();
    await rm(dir, { recursive: true, force: true });
  }
});

test("preset metadata roundtrips remotely and sampled attribution never marks quota complete", () => {
  const input = {
    observe: [],
    route: [],
    permissions: [],
    stats: null,
    malformed: { observe: 0, route: 0, permissions: 0 },
    presetChanges: [{ preset: "fast", at: 100 }],
    presetStatus: { status: "ok" as const, observedFrom: 100, observedTo: 200 },
  };
  const envelope = parseRemoteEnvelope({ version: 1, epoch: "x", seq: 1, input });
  expect(envelope?.input.presetChanges).toEqual(input.presetChanges);
  expect(aggregate(envelope!.input).presetStatus).toEqual(input.presetStatus);
  expect(
    federate([{ id: "pc", label: "PC", status: "live", input: envelope!.input }]).exchange.sources[0]?.state
      ?.presetChanges,
  ).toEqual(input.presetChanges);
  expect(
    parseRemoteEnvelope({
      version: 1,
      epoch: "x",
      seq: 1,
      input: { ...input, presetStatus: { status: "ok", observedFrom: 200, observedTo: 100 } },
    }),
  ).toBeNull();
  const event = {
    timestamp: 150,
    sourceId: "pc",
    session: "s",
    contextAgent: null,
    role: null,
    latency: null,
    errors: [],
    execution: null,
    preset: null,
    client: null,
    directory: null,
  };
  const result = analyze(
    [event, { ...event, timestamp: 99 }],
    {
      from: 0,
      to: 200,
      quotas: [{ id: "q", label: "Q", provider: "p", metric: "tokens" }],
      presetChanges: [{ sourceId: "pc", preset: "fast", at: 100 }],
      presetCoverage: [{ sourceId: "pc", from: 100, to: 200 }],
    },
    200,
  );
  expect(result.presets[0]?.coverage.sampled).toBe(1);
  expect(result.presetCoverage.unattributed).toBe(1);
  expect(result.quotas[0]?.fiveHour.status).toBe("unknown");
});

test("agent source envelope carries explicit sampled metadata", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ord-presets-agent-"));
  let agent: Awaited<ReturnType<typeof startAgent>> | undefined;
  try {
    const preset = join(dir, "slim.json");
    const settings = join(dir, "analytics.json");
    await writeFile(preset, '{"preset":"observed"}');
    await writeFile(settings, JSON.stringify({ presetPath: preset }));
    agent = await startAgent(
      loadConfig({ ORD_STATE_DIR: dir, ORD_PORT: "0", ORD_STATS_ENABLED: "false", ORD_ANALYTICS_CONFIG: settings }, []),
    );
    const response = await fetch(`${agent.url}/api/source`);
    const envelope = parseRemoteEnvelope(await response.json());
    expect(envelope?.input.presetChanges?.[0]?.preset).toBe("observed");
    expect(envelope?.input.presetStatus?.detail).toContain("Sampled selected file");
  } finally {
    await agent?.stop();
    await rm(dir, { recursive: true, force: true });
  }
});
