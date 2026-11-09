import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { aggregate, type DashboardInput, type DashboardState } from "../src/core/aggregate";
import { federate } from "../src/core/federation";
import { type EvidenceState, inspectSession, listSessions } from "../src/core/session-inspection";
import { DashboardShell, drawerForKey, EventDetail } from "../web/App";
import type { ExchangeState } from "../web/exchange";
import { sessionTimeline } from "../web/replay";
import { escapeAction, moveRow, sessionEntry, sessionKey } from "../web/sessions";
import { EvidenceChip } from "../web/views/SessionsView";

const NOW = Date.parse("2026-11-04T02:13:10Z");

type Obs = DashboardInput["observe"][number];
type Rte = DashboardInput["route"][number];
type Prm = DashboardInput["permissions"][number];

const observe = (extra: Record<string, unknown> = {}): Obs =>
  ({
    ts: "2026-11-04T02:00:00Z",
    session: "s_A",
    message: "m1",
    agent: "orchestrator",
    prompt: "Fix the off-by-one bug",
    model: "jev-1.13-free",
    latency_ms: 100,
    status: 200,
    answers: {
      role: { type: "choice", choice: "fixer", confidence: 0.77, probabilities: { fixer: 0.77 } },
      needs_oracle: { type: "noul", noul: 0.22 },
    },
    ...extra,
  }) as Obs;
const route = (extra: Partial<Rte> = {}): Rte => ({
  ts: "2026-11-04T02:00:01Z",
  session: "s_A",
  message: "m1",
  agent: "orchestrator",
  dir: "/tmp",
  flag: "/tmp/.opencode/jev-route",
  prompt: "Fix the off-by-one bug",
  role: "fixer",
  conf: 0.77,
  needs_oracle: 0.22,
  latency_ms: 50,
  decision: "injected",
  reason: null,
  ...extra,
});
const permission = (extra: Partial<Prm> = {}): Prm => ({
  ts: "2026-11-04T02:00:02Z",
  session: "s_A",
  commands: ["git status"],
  scores: { reversible: 0.68, routine: 0.95 },
  verdict: "allow",
  latency_ms: 30,
  ...extra,
});
const input = (patch: Partial<DashboardInput> = {}): DashboardInput => ({
  observe: [],
  route: [],
  permissions: [],
  stats: null,
  malformed: { observe: 0, route: 0, permissions: 0 },
  ...patch,
});

const single = (patch: Partial<DashboardInput> = {}): DashboardState =>
  aggregate(
    input({
      observe: [
        observe(),
        observe({
          ts: "2026-11-04T02:00:05Z",
          message: "m2",
          prompt: "Rename the helper",
          answers: undefined,
          status: undefined,
          error: "TimeoutError",
        }),
        observe({ ts: "2026-11-04T02:00:10Z", session: "s_B", message: "m3", prompt: "Explore the repo" }),
      ],
      route: [route()],
      permissions: [
        permission(),
        permission({ ts: "2026-11-04T02:00:03Z", commands: ["rm -r /tmp/x"], scores: undefined, verdict: "ask:gate" }),
        permission({ ts: "2026-11-04T02:00:04Z", session: "s_B", commands: ["git push origin feat/x"] }),
      ],
      ...patch,
    }),
    NOW,
  );

const federated = (): ExchangeState =>
  federate(
    [
      {
        id: "pc",
        label: "PC",
        status: "live",
        input: input({
          observe: [
            observe({ session: "same", message: "m1" }),
            observe({ ts: "2026-11-04T02:00:04Z", session: "same", message: "m2" }),
            observe({ ts: "2026-11-04T02:00:09Z", session: "pc_only", message: "m3" }),
          ],
          permissions: [permission({ session: "same", commands: ["pc-gate-command"] })],
        }),
      },
      {
        id: "orca",
        label: "Orca",
        status: "live",
        input: input({
          observe: [observe({ ts: "2026-11-04T02:00:06Z", session: "same", message: "m9", prompt: "Orca prompt" })],
          permissions: [permission({ session: "same", commands: ["orca-gate-command"] })],
        }),
      },
    ],
    NOW,
  ) as unknown as ExchangeState;

