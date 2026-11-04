import { expect, test } from "bun:test";
import { appendFile, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../src/config";
import { startApp } from "../src/server";
import { writeWeeklySnapshot } from "../src/sources/snapshots";

test("server reads configured source paths", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ord-paths-"));
  const path = join(dir, "custom=route.jsonl");
  await writeFile(path, await Bun.file("fixtures/jev-route.jsonl").text());
  const app = await startApp(
    loadConfig({ ORD_STATE_DIR: dir, ORD_PORT: "0", ORD_STATS_ENABLED: "false" }, [`--route-path=${path}`]),
  );
  try {
    const state = await (await fetch(`${app.url}/api/state`)).json();
    expect(state.sources.route.path).toBe(path);
    expect(state.sources.route.status).toBe("ok");
    expect(state.window.events.retained).toBeGreaterThan(0);
  } finally {
    await app.stop();
    await rm(dir, { recursive: true, force: true });
  }
});

test("port collision cleans up and permits a subsequent start", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ord-collision-"));
  const occupied = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response("occupied") });
  const config = loadConfig({ ORD_STATE_DIR: dir, ORD_PORT: String(occupied.port), ORD_STATS_ENABLED: "false" }, []);
  try {
    await expect(startApp(config, { historyRefreshMs: 20 })).rejects.toThrow();
    occupied.stop(true);
    const app = await startApp(config, { historyRefreshMs: 20 });
    await app.stop();
  } finally {
    occupied.stop(true);
    await rm(dir, { recursive: true, force: true });
  }
});

test("stopping closes history subscribers before subsequent writes", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ord-history-stop-"));
  const config = loadConfig({ ORD_STATE_DIR: dir, ORD_PORT: "0", ORD_STATS_ENABLED: "false" }, []);
  const app = await startApp(config, { historyRefreshMs: 20 });
  const reader = (await fetch(`${app.url}/api/events`)).body!.getReader();
  try {
    await reader.read();
    await app.stop();
    await writeWeeklySnapshot(config.snapshotDir, await Bun.file("fixtures/stats.json").json(), new Date(2026, 0, 5));
    await Bun.sleep(80);
    const result = await Promise.race([
      reader.read().then(
        (value) => value.done,
        () => true,
      ),
      Bun.sleep(500).then(() => false),
    ]);
    expect(result).toBe(true);
  } finally {
    await app.stop();
    await rm(dir, { recursive: true, force: true });
  }
});

test("history is loaded at startup and refreshed until stop", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ord-history-"));
  const config = loadConfig({ ORD_STATE_DIR: dir, ORD_PORT: "0", ORD_STATS_ENABLED: "false" }, []);
  const stats = await Bun.file("fixtures/stats.json").json();
  await writeWeeklySnapshot(config.snapshotDir, stats, new Date(2026, 0, 5));
  const app = await startApp(config, { historyRefreshMs: 20 });
  try {
    let state = await (await fetch(`${app.url}/api/state`)).json();
    expect(state.history).toHaveLength(1);
    expect(state.historyStatus.status).toBe("ok");
    await writeWeeklySnapshot(config.snapshotDir, stats, new Date(2026, 0, 12));
    for (let i = 0; i < 50 && state.history.length < 2; i++) {
      await Bun.sleep(20);
      state = await (await fetch(`${app.url}/api/state`)).json();
    }
    expect(state.history).toHaveLength(2);
  } finally {
    await app.stop();
    await rm(dir, { recursive: true, force: true });
  }
});

test("source retention reports evicted records explicitly", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ord-window-"));
  const line = (await Bun.file("fixtures/jev-observe.jsonl").text()).split("\n")[0]!;
  await appendFile(join(dir, "jev-observe.jsonl"), `${line}\n${line}\n${line}\n`);
  const app = await startApp(
    loadConfig({ ORD_STATE_DIR: dir, ORD_PORT: "0", ORD_STATS_ENABLED: "false", ORD_MAX_RECORDS: "2" }, []),
  );
  try {
    const state = await (await fetch(`${app.url}/api/state`)).json();
    expect(state.window?.evicted.observe).toBe(1);
    expect(state.window?.events.retained).toBe(2);
  } finally {
    await app.stop();
    await rm(dir, { recursive: true, force: true });
  }
});

