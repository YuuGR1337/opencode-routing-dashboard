import { type DashboardInput, MAX_PAYLOAD_BYTES } from "../core/aggregate";
import { parseLine, parseStats } from "../core/schema";
import { parseSourceConfig, type SourceConfig } from "./source-config";

export type RemoteEnvelope = { version: 1; epoch: string; seq: number; input: DashboardInput };
/** Fail closed for any proxy configuration, including when NO_PROXY is set. */
export function assertNoProxy(env: Record<string, string | undefined>): void {
  if (["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy"].some((key) => !!env[key]))
    throw new Error("Proxy configuration is not supported");
}
const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const count = (v: unknown) => Number.isSafeInteger(v) && (v as number) >= 0;
const counters = (v: unknown) => obj(v) && ["observe", "route", "permissions"].every((k) => count(v[k]));
const text = (v: unknown) => typeof v === "string" && v.length <= 4096;
function bounded(v: unknown, depth = 0): boolean {
  if (depth > 32) return false;
  if (Array.isArray(v)) return v.length <= 10000 && v.every((x) => bounded(x, depth + 1));
  if (obj(v)) return Object.keys(v).length <= 10000 && Object.values(v).every((x) => bounded(x, depth + 1));
  return true;
}
export function parseRemoteEnvelope(value: unknown): RemoteEnvelope | null {
  if (
    !obj(value) ||
    value.version !== 1 ||
    !text(value.epoch) ||
    !value.epoch ||
    !count(value.seq) ||
    !obj(value.input) ||
    !bounded(value)
  )
    return null;
  const v = value.input;
  for (const source of ["observe", "route", "permissions"] as const) {
    const records = v[source];
    if (
      !Array.isArray(records) ||
      records.length > 10000 ||
      !records.every((record) => {
        try {
          return parseLine(source, JSON.stringify(record)).ok;
        } catch {
          return false;
        }
      })
    )
      return null;
  }
  if (
    !counters(v.malformed) ||
    (v.evicted !== undefined && !counters(v.evicted)) ||
    (v.stats !== null && !parseStats(v.stats))
  )
    return null;
  if (
    v.sources !== undefined &&
    (!obj(v.sources) ||
      !["observe", "route", "permissions"].every((k) => {
        const s = (v.sources as Record<string, unknown>)[k];
        return (
          obj(s) &&
          ["ok", "missing", "error"].includes(s.status as string) &&
          text(s.path) &&
          (s.detail === undefined || text(s.detail))
        );
      }))
  )
    return null;
  if (
    v.statsStatus !== undefined &&
    (!obj(v.statsStatus) ||
      !["ok", "unavailable", "error", "disabled"].includes(v.statsStatus.status as string) ||
      (v.statsStatus.detail !== undefined && !text(v.statsStatus.detail)) ||
      (v.statsStatus.fetchedAt !== undefined && !text(v.statsStatus.fetchedAt)))
  )
    return null;
  if (
    v.history !== undefined &&
    (!Array.isArray(v.history) ||
      v.history.length > 52 ||
      !v.history.every(
        (h) => obj(h) && typeof h.date === "string" && /^\d{4}-\d\d-\d\d$/.test(h.date) && parseStats(h.stats),
      ))
  )
    return null;
  if (Array.isArray(v.history)) {
    let total = 0;
    try {
      for (const item of v.history) {
        if (!obj(item)) return null;
        const bytes = Buffer.byteLength(JSON.stringify(item.stats));
        total += bytes;
        if (bytes > 1024 * 1024 || total > 2 * 1024 * 1024) return null;
      }
    } catch {
      return null;
    }
  }
  if (
    v.historyStatus !== undefined &&
    (!obj(v.historyStatus) ||
      !["ok", "missing", "error"].includes(v.historyStatus.status as string) ||
      !text(v.historyStatus.path) ||
      !count(v.historyStatus.malformed) ||
      !count(v.historyStatus.omitted) ||
      (v.historyStatus.detail !== undefined && !text(v.historyStatus.detail)))
  )
    return null;
  if (
    v.presetChanges !== undefined &&
    (!Array.isArray(v.presetChanges) ||
      v.presetChanges.length > 100 ||
      !v.presetChanges.every(
        (c) => obj(c) && typeof c.preset === "string" && c.preset.length > 0 && c.preset.length <= 512 && count(c.at),
      ))
  )
    return null;
  if (
    v.presetStatus !== undefined &&
    (!obj(v.presetStatus) ||
      !["ok", "missing", "error", "unconfigured"].includes(v.presetStatus.status as string) ||
      (v.presetStatus.detail !== undefined && !text(v.presetStatus.detail)) ||
      (v.presetStatus.status === "ok"
        ? !count(v.presetStatus.observedFrom) ||
          !count(v.presetStatus.observedTo) ||
          (v.presetStatus.observedFrom as number) > (v.presetStatus.observedTo as number)
        : v.presetStatus.observedFrom !== undefined || v.presetStatus.observedTo !== undefined))
  )
    return null;
  const {
    observe,
    route,
    permissions,
    stats,
    malformed,
    evicted,
    sources,
    statsStatus,
    history,
    historyStatus,
    presetChanges,
    presetStatus,
  } = v;
  return {
    version: 1,
    epoch: value.epoch as string,
    seq: value.seq as number,
    input: {
      observe,
      route,
      permissions,
      stats,
      malformed,
      ...(evicted !== undefined && { evicted }),
      ...(sources !== undefined && { sources }),
      ...(statsStatus !== undefined && { statsStatus }),
      ...(history !== undefined && { history }),
      ...(historyStatus !== undefined && { historyStatus }),
      ...(presetChanges !== undefined && { presetChanges }),
      ...(presetStatus !== undefined && { presetStatus }),
    } as DashboardInput,
  };
}
export type RemoteOptions = {
  token?: string;
  onUpdate(input: DashboardInput, envelope: RemoteEnvelope): void;
  onStatus(status: "connecting" | "ok" | "stale", detail?: string): void;
  connectTimeoutMs?: number;
  idleTimeoutMs?: number;
  retryBaseMs?: number;
  retryMaxMs?: number;
  random?: () => number;
};
export function startRemote(source: SourceConfig, options: RemoteOptions): { stop(): Promise<void> } {
  assertNoProxy(process.env);
  parseSourceConfig([source]);
  const controller = new AbortController();
  let previous: RemoteEnvelope | null = null;
  const signal = controller.signal;
  const accept = (data: string) => {
    const envelope = parseRemoteEnvelope(JSON.parse(data));
    // Each delta is a complete replacement, so sequence gaps are safe; a new epoch is a restart.
    if (!envelope || (previous && envelope.epoch === previous.epoch && envelope.seq < previous.seq))
      throw new Error("Invalid envelope");
    if (!previous || envelope.epoch !== previous.epoch || envelope.seq !== previous.seq) {
      previous = envelope;
      options.onUpdate(envelope.input, envelope);
    }
    options.onStatus("ok");
  };
  const request = async (path: string, consume: (reader: ReadableStreamDefaultReader<Uint8Array>) => Promise<void>) => {
    assertNoProxy(process.env);
    const local = new AbortController();
    const abort = () => local.abort();
    signal.addEventListener("abort", abort, { once: true });
    let timer = setTimeout(abort, options.connectTimeoutMs ?? 10000);
    try {
      const headers: Record<string, string> = {};
      if (options.token) headers.Authorization = `Bearer ${options.token}`;
      const response = await fetch(new URL(path, source.endpoint), {
        headers,
        signal: local.signal,
        redirect: "error",
      });
      clearTimeout(timer);
      if (!response.ok || !response.body) throw new Error("Request failed");
      const reader = response.body.getReader();
      const timedReader = {
        ...reader,
        read: async () => {
          let onAbort: () => void = () => {};
          const interrupted = new Promise<never>((_, reject) => {
            onAbort = () => reject(new Error("Interrupted"));
            local.signal.addEventListener("abort", onAbort, { once: true });
            if (local.signal.aborted) onAbort();
          });
          timer = setTimeout(abort, options.idleTimeoutMs ?? 30000);
          try {
            return await Promise.race([reader.read(), interrupted]);
          } finally {
            clearTimeout(timer);
            local.signal.removeEventListener("abort", onAbort);
          }
        },
      } as ReadableStreamDefaultReader<Uint8Array>;
      try {
        await consume(timedReader);
      } finally {
        void reader.cancel().catch(() => {});
      }
    } finally {
      clearTimeout(timer);
      local.abort();
      signal.removeEventListener("abort", abort);
    }
  };
  const loop = async () => {
    let failures = 0;
    while (!signal.aborted) {
      options.onStatus("connecting");
      const started = Date.now();
      try {
        await request("/api/source", async (reader) => {
          const chunks: Uint8Array[] = [];
          let size = 0;
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            size += value.length;
            if (size > MAX_PAYLOAD_BYTES) throw new Error("Oversize");
            chunks.push(value);
          }
          accept(new TextDecoder().decode(Buffer.concat(chunks)));
        });
        await request("/api/events", async (reader) => {
          const decoder = new TextDecoder();
          let buffer = "";
          let bytes = 0;
          let scan = 0;
          for (;;) {
            const { value, done } = await reader.read();
            if (done) throw new Error("Disconnected");
            bytes += value.length;
            if (bytes > MAX_PAYLOAD_BYTES) throw new Error("Oversize");
            buffer += decoder.decode(value, { stream: true });
            let match: RegExpExecArray | null;
            const delimiter = /\r?\n\r?\n/g;
            delimiter.lastIndex = scan;
            while ((match = delimiter.exec(buffer))) {
              const event = buffer.slice(0, match.index);
              buffer = buffer.slice(match.index + match[0].length);
              delimiter.lastIndex = 0;
              bytes = Buffer.byteLength(buffer);
              const lines = event.split(/\r?\n/);
              const kind =
                lines
                  .find((line) => line.startsWith("event:"))
                  ?.slice(6)
                  .trim() ?? "message";
              const data = lines
                .filter((line) => line.startsWith("data:"))
                .map((line) => line.slice(5).replace(/^ /, ""))
                .join("\n");
              if (data && (kind === "snapshot" || kind === "delta" || kind === "message")) accept(data);
            }
            scan = Math.max(0, buffer.length - 3);
          }
        });
      } catch {
        if (!signal.aborted) options.onStatus("stale", "Remote source unavailable");
      }
      if (signal.aborted) break;
      if (Date.now() - started >= 30000) failures = 0;
      else failures++;
      const delay = Math.min(
        options.retryMaxMs ?? 30000,
        (options.retryBaseMs ?? 500) * 2 ** Math.min(failures - 1, 16),
      );
      await new Promise<void>((resolve) => {
        const finish = () => {
          clearTimeout(timer);
          signal.removeEventListener("abort", finish);
          resolve();
        };
        const timer = setTimeout(
          finish,
          delay * (0.5 + Math.max(0, Math.min(1, (options.random ?? Math.random)())) * 0.5),
        );
        signal.addEventListener("abort", finish, { once: true });
        if (signal.aborted) finish();
      });
    }
  };
  const done = loop();
  return {
    stop: async () => {
      controller.abort();
      await done;
    },
  };
}
