import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { aggregate, type DashboardInput, type DashboardState, type FlowEvent } from "../src/core/aggregate";
import { parseLines, parseStats } from "../src/core/schema";
import { DashboardShell, EventDetail } from "../web/App";
import { EMPTY_FILTERS, type FlowFilters } from "../web/filters";
import { AgreementView } from "../web/views/AgreementView";
import { ErrorsView } from "../web/views/ErrorsView";
import { FilterBar } from "../web/views/FilterBar";
import { FlowView } from "../web/views/FlowView";
import { HistoryView } from "../web/views/HistoryView";
import { UsageView } from "../web/views/UsageView";

const NOW = Date.parse("2026-11-04T02:13:10Z");

async function fixtureInput(): Promise<DashboardInput> {
  const observe = parseLines("observe", await Bun.file("fixtures/jev-observe.jsonl").text());
  const route = parseLines("route", await Bun.file("fixtures/jev-route.jsonl").text());
  const permissions = parseLines("permissions", await Bun.file("fixtures/jev-permissions.jsonl").text());
  return {
    observe: observe.records,
    route: route.records,
    permissions: permissions.records,
    stats: parseStats(await Bun.file("fixtures/stats.json").json()),
    malformed: { observe: observe.malformed, route: route.malformed, permissions: permissions.malformed },
    sources: {
      observe: { status: "ok", path: "/state/jev-observe.jsonl" },
      route: { status: "ok", path: "/state/jev-route.jsonl" },
      permissions: { status: "ok", path: "/state/jev-permissions.jsonl" },
    },
    statsStatus: { status: "ok" },
  };
}
const fixtureState = async (): Promise<DashboardState> => aggregate(await fixtureInput(), NOW);
const emptyState = (extra: Partial<DashboardInput> = {}) =>
  aggregate(
    {
      observe: [],
      route: [],
      permissions: [],
      stats: null,
      malformed: { observe: 0, route: 0, permissions: 0 },
      ...extra,
    },
    NOW,
  );
const markup = (node: React.ReactElement) => renderToStaticMarkup(node);

// ---- Agreement ----

