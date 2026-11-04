import { constants } from "node:fs";
import { open, realpath } from "node:fs/promises";
import { basename, dirname, join, resolve, sep } from "node:path";
import type { AlertState, Quota } from "../core/analytics";

export type AnalyticsRuntimeSettings = {
  quotas: Quota[];
  alerts: { holdMs: number; repeatMs: number; activeMs: number; desktop: boolean };
  presetPath?: string;
};
const maxBytes = 256 * 1024;
const object = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0 && v.length <= 512;
const positive = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;
const keys = (v: Record<string, unknown>, allowed: string[]) => Object.keys(v).every((k) => allowed.includes(k));
function safePath(path: string): boolean {
  return path
    .split(/[\\/]+/)
    .filter(Boolean)
    .every(
      (name) =>
        !/^(?:\.ssh|\.env)/i.test(name) &&
        !/(?:auth|credential|secret|token|key|service|\.(?:pem|p12|pfx)$)/i.test(name),
    );
}
export async function checkedPath(path: string): Promise<string> {
  if (!path || !safePath(path) || !safePath(resolve(path))) throw new Error("Unsafe path");
  let parent = dirname(resolve(path));
  const pending: string[] = [];
  while (true) {
    try {
      parent = await realpath(parent);
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT" || parent === dirname(parent)) throw error;
      pending.unshift(basename(parent));
      parent = dirname(parent);
    }
  }
  const resolved = join(parent, ...pending, basename(path));
  if (!safePath(resolved.split(sep).join("/"))) throw new Error("Unsafe path");
  return resolved;
}
export async function loadAnalyticsSettings(path: string): Promise<AnalyticsRuntimeSettings> {
  const checked = await checkedPath(path);
  const file = await open(checked, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > maxBytes) throw new Error("Invalid settings file");
    const data = Buffer.alloc(maxBytes + 1);
    let length = 0;
    while (length < data.length) {
      const { bytesRead } = await file.read(data, length, data.length - length, length);
      if (!bytesRead) break;
      length += bytesRead;
    }
    if (length > maxBytes) throw new Error("Settings too large");
    let value: unknown;
    try {
      value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(data.subarray(0, length)));
    } catch {
      throw new Error("Invalid settings JSON");
    }
    if (!object(value) || !keys(value, ["quotas", "alerts", "presetPath"])) throw new Error("Invalid settings");
    const quotas = value.quotas ?? [];
    if (!Array.isArray(quotas)) throw new Error("Invalid quotas");
    const ids = new Set<string>();
    for (const q of quotas) {
      if (
        !object(q) ||
        !keys(q, ["id", "label", "provider", "model", "metric", "limit5h", "limitWeekly"]) ||
        !text(q.id) ||
        !text(q.label) ||
        !text(q.provider) ||
        (q.model !== undefined && !text(q.model)) ||
        (q.metric !== "tokens" && q.metric !== "messages") ||
        (q.limit5h !== undefined && !positive(q.limit5h)) ||
        (q.limitWeekly !== undefined && !positive(q.limitWeekly)) ||
        ids.has(q.id)
      )
        throw new Error("Invalid quota");
      ids.add(q.id);
    }
    const alerts = value.alerts ?? { holdMs: 0, repeatMs: 60000, activeMs: 60000, desktop: false };
    if (
      !object(alerts) ||
      !keys(alerts, ["holdMs", "repeatMs", "activeMs", "desktop"]) ||
      typeof alerts.holdMs !== "number" ||
      !Number.isFinite(alerts.holdMs) ||
      alerts.holdMs < 0 ||
      !positive(alerts.repeatMs) ||
      !positive(alerts.activeMs) ||
      typeof alerts.desktop !== "boolean"
    )
      throw new Error("Invalid alerts");
    if (value.presetPath !== undefined && (!text(value.presetPath) || !safePath(value.presetPath)))
      throw new Error("Invalid preset path");
    if (typeof value.presetPath === "string") await checkedPath(value.presetPath);
    return {
      quotas: quotas as Quota[],
      alerts: alerts as AnalyticsRuntimeSettings["alerts"],
      ...(value.presetPath === undefined ? {} : { presetPath: value.presetPath as string }),
    };
  } finally {
    await file.close();
  }
}

export type NotificationRunner = (args: string[], signal: AbortSignal) => Promise<number>;
async function spawnNotification(args: string[], signal: AbortSignal): Promise<number> {
  const child = Bun.spawn(args, { stdin: "ignore", stdout: "ignore", stderr: "ignore" });
  const kill = () => {
    try {
      child.kill("SIGKILL");
    } catch {}
  };
  signal.addEventListener("abort", kill, { once: true });
  if (signal.aborted) kill();
  try {
    return await child.exited;
  } finally {
    signal.removeEventListener("abort", kill);
  }
}
const appleScript = `on run argv
  display notification (item 1 of argv) with title (item 2 of argv)
end run`;
/** Caller must check the desktop opt-in before calling; no event contents are forwarded. */
export async function notifyAlert(
  alert: AlertState,
  options: { platform?: string; runner?: NotificationRunner; timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<{ ok: boolean; reason?: string }> {
  const platform = options.platform ?? process.platform;
  const messages = {
    "classifier-rate-limit": "Jev classifier rate limit detected",
    "rate-limit": "Execution provider rate limit detected",
    quota: "Execution provider quota exhaustion detected",
    fallback: "Fallback detected",
  } as const;
  const message = messages[alert.kind];
  if (!message) return { ok: false, reason: "invalid alert" };
  const args =
    platform === "linux"
      ? ["notify-send", "Routing dashboard", message]
      : platform === "darwin"
        ? ["osascript", "-e", appleScript, message, "Routing dashboard"]
        : null;
  if (!args) return { ok: false, reason: "unsupported platform" };
  const controller = new AbortController();
  const abort = () => controller.abort();
  options.signal?.addEventListener("abort", abort, { once: true });
  if (options.signal?.aborted) abort();
  const timeoutMs =
    options.timeoutMs !== undefined && positive(options.timeoutMs) ? Math.min(options.timeoutMs, 30000) : 5000;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timedOut = new Promise<number>((_, reject) => {
      controller.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error("timeout"));
      }, timeoutMs);
    });
    if (controller.signal.aborted) return { ok: false, reason: "notification failed" };
    const result = await Promise.race([(options.runner ?? spawnNotification)(args, controller.signal), timedOut]);
    return result === 0 ? { ok: true } : { ok: false, reason: "notification failed" };
  } catch {
    return { ok: false, reason: "notification failed" };
  } finally {
    if (timer) clearTimeout(timer);
    options.signal?.removeEventListener("abort", abort);
  }
}
