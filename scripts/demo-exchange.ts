#!/usr/bin/env bun
/**
 * Repeatable PC + Orca + local demo of the exchange, built from anonymized fixtures in fixtures/exchange/.
 *
 * It starts the real thing: two headless agents (PC, Orca) and a dashboard whose configured sources point at them,
 * plus its own local fixture directory. Timestamps are shifted so the newest record is seconds old; nothing is
 * generated or overlaid in the UI. The dashboard runs with --demo, so the UI wears its DEMO band.
 *
 * Everything lives in a fresh temporary directory, binds 127.0.0.1 and is stopped and removed on SIGINT/SIGTERM.
 */
import { appendFile, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../src/config";
import { startApp } from "../src/server";
import { startAgent } from "../src/server/agent";

const usage = `Usage: bun scripts/demo-exchange.ts [--port N] [--live] [--duration SECONDS] [--keep]
  --port N         dashboard port (default 4788; 0 picks a free one)
  --live           append a synthetic PC record every 4 s so arrivals and replay have fresh data
  --duration S     stop by itself after S seconds (default: run until Ctrl-C)
  --keep           keep the temporary directory on exit`;

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const FIXTURES = join(ROOT, "fixtures", "exchange");
const FILES = ["jev-observe.jsonl", "jev-route.jsonl", "jev-permissions.jsonl"] as const;
const SOURCES = ["pc", "orca", "local"] as const;
const FRESH_MS = 15_000;
const LIVE_PROMPTS = [
  "Check the lint warnings",
  "Split the long function",
  "Add a docstring to the exporter",
  "Why is this test flaky",
];

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  console.log(usage);
  process.exit(0);
}
let port = 4788;
let duration: number | undefined;
let live = false;
let keep = false;
for (let i = 0; i < args.length; i++) {
  const arg = args[i]!;
  if (arg === "--live") live = true;
  else if (arg === "--keep") keep = true;
  else if ((arg === "--port" || arg === "--duration") && /^\d+$/.test(args[i + 1] ?? "")) {
    const value = Number(args[++i]);
    if (arg === "--port") {
      if (value > 65535) throw new Error(`Invalid --port\n${usage}`);
      port = value;
    } else duration = value;
  } else throw new Error(`Invalid argument: ${arg}\n${usage}`);
}

const parse = (line: string): Record<string, unknown> | null => {
  try {
    const value: unknown = JSON.parse(line);
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};
const lines = (text: string) => text.split("\n").filter((line) => line.length > 0);
const stamp = (record: Record<string, unknown> | null) =>
  record && typeof record.ts === "string" ? Date.parse(record.ts) : Number.NaN;

const cleanups: (() => Promise<unknown>)[] = [];
let stopping: Promise<void> | undefined;
let base: string | undefined;
let liveTimer: ReturnType<typeof setInterval> | undefined;
function shutdown(code = 0): Promise<void> {
  return (stopping ??= (async () => {
    if (liveTimer) clearInterval(liveTimer);
    // Dashboard first (it holds the connections to the agents), agents after.
    for (const stop of cleanups.reverse()) await stop().catch((error: unknown) => console.error(String(error)));
    if (base && !keep) {
      const tmp = await realpath(tmpdir());
      const actual = await realpath(base).catch(() => undefined);
      // Only ever remove the directory this script created.
      if (actual?.startsWith(tmp + sep) && actual.split(sep).pop()?.startsWith("ord-demo-exchange-"))
        await rm(actual, { recursive: true, force: true });
    } else if (base) console.log(`kept ${base}`);
    console.log("demo stopped");
    process.exit(code);
  })());
}
let signals = 0;
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    // A second signal means the clean stop is taking too long.
    if (++signals > 1) process.exit(130);
    void shutdown(0);
  });