const render = (state: ExchangeState | DashboardState, props: Record<string, unknown> = {}) =>
  renderToStaticMarkup(<DashboardShell state={state as ExchangeState} now={NOW} {...props} />);
const text = (html: string) => html.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, "");
/** The inspector panel only: from its opening tag to the end of that aside (it holds no nested aside). */
const drawer = (html: string) => {
  const at = html.indexOf('id="drawer-sessions"');
  if (at < 0) return "";
  const end = html.indexOf("</aside>", at);
  return html.slice(at, end < 0 ? undefined : end);
};
const count = (html: string, needle: string) => html.split(needle).length - 1;

// ---- entry points and keys (acceptance: key 9 and `s`) ----

test("Sessions is the ninth view on key 9 and the drawer set stays otherwise unchanged", () => {
  const html = render(single());
  expect(html.match(/<button[^>]*data-drawer="[a-z]+"[^>]*>/g)).toHaveLength(9);
  expect(html).toMatch(/data-drawer="sessions"[^>]*>[^<]*<sup>9<\/sup>/);
  expect(drawerForKey("9")).toBe("sessions");
  expect(drawerForKey("1")).toBe("agreement");
  expect(drawerForKey("8")).toBe("export");
  expect(drawerForKey("0")).toBeNull();
  expect(drawerForKey("s")).toBeNull();
  expect(text(html)).toContain("s session");
  expect(text(html)).toContain("1-9 views");
});

test("key s targets the selected event's session and the same event", () => {
  const state = single();
  const target = state.events.find((e) => e.message === "m2")!;
  expect(sessionEntry(state.events, target.id)).toEqual({ session: "s_A", event: target.id });
  expect(sessionEntry(state.events, "gone")).toBeNull();
  expect(sessionEntry(state.events, null)).toBeNull();
});

test("the event detail offers a session action only when it can open the inspector", () => {
  const state = single();
  const event = state.events[0]!;
  const without = renderToStaticMarkup(<EventDetail event={event} events={state.events} />);
  expect(without).not.toContain('data-action="session"');
  const withAction = renderToStaticMarkup(<EventDetail event={event} events={state.events} onSession={() => {}} />);
  expect(withAction).toMatch(/<button[^>]*data-action="session"[^>]*>[^<]*session/);
});

test("Escape goes detail to list to close; arrow movement is clamped and starts at the first row", () => {
  expect(escapeAction("sessions", "s_A")).toBe("to-list");
  expect(escapeAction("sessions", null)).toBe("close");
  expect(escapeAction("errors", "s_A")).toBe("close");
  expect(escapeAction(null, "s_A")).toBe("close");
  expect(moveRow(["a", "b", "c"], "a", 1)).toBe("b");
  expect(moveRow(["a", "b", "c"], "c", 1)).toBe("c");
  expect(moveRow(["a", "b", "c"], "b", -1)).toBe("a");
  expect(moveRow(["a", "b", "c"], "a", -1)).toBe("a");
  expect(moveRow(["a", "b", "c"], null, 1)).toBe("a");
  expect(moveRow([], "a", 1)).toBeNull();
});

test("session keys follow the federated id and never merge sources", () => {
  expect(sessionKey({ sourceId: "pc", session: "same" })).toBe(JSON.stringify(["pc", "same"]));
  expect(sessionKey({ sourceId: null, session: "s_A" })).toBe("s_A");
});

// ---- list ----

test("the list shows one row per session, newest last event first, and does not offer controls", () => {
  const html = render(single(), { initialDrawer: "sessions" });
  expect(html).toContain('id="drawer-sessions"');
  expect(html).toContain('role="dialog"');
  expect(html).toContain('aria-label="Sessions"');
  const panel = drawer(html);
  expect(count(panel, "data-s-row=")).toBe(2);
  const order = [...panel.matchAll(/class="s-name"[^>]*>([^<]+)</g)].map((m) => m[1]);
  expect(order).toEqual(["s_B", "s_A"]);
  const t = text(panel);
  expect(t).toContain("sent 2");
  expect(t).toContain("1 error");
  expect(t).toContain("2 perm");
  // The list is the first state; no detail yet.
  expect(panel).toContain('data-pane="list"');
  expect(panel).not.toContain("s-scope");
});

