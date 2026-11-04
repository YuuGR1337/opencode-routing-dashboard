import { expect, test } from "bun:test";
import { appendFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../src/config";
import { startApp } from "../src/server";

test("server starts with 10k fixture-derived records and streams an append", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ord-perf-"));
  const fixture = JSON.parse((await Bun.file("fixtures/jev-route.jsonl").text()).split("\n")[0]!);
  const path = join(dir, "jev-route.jsonl");
  await writeFile(
    path,
    Array.from({ length: 10000 }, (_, i) =>
      JSON.stringify({ ...fixture, session: `anon-${i}`, message: `msg-${i}` }),
    ).join("\n") + "\n",
  );
  const config = loadConfig({ ORD_STATE_DIR: dir, ORD_PORT: "0", ORD_STATS_ENABLED: "false" }, []);
  let app: Awaited<ReturnType<typeof startApp>> | undefined;
  try {
    const start = performance.now();
    app = await startApp(config);
    const response = await fetch(`${app.url}/api/state`);
    const elapsed = performance.now() - start;
    console.log(`10k startup to HTTP response: ${elapsed.toFixed(2)}ms`);
    expect(elapsed).toBeLessThan(1000);
    const state = await response.json();
    expect(state.window.events.retained).toBe(10000);
    expect(state.events.length).toBe(state.window.events.sent);
    expect(state.window.events.sent + state.window.events.omitted).toBe(10000);
    const reader = (await fetch(`${app.url}/api/events`)).body!.getReader();
    const readEvent = async () => {
      let text = "";
      let bytes = 0;
      while (!text.endsWith("\n\n")) {
        const chunk = await reader.read();
        if (chunk.done) throw new Error("stream closed");
        bytes += chunk.value.byteLength;
        text += new TextDecoder().decode(chunk.value);
      }
      return { text, bytes };
    };
    const snapshot = await readEvent();
    expect(snapshot.bytes).toBeLessThan(16 * 1024 * 1024);
    expect(snapshot.text.startsWith("event: snapshot")).toBe(true);
    await appendFile(
      path,
      `${JSON.stringify({ ...fixture, session: "anon-new", message: "msg-new", reason: "exception:performance" })}\n`,
    );
    const delta = await Promise.race([
      readEvent(),
      Bun.sleep(1900).then(() => {
        throw new Error("delta timeout");
      }),
    ]);
    expect(delta.text.includes("exception:performance")).toBe(true);
    await reader.cancel();
  } finally {
    await app?.stop();
    await rm(dir, { recursive: true, force: true });
  }
}, 10000);
