import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../src/config";
import { startApp } from "../src/server";

test("HTTP exports use local source state and enforce input and server security", async () => {
  const dir = await mkdtemp(join(tmpdir(), "report-http-"));
  await writeFile(join(dir, "jev-observe.jsonl"), await Bun.file("fixtures/report.json").text());
  const app = await startApp(
    loadConfig({ ORD_STATE_DIR: dir, ORD_PORT: "0", ORD_STATS_FILE: "fixtures/stats.json" }, []),
  );
  try {
    for (let i = 0; i < 100; i++) {
      const state = await (await fetch(`${app.url}/api/state`)).json();
      if (state.exchange.sources[0].state.statsStatus?.status === "ok") break;
      await Bun.sleep(20);
    }
    const url = `${app.url}/api/export?from=2026-11-04&to=2026-11-04&format=csv&source=local`;
    const response = await fetch(url);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/csv");
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="routing-report.csv"');
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    const body = await response.text();
    expect(body).toContain("fixture_session");
    expect(body).toContain("different range");
    expect(body).not.toContain("synthetic placeholder");
    const head = await fetch(url, { method: "HEAD" });
    expect(head.status).toBe(200);
    expect(await head.text()).toBe("");
    const md = await fetch(`${app.url}/api/export?from=2026-11-04&to=2026-11-04&format=md`);
    expect(md.status).toBe(200);
    expect(md.headers.get("content-type")).toContain("text/markdown");
    for (const query of [
      "from=2026-11-04&format=md",
      "from=2026-02-30&to=2026-03-01&format=md",
      "from=2026-11-04&to=2026-11-04&format=html",
      "from=2026-11-04&to=2026-11-04&format=md&source=unknown",
    ]) {
      expect((await fetch(`${app.url}/api/export?${query}`)).status).toBe(400);
    }
    expect((await fetch(url, { method: "POST" })).status).toBe(405);
    expect((await fetch(url, { headers: { Host: "evil.example" } })).status).toBe(403);
  } finally {
    await app.stop();
    await rm(dir, { recursive: true, force: true });
  }
});

test("unavailable configured source is never silently omitted", async () => {
  const dir = await mkdtemp(join(tmpdir(), "report-offline-"));
  const remote = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response("offline", { status: 503 }) });
  const file = join(dir, "sources.json");
  await writeFile(file, JSON.stringify([{ id: "pc", label: "PC", endpoint: `http://127.0.0.1:${remote.port}` }]));
  const app = await startApp(
    loadConfig({ ORD_STATE_DIR: dir, ORD_PORT: "0", ORD_STATS_ENABLED: "false", ORD_CONFIG: file }, []),
  );
  try {
    const base = `${app.url}/api/export?from=2026-11-04&to=2026-11-04&format=md`;
    expect((await fetch(base)).status).toBe(503);
    expect((await fetch(`${base}&source=pc`)).status).toBe(503);
    expect((await fetch(`${base}&source=local`)).status).toBe(200);
  } finally {
    await app.stop();
    remote.stop(true);
    await rm(dir, { recursive: true, force: true });
  }
});

test("all live source states and selection remain separate", async () => {
  const dir = await mkdtemp(join(tmpdir(), "report-live-"));
  const record = await Bun.file("fixtures/report.json").json();
  const remote = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(req) {
      if (new URL(req.url).pathname === "/api/events")
        return new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode(": connected\n\n"));
            },
          }),
          { headers: { "Content-Type": "text/event-stream" } },
        );
      return Response.json({
        version: 1,
        epoch: "report-fixture",
        seq: 1,
        input: {
          observe: [{ ...record, session: "remote_only" }],
          route: [],
          permissions: [],
          stats: null,
          malformed: { observe: 0, route: 0, permissions: 0 },
        },
      });
    },
  });
  const file = join(dir, "sources.json");
  await writeFile(join(dir, "jev-observe.jsonl"), `${JSON.stringify(record)}\n`);
  await writeFile(file, JSON.stringify([{ id: "pc", label: "PC", endpoint: `http://127.0.0.1:${remote.port}` }]));
  const app = await startApp(
    loadConfig({ ORD_STATE_DIR: dir, ORD_PORT: "0", ORD_STATS_ENABLED: "false", ORD_CONFIG: file }, []),
  );
  try {
    let live = false;
    for (let i = 0; i < 100; i++) {
      const state = await (await fetch(`${app.url}/api/state`)).json();
      if (state.exchange.sources[1].status === "live") {
        live = true;
        break;
      }
      await Bun.sleep(20);
    }
    expect(live).toBe(true);
    const base = `${app.url}/api/export?from=2026-11-04&to=2026-11-04&format=md`;
    const all = await fetch(base);
    expect(all.status).toBe(200);
    const text = await all.text();
    expect(text).toContain("remote_only");
    expect(text).toContain("fixture_session");
    const pc = await fetch(`${base}&source=pc`);
    expect(pc.status).toBe(200);
    const selected = await pc.text();
    expect(selected).toContain("remote_only");
    expect(selected).not.toContain("fixture_session");
  } finally {
    await app.stop();
    remote.stop(true);
    await rm(dir, { recursive: true, force: true });
  }
});