test("the combined view shows the source id on every row and keeps equal session strings apart", () => {
  const html = render(federated(), { initialDrawer: "sessions" });
  const panel = drawer(html);
  expect(count(panel, "data-s-row=")).toBe(3);
  const rows = [...panel.matchAll(/class="s-src"[^>]*>([^<]+)</g)].map((m) => m[1]);
  expect(rows.sort()).toEqual(["orca", "pc", "pc"]);
  // Never forced to choose a source first.
  expect(panel).toContain('data-pane="list"');
  expect(listSessions(federated() as unknown as DashboardState).filter((e) => e.session === "same")).toHaveLength(2);
});

test("a selected source lists only its own sessions", () => {
  const html = render(federated(), { initialDrawer: "sessions", initialView: "orca" });
  const panel = drawer(html);
  expect(count(panel, "data-s-row=")).toBe(1);
  expect(text(panel)).not.toContain("pc_only");
});

test("an empty source says so and does not claim an archive", () => {
  const html = render(single({ observe: [], route: [], permissions: [] }), { initialDrawer: "sessions" });
  const t = text(drawer(html));
  expect(t).toContain("no sessions in the sent events");
  expect(t).toContain("sample");
});

// ---- detail: scope ----

test("the scope header states source, session, sent, source-window counters and that it is a sample", () => {
  const html = render(single(), { initialSession: { session: "s_A" } });
  const panel = drawer(html);
  expect(panel).toContain('data-pane="detail"');
  const scope = text(panel.slice(panel.indexOf("s-scope"), panel.indexOf("s-timeline")));
  for (const piece of [
    "source local",
    "session s_A",
    "sent 2",
    "retained 3 (source window)",
    "omitted 0",
    "evicted 0",
    "sample, not a complete archive",
  ])
    expect(scope).toContain(piece);
  expect(scope).not.toContain("may be missing");
  // Only ever the negated form.
  expect(text(panel).replace(/not a complete archive/g, "")).not.toMatch(/complete (archive|session)/i);
});

test("omitted or evicted rows add that older events of the session may be missing", () => {
  const base = single();
  const omitted = { ...base, window: { ...base.window, events: { ...base.window.events, omitted: 4 } } };
  const t1 = text(drawer(render(omitted, { initialSession: { session: "s_A" } })));
  expect(t1).toContain("omitted 4");
  expect(t1).toContain("older events of this session may be missing");
  const evicted = { ...base, window: { ...base.window, evicted: { observe: 2, route: 1, permissions: 0 } } };
  const t2 = text(drawer(render(evicted, { initialSession: { session: "s_A" } })));
  expect(t2).toContain("evicted 3");
  expect(t2).toContain("older events of this session may be missing");
});

test("a stale or disconnected view keeps the last known wording", () => {
  const html = render(single(), { initialSession: { session: "s_A" }, connected: false });
  expect(text(drawer(html))).toContain("last known");
});

test("the combined view names the source of the inspected session and excludes other sources", () => {
  const key = JSON.stringify(["pc", "same"]);
  const html = render(federated(), { initialSession: { session: key } });
  const panel = drawer(html);
  const t = text(panel);
  expect(t).toContain("source pc");
  expect(t).toContain("session same");
  expect(t).toContain("sent 2");
  expect(t).toContain("pc-gate-command");
  expect(t).not.toContain("orca-gate-command");
  expect(t).not.toContain("Orca prompt");
});

test("an unknown session shows an empty state with the scope, not an error or a guess", () => {
  const html = render(single(), { initialSession: { session: "nope" } });
  const t = text(drawer(html));
  expect(t).toContain("session nope");
  expect(t).toContain("sent 0");
  expect(t).toContain("no events of this session in the sent sample");
  expect(t).toContain("sample, not a complete archive");
  expect(drawer(html)).not.toContain("data-s-event=");
  expect(t).not.toContain("NaN");
});

// ---- detail: timeline ----

