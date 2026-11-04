import { realpath, stat } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import type { Config } from "../config";
import { aggregate, type DashboardInput, MAX_PAYLOAD_BYTES, type Source } from "../core/aggregate";
import { parseLine } from "../core/schema";
import { startStats } from "../sources/stats";
import { startTail } from "../sources/tail";

export async function startApp(config: Config, options: { heartbeatMs?: number; staticDir?: string } = {}) {
  const names: Source[] = ["observe", "route", "permissions"];
  const paths = {
    observe: join(config.stateDir, "jev-observe.jsonl"),
    route: join(config.stateDir, "jev-route.jsonl"),
    permissions: join(config.stateDir, "jev-permissions.jsonl"),
  };
  const input: DashboardInput = {
    observe: [],
    route: [],
    permissions: [],
    stats: null,
    malformed: { observe: 0, route: 0, permissions: 0 },
    evicted: { observe: 0, route: 0, permissions: 0 },
    sources: {
      observe: { status: "missing", path: paths.observe },
      route: { status: "missing", path: paths.route },
      permissions: { status: "missing", path: paths.permissions },
    },
  };
  let state = aggregate(input);
  let seq = 0;
  let ready = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const clients = new Set<ReadableStreamDefaultController<Uint8Array>>();
  const encoder = new TextEncoder();
  // Delta events intentionally contain the complete state and sequence, making each event self-contained.
  const maxPayload = MAX_PAYLOAD_BYTES;
  const publish = () => {
    timer = undefined;
    state = aggregate(input);
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
  const tails: Awaited<ReturnType<typeof startTail>>[] = [];
  let stats: Awaited<ReturnType<typeof startStats>> | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  try {
    for (const source of names) {
      tails.push(
        await startTail({
          path: paths[source],
          onLine(line: string) {
            const parsed = parseLine(source, line);
            if (!parsed.ok) input.malformed[source]++;
            else {
              if (parsed.source === "observe") input.observe.push(parsed.record);
              else if (parsed.source === "route") input.route.push(parsed.record);
              else input.permissions.push(parsed.record);
              const records = input[source];
              if (records.length > config.maxRecords) {
                const excess = records.length - config.maxRecords;
                input.evicted![source] += excess;
                records.splice(0, excess);
              }
            }
            changed();
          },
          onMalformed() {
            input.malformed[source]++;
            changed();
          },
          onStatus(status: "ok" | "missing" | "error", detail?: string) {
            input.sources![source] = { status, path: paths[source], ...(detail ? { detail } : {}) };
            changed();
          },
        }),
      );
    }
    stats = await startStats({
      enabled: config.statsEnabled,
      interval: config.statsInterval,
      command: config.statsCommand,
      file: config.statsFile,
      onUpdate(value, status) {
        input.stats = value;
        input.statsStatus = status;
        changed();
      },
    });
    state = aggregate(input);
    ready = true;
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
        if (url.pathname === "/api/state") return Response.json({ ...state, seq, demo: config.demo }, { headers });
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
        const root = resolve(options.staticDir ?? "dist");
        const file = resolve(root, `.${pathname === "/" ? "/index.html" : pathname}`);
        if (!file.startsWith(root + sep)) return new Response("Forbidden", { status: 403, headers });
        let actualRoot: string;
        try {
          actualRoot = await realpath(root);
          if (!(await stat(actualRoot)).isDirectory()) throw new Error("Not a directory");
        } catch {
          return new Response("Dashboard UI unavailable until M4.", {
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
          await Promise.all([...tails.map((tail) => tail.stop()), stats!.stop()]);
        })());
      },
    };
  } catch (error) {
    ready = false;
    if (timer) clearTimeout(timer);
    if (heartbeat) clearInterval(heartbeat);
    await Promise.all([...tails.map((tail) => tail.stop()), ...(stats ? [stats.stop()] : [])]);
    throw error;
  }
}
