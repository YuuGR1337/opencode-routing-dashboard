import { realpath, stat } from "node:fs/promises";
import { isIP } from "node:net";
import { resolve, sep } from "node:path";
import type { Config } from "../config";
import { type DashboardInput, MAX_PAYLOAD_BYTES } from "../core/aggregate";
import { createAnalyticsCache } from "../core/analytics-cache";
import { type FederatedState, type FederationSource, federate } from "../core/federation";
import { loadAnalyticsSettings } from "../sources/analytics";
import { startCollector } from "../sources/collector";
import { startRemote } from "../sources/remote";
import { loadSourceConfig } from "../sources/source-config";
import { startAnalyticsEngine } from "./analytics";

export async function startApp(
  config: Config,
  options: { heartbeatMs?: number; staticDir?: string; historyRefreshMs?: number } = {},
) {
  const bind = config.bind;
  if (!((isIP(bind) === 4 && bind.startsWith("127.")) || bind === "::1" || bind === "0:0:0:0:0:0:0:1"))
    throw new Error("Dashboard bind must be loopback");
  let input: DashboardInput;
  let state: FederatedState & { analytics?: ReturnType<ReturnType<typeof startAnalyticsEngine>["snapshot"]> };
  let analytics: ReturnType<typeof startAnalyticsEngine> | undefined;
  const analyticsCache = createAnalyticsCache();
  const remoteSources: FederationSource[] = [];
  const remotes: ReturnType<typeof startRemote>[] = [];
  let seq = 0;
  let ready = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const clients = new Set<ReadableStreamDefaultController<Uint8Array>>();
  const encoder = new TextEncoder();
  // Delta events intentionally contain the complete state and sequence, making each event self-contained.
  const maxPayload = MAX_PAYLOAD_BYTES;
  const publish = () => {
    timer = undefined;
    state = {
      ...federate([{ id: "local", label: "Local", status: "live", input }, ...remoteSources]),
      ...(analytics ? { analytics: analytics.snapshot() } : {}),
    };
    seq++;
    const data = encoder.encode(`event: delta\ndata: ${JSON.stringify({ state, seq, demo: config.demo })}\n\n`);
    for (const client of clients) {
      try {
        if (data.byteLength > maxPayload || (client.desiredSize ?? 0) <= 0) {
          client.close();
          clients.delete(client);
        } else client.enqueue(data);
      } catch {
        clients.delete(client);
      }
    }
  };
  const changed = () => {
    if (ready && !timer) timer = setTimeout(publish, 50);
  };
  let collector: Awaited<ReturnType<typeof startCollector>> | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  try {
    const analyticsSettings = config.analyticsConfigFile
      ? await loadAnalyticsSettings(config.analyticsConfigFile)
      : { quotas: [], alerts: { holdMs: 0, repeatMs: 60000, activeMs: 60000, desktop: false } };
    const configured = config.configFile ? await loadSourceConfig(config.configFile) : [];
    const tokens = configured.map((source) => {
      const token = source.tokenEnv ? process.env[source.tokenEnv] : undefined;
      if (source.tokenEnv && !token) throw new Error("Missing configured source token");
      return token;
    });
    collector = await startCollector(
      config,
      (next) => {
        analyticsCache.invalidate(next);
        input = next;
        changed();
      },
      { historyRefreshMs: options.historyRefreshMs },
    );
    input = collector.input;
    for (const source of configured)
      remoteSources.push({
        id: source.id,
        label: source.label,
        ...(source.client && { client: source.client }),
        ...(source.directoryRules && { directoryRules: source.directoryRules }),
        status: "connecting",
        input: null,
      });
    state = federate([{ id: "local", label: "Local", status: "live", input }, ...remoteSources]);
    analytics = startAnalyticsEngine(
      analyticsSettings,
      () => {
        const epochs = new Set<string>();
        return [{ id: "local", status: "live" as const, input }, ...remoteSources].map((source) => {
          const epoch = "epoch" in source ? source.epoch : undefined;
          const duplicate = !!epoch && epochs.has(epoch);
          if (epoch && !duplicate) epochs.add(epoch);
          const shown = state.exchange.sources.find((item) => item.id === source.id);
          const reason = duplicate ? "duplicate source epoch" : !source.input ? "source unavailable" : undefined;
          return {
            id: source.id,
            status: duplicate ? "error" : source.status,
            included: !reason,
            ...(reason ? { reason } : {}),
            uiOmitted: shown?.state?.window.events.omitted ?? 0,
            ...(shown?.detail === "Source exceeds payload budget"
              ? { uiReason: "source exceeds UI payload budget" }
              : {}),
            state: source.input && !duplicate ? analyticsCache.get(source.input) : null,
          };
        });
      },
      changed,
    );
    state = { ...state, analytics: analytics.snapshot() };
    ready = true;
    configured.forEach((source, index) => {
      const entry = remoteSources[index]!;
      remotes.push(
        startRemote(source, {
          token: tokens[index],
          onUpdate(next, envelope) {
            analyticsCache.invalidate(next);
            entry.input = next;
            entry.epoch = envelope.epoch;
            entry.lastSeenAt = new Date().toISOString();
            changed();
          },
          onStatus(status, detail) {
            entry.status = status === "ok" ? "live" : status === "connecting" && entry.input ? "stale" : status;
            entry.detail = detail;
            changed();
          },
        }),
      );
    });
    heartbeat = setInterval(() => {
      for (const client of clients) {
        try {
          if ((client.desiredSize ?? 0) <= 0) {
            client.close();
            clients.delete(client);
          } else client.enqueue(encoder.encode(": heartbeat\n\n"));
        } catch {
          clients.delete(client);
        }
      }
    }, options.heartbeatMs ?? 15000);
    const headers = {
      "Content-Security-Policy": "default-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
      "X-Content-Type-Options": "nosniff",
    };
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: config.port,
      idleTimeout: 0,
      async fetch(request) {
        const host = request.headers.get("host") ?? "";
        if (!/^(?:127\.0\.0\.1|localhost)(?::\d+)?$/i.test(host))
          return new Response("Forbidden", { status: 403, headers });
        if (request.method !== "GET" && request.method !== "HEAD")
          return new Response("Method not allowed", { status: 405, headers: { ...headers, Allow: "GET, HEAD" } });
        const url = new URL(request.url);
        if (url.pathname === "/api/state") {
          const body = JSON.stringify({ ...state, seq, demo: config.demo });
          if (encoder.encode(body).byteLength > maxPayload)
            return new Response("State too large", { status: 503, headers });
          return new Response(body, { headers: { ...headers, "Content-Type": "application/json" } });
        }
        if (url.pathname === "/api/events") {
          if (request.method === "HEAD")
            return new Response(null, { headers: { ...headers, "Content-Type": "text/event-stream" } });
          if (clients.size >= 64) return new Response("Too many clients", { status: 503, headers });
          const snapshot = encoder.encode(
            `event: snapshot\ndata: ${JSON.stringify({ state, seq, demo: config.demo })}\n\n`,
          );
          if (snapshot.byteLength > maxPayload)
            return new Response("State too large for SSE", { status: 503, headers });
          let controller: ReadableStreamDefaultController<Uint8Array>;
          const stream = new ReadableStream<Uint8Array>(
            {
              start(c) {
                controller = c;
                clients.add(c);
                c.enqueue(snapshot);
              },
              cancel() {
                clients.delete(controller);
              },
            },
            { highWaterMark: 2 },
          );
          return new Response(stream, {
            headers: {
              ...headers,
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache",
              Connection: "keep-alive",
            },
          });
        }
        if (url.pathname.startsWith("/api/")) return new Response("Not found", { status: 404, headers });
        let pathname: string;
        try {
          pathname = decodeURIComponent(url.pathname);
        } catch {
          return new Response("Bad request", { status: 400, headers });
        }
        const root = resolve(options.staticDir ?? resolve(import.meta.dir, "../../dist"));
        const file = resolve(root, `.${pathname === "/" ? "/index.html" : pathname}`);
        if (!file.startsWith(root + sep)) return new Response("Forbidden", { status: 403, headers });
        let actualRoot: string;
        try {
          actualRoot = await realpath(root);
          if (!(await stat(actualRoot)).isDirectory()) throw new Error("Not a directory");
        } catch {
          return new Response("Dashboard assets unavailable. Run bun run build in the source repository.", {
            status: 503,
            headers: { ...headers, "Content-Type": "text/plain; charset=utf-8" },
          });
        }
        try {
          const actualFile = await realpath(file);
          if (!actualFile.startsWith(actualRoot + sep)) return new Response("Forbidden", { status: 403, headers });
          if (!(await stat(actualFile)).isFile()) return new Response("Not found", { status: 404, headers });
          return new Response(Bun.file(actualFile), { headers });
        } catch {
          return new Response("Not found", { status: 404, headers });
        }
      },
    });
    let stopping: Promise<void> | undefined;
    return {
      url: `http://127.0.0.1:${server.port}`,
      server,
      stop() {
        return (stopping ??= (async () => {
          ready = false;
          if (timer) clearTimeout(timer);
          clearInterval(heartbeat);
          for (const client of clients) {
            try {
              client.close();
            } catch {}
          }
          clients.clear();
          server.stop(true);
          await analytics?.stop();
          await Promise.all(remotes.map((remote) => remote.stop()));
          await collector!.stop();
        })());
      },
    };
  } catch (error) {
    ready = false;
    if (timer) clearTimeout(timer);
    if (heartbeat) clearInterval(heartbeat);
    await analytics?.stop();
    await Promise.all(remotes.map((remote) => remote.stop()));
    if (collector) await collector.stop();
    throw error;
  }
}
