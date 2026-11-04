import { describe, expect, test } from "bun:test";
import { parseLine, parseLines, parseObserve, parsePermission, parseRoute, parseStats } from "../src/core/schema";

const fixture = (name: string) => Bun.file(`fixtures/${name}`).text();

describe("source schemas", () => {
  test("parse fixture lines and count malformed input", async () => {
    for (const [source, file, count, malformed] of [
      ["observe", "jev-observe.jsonl", 3, 1],
      ["route", "jev-route.jsonl", 3, 0],
      ["permissions", "jev-permissions.jsonl", 3, 0],
    ] as const) {
      const result = parseLines(source, await fixture(file));
      expect(result.records).toHaveLength(count);
      expect(result.malformed).toBe(malformed);
    }
  });

  test("preserves unknown fields and discriminates errors", async () => {
    const line = (await fixture("jev-observe.jsonl")).split("\n")[0]!;
    const value = { ...JSON.parse(line), extra: { retained: true } };
    expect(parseObserve(value)).toEqual(value);
    expect(parseLine("observe", JSON.stringify(value))).toEqual({ ok: true, source: "observe", record: value });
    expect(parseLine("observe", "{")).toMatchObject({ ok: false, source: "observe", error: expect.any(String) });
    expect(parseLine("observe", "{}")).toMatchObject({ ok: false, source: "observe", error: expect.any(String) });
  });

  test("enforces observe variants, nested values and timestamps", async () => {
    const lines = (await fixture("jev-observe.jsonl")).trim().split("\n");
    const success = JSON.parse(lines[0]!);
    const failure = JSON.parse(lines[2]!);
    expect(parseObserve(failure)).toEqual(failure);
    expect(parseObserve({ ...failure, error: undefined })).toBeNull();
    expect(parseObserve({ ...success, answers: undefined })).toBeNull();
    expect(parseObserve({ ...success, ts: "not a timestamp" })).toBeNull();
    expect(parseObserve({ ...success, latency_ms: Infinity })).toBeNull();
    expect(
      parseObserve({
        ...success,
        answers: { ...success.answers, role: { ...success.answers.role, confidence: "high" } },
      }),
    ).toBeNull();
    expect(
      parseObserve({
        ...success,
        answers: { ...success.answers, role: { ...success.answers.role, probabilities: { fixer: NaN } } },
      }),
    ).toBeNull();
  });

  test("validates route exceptions and permission shapes", async () => {
    const route = JSON.parse((await fixture("jev-route.jsonl")).split("\n")[0]!);
    const exception = { ts: route.ts, session: route.session, decision: "skipped", reason: "exception:boom" } as const;
    expect(parseRoute(exception)).toEqual(exception);
    expect(parseRoute({ ...exception, decision: "injected" })).toBeNull();
    expect(parseRoute({ ...exception, reason: "low_conf" })).toBeNull();
    expect(parseRoute({ ...route, conf: "high" })).toBeNull();
    const permission = JSON.parse((await fixture("jev-permissions.jsonl")).split("\n")[0]!);
    expect(parsePermission(permission)).toEqual(permission);
    expect(parsePermission({ ...permission, commands: [1] })).toBeNull();
    expect(parsePermission({ ...permission, scores: { reversible: 0.2, routine: "yes" } })).toBeNull();
  });

  test("validates stats including nested tokens and tools", async () => {
    const stats = JSON.parse(await fixture("stats.json"));
    expect(parseStats(stats)).toEqual(stats);
    expect(
      parseStats({ ...stats, tokens: { ...stats.tokens, cache: { ...stats.tokens.cache, read: Infinity } } }),
    ).toBeNull();
    expect(
      parseStats({ ...stats, tools: { ...stats.tools, usage: [{ ...stats.tools.usage[0], failed: "1" }] } }),
    ).toBeNull();
    expect(parseStats({ ...stats, models: [{ ...stats.models[0], tokens: null }] })).toBeNull();
    expect(parseStats({ ...stats, range: { ...stats.range, from: "yesterday" } })).toBeNull();
  });
});
