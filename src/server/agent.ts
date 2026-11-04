import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import type { Config } from "../config";
import { type DashboardInput, MAX_PAYLOAD_BYTES } from "../core/aggregate";
import { startCollector } from "../sources/collector";

export async function startAgent(
  config: Config,
  options: { bind?: string; token?: string; redactPrompts?: boolean; heartbeatMs?: number } = {},
): Promise<{ url: string; stop(): Promise<void> }> {
  if (config.maxRecords > 10000) throw new Error("Agent maxRecords cannot exceed 10000");
  const bind = options.bind ?? "127.0.0.1";
  if (config.configFile) throw new Error("Agent cannot use a config file");
  const family = isIP(bind);
  if (!family || bind === "0.0.0.0" || (family === 6 && /^0*(?::0*){1,7}$/.test(bind)))
    throw new Error("Bind must be a concrete IP address");
  const loopback =
    (family === 4 && bind.startsWith("127.")) || (family === 6 && /^(?:::1|0:0:0:0:0:0:0:1)$/i.test(bind));
  if ((!loopback && !options.token) || (options.token !== undefined && options.token.length < 32))
    throw new Error("Token must be at least 32 characters");
  const digest = (value: string) => createHash("sha256").update(value).digest();
  const tokenHash = options.token === undefined ? undefined : digest(options.token);
  const epoch = randomUUID();
  let seq = 0;
  let input: DashboardInput;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  const clients = new Set<ReadableStreamDefaultController<Uint8Array>>();
  const encoder = new TextEncoder();
  const envelope = () => ({
    version: 1,
    epoch,
    seq,
    input: options.redactPrompts
      ? {
          ...input,
          observe: input.observe.map((record) => ({ ...record, prompt: "" })),
          route: input.route.map((record) => ("prompt" in record ? { ...record, prompt: "" } : record)),
        }
      : input,
  });
  const send = (client: ReadableStreamDefaultController<Uint8Array>, data: Uint8Array) => {
    try {
      if (data.byteLength > MAX_PAYLOAD_BYTES || (client.desiredSize ?? 0) <= 0) {
        client.close();
        clients.delete(client);
      } else client.enqueue(data);
    } catch {
      clients.delete(client);
    }
  };
  const collector = await startCollector(config, (next) => {
    if (stopped) return;
    input = next;
    if (!timer)
      timer = setTimeout(() => {
        timer = undefined;
        seq++;
        const data = encoder.encode(`event: delta\ndata: ${JSON.stringify(envelope())}\n\n`);
        for (const client of clients) send(client, data);
      }, 250);
  });
  input = collector.input;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  try {
    const server = Bun.serve({
      hostname: bind,
      port: config.port,
      idleTimeout: 0,
      fetch(request) {
        const url = new URL(request.url);
        const host = request.headers.get("host") ?? "";
        const expected = family === 6 ? `[${bind}]` : bind;
        const allowed = [expected, ...(loopback ? ["localhost"] : [])];
        if (
          !allowed.some((name) => {
            const lower = host.toLowerCase();
            const prefix = name.toLowerCase();
            if (lower === prefix) return true;
            if (!lower.startsWith(`${prefix}:`)) return false;
            const port = lower.slice(prefix.length + 1);
            return (
              /^\d{1,5}$/.test(port) &&
              Number(port) >= 1 &&
              Number(port) <= 65535 &&
              (loopback || Number(port) === server.port)
            );
          })
        )
          return new Response("Forbidden", { status: 403 });
        if (request.headers.has("origin") || request.headers.has("sec-fetch-site") || url.search)
          return new Response("Forbidden", { status: 403 });
        if (tokenHash) {
          const authorization = request.headers.get("authorization") ?? "";
          if (!authorization.startsWith("Bearer ") || !timingSafeEqual(tokenHash, digest(authorization.slice(7))))
            return new Response("Unauthorized", { status: 401 });
        }
        if (request.method !== "GET" && request.method !== "HEAD")
          return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
        if (url.pathname !== "/api/source" && url.pathname !== "/api/events")
          return new Response("Not found", { status: 404 });
        const json = JSON.stringify(envelope());
        const isEvents = url.pathname === "/api/events";
        const data = encoder.encode(isEvents ? `event: snapshot\ndata: ${json}\n\n` : json);
        if (data.byteLength > MAX_PAYLOAD_BYTES) return new Response("State too large", { status: 503 });
        const headers = {
          "Content-Type": isEvents ? "text/event-stream" : "application/json",
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        };
        if (request.method === "HEAD") return new Response(null, { headers });
        if (!isEvents) return new Response(data, { headers });
        if (clients.size >= 64) return new Response("Too many clients", { status: 503 });
        let controller: ReadableStreamDefaultController<Uint8Array>;
        const stream = new ReadableStream<Uint8Array>(
          {
            start(c) {
              controller = c;
              clients.add(c);
              c.enqueue(data);
            },
            cancel() {
              clients.delete(controller);
            },
          },
          { highWaterMark: 2 },
        );
        return new Response(stream, { headers });
      },
    });
    heartbeat = setInterval(() => {
      const data = encoder.encode(": heartbeat\n\n");
      for (const client of clients) send(client, data);
    }, options.heartbeatMs ?? 15000);
    let stopping: Promise<void> | undefined;
    return {
      url: `http://${family === 6 ? `[${bind}]` : bind}:${server.port}`,
      stop() {
        return (stopping ??= (async () => {
          stopped = true;
          if (timer) clearTimeout(timer);
          clearInterval(heartbeat);
          for (const client of clients) {
            try {
              client.close();
            } catch {}
          }
          clients.clear();
          server.stop(true);
          await collector.stop();
        })());
      },
    };
  } catch (error) {
    stopped = true;
    if (timer) clearTimeout(timer);
    if (heartbeat) clearInterval(heartbeat);
    await collector.stop();
    throw error;
  }
}
