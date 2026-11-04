import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../src/config";
import { loadSnapshots, snapshotOnce, writeWeeklySnapshot } from "../src/sources/snapshots";

test("weekly snapshot roundtrips on the local Monday", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ord-snapshot-"));
  try {
    const stats = await Bun.file("fixtures/stats.json").json();
    const result = await writeWeeklySnapshot(dir, stats, new Date(2026, 0, 4, 12));
    expect(result.path).toBe(join(dir, "2025-12-29.json"));
    expect(result.created).toBe(true);
    expect((await loadSnapshots(dir)).snapshots).toEqual([{ date: "2025-12-29", stats }]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("concurrent writers preserve the existing file and invalid stats never write", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ord-snapshot-"));
  try {
    const stats = await Bun.file("fixtures/stats.json").json();
    const results = await Promise.all(
      Array.from({ length: 8 }, () => writeWeeklySnapshot(dir, stats, new Date(2026, 1, 2))),
    );
    expect(results.filter((result) => result.created)).toHaveLength(1);
    const before = await readFile(results[0]!.path, "utf8");
    expect((await writeWeeklySnapshot(dir, { ...stats, custom: "changed" }, new Date(2026, 1, 2))).created).toBe(false);
    expect(await readFile(results[0]!.path, "utf8")).toBe(before);
    await expect(writeWeeklySnapshot(dir, {} as any)).rejects.toThrow("Invalid stats");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("loader rejects invalid dates, schemas, symlinks and directories, ignoring temp files", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ord-snapshot-"));
  try {
    await writeFile(join(dir, "2026-02-30.json"), "{}");
    await writeFile(join(dir, "wrong.json"), "{}");
    await writeFile(join(dir, "2026-02-01.json"), "{}");
    await symlink(join(dir, "2026-02-01.json"), join(dir, "2026-02-02.json"));
    await mkdir(join(dir, "2026-02-03.json"));
    await writeFile(join(dir, ".snapshot-temp.tmp"), "garbage");
    const loaded = await loadSnapshots(dir);
    expect(loaded.snapshots).toEqual([]);
    expect(loaded.status.malformed).toBe(5);
    expect((await loadSnapshots(join(dir, "missing"))).status.status).toBe("missing");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("loader caps count and bytes and reports omissions", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ord-snapshot-"));
  try {
    const stats = await Bun.file("fixtures/stats.json").text();
    for (let i = 0; i < 55; i++) {
      const date = new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10);
      await writeFile(join(dir, `${date}.json`), stats);
    }
    let loaded = await loadSnapshots(dir);
    expect(loaded.snapshots).toHaveLength(52);
    expect(loaded.status.omitted).toBe(3);
    await writeFile(join(dir, "2026-01-01.json"), "x".repeat(1024 * 1024 + 1));
    loaded = await loadSnapshots(dir);
    expect(loaded.status.omitted).toBe(4);
    await rm(dir, { recursive: true, force: true });
    await mkdir(dir);
    const large = JSON.stringify({ ...JSON.parse(stats), extra: "x".repeat(800000) });
    for (const day of ["01", "02", "03"]) await writeFile(join(dir, `2026-01-${day}.json`), large);
    loaded = await loadSnapshots(dir);
    expect(loaded.snapshots).toHaveLength(2);
    expect(loaded.status.omitted).toBe(1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("snapshotOnce uses fixture stats and reports disabled or invalid stats", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ord-snapshot-"));
  try {
    const config = loadConfig(
      { ORD_STATE_DIR: dir, ORD_STATS_FILE: "fixtures/stats.json", ORD_STATS_COMMAND: "/not/a/command" },
      [],
    );
    expect((await snapshotOnce(config)).created).toBe(true);
    expect((await loadSnapshots(config.snapshotDir)).snapshots).toHaveLength(1);
    await expect(snapshotOnce({ ...config, statsEnabled: false })).rejects.toThrow("disabled");
    await writeFile(join(dir, "bad.json"), "{}");
    await expect(snapshotOnce({ ...config, statsFile: join(dir, "bad.json") })).rejects.toThrow("Invalid stats schema");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
