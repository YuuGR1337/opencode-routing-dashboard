import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { link, mkdir, open, readdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import type { Config } from "../config";
import { parseStats, type StatsRecord } from "../core/schema";
import { startStats } from "./stats";

const FILE_CAP = 1024 * 1024;
const TOTAL_CAP = 2 * FILE_CAP;
const COUNT_CAP = 52;
type HistoryStatus = {
  status: "ok" | "missing" | "error";
  path: string;
  malformed: number;
  omitted: number;
  detail?: string;
};
const code = (error: unknown) =>
  typeof error === "object" && error !== null && "code" in error ? error.code : undefined;

export async function writeWeeklySnapshot(
  dir: string,
  stats: StatsRecord,
  now: Date = new Date(),
): Promise<{ path: string; created: boolean }> {
  const validated = parseStats(stats);
  if (!validated) throw new Error("Invalid stats schema; snapshot not written");
  const data = JSON.stringify(validated);
  if (Buffer.byteLength(data) > FILE_CAP) throw new Error("Stats snapshot exceeds size limit");
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  if (!Number.isFinite(monday.getTime())) throw new Error("Invalid snapshot date");
  const date = `${monday.getFullYear().toString().padStart(4, "0")}-${String(monday.getMonth() + 1).padStart(2, "0")}-${String(monday.getDate()).padStart(2, "0")}`;
  const path = join(dir, `${date}.json`);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const temp = join(dir, `.snapshot-${randomUUID()}.tmp`);
  let createdTemp = false;
  try {
    const file = await open(temp, "wx", 0o600);
    createdTemp = true;
    try {
      await file.writeFile(data);
      await file.sync();
    } finally {
      await file.close();
    }
    try {
      await link(temp, path);
      return { path, created: true };
    } catch (error) {
      if (code(error) === "EEXIST") return { path, created: false };
      throw error;
    }
  } finally {
    if (createdTemp) await unlink(temp).catch(() => {});
  }
}

function validDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const d = new Date(`${date}T00:00:00.000Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === date;
}

export async function loadSnapshots(
  dir: string,
): Promise<{ snapshots: { date: string; stats: StatsRecord }[]; status: HistoryStatus }> {
  const status: HistoryStatus = { status: "ok", path: dir, malformed: 0, omitted: 0 };
  const snapshots: { date: string; stats: StatsRecord }[] = [];
  let names: string[];
  try {
    names = await readdir(dir);
  } catch (error) {
    status.status = code(error) === "ENOENT" ? "missing" : "error";
    if (status.status === "error") status.detail = error instanceof Error ? error.message : "Cannot read snapshots";
    return { snapshots, status };
  }
  const candidates: string[] = [];
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    if (!validDate(name.slice(0, -5))) {
      status.malformed++;
      continue;
    }
    candidates.push(name);
  }
  candidates.sort().reverse();
  let bytes = 0;
  for (const name of candidates) {
    if (snapshots.length >= COUNT_CAP) {
      status.omitted++;
      continue;
    }
    let file: Awaited<ReturnType<typeof open>> | undefined;
    try {
      file = await open(join(dir, name), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
      const info = await file.stat();
      if (!info.isFile()) {
        status.malformed++;
        continue;
      }
      if (info.size > FILE_CAP || bytes + info.size > TOTAL_CAP) {
        status.omitted++;
        continue;
      }
      const buffer = Buffer.alloc(info.size + 1);
      let read = 0;
      while (read < buffer.length) {
        const part = await file.read(buffer, read, buffer.length - read, read);
        if (!part.bytesRead) break;
        read += part.bytesRead;
      }
      bytes += read;
      if (read > info.size || bytes > TOTAL_CAP) {
        status.omitted++;
        continue;
      }
      const stats = parseStats(JSON.parse(buffer.subarray(0, read).toString("utf8")));
      if (!stats) {
        status.malformed++;
        continue;
      }
      snapshots.push({ date: name.slice(0, -5), stats });
    } catch {
      status.malformed++;
    } finally {
      await file?.close();
    }
  }
  return { snapshots, status };
}

export async function snapshotOnce(config: Config): Promise<{ path: string; created: boolean }> {
  if (!config.statsEnabled) throw new Error("Stats are disabled; cannot write snapshot");
  let value: StatsRecord | null = null;
  let status: { status: string; detail?: string } = { status: "unavailable" };
  const poller = await startStats({
    enabled: true,
    interval: config.statsInterval,
    command: config.statsCommand,
    file: config.statsFile,
    onUpdate(stats, next) {
      value = stats;
      status = next;
    },
  });
  try {
    await poller.ready;
    if (status.status !== "ok" || !value)
      throw new Error(`Cannot write snapshot: stats ${status.status}${status.detail ? `: ${status.detail}` : ""}`);
    return await writeWeeklySnapshot(config.snapshotDir, value);
  } finally {
    await poller.stop();
  }
}
