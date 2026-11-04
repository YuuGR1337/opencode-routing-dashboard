import { open, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

let dir: string | undefined;
let interval = 500;
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  const flag = args[i];
  const value = args[++i];
  if (!value || value.startsWith("--")) throw new Error(`Missing value for ${flag}`);
  if (flag === "--dir") dir = value;
  else if (flag === "--interval-ms" && /^\d+$/.test(value) && Number.isSafeInteger(Number(value)))
    interval = Number(value);
  else throw new Error(`Invalid option: ${flag}`);
}
if (!dir || !(await stat(dir)).isDirectory()) throw new Error("--dir must name an existing temporary directory");
const outputDir = resolve(dir);
const sources = ["observe", "route", "permissions"] as const;
const records: { source: (typeof sources)[number]; line: string; time: number }[] = [];
for (const source of sources) {
  const text = await Bun.file(`fixtures/jev-${source}.jsonl`).text();
  for (const line of text.split("\n").filter(Boolean)) {
    let time = Number.POSITIVE_INFINITY;
    try {
      const value: unknown = JSON.parse(line);
      if (typeof value === "object" && value !== null && "ts" in value && typeof value.ts === "string") {
        const parsed = Date.parse(value.ts);
        if (Number.isFinite(parsed)) time = parsed;
      }
    } catch {
      /* Preserve malformed fixture lines for error counts. */
    }
    records.push({ source, line, time });
  }
}
records.sort((a, b) => a.time - b.time);
const handles = new Map<(typeof sources)[number], Awaited<ReturnType<typeof open>>>();
try {
  for (const source of sources) handles.set(source, await open(join(outputDir, `jev-${source}.jsonl`), "wx"));
  console.log(
    `Replaying fixture events into ${outputDir}. Set ORD_STATE_DIR to this directory, ORD_DEMO=true, and ORD_STATS_FILE=fixtures/stats.json for fixture stats.`,
  );
  for (const record of records) {
    await handles.get(record.source)!.appendFile(`${record.line}\n`);
    if (interval) await Bun.sleep(interval);
  }
} finally {
  await Promise.all([...handles.values()].map((handle) => handle.close()));
}
