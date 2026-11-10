import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { aggregate, type DashboardInput } from "../src/core/aggregate";
import { parseLines } from "../src/core/schema";
import { suggestionEvidence, UNKNOWN } from "../src/core/suggestion-evidence";
import { SuggestionEvidence } from "../web/views/SuggestionEvidence";

async function events() {
  const observe = parseLines("observe", await Bun.file("fixtures/jev-observe.jsonl").text());
  const route = parseLines("route", await Bun.file("fixtures/jev-route.jsonl").text());
  const input: DashboardInput = {
    observe: observe.records,
    route: route.records,
    permissions: [],
    stats: null,
    malformed: { observe: 0, route: 0, permissions: 0 },
    sources: {
      observe: { status: "ok", path: "o" },
      route: { status: "ok", path: "r" },
      permissions: { status: "ok", path: "p" },
    },
    statsStatus: { status: "ok" },
  };
  return aggregate(input, Date.parse("2026-11-04T02:13:10Z")).events;
}
const val = (ev: ReturnType<typeof suggestionEvidence>, key: string) => ev.rows.find((r) => r.key === key)?.value;

test("skipped with reason shows the recorded reason", async () => {
  const e = (await events()).find((x) => x.message === "msg_A1")!;
  const ev = suggestionEvidence(e);
  expect(ev.title).toBe("Why this suggestion?");
  expect(val(ev, "decision")).toBe("skipped");
  expect(val(ev, "reason")).toBe("role_orchestrator");
  expect(val(ev, "role")).toBe("orchestrator");
});

test("injected with conf shows confidence and probabilities; null reason stays unknown", async () => {
  const e = (await events()).find((x) => x.message === "msg_B2")!;
  const ev = suggestionEvidence(e);
  expect(val(ev, "decision")).toBe("injected");
  expect(val(ev, "reason")).toBe(UNKNOWN);
  expect(val(ev, "conf")).toBe("0.85");
  expect(val(ev, "needs_oracle")).toBe("0.2");
  expect(ev.probabilities[0]).toEqual({ role: "fixer", probability: 0.77 });
});

test("subset of fields renders the rest as unknown", async () => {
  const e = (await events()).find((x) => x.session === "ses_D4")!;
  const ev = suggestionEvidence(e);
  expect(val(ev, "decision")).toBe("skipped");
  for (const k of ["role", "conf", "needs_oracle"]) expect(val(ev, k)).toBe(UNKNOWN);
  expect(ev.probabilities).toEqual([]);
  const html = renderToStaticMarkup(<SuggestionEvidence event={e} />);
  expect(html).toContain("Why this suggestion?");
  expect(html).toContain(UNKNOWN);
  expect(html.toLowerCase()).not.toContain("why this model");
});

test("event without route or observe is all unknown", () => {
  const ev = suggestionEvidence({ route: null, observe: null });
  expect(ev.rows.every((r) => r.value === UNKNOWN && !r.known)).toBe(true);
});
