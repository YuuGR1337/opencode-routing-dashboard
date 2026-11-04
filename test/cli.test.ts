import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const cli = resolve(import.meta.dir, "../src/cli.ts");
const fixture = resolve(import.meta.dir, "../fixtures/stats.json");
const dir = await mkdtemp(join(tmpdir(), "ord-cli-"));
afterAll(() => rm(dir, { recursive: true, force: true }));

async function run(...args: string[]) {
  const child = Bun.spawn([process.execPath, cli, ...args], {
    cwd: dir,
    env: { PATH: process.env.PATH, HOME: dir },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { stdout, stderr, code };
}

describe("CLI", () => {
  test("help documents commands from another cwd", async () => {
    const result = await run("--help");
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("snapshot");
    expect(result.stdout).toContain("serve");
  });

  test("rejects invalid flags", async () => {
    const result = await run("snapshot", "--not-a-flag");
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Unknown option: --not-a-flag");
  });

  test("preserves version", async () => {
    const { VERSION } = await import("../src/cli");
    expect(VERSION).toBe("0.1.0");
  });

  test("captures a snapshot and exits without starting HTTP", async () => {
    const snapshots = join(dir, "snapshots");
    const result = await run("snapshot", "--state-dir", dir, "--snapshot-dir", snapshots, "--stats-file", fixture);
    expect(result.code).toBe(0);
    expect(result.stdout).not.toContain("http://");
    expect((await readdir(snapshots)).length).toBeGreaterThan(0);
  });
});
