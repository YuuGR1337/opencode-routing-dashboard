import { readFile } from "node:fs/promises";
import { parseStats, type StatsRecord } from "../core/schema";

type Status = { status: "ok" | "unavailable" | "error" | "disabled"; detail?: string; fetchedAt?: string };
type Options = {
  enabled: boolean;
  interval: number;
  command: string;
  file?: string;
  runner?: (command: string, args: string[], signal: AbortSignal) => Promise<string>;
  timeoutMs?: number;
  onUpdate: (stats: StatsRecord | null, status: Status) => void;
};
const cap = 4 * 1024 * 1024;
async function run(command: string, args: string[], signal: AbortSignal): Promise<string> {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith("OTEL_EXPORTER_")) delete env[key];
  // Not present in the verified OpenCode 2.2.5 or 2.2.6 builds; do not claim they are safeguards.
  delete env.OPENCODE_PURE;
  delete env.OPENCODE_DISABLE_LSP_DOWNLOAD;
  Object.assign(env, {
    OPENCODE_DISABLE_MODELS_FETCH: "1",
    OPENCODE_DISABLE_AUTOUPDATE: "1",
  });
  // These safeguards apply only to our child, not independent OpenCode services.
  const child = Bun.spawn([command, ...args], { stdout: "pipe", stderr: "ignore", env });
  const reader = child.stdout.getReader();
  let grace: ReturnType<typeof setTimeout> | undefined;
  const kill = () => {
    void reader.cancel().catch(() => {});
    try {
      child.kill("SIGTERM");
    } catch {}
    grace = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {}
    }, 100);
  };
  signal.addEventListener("abort", kill, { once: true });
  if (signal.aborted) kill();
  try {
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > cap) {
        kill();
        throw new Error("Stats output too large");
      }
      chunks.push(value);
    }
    if ((await child.exited) !== 0) throw new Error("Stats command failed or timed out");
    return new TextDecoder().decode(Buffer.concat(chunks));
  } finally {
    if (signal.aborted) {
      try {
        child.kill("SIGKILL");
      } catch {}
    }
    await child.exited;
    if (grace) clearTimeout(grace);
    signal.removeEventListener("abort", kill);
  }
}
export async function startStats(options: Options) {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running: Promise<void> | undefined;
  let controller: AbortController | undefined;
  let last: StatsRecord | null = null;
  let fetchedAt: string | undefined;
  let failures = 0;
  const poll = async () => {
    controller = new AbortController();
    const signal = controller.signal;
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller?.abort();
    }, options.timeoutMs ?? 10000);
    const aborted = new Promise<never>((_, reject) =>
      signal.addEventListener("abort", () => reject(new Error(timedOut ? "Stats timed out" : "Stats stopped")), {
        once: true,
      }),
    );
    let work: Promise<string> | undefined;
    try {
      work = options.file
        ? readFile(options.file, { encoding: "utf8", signal })
        : (options.runner ?? run)(
            options.command,
            ["stats", "--json", "--models", "--tools", "--cost", "--standalone"],
            signal,
          );
      const text = await Promise.race([work, aborted]);
      if (Buffer.byteLength(text) > cap) throw new Error("Stats output too large");
      const parsed = parseStats(JSON.parse(text));
      if (!parsed) throw new Error("Invalid stats schema");
      last = parsed;
      failures = 0;
      fetchedAt = new Date().toISOString();
      if (!stopped) options.onUpdate(last, { status: "ok", fetchedAt });
    } catch (error) {
      failures++;
      const unavailable = typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
      if (!stopped)
        options.onUpdate(last, {
          status: unavailable ? "unavailable" : "error",
          detail: error instanceof Error ? error.message : "Stats unavailable",
          ...(fetchedAt ? { fetchedAt } : {}),
        });
    } finally {
      clearTimeout(timeout);
      // The built-in runner owns a process and must reap it. Injected runners may ignore abort.
      if (signal.aborted && !options.file && !options.runner && work) await work.catch(() => {});
    }
    if (!stopped)
      timer = setTimeout(
        () => {
          running = poll();
        },
        Math.min(options.interval * 1000 * 2 ** Math.min(failures, 5), 2147483647),
      );
  };
  if (options.enabled) running = poll();
  else options.onUpdate(null, { status: "disabled" });
  const ready = running ?? Promise.resolve();
  return {
    ready,
    async stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      controller?.abort();
      await running;
    },
  };
}
