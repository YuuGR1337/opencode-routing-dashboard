import { expect, test } from "bun:test";
import { assertNoProxy, parseRemoteEnvelope, startRemote } from "../src/sources/remote";

test("proxy guard rejects every proxy setting even with bypass", () => {
  for (const key of ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy"]) {
    expect(() => assertNoProxy({ [key]: "http://sentinel", NO_PROXY: "*" })).toThrow(
      "Proxy configuration is not supported",
    );
  }
  expect(() => assertNoProxy({})).not.toThrow();
});

test("subprocess fails before a configured proxy receives bearer credentials", async () => {
  let hits = 0;
  const proxy = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () => {
      hits++;
      return new Response();
    },
  });
  const code = `import { startRemote } from './src/sources/remote'; try { startRemote({id:'pc',label:'PC',endpoint:'http://example.invalid'}, {token:'sentinel-token',onUpdate(){},onStatus(){}}); console.log('unexpected'); process.exit(2); } catch (e) { console.log(e.message); }`;
  try {
    const child = Bun.spawn([process.execPath, "-e", code], {
      env: { PATH: process.env.PATH, HTTP_PROXY: `http://127.0.0.1:${proxy.port}`, NO_PROXY: "" },
      stdout: "pipe",
      stderr: "pipe",
    });
    const [out, err, exit] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    expect(exit).toBe(0);
    expect(hits).toBe(0);
    expect(out).toContain("Proxy configuration is not supported");
    expect(out + err).not.toContain("sentinel-token");
    expect(out + err).not.toContain(String(proxy.port));
  } finally {
    proxy.stop(true);
  }
});

test("rejects oversized remote history snapshots and total history", async () => {
  const stats = await Bun.file("fixtures/stats.json").json();
  const base = {
    observe: [],
    route: [],
    permissions: [],
    stats: null,
    malformed: { observe: 0, route: 0, permissions: 0 },
  };
  const env = (history: unknown[]) => ({ version: 1, epoch: "e", seq: 0, input: { ...base, history } });
  expect(
    parseRemoteEnvelope(env([{ date: "2026-01-01", stats: { ...stats, extra: "x".repeat(1024 * 1024) } }])),
  ).toBeNull();
  const snapshot = { ...stats, extra: "x".repeat(750 * 1024) };
  expect(
    parseRemoteEnvelope(env(Array.from({ length: 3 }, (_, i) => ({ date: `2026-01-0${i + 1}`, stats: snapshot })))),
  ).toBeNull();
});

test("marks a peer with oversized history stale without publishing it", async () => {
  const stats = await Bun.file("fixtures/stats.json").json();
  const input = {
    observe: [],
    route: [],
    permissions: [],
    stats: null,
    malformed: { observe: 0, route: 0, permissions: 0 },
    history: [{ date: "2026-01-01", stats: { ...stats, extra: "x".repeat(1024 * 1024) } }],
  };
  const server = Bun.serve({ port: 0, fetch: () => Response.json({ version: 1, epoch: "e", seq: 0, input }) });
  let complete!: () => void;
  const done = new Promise<void>((resolve) => {
    complete = resolve;
  });
  let updates = 0;
  const remote = startRemote(
    { id: "pc", label: "PC", endpoint: `http://127.0.0.1:${server.port}` },
    {
      retryBaseMs: 10000,
      onUpdate: () => {
        updates++;
      },
      onStatus: (status) => {
        if (status === "stale") complete();
      },
    },
  );
  try {
    await done;
    expect(updates).toBe(0);
  } finally {
    await remote.stop();
    server.stop(true);
  }
});

test("reads fragmented CRLF and UTF-8 SSE replacement containing 10000 records", async () => {
  const empty = {
    observe: [],
    route: [],
    permissions: [],
    stats: null,
    malformed: { observe: 0, route: 0, permissions: 0 },
  };
  const records = Array.from({ length: 10000 }, (_, i) => ({
    ts: "2026-01-01T00:00:00Z",
    session: String(i),
    message: null,
    agent: null,
    prompt: "aé",
    model: "m",
    latency_ms: 1,
    error: "x",
  }));
  const payload = new TextEncoder().encode(
    `: heartbeat\r\n\r\nevent: delta\r\ndata: ${JSON.stringify({ version: 1, epoch: "e", seq: 1, input: { ...empty, observe: records } })}\r\n\r\n`,
  );
  const server = Bun.serve({
    port: 0,
    fetch: (request) => {
      if (new URL(request.url).pathname === "/api/source")
        return Response.json({ version: 1, epoch: "e", seq: 0, input: empty });
      let pos = 0;
      return new Response(
        new ReadableStream({
          pull(controller) {
            if (pos === payload.length) return controller.close();
            const end = Math.min(pos + 257, payload.length);
            controller.enqueue(payload.subarray(pos, end));
            pos = end;
          },
        }),
        { headers: { "content-type": "text/event-stream" } },
      );
    },
  });
  let complete!: () => void;
  const done = new Promise<void>((resolve) => {
    complete = resolve;
  });
  let received = 0;
  const remote = startRemote(
    { id: "pc", label: "PC", endpoint: `http://127.0.0.1:${server.port}` },
    {
      onUpdate: (input) => {
        if (input.observe.length) {
          received = input.observe.length;
          complete();
        }
      },
      onStatus: () => {},
    },
  );
  try {
    await done;
    expect(received).toBe(10000);
  } finally {
    await remote.stop();
    server.stop(true);
  }
}, 15000);

