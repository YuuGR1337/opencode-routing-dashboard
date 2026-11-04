import { expect, test } from "bun:test";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startStats } from "../src/sources/stats";

test("stats uses verified 2.2.5 flags without unsupported OPENCODE_PURE", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ord-safe-stats-"));
  const script = join(dir, "fake");
  const output = join(dir, "result.json");
  await writeFile(
    script,
    `#!${process.execPath}\nawait Bun.write(${JSON.stringify(output)}, JSON.stringify({ args: process.argv.slice(2), disabled: ["OPENCODE_DISABLE_MODELS_FETCH", "OPENCODE_DISABLE_AUTOUPDATE", "OPENCODE_DISABLE_LSP_DOWNLOAD"].every(key => process.env[key] === "1"), pure: Object.hasOwn(process.env, "OPENCODE_PURE"), exporter: Object.keys(process.env).some(key => key.startsWith("OTEL_EXPORTER_")) }));\nconsole.log('{}');\n`,
  );
  await chmod(script, 0o700);
  process.env.OTEL_EXPORTER_ORD_TEST = "synthetic";
  const poller = await startStats({ enabled: true, interval: 60, command: script, onUpdate: () => {} });
  try {
    await poller.ready;
    const result = JSON.parse(await readFile(output, "utf8"));
    expect(result.args).toContain("--standalone");
    expect(result.args).toContain("stats");
    expect(result.disabled).toBe(true);
    expect(result.pure).toBe(false);
    expect(result.exporter).toBe(false);
  } finally {
    await poller.stop();
    delete process.env.OTEL_EXPORTER_ORD_TEST;
    await rm(dir, { recursive: true, force: true });
  }
});

test("disabled stats never calls runner", async () => {
  let calls = 0;
  const poller = await startStats({
    enabled: false,
    interval: 60,
    command: "opencode",
    runner: async () => {
      calls++;
      return "";
    },
    onUpdate: () => {},
  });
  await poller.stop();
  expect(calls).toBe(0);
});
test("noncooperative runner does not block startup or stop", async () => {
  const result = await Promise.race([
    startStats({
      enabled: true,
      interval: 60,
      command: "x",
      runner: async () => new Promise<string>(() => {}),
      onUpdate: () => {},
    }),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 150)),
  ]);
  expect(result).not.toBeNull();
  if (result)
    expect(
      await Promise.race([
        result.stop().then(() => true),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 150)),
      ]),
    ).toBe(true);
});
test("missing executable is unavailable", async () => {
  let status = "";
  const poller = await startStats({
    enabled: true,
    interval: 60,
    command: "/nonexistent/ord-command",
    onUpdate: (_, s) => {
      status = s.status;
    },
  });
  await poller.ready;
  expect(status).toBe("unavailable");
  await poller.stop();
});
test("stop kills and reaps a child ignoring SIGTERM", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ord-child-"));
  const script = join(dir, "stats.sh");
  const pidfile = join(dir, "pid");
  await writeFile(script, `#!/bin/sh\ntrap '' TERM\necho $$ > '${pidfile}'\nwhile :; do :; done\n`);
  await chmod(script, 0o700);
  const poller = await startStats({ enabled: true, interval: 60, command: script, onUpdate: () => {} });
  try {
    let pid = 0;
    for (let i = 0; i < 100 && !pid; i++) {
      try {
        pid = Number(await readFile(pidfile, "utf8"));
      } catch {
        await Bun.sleep(10);
      }
    }
    expect(pid).toBeGreaterThan(0);
    await poller.stop();
    expect(() => process.kill(pid, 0)).toThrow();
  } finally {
    await poller.stop();
    await rm(dir, { recursive: true, force: true });
  }
});

test("timeout aborts an injected runner and preserves last good timestamp", async () => {
  const fixture = await readFile("fixtures/stats.json", "utf8");
  let calls = 0;
  const updates: { status: string; fetchedAt?: string }[] = [];
  let sawAbort = false;
  const poller = await startStats({
    enabled: true,
    interval: 0.01,
    timeoutMs: 40,
    command: "unused",
    runner: async (_command, _args, signal) => {
      if (++calls === 1) return fixture;
      signal.addEventListener("abort", () => {
        sawAbort = true;
      });
      return new Promise<string>(() => {});
    },
    onUpdate: (_value, status) => updates.push(status),
  });
  try {
    await poller.ready;
    await Bun.sleep(100);
    expect(updates[0]?.status).toBe("ok");
    expect(updates[1]?.status).toBe("error");
    expect(updates[1]?.fetchedAt).toBe(updates[0]?.fetchedAt);
    expect(sawAbort).toBe(true);
  } finally {
    await poller.stop();
  }
});
