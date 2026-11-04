import { constants } from "node:fs";
import { open } from "node:fs/promises";
import type { PresetChange, PresetStatus } from "../core/aggregate";
import { checkedPath } from "./analytics";

/** JSONC comments and trailing commas are removed only outside quoted strings. */
export function parsePresetConfig(input: string): string | null {
  const source = input.replace(/^\uFEFF/, "");
  let clean = "";
  let string = false;
  let escaped = false;
  for (let i = 0; i < source.length; i++) {
    const c = source[i]!;
    if (string) {
      clean += c;
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') string = false;
    } else if (c === '"') {
      string = true;
      clean += c;
    } else if (c === "/" && source[i + 1] === "/") {
      i += 2;
      while (i < source.length && source[i] !== "\n" && source[i] !== "\r") i++;
      clean += "\n";
    } else if (c === "/" && source[i + 1] === "*") {
      const end = source.indexOf("*/", i + 2);
      if (end < 0) throw new Error("Invalid JSONC");
      i = end + 1;
      clean += " ";
    } else clean += c;
  }
  let output = "";
  string = false;
  escaped = false;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i]!;
    if (string) {
      output += c;
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') string = false;
    } else if (c === '"') {
      string = true;
      output += c;
    } else if (c === "," && /^[\s]*[}\]]/.test(clean.slice(i + 1))) continue;
    else output += c;
  }
  const value: unknown = JSON.parse(output);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid preset config");
  const preset = (value as Record<string, unknown>).preset;
  return typeof preset === "string" && preset.length > 0 && preset.length <= 512 && !/\{env:[^}]*\}/i.test(preset)
    ? preset
    : null;
}

export async function startPresetMonitor(
  path: string,
  onUpdate: (value: { changes: PresetChange[]; status: PresetStatus }) => void,
  options: { intervalMs?: number; now?: () => number } = {},
) {
  let changes: PresetChange[] = [];
  let from: number | undefined;
  let last: string | null = null;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running: Promise<void> | undefined;
  let lastPublishedAt = 0;
  let publishedSignature = "";
  const now = options.now ?? Date.now;
  const interval =
    options.intervalMs && options.intervalMs > 0 && Number.isFinite(options.intervalMs) ? options.intervalMs : 1000;
  async function poll() {
    let status: PresetStatus;
    try {
      const resolved = await checkedPath(path);
      const file = await open(resolved, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
      let preset: string | null;
      try {
        const stat = await file.stat();
        if (!stat.isFile() || stat.size > 256 * 1024) throw new Error("Invalid file");
        const data = Buffer.alloc(256 * 1024 + 1);
        let length = 0;
        while (length < data.length) {
          const part = await file.read(data, length, data.length - length, length);
          if (!part.bytesRead) break;
          length += part.bytesRead;
        }
        if (length > 256 * 1024) throw new Error("Oversize file");
        preset = parsePresetConfig(new TextDecoder("utf-8", { fatal: true }).decode(data.subarray(0, length)));
      } finally {
        await file.close();
      }
      if (!preset) throw new Error("Preset unavailable");
      const at = now();
      if (from === undefined || at < from) {
        from = at;
        last = null;
      }
      if (last !== preset) {
        changes = [...changes, { preset, at }].slice(-100);
        last = preset;
      }
      status = {
        status: "ok",
        detail: "Sampled selected file; overrides not resolved, changes between samples may be missed",
        observedFrom: from,
        observedTo: at,
      };
    } catch (error) {
      from = undefined;
      last = null;
      status = {
        status: (error as NodeJS.ErrnoException).code === "ENOENT" ? "missing" : "error",
        detail: "Selected file preset unavailable; overrides not resolved",
      };
    }
    const signature = JSON.stringify({ changes, status: { ...status, observedTo: undefined } });
    const current = now();
    if (
      !stopped &&
      (signature !== publishedSignature || current - lastPublishedAt >= 30000 || current < lastPublishedAt)
    ) {
      publishedSignature = signature;
      lastPublishedAt = current;
      onUpdate({ changes: [...changes], status });
    }
  }
  const cycle = () => {
    running = poll().finally(() => {
      if (!stopped) timer = setTimeout(cycle, interval);
    });
  };
  cycle();
  await running;
  return {
    async stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      await running;
    },
  };
}