test("validates full replacement envelopes", () => {
  const input = {
    observe: [],
    route: [],
    permissions: [],
    stats: null,
    malformed: { observe: 0, route: 0, permissions: 0 },
  };
  const envelope = { version: 1 as const, epoch: "epoch", seq: 0, input };
  expect(parseRemoteEnvelope(envelope)).toEqual(envelope);
  expect(
    parseRemoteEnvelope({ ...envelope, input: { ...input, malformed: { ...input.malformed, route: -1 } } }),
  ).toBeNull();
  expect(parseRemoteEnvelope({ ...envelope, seq: -1 })).toBeNull();
  expect(parseRemoteEnvelope({ ...envelope, input: { ...input, token: "sentinel" } })?.input).not.toHaveProperty(
    "token",
  );
});

test("does not follow redirects or expose tokens in health details", async () => {
  let hits = 0;
  const target = Bun.serve({
    port: 0,
    fetch: () => {
      hits++;
      return new Response();
    },
  });
  const origin = Bun.serve({ port: 0, fetch: () => Response.redirect(`http://127.0.0.1:${target.port}/`) });
  const details: string[] = [];
  let complete!: () => void;
  const failed = new Promise<void>((resolve) => {
    complete = resolve;
  });
  const remote = startRemote(
    { id: "pc", label: "PC", endpoint: `http://127.0.0.1:${origin.port}` },
    {
      token: "sentinel-secret",
      onUpdate: () => {},
      onStatus: (status, detail) => {
        if (detail) details.push(detail);
        if (status === "stale") complete();
      },
    },
  );
  try {
    await failed;
    await remote.stop();
    expect(hits).toBe(0);
    expect(details.join()).not.toContain("sentinel-secret");
  } finally {
    await remote.stop();
    origin.stop(true);
    target.stop(true);
  }
});

test("applies replacement snapshots and restarts without duplicates", async () => {
  const input = {
    observe: [],
    route: [],
    permissions: [],
    stats: null,
    malformed: { observe: 0, route: 0, permissions: 0 },
  };
  const envelope = (epoch: string, seq: number) => ({ version: 1, epoch, seq, input });
  const server = Bun.serve({
    port: 0,
    fetch: (request) =>
      new URL(request.url).pathname === "/api/source"
        ? Response.json(envelope("a", 1))
        : new Response(
            `event: delta\ndata: ${JSON.stringify(envelope("a", 3))}\n\nevent: snapshot\ndata: ${JSON.stringify(envelope("b", 0))}\n\n`,
            { headers: { "content-type": "text/event-stream" } },
          ),
  });
  const updates: string[] = [];
  let complete!: () => void;
  const done = new Promise<void>((resolve) => {
    complete = resolve;
  });
  const remote = startRemote(
    { id: "pc", label: "PC", endpoint: `http://127.0.0.1:${server.port}` },
    {
      onUpdate: (_input, e) => {
        updates.push(`${e.epoch}:${e.seq}`);
        if (updates.length === 3) complete();
      },
      onStatus: () => {},
    },
  );
  try {
    await done;
    await remote.stop();
    expect(updates).toEqual(["a:1", "a:3", "b:0"]);
  } finally {
    await remote.stop();
    server.stop(true);
  }
});

test("times out stalled responses and stops retrying", async () => {
  let hits = 0;
  const server = Bun.serve({
    port: 0,
    fetch: () => {
      hits++;
      return new Response(new ReadableStream({ start() {} }));
    },
  });
  let complete!: () => void;
  const failed = new Promise<void>((resolve) => {
    complete = resolve;
  });
  const remote = startRemote(
    { id: "pc", label: "PC", endpoint: `http://127.0.0.1:${server.port}` },
    {
      connectTimeoutMs: 20,
      idleTimeoutMs: 20,
      retryBaseMs: 10000,
      onUpdate: () => {},
      onStatus: (status) => {
        if (status === "stale") complete();
      },
    },
  );
  try {
    await failed;
    await remote.stop();
    expect(hits).toBe(1);
  } finally {
    await remote.stop();
    server.stop(true);
  }
});

for (const kind of ["body", "sse"] as const)
  test(`rejects oversized ${kind}`, async () => {
    const input = {
      observe: [],
      route: [],
      permissions: [],
      stats: null,
      malformed: { observe: 0, route: 0, permissions: 0 },
    };
    const server = Bun.serve({
      port: 0,
      fetch: (request) => {
        if (kind === "sse" && new URL(request.url).pathname === "/api/source")
          return Response.json({ version: 1, epoch: "a", seq: 0, input });
        return new Response(`${kind === "sse" ? "data: " : ""}${"x".repeat(16 * 1024 * 1024 + 1)}`);
      },
    });
    let complete!: () => void;
    const failed = new Promise<void>((resolve) => {
      complete = resolve;
    });
    const remote = startRemote(
      { id: "pc", label: "PC", endpoint: `http://127.0.0.1:${server.port}` },
      {
        retryBaseMs: 10000,
        onUpdate: () => {},
        onStatus: (status) => {
          if (status === "stale") complete();
        },
      },
    );
    try {
      await failed;
      await remote.stop();
    } finally {
      await remote.stop();
      server.stop(true);
    }
  });