test("the timeline is the replay order, marks the selected row, and rows are real buttons", () => {
  const state = single();
  const target = state.events.find((e) => e.message === "m2")!;
  const html = render(state, { initialSession: { session: "s_A", event: target.id } });
  const panel = drawer(html);
  expect(count(panel, "data-s-event=")).toBe(2);
  expect(panel).toMatch(/<li[^>]*aria-current="true"[^>]*data-s-event|<li[^>]*data-s-event[^>]*aria-current="true"/);
  const rowsOnly = panel.slice(panel.indexOf("s-timeline"), panel.indexOf("</ol>", panel.indexOf("s-timeline")));
  expect(count(rowsOnly, 'aria-current="true"')).toBe(1);
  expect(panel).toMatch(/<li[^>]*data-s-event[^>]*><button type="button"/);
  const t = text(panel);
  expect(t).toContain("observed event span");
  expect(t).not.toMatch(/duration|run time|elapsed/i);
  // Replay cursor is shared, not a second transport.
  expect(t).toContain("replay cursor 2 of 2");
  expect(panel).not.toContain('aria-label="session replay"');
  // The error row keeps the existing triangle and the error name.
  expect(panel).toContain('data-state="error"');
  expect(t).toContain("TimeoutError");
});

test("the inspector order is the replay order (one source of truth)", () => {
  const state = single();
  expect(sessionTimeline(state.events, "s_A").map((e) => e.id)).toEqual(
    inspectSession(state, "s_A").events.map((e) => e.id),
  );
});

test("a narrow viewport shows a back control that returns to the list", () => {
  const html = render(single(), { initialSession: { session: "s_A" } });
  expect(drawer(html)).toMatch(/<button[^>]*class="s-back"[^>]*>← sessions<\/button>/);
  expect(drawer(render(single(), { initialDrawer: "sessions" }))).not.toContain("s-back");
});

// ---- detail: evidence states ----

test("recorded, enriched and not available are told apart by glyph, word and border pattern", async () => {
  const chip = (s: EvidenceState) => renderToStaticMarkup(<EvidenceChip state={s} />);
  const rec = chip({ state: "recorded", kind: "observe" });
  const enr = chip({ state: "enriched" });
  const na = chip({ state: "not_available", reason: "not in Jev logs" });
  expect(text(rec)).toBe("▮ recorded");
  expect(text(enr)).toBe("＋ enriched · validated");
  expect(text(na)).toBe("— not available");
  expect(rec).toContain('data-evidence="recorded"');
  expect(enr).toContain('data-evidence="enriched"');
  expect(na).toContain('data-evidence="not_available"');
  const css = await Bun.file("web/styles.css").text();
  expect(css).toMatch(/\.chip\[data-evidence="recorded"\]\s*\{[^}]*border:\s*1px solid/);
  expect(css).toMatch(/\.chip\[data-evidence="enriched"\]\s*\{[^}]*border:\s*1px solid/);
  expect(css).toMatch(/\.chip\[data-evidence="not_available"\]\s*\{[^}]*border:\s*1px dashed/);
});

test("fields carry a state and the record kind; every execution field is not available with a reason", () => {
  const state = single();
  const first = state.events.find((e) => e.message === "m1")!;
  const html = render(state, { initialSession: { session: "s_A", event: first.id } });
  const panel = drawer(html);
  const row = (name: string) => {
    const at = panel.indexOf(`data-field="${name}"`);
    expect(at).toBeGreaterThan(-1);
    return text(panel.slice(at, panel.indexOf("</tr>", at)));
  };
  expect(row("suggestion")).toContain("fixer");
  expect(row("suggestion")).toContain("▮ recorded");
  expect(row("suggestion")).toContain("observe");
  expect(row("decision")).toContain("route");
  expect(row("reason")).toContain("— not available");
  expect(row("reason")).toContain("not in Jev logs");
  for (const name of ["executionAgent", "executionModel", "executionProvider", "executionVariant", "tokens", "cost"]) {
    expect(row(name)).toContain("— not available");
    expect(row(name)).toContain("not in Jev logs");
  }
  expect(row("fallback")).toContain("not detectable");
  expect(panel).not.toContain('data-evidence="enriched"');
});