try {
  const index = Bun.file(join(ROOT, "dist", "index.html"));
  if (!(await index.exists())) {
    console.log("dist/ is missing, running the build once");
    const build = Bun.spawn(["bun", join(ROOT, "scripts", "build.ts")], {
      cwd: ROOT,
      stdout: "inherit",
      stderr: "inherit",
    });
    if ((await build.exited) !== 0) throw new Error("Build failed");
  }

  base = await mkdtemp(join(tmpdir(), "ord-demo-exchange-"));
  const dirs = Object.fromEntries(SOURCES.map((id) => [id, join(base!, id)])) as Record<
    (typeof SOURCES)[number],
    string
  >;
  for (const id of SOURCES) await mkdir(dirs[id], { recursive: true });

  // Copy the fixtures with timestamps shifted together: sources keep their relative order and spacing.
  const texts = new Map<string, string>();
  let newest = Number.NEGATIVE_INFINITY;
  for (const id of SOURCES)
    for (const file of FILES) {
      const text = await readFile(join(FIXTURES, id, file), "utf8");
      texts.set(`${id}/${file}`, text);
      for (const line of lines(text)) {
        const time = stamp(parse(line));
        if (Number.isFinite(time)) newest = Math.max(newest, time);
      }
    }
  if (!Number.isFinite(newest)) throw new Error("Fixtures contain no timestamps");
  const delta = Date.now() - FRESH_MS - newest;
  for (const [key, text] of texts) {
    const shifted = lines(text).map((line) => {
      const record = parse(line);
      return record && Number.isFinite(stamp(record))
        ? JSON.stringify({ ...record, ts: new Date(stamp(record) + delta).toISOString() })
        : line;
    });
    await writeFile(join(base, key), shifted.length ? `${shifted.join("\n")}\n` : "");
  }
  // Stats keep their own range width; only its end moves to now, so ranges stay distinct per source.
  for (const id of ["pc", "local"] as const) {
    const stats = JSON.parse(await readFile(join(FIXTURES, id, "stats.json"), "utf8"));
    const width = stats.range.to - stats.range.from;
    stats.range = { from: Date.now() - width, to: Date.now() };
    await writeFile(join(dirs[id], "stats.json"), `${JSON.stringify(stats)}\n`);
  }

  const agent = async (id: "pc" | "orca") => {
    const config = loadConfig({}, [
      "--state-dir",
      dirs[id],
      "--port",
      "0",
      "--snapshot-dir",
      join(dirs[id], "snapshots"),
      ...(id === "pc" ? ["--stats-file", join(dirs[id], "stats.json")] : ["--stats-enabled", "false"]),
    ]);
    const started = await startAgent(config, { bind: "127.0.0.1" });
    cleanups.push(() => started.stop());
    return started.url;
  };
  const urls = { pc: await agent("pc"), orca: await agent("orca") };

  // Orca is configured, not observed: no record names its client, so the source and its worktree directory say so.
  const sources = join(base, "sources.json");
  await writeFile(
    sources,
    JSON.stringify([
      { id: "pc", label: "PC", endpoint: urls.pc, client: "TUI" },
      {
        id: "orca",
        label: "Orca",
        endpoint: urls.orca,
        client: "Orca",
        directoryRules: [{ prefix: "/home/user/orca-worktrees", client: "Orca", label: "orca worktree" }],
      },
    ]),
  );
  // Demo limits only. They are not a real subscription and carry that in their labels.
  const analytics = join(base, "analytics.json");
  await writeFile(
    analytics,
    JSON.stringify({
      quotas: [
        {
          id: "sub-a",
          label: "Subscription A (demo limits)",
          provider: "fixture-provider",
          metric: "tokens",
          limit5h: 40000,
          limitWeekly: 300000,
        },
      ],
      alerts: { holdMs: 0, repeatMs: 60000, activeMs: 600000, desktop: false },
    }),
  );

  const config = loadConfig({}, [
    "--demo",
    "true",
    "--state-dir",
    dirs.local,
    "--port",
    String(port),
    "--stats-file",
    join(dirs.local, "stats.json"),
    "--snapshot-dir",
    join(base, "snapshots"),
    "--config",
    sources,
    "--analytics-config",
    analytics,
  ]);
  const app = await startApp(config, { staticDir: join(ROOT, "dist") + sep });
  cleanups.push(() => app.stop());

  if (live) {
    let n = 0;
    liveTimer = setInterval(() => {
      const ts = new Date().toISOString();
      const prompt = LIVE_PROMPTS[n % LIVE_PROMPTS.length]!;
      const role = (["fixer", "explorer", "orchestrator", "designer"] as const)[n % 4]!;
      const message = `msg_live_${++n}`;
      const common = { ts, session: "ses_pc_live", message, agent: role, prompt };
      const observe = {
        ...common,
        model: "jev-1.13-free",
        status: 200,
        answers: {
          role: { type: "choice", choice: role, confidence: 0.8, probabilities: { [role]: 0.8 } },
          needs_oracle: { type: "noul", noul: 0.1 },
        },
        latency_ms: 350,
        preset: "fast",
      };
      const route = {
        ...common,
        dir: "/home/user/project",
        flag: "/home/user/project/.opencode/jev-route",
        role,
        conf: 0.8,
        needs_oracle: 0.1,
        decision: "injected",
        reason: null,
        latency_ms: 360,
      };
      void appendFile(join(dirs.pc, "jev-observe.jsonl"), `${JSON.stringify(observe)}\n`).catch(() => {});
      void appendFile(join(dirs.pc, "jev-route.jsonl"), `${JSON.stringify(route)}\n`).catch(() => {});
    }, 4000);
  }

  console.log("DEMO: anonymized fixtures, not live data");
  console.log(`dashboard  ${app.url}`);
  console.log(`pc agent   ${urls.pc}`);
  console.log(`orca agent ${urls.orca}`);
  console.log(`files      ${base}`);
  console.log(
    "clients: PC is TUI (one record states it); Orca is configured by source and directory rule; local is unknown.",
  );
  console.log(live ? "appending a PC record every 4 s (--live). Ctrl-C to stop." : "Ctrl-C to stop.");
  if (duration !== undefined) setTimeout(() => void shutdown(0), duration * 1000);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  await shutdown(1);
}
