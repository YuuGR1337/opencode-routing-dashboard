import { expect, test } from "bun:test";
import { appendFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../src/config";
import { startAgent } from "../src/server/agent";

test("source, SSE, retention, redaction and request security", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ord-agent-"));
  const path = join(dir, "jev-observe.jsonl");
  const line = (await Bun.file("fixtures/jev-observe.jsonl").text()).split("\n")[0]!;
  await writeFile(path, `${line}\n${line}\ninvalid\n`);
  const config = loadConfig(
    { ORD_STATE_DIR: dir, ORD_PORT: "0", ORD_STATS_ENABLED: "false", ORD_MAX_RECORDS: "1" },
    [],
  );
  const agent = await startAgent(config, { token: "x".repeat(32), redactPrompts: true, heartbeatMs: 10000 });
  const auth = { Authorization: `Bearer ${"x".repeat(32)}` };
  try {
    expect((await fetch(`${agent.url}/api/source`)).status).toBe(401);
    expect((await fetch(`${agent.url}/api/source`, { headers: { ...auth, Host: "127.0.0.1:4319" } })).status).toBe(200);
    expect((await fetch(`${agent.url}/api/source`, { headers: { ...auth, Host: "localhost:4319" } })).status).toBe(200);
    expect(
      (await fetch(`${agent.url}/api/source`, { headers: { Authorization: `Bearer ${"y".repeat(32)}` } })).status,
    ).toBe(401);
    expect(
      (await fetch(`${agent.url}/api/source`, { headers: { Authorization: `Bearer ${"x".repeat(32)}extra` } })).status,
    ).toBe(401);
    expect((await fetch(`${agent.url}/api/source`, { headers: { ...auth, Host: "evil.example" } })).status).toBe(403);
    expect(
      (await fetch(`${agent.url}/api/source`, { headers: { ...auth, "Sec-Fetch-Site": "same-origin" } })).status,
    ).toBe(403);
    expect((await fetch(`${agent.url}/api/source`, { method: "POST", headers: auth })).status).toBe(405);
    const head = await fetch(`${agent.url}/api/source`, { method: "HEAD", headers: auth });
    expect(head.status).toBe(200);
    expect(await head.text()).toBe("");
    expect((await fetch(`${agent.url}/api/events`, { method: "HEAD", headers: auth })).status).toBe(200);
    expect((await fetch(`${agent.url}/api/source`, { headers: { ...auth, Origin: "http://localhost" } })).status).toBe(
      403,
    );
    expect((await fetch(`${agent.url}/api/source?token=x`, { headers: auth })).status).toBe(403);
    expect((await fetch(`${agent.url}/`, { headers: auth })).status).toBe(404);
    const source = await (await fetch(`${agent.url}/api/source`, { headers: auth })).json();
    expect(source.version).toBe(1);
    expect(source.input.observe).toHaveLength(1);
    expect(source.input.observe[0].prompt).toBe("");
    expect(source.input.evicted.observe).toBe(1);
    expect(source.input.malformed.observe).toBe(1);
    const reader = (await fetch(`${agent.url}/api/events`, { headers: auth })).body!.getReader();
    const first = new TextDecoder().decode((await reader.read()).value);
    expect(first).toContain("event: snapshot");
    await appendFile(path, `${line}\n`);
    const next = await Promise.race([
      reader.read(),
      Bun.sleep(2000).then(() => {
        throw new Error("missing delta");
      }),
    ]);
    expect(new TextDecoder().decode(next.value)).toContain("event: delta");
    await reader.cancel();
  } finally {
    await agent.stop();
    await rm(dir, { recursive: true, force: true });
  }
});

test("binds must be concrete IPs and remote binds require a strong token", async () => {
  const config = loadConfig({ ORD_PORT: "0", ORD_STATS_ENABLED: "false" }, []);
  for (const bind of ["0.0.0.0", "::", "localhost", "192.0.2.1"]) {
    await expect(startAgent(config, { bind })).rejects.toThrow();
  }
});

test("agent rejects retention above protocol limit before starting", async () => {
  const config = loadConfig({ ORD_PORT: "0", ORD_STATS_ENABLED: "false", ORD_MAX_RECORDS: "10001" }, []);
  await expect(startAgent(config)).rejects.toThrow("10000");
});

test("10k realistic records fit source and SSE and publish an append within two seconds", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ord-agent-volume-"));
  const path = join(dir, "jev-observe.jsonl");
  const record = JSON.parse((await Bun.file("fixtures/jev-observe.jsonl").text()).split("\n")[0]!);
  record.padding = "x".repeat(500);
  const line = JSON.stringify(record);
  await writeFile(path, `${line}\n`.repeat(10000));
  const config = loadConfig({ ORD_STATE_DIR: dir, ORD_PORT: "0", ORD_STATS_ENABLED: "false" }, []);
  const agent = await startAgent(config);
  try {
    const response = await fetch(`${agent.url}/api/source`);
    expect(response.status).toBe(200);
    const bytes = await response.arrayBuffer();
    expect(bytes.byteLength).toBeLessThanOrEqual(16 * 1024 * 1024);
    expect(JSON.parse(new TextDecoder().decode(bytes)).input.observe).toHaveLength(10000);
    const reader = (await fetch(`${agent.url}/api/events`)).body!.getReader();
    const readEvent = async () => {
      const decoder = new TextDecoder();
      let text = "";
      while (!text.endsWith("\n\n")) {
        const chunk = await reader.read();
        if (chunk.done) throw new Error("stream closed");
        text += decoder.decode(chunk.value, { stream: true });
      }
      return text;
    };
    expect(await readEvent()).toContain("event: snapshot");
    const start = performance.now();
    await appendFile(path, `${line}\n`);
    const delta = await Promise.race([
      readEvent(),
      Bun.sleep(2000).then(() => {
        throw new Error("missing delta within two seconds");
      }),
    ]);
    expect(delta).toContain("event: delta");
    console.log(`10k append-to-delta: ${Math.round(performance.now() - start)} ms`);
    await reader.cancel();
  } finally {
    await agent.stop();
    await rm(dir, { recursive: true, force: true });
  }
}, 30000);