test("router facts are grouped and labelled as recommendation, not execution", () => {
  const html = render(single(), { initialSession: { session: "s_A" } });
  const panel = drawer(html);
  const t = text(panel);
  expect(t).toContain("ROUTER · recommendation, not execution");
  expect(t).toContain("recorded context agent, not proof of delegation");
  expect(t).toContain("classifier model");
  expect(t).toContain("the observe model is the classifier, not the execution model");
  expect(t).toContain("recommendation injected, not proof that the suggested agent ran");
  expect(t).toContain("exec agent/model — not available");
  expect(t).toContain("tokens/cost — not available");
  expect(t).toContain("linked stats none");
  // Router fields sit inside the router block, execution fields outside it.
  const routerAt = panel.indexOf("s-router");
  const execAt = panel.indexOf("s-exec");
  expect(routerAt).toBeGreaterThan(-1);
  expect(execAt).toBeGreaterThan(routerAt);
  const router = panel.slice(routerAt, execAt);
  for (const name of [
    "suggestion",
    "confidence",
    "needsOracle",
    "decision",
    "reason",
    "contextAgent",
    "classifierModel",
  ])
    expect(router).toContain(`data-field="${name}"`);
  expect(router).not.toContain('data-field="executionModel"');
  expect(panel.slice(execAt)).toContain('data-field="executionModel"');
});

// ---- permissions ----

test("permission verdicts are the gate output of this session only, with the Errors drawer handling", () => {
  const html = render(single(), { initialSession: { session: "s_A" } });
  const panel = drawer(html);
  const t = text(panel);
  expect(t).toContain("permission gate · this session");
  expect(t).toContain("git status");
  expect(t).toContain("rm -r /tmp/x");
  expect(t).not.toContain("git push origin feat/x");
  expect(t).toContain("newest 3 of 3 retained verdicts listed");
  // Absent scores stay unavailable, glyph plus word for the verdict.
  expect(panel).toContain("ask:gate");
  expect(panel).toContain("●");
  expect(panel).toContain("◆");
  const gate = panel.slice(panel.indexOf("permission gate"));
  expect(gate).toContain("—");
  // A verdict is a gate output, not an approval event.
  expect(t).not.toMatch(/approved by|denied by/i);
});

test("a session with no verdicts says so", () => {
  const t = text(drawer(render(single(), { initialSession: { session: "s_B" } })));
  expect(t).toContain("git push origin feat/x");
  const none = single({ permissions: [] });
  expect(text(drawer(render(none, { initialSession: { session: "s_A" } })))).toContain(
    "no permission verdicts in the retained window",
  );
});

// ---- read-only ----

test("the inspector has no execute, retry, approve or deny controls and no success wording", () => {
  for (const html of [
    render(single(), { initialDrawer: "sessions" }),
    render(single(), { initialSession: { session: "s_A" } }),
    render(federated(), { initialSession: { session: JSON.stringify(["pc", "same"]) } }),
    render(single(), { initialSession: { session: "nope" } }),
  ]) {
    const panel = drawer(html);
    expect(panel).toContain('id="drawer-sessions"');
    const buttons = [...panel.matchAll(/<button[^>]*>([^]*?)<\/button>/g)].map((m) => text(m[1]!).toLowerCase());
    for (const label of buttons)
      expect(label).not.toMatch(/execut|run\b|retry|re-?run|approve|deny|allow\b|edit|delete|confirm|apply/);
    expect(panel).not.toMatch(/<(form|input|textarea|select)\b/);
    expect(text(panel)).not.toMatch(/success|succeeded|completed|finished|passed|\bdone\b|duration|run time/i);
  }
});

test("selecting is a view change only: rows never carry a pass/fail class", () => {
  const panel = drawer(render(single(), { initialSession: { session: "s_A" } }));
  expect(panel).toContain('id="drawer-sessions"');
  expect(panel).not.toMatch(/class="[^"]*\b(pass|fail|success|failed|ok-row)\b/);
});

// ---- styles (Lane Bay tokens only, no new motion) ----

const sessionsCss = async () => {
  const css = await Bun.file("web/styles.css").text();
  const start = css.indexOf("/* ---- sessions inspector");
  expect(start).toBeGreaterThan(-1);
  return css.slice(start);
};