test("AgreementView renders the context confusion matrix and the 10-bin confidence histogram", async () => {
  const state = await fixtureState();
  const html = markup(<AgreementView state={state} />);
  expect(html).toContain("context agreement");
  expect(html).toContain("not proof of delegation");
  expect(html).toContain("1 of 2 compared");
  // Fixed five roles on both axes.
  expect(html.match(/data-cell="/g)).toHaveLength(25);
  expect(html).toContain('data-cell="orchestrator:orchestrator" data-count="1"');
  expect(html).toContain('data-cell="fixer:orchestrator" data-count="1"');
  expect(html).toContain('data-cell="oracle:oracle" data-count="0"');
  // Rows are the Jev suggestion, columns are the recorded context agent.
  expect(html).toContain("suggestion");
  expect(html).toContain("context agent");
  // Histogram: 10 bins over 0.0-1.0, with the two fixture confidences in bins 7 and 9.
  expect(html.match(/data-bin="/g)).toHaveLength(10);
  expect(html).toContain('data-bin="7" data-count="1"');
  expect(html).toContain('data-bin="9" data-count="1"');
  expect(html).toContain('data-bin="0" data-count="0"');
  // Events without a suggestion or context agent are excluded and said so.
  expect(html).toContain("excluded");
  expect(html).toContain("retained window");
  expect(html).not.toMatch(/\sstyle=/);
  expect(html).not.toContain("NaN");
});

test("AgreementView states when nothing could be compared", () => {
  const html = markup(<AgreementView state={emptyState()} />);
  expect(html).toContain("nothing compared");
  expect(html).not.toContain("NaN");
  expect(html.match(/data-bin="/g)).toHaveLength(10);
});

test("AgreementView shows context agents outside the five roles instead of dropping them", async () => {
  const state = await fixtureState();
  const odd: DashboardState = {
    ...state,
    agreement: { ...state.agreement, matrix: { fixer: { "custom-agent": 3 } }, compared: 3, agreed: 0, percent: 0 },
  };
  const html = markup(<AgreementView state={odd} />);
  expect(html).toContain('data-cell="fixer:custom-agent" data-count="3"');
});

// ---- Usage ----

test("UsageView breaks stats down by model, provider and variant with every token class", async () => {
  const state = await fixtureState();
  const html = markup(<UsageView state={state} />);
  for (const label of ["by model", "by provider", "by variant"]) expect(html).toContain(label);
  for (const col of ["steps", "input", "output", "reasoning", "cache read", "cache write", "cost"])
    expect(html).toContain(`>${col}<`);
  expect(html).toContain("grok-4.7");
  expect(html).toContain("claude-sonnet-5-5");
  expect(html).toContain("xai");
  expect(html).toContain("claude-code");
  expect(html).toContain("high");
  expect(html).toContain("default");
  expect(html).toContain("25,037,910".slice(0, 3)); // total input is present in some grouping
  expect(html).toContain("431.18");
  expect(html).toContain("2026-10-");
  expect(html).toContain("stats range");
  expect(html).toContain("presets not available");
  expect(html).not.toContain("NaN");
});

test("UsageView never invents a price for providers that report cost 0", async () => {
  const html = markup(<UsageView state={await fixtureState()} />);
  expect(html).toContain("0 reported");
  expect(html).toContain("no price inferred");
  expect(html).not.toContain("$0.00");
});

test("UsageView explains unavailable stats instead of showing zeros", () => {
  const html = markup(
    <UsageView state={emptyState({ statsStatus: { status: "unavailable", detail: "opencode not found" } })} />,
  );
  expect(html).toContain("stats unavailable");
  expect(html).toContain("opencode not found");
  expect(html).not.toContain("<table");
});

// ---- Errors ----

test("ErrorsView lists Jev failures, timeouts, malformed lines, tool failures and permission verdicts", async () => {
  const state = await fixtureState();
  const html = markup(<ErrorsView state={state} />);
  expect(html).toContain("jev failures");
  expect(html).toContain("observe errors");
  expect(html).toContain("route errors");
  expect(html).toContain("timeouts");
  expect(html).toContain("TimeoutError");
  expect(html).toContain("exception:boom");
  expect(html).toContain("malformed (process lifetime)");
  expect(html).toContain("tool failures");
  expect(html).toContain("87 of 7282 calls");
  // Tool failures carry the stats range, separate from the retained log window.
  expect(html).toContain("stats range 2026-10-");
  expect(html).toContain("shell");
  expect(html).toContain("21");
  expect(html).toContain("permission gate");
  for (const verdict of ["ask:low-score", "ask:gate", "ask:risk-list"]) expect(html).toContain(verdict);
  expect(html).toContain("rm -r /tmp/x");
  expect(html).toContain("git push origin feat/x");
  expect(html).toContain("reversible");
  expect(html).toContain("routine");
  expect(html).toContain("retained window");
  expect(html).not.toContain("NaN");
});

test("ErrorsView has designed empty states", () => {
  const html = markup(<ErrorsView state={emptyState()} />);
  expect(html).toContain("no jev failures");
  expect(html).toContain("no permission verdicts");
  expect(html).toContain("tool failures");
  expect(html).toContain("stats unavailable");
});

// ---- History ----

type HistoryStatus = {
  status: "ok" | "missing" | "error";
  path: string;
  malformed: number;
  omitted: number;
  detail?: string;
};
// historyStatus is added to DashboardState by the snapshot lane; tests pass it explicitly.
const withHistoryStatus = (state: DashboardState, historyStatus: HistoryStatus | null) =>
  ({ ...state, historyStatus }) as DashboardState;

test("HistoryView empty state points at the snapshot command and the weekly timer, not at a future milestone", async () => {
  const html = markup(<HistoryView state={await fixtureState()} />);
  expect(html).toContain("no snapshots");
  expect(html).toContain("YYYY-MM-DD.json");
  expect(html).toContain("bun run snapshot");
  expect(html).toContain("weekly timer");
  expect(html).not.toContain("M5");
  expect(html).not.toContain("arrive");
  // The server did not report a directory, so none is invented.
  expect(html).toContain("snapshot directory not reported");
  expect(html).not.toContain("data-multiple");
});

test("HistoryView names the configured snapshot directory when it is empty", async () => {
  const state = withHistoryStatus(await fixtureState(), {
    status: "ok",
    path: "/data/ord/snapshots",
    malformed: 0,
    omitted: 0,
  });
  const html = markup(<HistoryView state={state} />);
  expect(html).toContain("no snapshots in");
  expect(html).toContain("/data/ord/snapshots");
  expect(html).toContain("bun run snapshot");
  expect(html).not.toContain("not reported");
});

test("HistoryView says when the snapshot directory is missing or unreadable", async () => {
  const base = await fixtureState();
  const missing = markup(
    <HistoryView
      state={withHistoryStatus(base, { status: "missing", path: "/nope/snapshots", malformed: 0, omitted: 0 })}
    />,
  );
  expect(missing).toContain("snapshot directory missing");
  expect(missing).toContain("/nope/snapshots");
  expect(missing).toContain("bun run snapshot");
  const broken = markup(
    <HistoryView
      state={withHistoryStatus(base, {
        status: "error",
        path: "/locked/snapshots",
        malformed: 0,
        omitted: 0,
        detail: "EACCES",
      })}
    />,
  );
  expect(broken).toContain("snapshot directory unreadable");
  expect(broken).toContain("/locked/snapshots");
  expect(broken).toContain("EACCES");
  expect(broken).toMatch(/class="[^"]*err[^"]*"/);
});

test("HistoryView reports malformed and omitted snapshot counts honestly, even with nothing to draw", async () => {
  const base = await fixtureState();
  const html = markup(
    <HistoryView state={withHistoryStatus(base, { status: "ok", path: "/s", malformed: 2, omitted: 7 })} />,
  );
  expect(html).toContain("2 snapshot files could not be parsed and were skipped");
  expect(html).toContain("7 older snapshots omitted from the payload");
  const one = markup(
    <HistoryView state={withHistoryStatus(base, { status: "ok", path: "/s", malformed: 1, omitted: 1 })} />,
  );
  expect(one).toContain("1 snapshot file could not be parsed and was skipped");
  expect(one).toContain("1 older snapshot omitted from the payload");
});

test("HistoryView shows the directory and counts above populated snapshots, and invents no deltas", async () => {
  const state = await fixtureState();
  const base = state.stats!;
  const history = [
    { date: "2026-10-19", stats: { ...base, steps: 1000 } },
    { date: "2026-10-26", stats: { ...base, steps: 2000 } },
  ];
  const html = markup(
    <HistoryView
      state={withHistoryStatus(
        { ...state, history },
        { status: "ok", path: "/data/ord/snapshots", malformed: 1, omitted: 3 },
      )}
    />,
  );
  expect(html).toContain("/data/ord/snapshots");
  expect(html).toContain("2 snapshots");
  expect(html).toContain("1 snapshot file could not be parsed and was skipped");
  expect(html).toContain("3 older snapshots omitted from the payload");
  expect(html).toContain("no week-over-week deltas");
  expect(html).not.toContain("Δ");
  expect(html).not.toMatch(/[+-]\d+(\.\d+)?%/);
  expect(html).not.toContain("no snapshots");
  expect(html).not.toContain("NaN");
});

test("HistoryView draws small multiples per metric from demo snapshots, oldest first", async () => {
  const state = await fixtureState();
  const base = state.stats!;
  // Explicit demo fixtures, derived from the fixture stats; unsorted on purpose.
  const history = [
    { date: "2026-10-27", stats: { ...base, steps: 3000, prompts: 120, sessions: 60, cost: 300 } },
    { date: "2026-10-13", stats: { ...base, steps: 1000, prompts: 40, sessions: 20, cost: 80 } },
    { date: "2026-10-20", stats: { ...base, steps: 2000, prompts: 80, sessions: 40, cost: 190 } },
  ];
  const html = markup(<HistoryView state={{ ...state, history }} />);
  for (const metric of ["steps", "prompts", "sessions", "tokens", "cost", "tool failures"])
    expect(html).toContain(`data-multiple="${metric}"`);
  expect(html.match(/data-multiple="/g)).toHaveLength(6);
  expect(html.match(/data-point="/g)).toHaveLength(18);
  expect(html.indexOf("2026-10-13")).toBeLessThan(html.indexOf("2026-10-27"));
  expect(html).toContain("3 snapshots");
  expect(html).toContain("each snapshot covers its own stats range");
  expect(html).not.toContain("no snapshots");
  expect(html).not.toContain("NaN");
});

test("HistoryView handles a single snapshot", async () => {
  const state = await fixtureState();
  const html = markup(<HistoryView state={{ ...state, history: [{ date: "2026-10-27", stats: state.stats! }] }} />);
  expect(html).toContain("1 snapshot");
  expect(html).not.toContain("NaN");
});

// ---- Filters ----

test("FilterBar exposes every filter with labels, options from the sent events, and a scope label", async () => {
  const state = await fixtureState();
  const html = markup(<FilterBar events={state.events} filters={EMPTY_FILTERS} matched={4} onChange={() => {}} />);
  for (const label of [
    "search",
    "time range",
    "session",
    "role",
    "context agent",
    "classifier model",
    "decision",
    "errors only",
  ])
    expect(html).toContain(`aria-label="${label}"`);
  expect(html).toContain("clear filters");
  expect(html).toContain('<option value="ses_B2">');
  expect(html).toContain('<option value="jev-1.13-free">');
  for (const role of ["orchestrator", "oracle", "fixer", "explorer", "designer"])
    expect(html).toContain(`<option value="${role}">`);
  for (const range of ["5m", "1h", "24h"]) expect(html).toContain(`<option value="${range}">`);
  expect(html).toContain("4 of 4 sent");
  expect(html).not.toContain("filtered");
  // There is no execution filter: execution fields are not recorded.
  expect(html).not.toMatch(/aria-label="(exec|execution)/);
  expect(html).toContain("execution fields are not recorded");
});

test("FilterBar labels an active filtered scope", async () => {
  const state = await fixtureState();
  const filters: FlowFilters = { ...EMPTY_FILTERS, role: "fixer", errorsOnly: true };
  const html = markup(<FilterBar events={state.events} filters={filters} matched={1} onChange={() => {}} />);
  expect(html).toContain("filtered: 1 of 4 sent");
  expect(html).toContain('<option value="fixer" selected="">');
  expect(html).toMatch(/aria-label="errors only"[^>]*checked/);
});

// ---- Flow view and shell integration ----

test("FlowView renders the switchboard and ticker for the rows it is given", async () => {
  const state = await fixtureState();
  const rows = [...state.events].reverse();
  const html = markup(
    <FlowView
      state={state}
      rows={rows}
      selected={null}
      arrived={new Set()}
      burst={0}
      filterBar={<div data-testid="slot">slot</div>}
      filterNote={null}
      onSelect={() => {}}
    />,
  );
  expect(html).toContain("patch bay");
  expect(html).toContain("ticker tape");
  expect(html).toContain('data-testid="slot"');
  expect(html.match(/data-row="event"/g)).toHaveLength(4);
  expect(html.match(/data-jack="role"/g)).toHaveLength(5);
});

test("FlowView says when a filter hides every row", async () => {
  const state = await fixtureState();
  const html = markup(
    <FlowView
      state={state}
      rows={[]}
      selected={null}
      arrived={new Set()}
      burst={0}
      filterBar={null}
      filterNote="filtered: 0 of 4 sent"
      onSelect={() => {}}
    />,
  );
  expect(html).toContain("filtered: 0 of 4 sent");
  expect(html).toContain("no events match");
  expect(html).not.toContain("silent exchange");
});

test("the shell enables every drawer and mounts the filter bar", async () => {
  const html = markup(<DashboardShell state={await fixtureState()} />);
  expect(html.match(/<button[^>]*data-drawer="[a-z]+"[^>]*>/g)).toHaveLength(8);
  expect(html).not.toMatch(/<button[^>]*data-drawer[^>]*disabled/);
  expect(html).toContain('aria-expanded="false"');
  expect(html).toContain('aria-label="search"');
  expect(html).not.toContain('role="dialog"');
});

test("the shell can open each drawer as a labeled dialog", async () => {
  const state = await fixtureState();
  const expectations = {
    agreement: "confusion matrix",
    usage: "by provider",
    errors: "permission gate",
    history: "no snapshots",
  } as const;
  for (const [name, text] of Object.entries(expectations)) {
    const html = markup(
      <DashboardShell state={state} initialDrawer={name as keyof typeof expectations} demo connected />,
    );
    expect(html).toContain('role="dialog"');
    expect(html).toContain(text);
    expect(html).toContain('aria-label="close drawer"');
    expect(html).toContain(`data-drawer="${name}"`);
    expect(html).not.toMatch(/\sstyle=/);
  }
});

// ---- Event detail ----

test("EventDetail shows the session timeline from the sent events and keeps linked stats unlinked", async () => {
  const state = await fixtureState();
  const current = state.events.find((e) => e.message === "msg_B2")!;
  const sibling: FlowEvent = {
    ...current,
    id: "sibling",
    ts: "2026-11-04T02:14:30.000Z",
    message: "msg_B3",
    suggestion: "explorer",
  };
  const html = markup(
    <EventDetail event={current} events={[...state.events, sibling]} retained={state.window.events.retained} />,
  );
  expect(html).toContain("session timeline");
  expect(html).toContain("msg_B3");
  expect(html).toContain('aria-current="true"');
  // Other sessions are not part of this timeline.
  expect(html.match(/data-timeline="row"/g)).toHaveLength(2);
  expect(html).toContain("sent events of this session");
  expect(html).toContain("not attributable");
  expect(html).not.toContain("available in M4");
});
