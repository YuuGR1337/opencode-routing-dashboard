import { afterEach, expect, test } from "bun:test";
import { appendFile, mkdtemp, rename, rm, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startTail } from "../src/sources/tail";

const dirs: string[] = [];
const tails: Awaited<ReturnType<typeof startTail>>[] = [];
afterEach(async () => {
  await Promise.all(tails.splice(0).map((tail) => tail.stop()));
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});
async function setup(initial?: string, options: { watch?: boolean; maxLineBytes?: number } = {}) {
  const dir = await mkdtemp(join(tmpdir(), "tail-test-"));
  dirs.push(dir);
  const path = join(dir, "log");
  if (initial !== undefined) await writeFile(path, initial);
  const lines: string[] = [];
  const statuses: string[] = [];
  let malformed = 0;
  const tail = await startTail({
    path,
    pollMs: 10,
    ...options,
    onLine: (line) => lines.push(line),
    onStatus: (status) => statuses.push(status),
    onMalformed: () => {
      malformed++;
    },
  });
  tails.push(tail);
  return { path, lines, statuses, tail, malformed: () => malformed };
}

test("initial drain, append and partial UTF-8", async () => {
  const t = await setup("first\npartial");
  expect(t.lines).toEqual(["first"]);
  await appendFile(t.path, Buffer.from([0xe2, 0x82]));
  await t.tail.drain();
  expect(t.lines).toEqual(["first"]);
  await appendFile(t.path, Buffer.from([0xac, 10]));
  await t.tail.drain();
  expect(t.lines).toEqual(["first", "partial€"]);
});

test("initial drain handles 10,000 lines", async () => {
  const t = await setup("line\n".repeat(10_000));
  expect(t.lines).toHaveLength(10_000);
  expect(t.lines[9_999]).toBe("line");
});

test("missing then created, polling only", async () => {
  const t = await setup(undefined, { watch: false });
  expect(t.statuses).toContain("missing");
  await writeFile(t.path, "created\n");
  await Bun.sleep(80);
  expect(t.lines).toEqual(["created"]);
  expect(t.statuses).toContain("ok");
});

test("rotation drains old file and follows replacement", async () => {
  const t = await setup("old\n");
  await appendFile(t.path, "last\n");
  await rename(t.path, `${t.path}.1`);
  await writeFile(t.path, "new\n");
  await t.tail.drain();
  expect(t.lines).toEqual(["old", "last", "new"]);
});

test("truncation resets offset and partial line", async () => {
  const t = await setup("old\nunfinished");
  await truncate(t.path, 0);
  await t.tail.drain();
  await appendFile(t.path, "new\n");
  await t.tail.drain();
  expect(t.lines).toEqual(["old", "new"]);
});

test("oversized line counted once and recovery", async () => {
  const t = await setup("", { maxLineBytes: 4 });
  await appendFile(t.path, "12345");
  await t.tail.drain();
  await appendFile(t.path, "678\nok\n");
  await t.tail.drain();
  expect(t.malformed()).toBe(1);
  expect(t.lines).toEqual(["ok"]);
});

test("stop is idempotent and prevents callbacks", async () => {
  const t = await setup("one\n");
  await Promise.all([t.tail.stop(), t.tail.stop()]);
  await appendFile(t.path, "two\n");
  await t.tail.drain();
  await Bun.sleep(30);
  expect(t.lines).toEqual(["one"]);
});

test("burst drain requests coalesce to one pending operation", async () => {
  const t = await setup("start\n", { watch: false });
  await appendFile(t.path, "next\n");
  const requests = Array.from({ length: 1000 }, () => t.tail.drain());
  expect(new Set(requests).size).toBeLessThanOrEqual(2);
  await Promise.all(requests);
  expect(t.lines).toEqual(["start", "next"]);
});

test("drain and stop finish while a producer keeps appending", async () => {
  const t = await setup("", { watch: false });
  let producing = true;
  const producer = (async () => {
    while (producing) await appendFile(t.path, "x\n".repeat(4096));
  })();
  try {
    await appendFile(t.path, "first\n");
    const completed = await Promise.race([t.tail.drain().then(() => true), Bun.sleep(1000).then(() => false)]);
    expect(completed).toBe(true);
    const stopped = await Promise.race([t.tail.stop().then(() => true), Bun.sleep(1000).then(() => false)]);
    expect(stopped).toBe(true);
  } finally {
    producing = false;
    await producer;
  }
});
