import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("export CLI produces only a report from initial local files and stats", async () => {
  const dir = await mkdtemp(join(tmpdir(), "report-cli-"));
  try {
    await writeFile(join(dir, "jev-observe.jsonl"), `${await Bun.file("fixtures/report.json").text()}\n`);
    const child = Bun.spawn(
      [
        "bun",
        "src/cli.ts",
        "export",
        "--from",
        "2026-11-04",
        "--to",
        "2026-11-04",
        "--format",
        "csv",
        "--state-dir",
        dir,
        "--stats-file",
        "fixtures/stats.json",
      ],
      { stdout: "pipe", stderr: "pipe" },
    );
    const [out, err, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    expect(code).toBe(0);
    expect(err).toBe("");
    expect(out.startsWith("section,source_id,source_label,item,value,status_or_reason\r\n")).toBe(true);
    expect(out).toContain("fixture_session");
    expect(out).toContain("different range");
    expect(out).not.toContain("synthetic placeholder");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("export rejects invalid options without stdout", async () => {
  for (const args of [
    ["--from", "2026-02-30", "--to", "2026-03-01", "--format", "md"],
    ["--from", "2026-01-01", "--to", "2026-01-01", "--format", "html"],
    ["--from", "2026-01-01"],
  ]) {
    const child = Bun.spawn(["bun", "src/cli.ts", "export", ...args], { stdout: "pipe", stderr: "pipe" });
    const [out, err, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    expect(code).toBe(1);
    expect(out).toBe("");
    expect(err.length).toBeGreaterThan(0);
  }
});

test("export includes authenticated remote snapshot and rejects missing tokens and reserved ids", async () => {
  const dir = await mkdtemp(join(tmpdir(), "report-remote-"));
  let authorized = false;
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch(req) {
      authorized = req.headers.get("authorization") === "Bearer test-only-token";
      if (!authorized) return new Response("unauthorized", { status: 401 });
      return Response.json({
        version: 1,
        epoch: "fixture",
        seq: 1,
        input: {
          observe: [
            {
              ts: "2026-11-04T12:00:00Z",
              session: "remote_session",
              message: null,
              agent: null,
              prompt: "synthetic",
              model: "classifier",
              latency_ms: 12,
              error: "synthetic",
            },
          ],
          route: [],
          permissions: [],
          stats: null,
          malformed: { observe: 0, route: 0, permissions: 0 },
        },
      });
    },
  });
  try {
    const config = join(dir, "sources.json");
    const source = {
      id: "pc",
      label: "PC",
      endpoint: `http://127.0.0.1:${server.port}`,
      tokenEnv: "REPORT_TEST_TOKEN",
    };
    const args = [
      "bun",
      "src/cli.ts",
      "export",
      "--from",
      "2026-11-04",
      "--to",
      "2026-11-04",
      "--format",
      "md",
      "--state-dir",
      dir,
      "--stats-enabled",
      "false",
      "--config",
      config,
    ];
    await writeFile(config, JSON.stringify([source]));
    const run = async (env: NodeJS.ProcessEnv) => {
      const child = Bun.spawn(args, { stdout: "pipe", stderr: "pipe", env });
      return Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
    };
    const [out, err, code] = await run({ ...process.env, REPORT_TEST_TOKEN: "test-only-token" });
    expect(code).toBe(0);
    expect(err).toBe("");
    expect(out).toContain("remote_session");
    expect(authorized).toBe(true);
    const env = { ...process.env };
    delete env.REPORT_TEST_TOKEN;
    const missing = await run(env);
    expect(missing[2]).toBe(1);
    expect(missing[0]).toBe("");
    await writeFile(config, JSON.stringify([{ ...source, id: "local" }]));
    const reserved = await run({ ...process.env, REPORT_TEST_TOKEN: "test-only-token" });
    expect(reserved[2]).toBe(1);
    expect(reserved[0]).toBe("");
  } finally {
    server.stop(true);
    await rm(dir, { recursive: true, force: true });
  }
});

test("export fails instead of omitting an unavailable remote", async () => {
  const dir = await mkdtemp(join(tmpdir(), "report-offline-"));
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch: () => new Response("unavailable", { status: 503 }),
  });
  try {
    const config = join(dir, "sources.json");
    await writeFile(config, JSON.stringify([{ id: "pc", label: "PC", endpoint: `http://127.0.0.1:${server.port}` }]));
    const child = Bun.spawn(
      [
        "bun",
        "src/cli.ts",
        "export",
        "--from",
        "2026-11-04",
        "--to",
        "2026-11-04",
        "--format",
        "csv",
        "--state-dir",
        dir,
        "--stats-enabled",
        "false",
        "--config",
        config,
      ],
      { stdout: "pipe", stderr: "pipe" },
    );
    const [out, err, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    expect(code).toBe(1);
    expect(out).toBe("");
    expect(err).toContain("Remote source unavailable");
  } finally {
    server.stop(true);
    await rm(dir, { recursive: true, force: true });
  }
}, 15000);
