import { expect, test } from "bun:test";
import { aggregate } from "../src/core/aggregate";
import { buildReport, formatReport, parseReportRange } from "../src/core/reports";
import { parseStats } from "../src/core/schema";

test("date bounds include the full UTC end date", () => {
  expect(parseReportRange("2026-11-04", "2026-11-04")).toEqual({
    from: Date.parse("2026-11-04T00:00:00Z"),
    to: Date.parse("2026-11-05T00:00:00Z"),
  });
});

test("rejects malformed, normalized and reversed dates", () => {
  for (const [from, to] of [
    ["2026-02-30", "2026-03-01"],
    ["2026-01-01T00:00:00", "2026-01-02"],
    ["2026-02-01", "2026-01-01"],
    ["2026-01-01T25:00:00Z", "2026-01-02"],
  ]) {
    expect(() => parseReportRange(from!, to!)).toThrow();
  }
});

test("reports independent sources, coverage, unknowns and escaped data", async () => {
  const stats = parseStats(await Bun.file("fixtures/stats.json").json())!;
  const range = parseReportRange("2026-11-04", "2026-11-04");
  const state = aggregate({
    observe: [
      {
        ts: "2026-11-04T12:00:00Z",
        session: "=shared",
        message: "m",
        agent: "fixer",
        prompt: "private prompt",
        model: "classifier",
        latency_ms: 42,
        error: "bad|line\nnext",
      },
      {
        ts: "2026-11-05T00:00:00Z",
        session: "outside",
        message: null,
        agent: null,
        prompt: "private",
        model: "classifier",
        latency_ms: 1,
        error: "bad",
      },
    ],
    route: [],
    permissions: [],
    stats: { ...stats, cost: 0 },
    malformed: { observe: 1, route: 0, permissions: 0 },
    evicted: { observe: 2, route: 3, permissions: 4 },
  });
  const report = buildReport(
    [
      { id: "pc", label: " +danger", state },
      { id: "orca", label: "Orca", state: { ...state, stats: null } },
    ],
    range,
  );
  expect(report.sources.map((s) => s.events.length)).toEqual([1, 1]);
  expect(report.sources[0]!.stats.status).toBe("different range");
  expect(report.sources[1]!.stats.status).toBe("unavailable");
  expect(report.sources[0]!.events[0]!.contextAgreement).toBeNull();
  const csv = formatReport(report, "csv");
  expect(csv).toContain("' +danger");
  expect(csv).toContain("'=shared");
  expect(csv).toContain('"bad|line\nnext"');
  expect(csv).not.toContain("private prompt");
  expect(csv).not.toContain("outside");
  expect(csv).toContain("different range");
  expect(csv).toContain(",0,");
  const md = formatReport(report, "md");
  expect(md).toContain("bad\\|line<br>next");
  expect(md).toContain("not detectable");
  expect(md).toContain("retained");
  expect(md).not.toContain("private prompt");
});

test("exact stats range is distinct from unavailable and CSV quotes formula text", async () => {
  const range = parseReportRange("2026-11-04T00:00:00Z", "2026-11-05T00:00:00Z");
  const stats = parseStats(await Bun.file("fixtures/stats.json").json())!;
  const state = aggregate({
    observe: [],
    route: [],
    permissions: [],
    stats: { ...stats, range },
    malformed: { observe: 0, route: 0, permissions: 0 },
  });
  const report = buildReport([{ id: "\t=evil", label: '  @"x,y"', state }], range);
  expect(report.sources[0]!.stats.status).toBe("matches");
  const csv = formatReport(report, "csv");
  expect(csv).toContain("'\t=evil");
  expect(csv).toContain('"\'  @""x,y"""');
});

test("range coverage conservatively identifies missing evidence and oldest included event", async () => {
  const record = await Bun.file("fixtures/report.json").json();
  const range = parseReportRange("2026-11-04", "2026-11-04");
  const state = aggregate({
    observe: [record],
    route: [],
    permissions: [],
    stats: null,
    malformed: { observe: 0, route: 0, permissions: 0 },
  });
  const reportFor = (value: typeof state) => buildReport([{ id: "local", label: "Local", state: value }], range);
  const complete = reportFor(state);
  expect(complete.sources[0]).toMatchObject({
    rangeComplete: true,
    oldestIncludedTs: "2026-11-04T12:00:00Z",
    rangeCompleteReason:
      "Complete within retained source evidence; historical logs before retention are not guaranteed.",
  });
  expect(formatReport(complete, "csv")).toContain(
    "coverage,local,Local,range completeness,true,Complete within retained source evidence; historical logs before retention are not guaranteed.",
  );
  const omitted = reportFor({ ...state, window: { ...state.window, events: { retained: 2, sent: 1, omitted: 1 } } });
  expect(omitted.sources[0]!.rangeComplete).toBe(false);
  expect(omitted.sources[0]!.oldestIncludedTs).toBe("2026-11-04T12:00:00Z");
  expect(formatReport(omitted, "md")).toContain(
    "| range completeness | false | Omitted, evicted or malformed evidence may overlap the requested range. |",
  );
  const evicted = reportFor({
    ...state,
    events: [],
    window: { ...state.window, evicted: { observe: 1, route: 0, permissions: 0 } },
  });
  expect(evicted.sources[0]).toMatchObject({ rangeComplete: false, oldestIncludedTs: null });
  const malformed = reportFor({
    ...state,
    errors: { ...state.errors, malformed: { observe: 0, route: 1, permissions: 0 } },
  });
  expect(malformed.sources[0]!.rangeComplete).toBe(false);
});