test("sessions styles use existing tokens, add no motion and keep the 11 px floor", async () => {
  const css = await sessionsCss();
  expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  expect(css).not.toMatch(/\banimation\b|\btransition\b|@keyframes/);
  const sizes = [...css.matchAll(/font:[^;]*?(\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1]));
  const fontSizes = [...css.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1]));
  for (const size of [...sizes, ...fontSizes]) expect(size).toBeGreaterThanOrEqual(11);
  expect(css).not.toMatch(/box-shadow|text-shadow|gradient|backdrop-filter/);
});

test("two panes above 1100 px; at 1100 px and below one pane shows at a time", async () => {
  const css = await sessionsCss();
  expect(css).toMatch(/\.sessions\s*\{[^}]*grid-template-columns:\s*\d+px minmax\(0, 1fr\)/);
  expect(css).toMatch(/\.s-back\s*\{[^}]*display:\s*none/);
  const narrow = css.slice(css.indexOf("@media (max-width: 1100px)"));
  expect(narrow).toMatch(/\.sessions\[data-pane="detail"\]\s+\.s-list\s*\{[^}]*display:\s*none/);
  expect(narrow).toMatch(/\.sessions\[data-pane="list"\]\s+\.s-detail\s*\{[^}]*display:\s*none/);
  expect(narrow).toMatch(/\.s-back\s*\{[^}]*display:\s*(inline-)?flex/);
  expect(css).toMatch(/\.s-row\s*\{[^}]*height:\s*var\(--row\)/);
});

// ---- placement: the chrome stays visible (DESIGN "Chrome kept") ----

test("the inspector sits inside the stage; header, nav, scope strip and ticker stay rendered around it", () => {
  const html = render(federated(), { initialSession: { session: JSON.stringify(["pc", "same"]) } });
  const stageAt = html.indexOf('<main class="stage"');
  const panelAt = html.indexOf('id="drawer-sessions"');
  const stageEnd = html.indexOf("</main>");
  expect(stageAt).toBeGreaterThan(-1);
  expect(panelAt).toBeGreaterThan(stageAt);
  expect(panelAt).toBeLessThan(stageEnd);
  for (const chrome of ['class="head"', 'class="exchange-bar"', 'class="views-nav"', 'class="scope-strip"'])
    expect(html.indexOf(chrome)).toBeGreaterThan(-1);
  for (const chrome of ['class="head"', 'class="views-nav"', 'class="scope-strip"'])
    expect(html.indexOf(chrome)).toBeLessThan(stageAt);
  expect(html.indexOf('aria-label="ticker tape"')).toBeGreaterThan(stageEnd);
  // It is not the full-height drawer: no drawer class, so nothing covers the header or the nav.
  expect(html.slice(panelAt - 40, panelAt + 120)).not.toContain('class="drawer"');
});

test("Call in focus stays visible inside the inspector, on the replay cursor event", () => {
  const state = single();
  const target = state.events.find((e) => e.message === "m2")!;
  const panel = drawer(render(state, { initialSession: { session: "s_A", event: target.id } }));
  expect(panel).toContain('aria-label="call in focus"');
  expect(text(panel.slice(panel.indexOf('aria-label="call in focus"'), panel.indexOf("s-scope")))).toContain(
    "TimeoutError",
  );
  // The list state shows the focus of the selected ticker call too.
  expect(drawer(render(single(), { initialDrawer: "sessions" }))).toContain('aria-label="call in focus"');
});

test("the inspector is not one of the drawer tabs and the other drawers keep their widths", async () => {
  const html = render(single(), { initialDrawer: "errors" });
  expect(html.match(/data-tab="/g)).toHaveLength(8);
  expect(html).not.toContain('data-tab="sessions"');
  const css = await Bun.file("web/styles.css").text();
  expect(Number(css.match(/\n\.drawer\s*\{[^}]*?\bwidth:\s*(\d+)px/)?.[1])).toBe(720);
  expect(css).toMatch(/\.stage\s*\{[^}]*position:\s*relative/);
  expect(css).toMatch(/\.sessions-panel\s*\{[^}]*position:\s*absolute[^}]*inset:\s*0/);
  expect(css).not.toMatch(/#drawer-sessions\s*\{[^}]*position:\s*fixed/);
});