test("demo marker appears on state, snapshot and delta without injecting fixtures", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ord-demo-"));
  const app = await startApp(
    loadConfig({ ORD_STATE_DIR: dir, ORD_PORT: "0", ORD_STATS_ENABLED: "false", ORD_DEMO: "true" }, []),
  );
  try {
    const state = (await (await fetch(`${app.url}/api/state`)).json()) as any;
    expect(state.demo).toBe(true);
    expect(state.events).toEqual([]);
    expect(state.stats).toBeNull();
    const reader = (await fetch(`${app.url}/api/events`)).body!.getReader();
    const snapshot = new TextDecoder().decode((await reader.read()).value);
    expect(JSON.parse(snapshot.split("data: ")[1]!).demo).toBe(true);
    await appendFile(
      join(dir, "jev-route.jsonl"),
      `${JSON.stringify({ ts: "2026-01-01T00:00:00Z", session: "demo-test", decision: "skipped", reason: "exception:demo" })}\n`,
    );
    const delta = new TextDecoder().decode((await reader.read()).value);
    expect(delta).toContain("event: delta");
    expect(JSON.parse(delta.split("data: ")[1]!).demo).toBe(true);
    await reader.cancel();
  } finally {
    await app.stop();
    await rm(dir, { recursive: true, force: true });
  }
});

test("server exposes missing sources and rejects hostile hosts", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ord-test-"));
  try {
    const app = await startApp(loadConfig({ ORD_STATE_DIR: dir, ORD_PORT: "0", ORD_STATS_ENABLED: "false" }, []));
    try {
      const state = (await (await fetch(`${app.url}/api/state`)).json()) as any;
      expect(state.sources.observe.status).toBe("missing");
      expect((await fetch(`${app.url}/api/state`, { headers: { Host: "evil.example" } })).status).toBe(403);
    } finally {
      await app.stop();
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("SSE heartbeat and cancellation release subscriber", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ord-heart-"));
  const app = await startApp(loadConfig({ ORD_STATE_DIR: dir, ORD_PORT: "0", ORD_STATS_ENABLED: "false" }, []), {
    heartbeatMs: 50,
  });
  try {
    const reader = (await fetch(`${app.url}/api/events`)).body!.getReader();
    await reader.read();
    const result = await Promise.race([
      reader.read(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("missing heartbeat")), 500)),
    ]);
    expect(new TextDecoder().decode(result.value)).toContain(": heartbeat");
    await reader.cancel();
    expect((await fetch(`${app.url}/api/state`, { method: "POST" })).status).toBe(405);
  } finally {
    await app.stop();
    await app.stop();
    await rm(dir, { recursive: true, force: true });
  }
});
test("static assets reject symlink escapes and missing assets return 404", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ord-static-"));
  const dist = join(dir, "dist");
  await mkdir(dist);
  await writeFile(join(dir, "outside"), "private");
  await symlink(join(dir, "outside"), join(dist, "leak"));
  const app = await startApp(loadConfig({ ORD_STATE_DIR: dir, ORD_PORT: "0", ORD_STATS_ENABLED: "false" }, []), {
    staticDir: dist,
  });
  try {
    expect((await fetch(`${app.url}/leak`)).status).toBe(403);
    expect((await fetch(`${app.url}/missing.js`)).status).toBe(404);
  } finally {
    await app.stop();
    await rm(dir, { recursive: true, force: true });
  }
});
test("SSE remains connected beyond Bun default idle timeout", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ord-idle-"));
  const app = await startApp(loadConfig({ ORD_STATE_DIR: dir, ORD_PORT: "0", ORD_STATS_ENABLED: "false" }, []), {
    heartbeatMs: 20000,
  });
  try {
    const reader = (await fetch(`${app.url}/api/events`)).body!.getReader();
    await reader.read();
    await Bun.sleep(11000);
    await appendFile(
      join(dir, "jev-route.jsonl"),
      `${JSON.stringify({ ts: "2026-01-01T00:00:00Z", session: "idle", decision: "skipped", reason: "exception:idle" })}\n`,
    );
    const result = await Promise.race([
      reader.read(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("idle SSE timeout")), 1900)),
    ]);
    expect(new TextDecoder().decode(result.value)).toContain("exception:idle");
    await reader.cancel();
  } finally {
    await app.stop();
    await rm(dir, { recursive: true, force: true });
  }
}, 15000);
test("appended JSONL arrives over SSE", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ord-sse-"));
  const app = await startApp(loadConfig({ ORD_STATE_DIR: dir, ORD_PORT: "0", ORD_STATS_ENABLED: "false" }, []));
  const abort = new AbortController();
  try {
    const response = await fetch(`${app.url}/api/events`, { signal: abort.signal });
    const reader = response.body!.getReader();
    const first = await reader.read();
    expect(new TextDecoder().decode(first.value)).toContain("event: snapshot");
    await appendFile(
      join(dir, "jev-route.jsonl"),
      `${JSON.stringify({ ts: "2026-01-01T00:00:00Z", session: "test", decision: "skipped", reason: "exception:test" })}\n`,
    );
    const result = await Promise.race([
      reader.read(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("SSE timeout")), 1900)),
    ]);
    expect(new TextDecoder().decode(result.value)).toContain("exception:test");
    await reader.cancel();
  } finally {
    abort.abort();
    await app.stop();
    await rm(dir, { recursive: true, force: true });
  }
});
