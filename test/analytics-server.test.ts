import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { loadConfig } from "../src/config";
import { startApp } from "../src/server/index";

test("server exposes unknown quota and debounced alerts without further writes", async () => {
  const dir = await mkdtemp("/tmp/opencode/analytics-integration-");
  let app: Awaited<ReturnType<typeof startApp>> | undefined;
  try {
    const settings = join(dir, "analytics.json");
    await writeFile(
      settings,
      JSON.stringify({
        quotas: [{ id: "plan", label: "Plan", provider: "p", metric: "tokens", limit5h: 100 }],
        alerts: { holdMs: 100, repeatMs: 1000, activeMs: 8000, desktop: false },
        presetPath: join(dir, "slim.json"),
      }),
    );
    await writeFile(
      join(dir, "jev-observe.jsonl"),
      `${JSON.stringify({ ts: new Date().toISOString(), session: "fixture", message: "m", agent: "fixer", prompt: "", model: "classifier", status: 429, error: "rate limit", latency_ms: 10 })}\n`,
    );
    app = await startApp(
      loadConfig({ ORD_STATE_DIR: dir, ORD_PORT: "0", ORD_STATS_ENABLED: "false", ORD_ANALYTICS_CONFIG: settings }, []),
    );
    const endpoint = `${app.url}/api/state`;
    const read = async () => (await (await fetch(endpoint)).json()) as any;
    const initial = await read();
    expect(initial.analytics.result.quotas[0].fiveHour.observed).toBeNull();
    expect(initial.analytics.result.quotas[0].fiveHour.status).toBe("unknown");
    expect(initial.analytics.presetStatus).toBe("unverified");
    expect(JSON.stringify(initial.analytics)).not.toContain(dir);
    let data = initial;
    const deadline = Date.now() + 5000;
    while (!data.analytics.alerts.length && Date.now() < deadline) {
      await Bun.sleep(100);
      data = await read();
    }
    expect(data.analytics.alerts[0].kind).toBe("classifier-rate-limit");
    const sse = await fetch(`${app.url}/api/events`);
    const reader = sse.body!.getReader();
    const chunk = await reader.read();
    expect(new TextDecoder().decode(chunk.value)).toContain('"analytics"');
    await reader.cancel();
  } finally {
    if (app) await app.stop();
    await rm(dir, { recursive: true, force: true });
  }
});

test("server analytics includes retained local events omitted from federated UI detail", async () => {
  const dir = await mkdtemp("/tmp/opencode/analytics-retained-");
  let app: Awaited<ReturnType<typeof startApp>> | undefined;
  try {
    const observe =
      Array.from({ length: 12 }, (_, i) =>
        JSON.stringify({
          ts: new Date().toISOString(),
          session: "s",
          message: `m${i}`,
          agent: "fixer",
          prompt: "x".repeat(400000),
          model: "jev",
          error: "failure",
          latency_ms: 1,
          preset: "fast",
        }),
      ).join("\n") + "\n";
    await writeFile(join(dir, "jev-observe.jsonl"), observe);
    app = await startApp(loadConfig({ ORD_STATE_DIR: dir, ORD_PORT: "0", ORD_STATS_ENABLED: "false" }, []));
    const deadline = Date.now() + 7000;
    let data: any;
    do {
      await Bun.sleep(100);
      data = await (await fetch(`${app.url}/api/state`)).json();
    } while ((data.analytics.result.presets[0]?.count ?? 0) < 12 && Date.now() < deadline);
    expect(data.analytics.result.presets[0]?.count).toBe(12);
    expect(data.analytics.result.sourceCoverage[0].retained).toBe(12);
    expect(data.analytics.result.sourceCoverage[0].omitted).toBe(0);
    expect(data.exchange.sources[0].state.window.events.omitted).toBeGreaterThan(0);
  } finally {
    await app?.stop();
    await rm(dir, { recursive: true, force: true });
  }
});
