#!/usr/bin/env node
import { existsSync } from "node:fs";
import { appendFile, mkdir, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const usage = `Usage: node scripts/verify-ui.mjs --url URL [--state-dir DIR] [--screenshots-dir DIR] [--report FILE] [--exchange yes]
Requires Playwright (package or PLAYWRIGHT_MODULE_PATH pointing to its index.mjs); CHROMIUM_PATH is optional.
Use a demo fixture server and an explicit temporary state directory to run append checks.
Without --state-dir, append-dependent checks are reported as skipped.`;
const checks = [];
const problems = [];
let browser;
let reportPath;
const check = (name, ok, info = "") => checks.push({ name, ok: Boolean(ok), info: String(info) });
const skip = (name, info) => checks.push({ name, ok: null, info });
const inside = (child, parent) => {
  const r = relative(parent, child);
  return r !== "" && !r.startsWith(`..${sep}`) && r !== ".." && !isAbsolute(r);
};

// ---- M9 exchange harness -------------------------------------------------------------------------------------
// Drives the real built client with a controllable EventSource, so PC / Orca / local states, evictions, rejected
// payloads and replay can be exercised without a multi-host setup. The states are rebuilt from the anonymized demo
// state (/api/state of the fixture server); sessions and ids below are synthetic and labelled as such by the DEMO band.
async function exchangeChecks({ browser, origin, initial, outDir, check, problems }) {
  const sizes = [
    { width: 1440, height: 900 },
    { width: 1024, height: 768 },
  ];
  const { seq: _s, demo: _d, exchange: _e, analytics: _a, ...base } = initial;
  const template = initial.events[0];
  const baseObserve = initial.events.find((e) => e.observe)?.observe ?? null;
  const pair = (s) => {
    try {
      const p = JSON.parse(s);
      return Array.isArray(p) ? p[1] : s;
    } catch {
      return s;
    }
  };
  const tag = (event, sourceId, extra = {}) => ({
    ...event,
    sourceId,
    session: JSON.stringify([sourceId, pair(event.session)]),
    ...extra,
  });
  const stateOf = (events) => ({
    ...base,
    events,
    window: { ...base.window, events: { retained: events.length, sent: events.length, omitted: 0 } },
  });
  const t0 = Date.parse("2026-11-04T02:13:01.000Z");
  const synthetic = (n, i) => ({
    ...template,
    id: `m9-replay-${n}`,
    ts: new Date(t0 + i * 400).toISOString(),
    prompt: `replay step ${n}`,
    message: `msg_m9_${n}`,
    suggestion: ["fixer", "explorer", "fixer", "oracle", "fixer"][i % 5],
    contextAgent: ["fixer", "orchestrator", "fixer", "oracle", "designer"][i % 5],
    errors: [],
    observe: {
      ...baseObserve,
      preset: ["fast", "fast", "slim", "slim", "fast"][i % 5],
      execution: {
        model: "m-demo",
        provider: "p-demo",
        tokens: { input: 200 + i, output: 40 },
        ...(i === 3 ? { status: 429 } : {}),
      },
    },
  });
  const original = initial.events.map((e) => ({ ...e, session: pair(e.session) }));
  const by = (name) => original.filter((e) => e.session === name);
  const pcEvents = [
    ...by("ses_A1").map((e) => tag(e, "pc", { client: "TUI" })),
    ...by("ses_B2").map((e) => tag(e, "pc", { client: "TUI" })),
    ...[1, 2, 3, 4, 5].map((n, i) => tag({ ...synthetic(n, i), session: "ses_replay" }, "pc", { client: "TUI" })),
  ];
  const orcaEvents = by("ses_C3").map((e) => tag(e, "orca", { client: "Orca", directory: "/work/orca-demo" }));
  const localEvents = by("ses_D4").map((e) => tag(e, "local"));
  const sources = (local = stateOf(localEvents)) => [
    {
      id: "pc",
      label: "PC",
      client: "TUI",
      status: "live",
      lastSeenAt: "2026-11-04T02:13:05.000Z",
      state: stateOf(pcEvents),
    },
    {
      id: "orca",
      label: "Orca",
      client: "Orca",
      status: "stale",
      lastSeenAt: "2026-11-04T02:09:41.000Z",
      detail: "idle timeout",
      state: stateOf(orcaEvents),
    },
    { id: "local", label: "Local", status: "connecting", state: local },
  ];
  const byTime = (events) => [...events].sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
  const nowMs = Date.now();
  const win = (observed, status, limit, gaps) => ({
    from: nowMs - 5 * 3600000,
    to: nowMs,
    limit,
    observed,
    status,
    coverage: { sources: 1, complete: status === "estimate", attributionGaps: gaps },
  });
  const quota = { id: "plus", label: "Plus (demo limits)", provider: "p-demo", metric: "tokens", limit5h: 4000 };
  const analytics = {
    settings: { quotas: [quota], alerts: { holdMs: 5000, repeatMs: 60000, activeMs: 3600000, desktop: false } },
    result: {
      quotas: [
        {
          ...quota,
          sourceId: "pc",
          fiveHour: win(1450, "partial", 4000, true),
          weekly: win(null, "unknown", null, true),
        },
        {
          ...quota,
          sourceId: "orca",
          fiveHour: win(0, "estimate", 4000, false),
          weekly: win(null, "unknown", null, false),
        },
      ],
    },
    alerts: [
      { sourceId: "pc", kind: "rate-limit", since: nowMs - 9000, lastFired: nowMs - 4000 },
      { sourceId: "orca", kind: "classifier-rate-limit", since: nowMs - 7200000, lastFired: nowMs - 7000000 },
    ],
    notificationStatus: { ok: true },
  };
  const combined = (events, srcs = sources()) => ({
    ...stateOf(byTime(events)),
    exchange: { sources: srcs },
    analytics,
  });
  const all = [...pcEvents, ...orcaEvents, ...localEvents];

  for (const viewport of sizes) {
    const tagName = `${viewport.width}x${viewport.height}`;
    const ok = (name, value, info = "") => check(`[${tagName}] ${name}`, value, info);
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    page.setDefaultTimeout(4000);
    page.on("console", (m) => {
      if (m.type() === "error") problems.push(`exchange console: ${m.text()}`);
    });
    page.on("pageerror", (e) => problems.push(`exchange pageerror: ${e.message}`));
    let seq = 1;
    await page.addInitScript(() => {
      window.__es = [];
      window.EventSource = class {
        constructor(url) {
          this.url = url;
          this.l = {};
          window.__es.push(this);
          setTimeout(() => this.onopen?.({}), 0);
        }
        addEventListener(type, fn) {
          (this.l[type] ??= []).push(fn);
        }
        close() {}
      };
      window.__push = (kind, data) => {
        for (const es of window.__es) for (const fn of es.l[kind] || []) fn({ data });
      };
    });
    await page.route("**/api/state", (route) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ ...combined(all), seq: 1, demo: true }),
      }),
    );
    const push = (state, kind = "delta", s = ++seq) =>
      page.evaluate(([k, text]) => window.__push(k, text), [kind, JSON.stringify({ state, seq: s, demo: true })]);
    const pushText = (text, kind = "delta") => page.evaluate(([k, t]) => window.__push(k, t), [kind, text]);
    const shot = (name) => page.screenshot({ path: join(outDir, `m9-${name}-${tagName}.png`) });
    const rows = () => page.locator('tr[data-row="event"]').count();
    const active = () => page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName);
    const text = (selector) => page.locator(selector).first().innerText();

    await page.goto(origin);
    await page.waitForSelector('[data-source="combined"]');
    await page.evaluate(() => document.fonts.ready);
    await page.waitForSelector('tr[data-row="event"]');

    // Source selector and health
    ok("source bar shows combined, pc, orca, local", (await page.locator('[role="radio"]').count()) === 4);
    ok(
      "stale and connecting are text, not only colour",
      /stale/.test(await text('[data-source="orca"]')) && /connecting/.test(await text('[data-source="local"]')),
    );
    ok("combined shows every source's events", (await rows()) === all.length, `rows=${await rows()}`);
    ok("ticker has a source column", (await page.locator("th.c-src").count()) === 1);
    await shot("combined");
    await page.focus('[data-source="combined"]');
    await page.keyboard.press("ArrowRight");
    await page.waitForFunction(() => document.activeElement?.getAttribute("data-source") === "pc").catch(() => {});
    ok(
      "arrow key selects next source and keeps focus",
      (await page.locator('[data-source="pc"]').getAttribute("aria-checked")) === "true" &&
        (await page.evaluate(() => document.activeElement?.getAttribute("data-source"))) === "pc",
    );
    ok("selected source shows only its events", (await rows()) === pcEvents.length);
    await page.click('[data-source="orca"]');
    ok(
      "orca view shows one event and names the view",
      (await rows()) === 1 && /viewing orca/.test(await text(".viewing")),
    );
    ok(
      "stale view states it shows last retained state",
      /orca stale.*showing last retained state/.test(await text(".scope-strip")),
    );
    await shot("source-stale");
    await page.click('[data-source="combined"]');
    await page.selectOption("#flt-source", "pc");
    ok("source filter narrows combined view", (await rows()) === pcEvents.length);
    await page.click('button[aria-label="clear filters"]');

    // Replay: one cursor drives focus, ticker selection and transport
    await page.locator("body").click({ position: { x: 5, y: 5 } });
    await page.keyboard.press("r");
    ok("r starts replay at first event of newest session", /replay 1 of 5/.test(await text(".transport .pos")));
    ok(
      "call in focus follows cursor",
      /replay step 1/.test(await text(".call.sel .call-text")) &&
        (viewport.width <= 1280 || /replay step 1/.test(await text(".focus-prompt"))),
    );
    ok("replay states sample limits", /sample of retained events.*not durable history/.test(await text(".sample")));
    ok("sparse-safe wires are only the played events", (await page.locator('path[data-wire="ghost"]').count()) === 1);
    await page.keyboard.press(".");
    await page.keyboard.press(".");
    ok(
      "step moves focus, ticker selection and counter together",
      /replay 3 of 5/.test(await text(".transport .pos")) &&
        /replay step 3/.test(await text(".call.sel .call-text")) &&
        (await page.locator('tr[aria-selected="true"]').getAttribute("data-id")) === "m9-replay-3" &&
        (viewport.width <= 1280 || /replay step 3/.test(await text(".focus-prompt"))),
    );
    ok("calls rail lists played events only", (await page.locator(".call-list .call").count()) === 3);
    await page.keyboard.press(",");
    ok("step back", /replay 2 of 5/.test(await text(".transport .pos")));
    await shot("replay");
    await page.keyboard.press("]");
    await page.keyboard.press("]");
    ok("speed steps to 4×", (await page.locator('[data-speed="4"]').getAttribute("aria-pressed")) === "true");
    await page.keyboard.press("p");
    await page.waitForFunction(() =>
      /replay 5 of 5/.test(document.querySelector(".transport .pos")?.textContent ?? ""),
    );
    await page.waitForSelector('button[aria-label="play"]');
    await page.waitForSelector('button[aria-label="play"]');
    ok(
      "play runs to the last retained event and stops",
      (await page.locator('button[aria-label="play"]').count()) === 1,
    );
    await page.keyboard.press(",");
    await page.keyboard.press("[");
    await page.keyboard.press("[");
    await page.keyboard.press("[");
    await page.keyboard.press("p");
    await page.keyboard.press("p");
    const paused = await text(".transport .pos");
    await page.waitForTimeout(900);
    ok("pause holds the cursor", paused === (await text(".transport .pos")), paused);
    await page.click('button[aria-label="stop replay"]');
    await page.waitForSelector('button[aria-label="start replay"]');
    ok("stop returns focus to the replay start control", (await active()) === "replay-start");
    ok("stop leaves live focus", (await page.locator('[aria-label="session replay"]').count()) === 0);

    // Eviction: selected event leaves the retained window
    await page.locator("body").click({ position: { x: 5, y: 5 } });
    await page.keyboard.press("j");
    const evictedId = await page.locator('tr[aria-selected="true"]').getAttribute("data-id");
    await page.keyboard.press("Enter");
    ok("detail opens for the selected event", await page.locator('aside[aria-label="event detail"]').isVisible());
    const remaining = all.filter((e) => e.id !== evictedId);
    await push(combined(remaining));
    await page.waitForSelector('[data-evicted="true"]');
    ok(
      "evicted detail closes and focus lands on the ticker",
      (await active()) === "ticker" && (await page.locator('aside[aria-label="event detail"]').count()) === 0,
    );
    ok("eviction is announced", /left the retained window/.test(await text('[data-evicted="true"]')));
    ok("selection moved to a retained neighbour", (await page.locator('tr[aria-selected="true"]').count()) === 1);
    await shot("evicted");

    // Orphaned filter value
    await page.selectOption("#flt-session", { index: 1 });
    const chosen = await page.locator("#flt-session").inputValue();
    const gone = remaining.find((e) => e.session === chosen);
    await push(combined(remaining.filter((e) => e.session !== chosen)));
    await page.waitForSelector("[data-orphaned]");
    ok(
      "orphaned filter option stays selectable and is marked",
      (await page.locator("#flt-session").inputValue()) === chosen &&
        /not in window/.test(await page.locator("#flt-session option:checked").innerText()) &&
        Boolean(gone),
    );
    ok("orphaned filter is announced", /1 filter value not in window/.test(await text("[data-orphaned]")));
    await shot("orphan-filter");
    await page.click('button[aria-label="clear filters"]');
    // The option memory is reset in an effect right after the filters clear.
    await page
      .waitForFunction(
        () => ![...document.querySelectorAll("#flt-session option")].some((o) => /not in window/.test(o.textContent)),
      )
      .catch(() => {});
    ok(
      "clear removes orphaned option",
      (await page.locator("#flt-session option", { hasText: "not in window" }).count()) === 0,
    );

    // Rejected payloads
    const before = Number(await page.locator(".intake-full [data-rejected]").getAttribute("data-rejected"));
    await pushText("{not json");
    await pushText(JSON.stringify({ state: { events: 1 }, seq: 99, demo: true }));
    await pushText(JSON.stringify({ state: combined(all), seq: 1, demo: true }));
    ok(
      "rejected payload counter counts bad payloads, not stale ones",
      Number(await page.locator(".intake-full [data-rejected]").getAttribute("data-rejected")) === before + 2,
      `before=${before}`,
    );
    await shot("rejected");

    // Analytics drawers
    await page.locator("body").click({ position: { x: 5, y: 5 } });
    await page.keyboard.press("5");
    ok("5 opens alerts", await page.locator("#drawer-alerts").isVisible());
    ok(
      "alerts lists server history with settings",
      (await page.locator("[data-alert]").count()) === 2 && /hold 5 s/.test(await text("#drawer-alerts")),
    );
    ok("alert badge counts active alerts", /▲1/.test(await text('[data-badge="alerts"]')));
    await shot("alerts");
    await page.keyboard.press("Escape");
    await page.keyboard.press("6");
    ok("6 opens quota with one row per source", (await page.locator("[data-quota]").count()) === 2);
    ok("quota bars only for measured values", (await page.locator("[data-quota-bar]").count()) === 2);
    ok(
      "quota says unknown where coverage is unproven",
      /unknown · coverage not proven/.test(await text("#drawer-quota")),
    );
    await shot("quota");
    await page.keyboard.press("Escape");
    await page.click('[data-source="orca"]');
    await page.keyboard.press("6");
    ok("source view narrows quota rows", (await page.locator("[data-quota]").count()) === 1);
    await page.keyboard.press("Escape");
    await page.click('[data-source="combined"]');
    await page.keyboard.press("7");
    ok("7 opens presets", await page.locator("#drawer-presets").isVisible());
    await page.selectOption("#preset-period", "all");
    ok("preset rows follow recorded presets", (await page.locator("[data-preset]").count()) === 2);
    ok("presets say unavailable, not zero", (await page.locator("#drawer-presets [data-unavailable]").count()) > 0);
    await shot("presets");
    await page.selectOption("#preset-period", "custom");
    await page.fill("#preset-from", "2026-11-05T12:00");
    await page.fill("#preset-to", "2026-11-03T10:00");
    ok(
      "reversed custom period is refused",
      /invalid range/.test(await text("#drawer-presets")) && (await page.locator("[data-preset]").count()) === 0,
    );
    await page.fill("#preset-from", "2026-11-03T00:00");
    await page.fill("#preset-to", "2026-11-05T23:59");
    ok("valid custom period compares again", (await page.locator("[data-preset]").count()) === 2);
    await shot("presets-custom");
    // The first Escape leaves the date input, the second closes the drawer.
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await page.waitForSelector("#drawer-presets", { state: "detached" });

    // Export drawer: blocked while a source is stale, links for a live source
    await page.keyboard.press("8");
    ok("8 opens export", await page.locator("#drawer-export").isVisible());
    await page.selectOption("#preset-period", "all");
    ok(
      "export is blocked while a source is not live, with the reason",
      (await page.locator("a.dl").count()) === 0 &&
        /source unavailable: orca stale/.test(await text("#drawer-export")) &&
        (await page.locator("span.dl.off").count()) === 2,
    );
    await shot("export-blocked");
    await page.keyboard.press("Escape");
    await page.click('[data-source="pc"]');
    await page.keyboard.press("8");
    const links = await page.locator("a.dl").evaluateAll((a) => a.map((x) => x.getAttribute("href")));
    ok(
      "live source gets same-origin md and csv links with its id",
      links.length === 2 &&
        links.every(
          (h) => h.startsWith("/api/export?") && new URL(h, "http://x").searchParams.get("source") === "pc",
        ) &&
        ["md", "csv"].every((f, i) => new URL(links[i], "http://x").searchParams.get("format") === f),
      links.join(" "),
    );
    await shot("export-links");
    await page.keyboard.press("Escape");
    await page.click('[data-source="combined"]');

    // Waiting source, sparse and full bay
    await push(combined(all, sources(null)));
    await page.click('[data-source="local"]');
    ok(
      "source without state says it is waiting",
      /waiting for local/.test(await text(".silent")) && (await rows()) === 0,
    );
    await shot("source-waiting");
    await page.click('[data-source="orca"]');
    ok(
      "sparse bay is shortened and tallied",
      (await page.locator('svg[data-sparse="true"]').count()) === 1 &&
        (await page.locator('[data-tally="role"]').count()) === 5,
    );
    const sparseHeight = Number(await page.locator(".bay-svg").getAttribute("height"));
    ok("sparse bay height is under 400", sparseHeight < 400, `height=${sparseHeight}`);
    await shot("sparse-bay");
    await page.click('[data-source="combined"]');
    await push(
      combined([
        ...all,
        ...Array.from({ length: 12 }, (_, i) => ({
          ...synthetic(100 + i, i),
          id: `m9-full-${i}`,
          ts: new Date(t0 + 10_000 + i * 100).toISOString(),
          session: JSON.stringify(["pc", "ses_full"]),
          sourceId: "pc",
        })),
      ]),
    );
    await page.waitForSelector('svg[data-sparse="false"]');
    // Lane Bay keeps ten rows aligned: 40 px wide, 36 px narrow (DESIGN #33 approved responsive contract).
    const fullBayHeight = viewport.width <= 1280 ? 360 : 400;
    ok(
      `full rail keeps the ${fullBayHeight} px bay`,
      Number(await page.locator(".bay-svg").getAttribute("height")) === fullBayHeight,
    );
    await shot("full-bay");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    ok("no horizontal page overflow", !overflow);
    await context.close();
  }
}

// ---- #33 Lane Bay identity checks ----------------------------------------------------------------------------
// Controlled-source synthetic cases that exercise the accepted DESIGN #39 contract: compact focus at both sizes,
// actual reduced-motion arrival suppression, visible keyboard focus paths, detail access, non-clipped 1024 rows,
// aggregate unlinked scope, and the rejected-payload / compact intake summary decisions from the scope approval.
async function laneBayChecks({ browser, origin, initial, outDir, check, problems }) {
  const sizes = [
    { width: 1440, height: 900 },
    { width: 1024, height: 768 },
  ];
  const { seq: _s, demo: _d, exchange: _e, analytics: _a, ...base } = initial;
  const template = initial.events[0];
  const baseObserve = initial.events.find((e) => e.observe)?.observe ?? null;
  const pair = (s) => {
    try {
      const p = JSON.parse(s);
      return Array.isArray(p) ? p[1] : s;
    } catch {
      return s;
    }
  };
  const tag = (event, sourceId, extra = {}) => ({
    ...event,
    sourceId,
    session: JSON.stringify([sourceId, pair(event.session)]),
    ...extra,
  });
  // Controlled combined state mimics the server: combined never sums per-source stats.
  const noStats = { status: "unavailable", detail: "combined view does not sum source stats" };
  const sourceNoStats = { status: "unavailable", detail: "controlled source has no stats" };
  const stateOf = (events, stats = base.stats, statsStatus = base.statsStatus) => ({
    ...base,
    events,
    stats,
    statsStatus,
    ...(stats === null
      ? {
          usage: { models: [], providers: [], variants: [], presets: "not available", totals: null },
          errors: { ...base.errors, toolFailures: null },
          readouts: { ...base.readouts, tokensToday: null },
        }
      : {}),
    window: { ...base.window, events: { retained: events.length, sent: events.length, omitted: 0 } },
  });
  const t0 = Date.parse("2026-11-04T02:13:01.000Z");
  const synthetic = (n, i) => ({
    ...template,
    id: `m33-replay-${n}`,
    ts: new Date(t0 + i * 400).toISOString(),
    prompt: `lane bay step ${n}`,
    message: `msg_m33_${n}`,
    suggestion: ["fixer", "explorer", "fixer", "oracle", "fixer"][i % 5],
    contextAgent: ["fixer", "orchestrator", "fixer", "oracle", "designer"][i % 5],
    errors: [],
    observe: {
      ...baseObserve,
      preset: ["fast", "fast", "slim", "slim", "fast"][i % 5],
    },
  });
  const original = initial.events.map((e) => ({ ...e, session: pair(e.session) }));
  const by = (name) => original.filter((e) => e.session === name);
  const pcEvents = [
    ...by("ses_A1").map((e) => tag(e, "pc", { client: "TUI" })),
    ...by("ses_B2").map((e) => tag(e, "pc", { client: "TUI" })),
    ...[1, 2, 3, 4, 5].map((n, i) => tag({ ...synthetic(n, i), session: "ses_replay" }, "pc", { client: "TUI" })),
  ];
  const orcaEvents = by("ses_C3").map((e) => tag(e, "orca", { client: "Orca", directory: "/work/orca-demo" }));
  const localEvents = by("ses_D4").map((e) => tag(e, "local"));
  const sources = (local = stateOf(localEvents, null, sourceNoStats), error = false) => [
    {
      id: "pc",
      label: "PC",
      client: "TUI",
      status: "live",
      lastSeenAt: "2026-11-04T02:13:05.000Z",
      state: stateOf(pcEvents),
    },
    {
      id: "orca",
      label: "Orca",
      client: "Orca",
      status: "stale",
      lastSeenAt: "2026-11-04T02:09:41.000Z",
      detail: "idle timeout",
      state: stateOf(orcaEvents, null, sourceNoStats),
    },
    {
      id: "local",
      label: "Local",
      status: error ? "error" : "connecting",
      detail: error ? "refused" : undefined,
      state: local,
    },
  ];
  const byTime = (events) => [...events].sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
  const combined = (events, srcs = sources()) => ({
    ...stateOf(byTime(events), null, noStats),
    exchange: { sources: srcs },
  });
  const all = [...pcEvents, ...orcaEvents, ...localEvents];

  for (const viewport of sizes) {
    const tagName = `${viewport.width}x${viewport.height}`;
    const ok = (name, value, info = "") => check(`[33-${tagName}] ${name}`, value, info);
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    page.setDefaultTimeout(4000);
    page.on("console", (m) => {
      if (m.type() === "error") problems.push(`lane-bay console: ${m.text()}`);
    });
    page.on("pageerror", (e) => problems.push(`lane-bay pageerror: ${e.message}`));
    let seq = 1;
    await page.addInitScript(() => {
      window.__es = [];
      window.EventSource = class {
        constructor(url) {
          this.url = url;
          this.l = {};
          window.__es.push(this);
          setTimeout(() => this.onopen?.({}), 0);
        }
        addEventListener(type, fn) {
          (this.l[type] ??= []).push(fn);
        }
        close() {}
      };
      window.__push = (kind, data) => {
        for (const es of window.__es) for (const fn of es.l[kind] || []) fn({ data });
      };
    });
    await page.route("**/api/state", (route) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ ...combined(all), seq: 1, demo: true }),
      }),
    );
    const push = (state, kind = "delta", s = ++seq) =>
      page.evaluate(([k, text]) => window.__push(k, text), [kind, JSON.stringify({ state, seq: s, demo: true })]);
    const pushText = (text, kind = "delta") => page.evaluate(([k, t]) => window.__push(k, t), [kind, text]);
    const shot = (name) => page.screenshot({ path: join(outDir, `m33-${name}-${tagName}.png`) });
    const text = (selector) => page.locator(selector).first().innerText();
    const style = (selector, prop) =>
      page
        .locator(selector)
        .first()
        .evaluate((el, p) => getComputedStyle(el)[p], prop);
    const visible = (selector) =>
      page
        .locator(selector)
        .first()
        .evaluate((el) => el.offsetParent !== null);
    const active = () =>
      page.evaluate(
        () =>
          document.activeElement?.id ||
          document.activeElement?.getAttribute("aria-label") ||
          document.activeElement?.getAttribute("data-source") ||
          document.activeElement?.tagName,
      );

    await page.goto(origin);
    await page.waitForSelector('[data-source="combined"]');
    await page.evaluate(() => document.fonts.ready);
    await page.waitForSelector('tr[data-row="event"]');

    const combinedRail = await text(".models");
    ok(
      "combined has no stats-derived model bars or totals",
      (await page.locator(".models .model-step-bar").count()) === 0 &&
        /total\s+—/.test(combinedRail) &&
        /tool failures\s+—/.test(combinedRail),
      combinedRail,
    );
    await page.click('[data-source="pc"]');
    await page.waitForSelector(".models .model-step-bar");
    ok(
      "PC shows its own aggregate bars and range",
      (await page.locator(".models .model-step-bar").count()) > 0 && /stats range\s+\d{4}/.test(await text(".models")),
    );
    await page.click('[data-source="combined"]');
    await page.waitForFunction(() => document.querySelectorAll(".models .model-step-bar").length === 0);

    // Populated shell with DEMO visible.
    ok("DEMO band visible", /DEMO/.test(await text(".demo-band")));
    await shot("populated");

    // DESIGN #39 measured layout expectations (fail until the UI is updated and re-measured).
    const demoHeight = await page.evaluate(() => document.querySelector(".demo-band")?.getBoundingClientRect().height);
    ok("DEMO band height 18px", demoHeight === 18, `height=${demoHeight}`);
    ok("readout value is 15px", (await style(".readout-value", "fontSize")) === "15px");
    ok(
      "wordmark is 15px bold",
      (await style(".brand-name", "fontSize")) === "15px" && /700|bold/.test(await style(".brand-name", "fontWeight")),
    );

    // Stage column widths from DESIGN #82: measure the shell grid tracks, not inner panels.
    const stageTracks = await page
      .locator(".stage")
      .first()
      .evaluate((el) =>
        window
          .getComputedStyle(el)
          .gridTemplateColumns.split(" ")
          .map((s) => Number.parseFloat(s)),
      );
    const [callsTrack, bayTrack, modelsTrack] = stageTracks;
    if (viewport.width >= 1440) {
      ok(
        "stage columns at 1440 follow DESIGN 300/840/300",
        callsTrack >= 290 &&
          callsTrack <= 310 &&
          bayTrack >= 830 &&
          bayTrack <= 850 &&
          modelsTrack >= 290 &&
          modelsTrack <= 310,
        `tracks=${JSON.stringify(stageTracks)}`,
      );
    } else {
      ok(
        "stage columns at 1024 follow DESIGN 256/536/232",
        callsTrack >= 246 &&
          callsTrack <= 266 &&
          bayTrack >= 526 &&
          bayTrack <= 546 &&
          modelsTrack >= 222 &&
          modelsTrack <= 242,
        `tracks=${JSON.stringify(stageTracks)}`,
      );
    }

    // Focused keyboard traversal through the actual Tab order (views nav keeps all 8 buttons tabbable).
    await page.locator("body").click({ position: { x: 5, y: 5 } });
    const focusInfo = () =>
      page.evaluate(() => {
        const el = document.activeElement;
        return {
          tag: el?.tagName,
          role: el?.getAttribute("role"),
          id: el?.id,
          ariaLabel: el?.getAttribute("aria-label"),
          drawer: el?.getAttribute("data-drawer"),
          inViewsNav: el ? el.closest(".views-nav") !== null : false,
          inFilters: el ? el.closest(".filters") !== null : false,
          inTicker: el?.id === "ticker",
          tickerTitle: el?.classList.contains("ticker-title") ?? false,
          outline: el ? getComputedStyle(el).outlineWidth : "",
        };
      });
    await page.keyboard.press("Tab");
    const source = await focusInfo();
    ok(
      "tab reaches source bar with visible focus",
      source.role === "radio" && source.outline !== "0px",
      JSON.stringify(source),
    );

    const visited = [];
    let current = await focusInfo();
    let steps = 0;
    while (!current.inFilters && steps < 13) {
      await page.keyboard.press("Tab");
      current = await focusInfo();
      visited.push(current);
      steps++;
    }
    const viewsButtons = visited.filter((v) => v.inViewsNav && v.outline !== "0px");
    ok(
      "Tab traverses all 9 views buttons with visible focus before filters",
      viewsButtons.length === 9 && visited[visited.length - 1]?.inFilters,
      `visited=${JSON.stringify(visited.map((v) => ({ id: v.id, ariaLabel: v.ariaLabel, drawer: v.drawer })))}`,
    );
    ok("filters has visible focus", current.outline !== "0px", JSON.stringify(current));
    ok(
      "Tab reaches replay start",
      visited.some((v) => v.id === "replay-start" && v.outline !== "0px"),
      JSON.stringify(visited),
    );
    ok(
      "Tab reaches ticker title before filters",
      visited.some((v) => v.tickerTitle),
      JSON.stringify(visited),
    );

    const tickerPath = [current];
    for (steps = 0; steps < 30; steps++) {
      await page.keyboard.press("Tab");
      current = await focusInfo();
      tickerPath.push(current);
      if (current.inTicker) break;
    }
    ok(
      "Tab traverses filter controls with visible focus",
      tickerPath.filter((v) => v.inFilters).length >= 8 &&
        tickerPath.filter((v) => v.inFilters).every((v) => v.outline !== "0px"),
      JSON.stringify(tickerPath),
    );
    // Tab focuses rows without inventing a selection; j is the existing explicit row-selection action.
    ok("Tab reaches event rows after filters", current.inTicker, JSON.stringify(current));
    await page.keyboard.press("j");
    await page.locator('#ticker tr[aria-selected="true"]').waitFor();
    const selectedRing = await page
      .locator('#ticker tr[aria-selected="true"] td:first-child')
      .first()
      .evaluate((el) => ({ width: getComputedStyle(el).outlineWidth, style: getComputedStyle(el).outlineStyle }));
    ok(
      "Tab reaches ticker after filters with selected-row focus ring",
      current.inTicker && selectedRing.width === "2px" && selectedRing.style === "solid",
      JSON.stringify({ tickerPath, selectedRing }),
    );

    // Source filter intentionally resets when the source changes.
    await page.selectOption("#flt-source", "pc");
    await page.click('[data-source="orca"]');
    ok("source filter resets when source changes", (await page.locator("#flt-source").inputValue()) === "");

    // Empty / waiting source shell.
    await push(combined(all, sources(null)));
    await page.click('[data-source="local"]');
    await page.waitForSelector(".silent");
    ok("empty source shows waiting text", /waiting for local/.test(await text(".silent")));
    await shot("empty");

    // Partial / sparse bay shell.
    await push(combined(all, sources()));
    await page.click('[data-source="orca"]');
    await page.waitForSelector('svg[data-sparse="true"]');
    ok(
      "partial bay is sparse and tallied",
      (await page.locator('svg[data-sparse="true"]').count()) === 1 &&
        (await page.locator('[data-tally="role"]').count()) === 5,
    );
    await shot("partial");

    // Error source shell.
    await push(combined(all, sources(null, true)));
    await page.click('[data-source="local"]');
    ok(
      "error source states the problem",
      /error|refused/.test((await text(".silent")) + " " + (await text(".scope-strip"))),
    );
    await shot("error");

    // Return to combined before intake / row checks.
    await push(combined(all, sources()));
    await page.click('[data-source="combined"]');

    // Rejected payloads are detailed in the Errors drawer (DESIGN #39 scope approval).
    const rejectedBefore = Number(
      (await page.locator(".intake-full [data-rejected]").getAttribute("data-rejected")) ?? "0",
    );
    await pushText("{not json");
    await pushText(JSON.stringify({ state: { events: 1 }, seq: 99, demo: true }));
    await pushText(JSON.stringify({ state: combined(all), seq: 1, demo: true }));
    // Two malformed envelopes are rejected; the valid but stale sequence is ignored, not rejected.
    await page.waitForFunction(
      (expected) =>
        Number(document.querySelector(".intake-full [data-rejected]")?.getAttribute("data-rejected")) === expected,
      rejectedBefore + 2,
    );
    const rejectedAfter = Number(
      (await page.locator(".intake-full [data-rejected]").getAttribute("data-rejected")) ?? "0",
    );
    ok(
      "rejected payload counter increments",
      rejectedAfter === rejectedBefore + 2,
      `before=${rejectedBefore} after=${rejectedAfter}`,
    );
    await page.locator("body").click({ position: { x: 5, y: 5 } });
    await page.keyboard.press("3");
    await page.waitForSelector("#drawer-errors");
    const rejectedDrawer = page.locator("#drawer-errors [data-rejected]");
    await rejectedDrawer.waitFor({ state: "attached" });
    const rejectedSection = rejectedDrawer.locator("xpath=ancestor::section[1]");
    const rejectedHeading = rejectedSection.locator("h3");
    await rejectedHeading.scrollIntoViewIfNeeded();
    const errorsText = await rejectedSection.textContent();
    const drawerCount = await rejectedDrawer.getAttribute("data-rejected");
    const intakeCount = await page.locator(".intake-full [data-rejected]").getAttribute("data-rejected");
    ok(
      "errors drawer lists rejected payloads",
      /rejected payloads \(this page\)/.test(errorsText ?? "") &&
        (await rejectedHeading.isVisible()) &&
        Number(drawerCount) === rejectedAfter &&
        drawerCount === intakeCount,
      `drawer=${drawerCount} intake=${intakeCount} expected=${rejectedAfter}`,
    );
    await page.keyboard.press("Escape");

    // Controlled long counts exercise the intentionally keyboard-scrollable title independently of the fixture burst.
    const longState = combined(all);
    longState.window = {
      ...longState.window,
      events: { ...longState.window.events, retained: 123456789, omitted: 123456789 - all.length },
      evicted: { observe: 123456789, route: 123456789, permissions: 123456789 },
    };
    longState.errors = {
      ...longState.errors,
      malformed: { observe: 123456789, route: 123456789, permissions: 123456789 },
      total: longState.errors.observe + longState.errors.route + 3 * 123456789,
    };
    await push(longState);
    await page.waitForFunction(() => document.querySelector(".ticker-title")?.textContent?.includes("123456789"));
    const title = page.locator(".ticker-title");
    const titleText = await title.textContent();
    if (viewport.width <= 1280) {
      ok(
        "ticker intake summary is compact",
        (await visible(".intake-short")) && /intake:\s*malformed\s*\d+\s*·\s*rejected\s*\d+/.test(titleText ?? ""),
      );
    } else {
      ok(
        "ticker intake line is full at ≥1440",
        (await visible(".intake-full")) && /malformed.*observe.*route.*permissions/.test(titleText ?? ""),
      );
    }
    ok(
      "long-count title retains counts intake and keyboard hints",
      /newest.*retained.*evicted observe 123456789.*route 123456789.*permissions 123456789/.test(titleText ?? "") &&
        /malformed.*rejected payloads/.test(titleText ?? "") &&
        /\/ search.*esc close/.test(titleText ?? ""),
    );
    const titleMetrics = () =>
      title.evaluate((el) => ({
        left: el.scrollLeft,
        max: el.scrollWidth - el.clientWidth,
        height: el.getBoundingClientRect().height,
        pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      }));
    await title.focus();
    await page.keyboard.press("Home");
    for (let i = 0; i < 80; i++) await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(300);
    const right = await titleMetrics();
    await page.keyboard.press("Home");
    for (let i = 0; i < 80; i++) await page.keyboard.press("ArrowLeft");
    await page.waitForTimeout(300);
    const left = await titleMetrics();
    ok(
      "long-count title keyboard scroll reaches both ends without page overflow",
      right.max > 0 &&
        right.left >= right.max - 2 &&
        left.left <= 2 &&
        Math.round(right.height) === 24 &&
        !right.pageOverflow &&
        !left.pageOverflow,
      JSON.stringify({ right, left }),
    );
    await push(combined(all));

    // Aggregate rail is explicitly unlinked from calls.
    ok("aggregate title says stats only", /aggregate.*stats only/i.test(await text(".models .panel-title")));
    ok("aggregate label says not linked to calls", /not linked to calls/i.test(await text(".models .rail-note")));

    // 1024-specific layout: row heights, non-clipped filter row and ticker rows.
    if (viewport.width <= 1280) {
      const callHeight = await page
        .locator(".call")
        .first()
        .evaluate((el) => el.getBoundingClientRect().height);
      ok("call row height is 36px at 1024", callHeight === 36, `height=${callHeight}`);

      const filtersEl = page.locator(".filters");
      const filtersRect = await filtersEl.first().evaluate((el) => el.getBoundingClientRect());
      ok("filter row height is 52px at 1024", Math.round(filtersRect.height) === 52, `height=${filtersRect.height}`);
      const filtersOverflow = await filtersEl
        .first()
        .evaluate((el) => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1);
      ok("filter controls fit inside the 52px bar", !filtersOverflow);

      const row = page.locator('tr[data-row="event"]').first();
      const rowHeight = await row.evaluate((el) => el.getBoundingClientRect().height);
      ok("ticker row height is 22px at 1024", rowHeight === 22, `height=${rowHeight}`);
      const scrollRect = await page
        .locator(".ticker-scroll")
        .first()
        .evaluate((el) => el.getBoundingClientRect());
      const visibleRows = await page.locator('tr[data-row="event"]').evaluateAll(
        (els, sr) =>
          els.filter((e) => {
            const r = e.getBoundingClientRect();
            return r.top >= sr.top && r.bottom <= sr.bottom + 1;
          }).length,
        scrollRect,
      );
      ok("ticker shows 5 full rows at 1024", visibleRows === 5, `visible=${visibleRows}`);

      ok("prompt column stays visible at 1024", await visible(".c-prompt"));
      ok("latency column stays visible at 1024", await visible(".c-latency"));
      const hiddenAtNarrow = [];
      for (const sel of [".c-reason", ".c-oracle", ".c-classifier", ".c-fallback", ".c-session"]) {
        const hidden = await page
          .locator(sel)
          .first()
          .evaluate((el) => getComputedStyle(el).display === "none" || el.offsetParent === null);
        hiddenAtNarrow.push({ sel, hidden });
      }
      ok(
        "lower-priority columns move to detail at 1024",
        hiddenAtNarrow.every((x) => x.hidden),
        hiddenAtNarrow.filter((x) => !x.hidden).map((x) => x.sel),
      );
    }

    // Actual reduced-motion arrival suppression on the 1440 main flow only.
    if (viewport.width >= 1440) {
      await page.emulateMedia({ reducedMotion: "reduce" });
      const rmSynth = {
        ...synthetic(900, 0),
        id: "m33-rm-arrive",
        ts: new Date().toISOString(),
        prompt: "reduced motion arrival",
        session: JSON.stringify(["pc", "ses_rm"]),
        sourceId: "pc",
      };
      await push(combined([...all, rmSynth]));
      const rmRow = page.locator('tr[data-id="m33-rm-arrive"]');
      await rmRow.waitFor({ state: "visible" });
      const rmAnim = await rmRow.evaluate((el) => getComputedStyle(el).animationName);
      ok("reduced motion suppresses row arrival animation", rmAnim === "none" || rmAnim === "", `animation=${rmAnim}`);

      await page.emulateMedia({ reducedMotion: "no-preference" });
      const normSynth = {
        ...synthetic(901, 1),
        id: "m33-norm-arrive",
        ts: new Date().toISOString(),
        prompt: "normal motion arrival",
        session: JSON.stringify(["pc", "ses_norm"]),
        sourceId: "pc",
      };
      await push(combined([...all, rmSynth, normSynth]));
      const normRow = page.locator('tr[data-id="m33-norm-arrive"]');
      await normRow.waitFor({ state: "visible" });
      const normAnim = await normRow.evaluate((el) => getComputedStyle(el).animationName);
      ok(
        "normal motion plays row arrival animation",
        normAnim !== "none" && normAnim !== "" && /arrive|travel/.test(normAnim),
        `animation=${normAnim}`,
      );
    }

    // Detail access and focus restoration at both sizes.
    await page.locator("body").click({ position: { x: 5, y: 5 } });
    await page.keyboard.press("j");
    const selId = await page.locator('tr[aria-selected="true"]').getAttribute("data-id");
    await page.keyboard.press("Enter");
    ok("Enter opens event detail", await page.locator('aside[aria-label="event detail"]').isVisible());
    const detailHeadings = await page
      .locator("aside.detail .detail-body h3")
      .evaluateAll((els) => els.map((e) => e.textContent));
    ok(
      "detail contains raw observe and route headings",
      detailHeadings.includes("raw observe") && detailHeadings.includes("raw route"),
      JSON.stringify(detailHeadings),
    );
    ok("detail moves focus to close button", (await active()) === "close detail");
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => document.querySelector('aside[aria-label="event detail"]') === null);
    await page.waitForFunction(() => document.activeElement?.id === "ticker", { timeout: 1000 }).catch(() => {});
    ok(
      "Escape closes detail and restores focus to ticker",
      (await page.locator('aside[aria-label="event detail"]').count()) === 0 && (await active()) === "ticker",
    );

    // Drawer focus restoration (open from a views button, close, return to it).
    await page.focus('button[data-drawer="agreement"]');
    await page.keyboard.press("Enter");
    await page.waitForSelector("#drawer-agreement");
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => document.querySelector("#drawer-agreement") === null);
    await page
      .waitForFunction(() => document.activeElement?.getAttribute("data-drawer") === "agreement", { timeout: 1000 })
      .catch(() => {});
    ok(
      "drawer close restores focus to opener",
      (await page.evaluate(() => document.activeElement?.getAttribute("data-drawer"))) === "agreement",
    );

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    ok("no horizontal page overflow", !overflow);

    await context.close();
  }
}

try {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    console.log(usage);
    process.exit(0);
  }
  const opts = {};
  for (let i = 0; i < args.length; i += 2) {
    if (
      !["--url", "--state-dir", "--screenshots-dir", "--report", "--exchange"].includes(args[i]) ||
      !args[i + 1] ||
      args[i + 1].startsWith("--")
    )
      throw new Error(`Invalid argument: ${args[i]}\n${usage}`);
    opts[args[i]] = args[i + 1];
  }
  reportPath = opts["--report"];
  if (!opts["--url"]) throw new Error(`--url is required\n${usage}`);
  const base = new URL(opts["--url"]);
  if (
    base.protocol !== "http:" ||
    !["127.0.0.1", "localhost"].includes(base.hostname) ||
    base.username ||
    base.password
  )
    throw new Error("--url must be a local HTTP server");
  const origin = base.origin;
  const modulePath = process.env.PLAYWRIGHT_MODULE_PATH;
  let playwright;
  try {
    playwright = await import(
      modulePath && (isAbsolute(modulePath) || modulePath.startsWith("."))
        ? pathToFileURL(resolve(modulePath)).href
        : modulePath || "playwright"
    );
  } catch (error) {
    throw new Error(
      `Playwright unavailable: set PLAYWRIGHT_MODULE_PATH or install playwright separately (${error.message})`,
    );
  }
  const executablePath =
    process.env.CHROMIUM_PATH || (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined);
  browser = await playwright.chromium.launch(executablePath ? { executablePath } : {});
  const stateResponse = await fetch(`${origin}/api/state`);
  if (!stateResponse.ok) throw new Error(`State endpoint returned ${stateResponse.status}`);
  const initial = await stateResponse.json();
  let appendPath;
  if (opts["--state-dir"]) {
    if (initial.demo !== true) throw new Error("Refusing writes: server is not in demo mode");
    const dir = await realpath(opts["--state-dir"]);
    const repo = await realpath(resolve(dirname(fileURLToPath(import.meta.url)), ".."));
    const roots = await Promise.all([tmpdir(), "/tmp/opencode"].filter(existsSync).map((p) => realpath(p)));
    if (!roots.some((root) => inside(dir, root)) || inside(dir, repo) || dir === repo)
      throw new Error("Refusing writes: state directory must be a temporary directory outside the repository");
    for (const name of ["observe", "route", "permissions"]) {
      const expected = join(dir, `jev-${name}.jsonl`);
      if (resolve(initial.sources?.[name]?.path || "") !== expected || (await realpath(expected)) !== expected)
        throw new Error(`Refusing writes: ${name} source does not match the temporary directory`);
    }
    appendPath = join(dir, "jev-observe.jsonl");
  }
  if (opts["--screenshots-dir"]) await mkdir(opts["--screenshots-dir"], { recursive: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(4000);
  page.on("console", (m) => {
    if (m.type() === "error") problems.push(`console: ${m.text()}`);
  });
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  page.on("response", (r) => {
    if (r.status() >= 400) problems.push(`HTTP ${r.status()}: ${r.url()}`);
  });
  page.on("requestfailed", (r) => {
    if (!r.url().endsWith("/api/events")) problems.push(`request failed: ${r.url()} ${r.failure()?.errorText}`);
  });
  await page.context().route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) {
      problems.push(`external request blocked: ${url.href}`);
      return route.abort();
    }
    return route.continue();
  });
  const response = await page.goto(origin);
  check("CSP header", /default-src 'self'/.test(response.headers()["content-security-policy"] || ""));
  await page.waitForSelector(".app");
  await page.evaluate(() => document.fonts.ready);
  check(
    "fonts loaded",
    await page.evaluate(
      () =>
        document.fonts.status === "loaded" &&
        [...document.fonts].some((f) => f.status === "loaded") &&
        [...document.fonts].every((f) => f.status !== "error"),
    ),
  );
  const rows = () => page.locator('tr[data-row="event"]').count();
  const active = () =>
    page.evaluate(
      () =>
        document.activeElement?.id ||
        document.activeElement?.getAttribute("aria-label") ||
        document.activeElement?.tagName,
    );
  const press = async (key) => {
    await page.keyboard.press(key);
  };
  const screenshot = async (name) => {
    if (opts["--screenshots-dir"]) await page.screenshot({ path: join(opts["--screenshots-dir"], `${name}.png`) });
  };
  await screenshot("flow");
  const baseline = await rows();
  check("fixture has events", baseline > 0);
  await press("/");
  check("/ focuses search", (await active()) === "flt-search");
  await page.fill("#flt-search", "no-synthetic-match-987654");
  check("search filters events", (await rows()) === 0);
  await press("Escape");
  check("Escape blurs search", (await active()) !== "flt-search");
  await page.fill("#flt-search", "no-synthetic-match-987654");
  await page.click('button[aria-label="clear filters"]');
  check("clear restores events", (await rows()) === baseline);
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await press("f");
  check("f focuses role", (await active()) === "flt-role");
  await page.selectOption("#flt-role", "fixer");
  check("role filter narrows events", (await rows()) > 0 && (await rows()) < baseline);
  await page.click('button[aria-label="clear filters"]');
  await page.check('input[aria-label="errors only"]');
  check("errors filter narrows events", (await rows()) > 0 && (await rows()) < baseline);
  await page.uncheck('input[aria-label="errors only"]');
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await press("j");
  check("j selects row", (await page.locator('tr[aria-selected="true"]').count()) === 1);
  const selected = await page.locator('tr[aria-selected="true"]').getAttribute("data-id");
  await press("j");
  await press("k");
  check(
    "k returns to previous row",
    (await page.locator('tr[aria-selected="true"]').getAttribute("data-id")) === selected,
  );
  await page.focus('button[data-drawer="agreement"]');
  await press("Enter");
  check(
    "focused button Enter opens agreement, not detail",
    (await page.locator("#drawer-agreement").isVisible()) &&
      (await page.locator('aside[aria-label="event detail"]').count()) === 0,
  );
  await page.focus('.drawer .tabs button[data-tab="usage"]');
  await press("Enter");
  check("focused tab Enter switches view", await page.locator("#drawer-usage").isVisible());
  await page.focus('.drawer button[aria-label="close drawer"]');
  await press("Enter");
  check("focused close Enter closes drawer", (await page.locator(".drawer").count()) === 0);
  await page.focus("#ticker");
  await press("Enter");
  check("Enter opens detail", await page.locator('aside[aria-label="event detail"]').isVisible());
  check("detail contains timeline", (await page.locator('[data-timeline="row"]').count()) > 0);
  await screenshot("detail");
  await press("Escape");
  check("Escape closes detail", (await page.locator('aside[aria-label="event detail"]').count()) === 0);
  for (const [key, name] of [
    ["1", "agreement"],
    ["2", "usage"],
    ["3", "errors"],
    ["4", "history"],
  ]) {
    await press(key);
    check(`${name} view opens`, await page.locator(`#drawer-${name}`).isVisible());
    await screenshot(name);
    await press("Escape");
    check(`${name} view closes`, (await page.locator(`#drawer-${name}`).count()) === 0);
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  check("reduced motion preference", await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches));
  check(
    "reduced motion CSS",
    await page.evaluate(() =>
      [...document.styleSheets].some((sheet) => {
        try {
          return [...sheet.cssRules].some((rule) => rule.conditionText?.includes("prefers-reduced-motion"));
        } catch {
          return false;
        }
      }),
    ),
  );
  const clock = await page.context().newPage();
  await clock.clock.install({ time: new Date("2026-11-04T02:13:30.000Z") });
  await clock.goto(origin);
  await clock.waitForSelector('tr[data-row="event"]');
  await clock.selectOption("#flt-time", "5m");
  const before = await clock.locator('tr[data-row="event"]').count();
  let deltas = 0;
  await clock.evaluate(() => {
    window.__verifyDeltas = 0;
    const es = new EventSource("/api/events");
    es.addEventListener("delta", () => window.__verifyDeltas++);
  });
  await clock.clock.runFor(360000);
  deltas = await clock.evaluate(() => window.__verifyDeltas);
  check(
    "clock expires time filter without SSE delta",
    before > 0 && (await clock.locator('tr[data-row="event"]').count()) === 0 && deltas === 0,
    `before=${before}, deltas=${deltas}`,
  );
  await clock.close();
  // Real report download against the running server (no fake state): link -> attachment -> body.
  const real = await page.context().newPage();
  await real.goto(origin);
  await real.waitForSelector('tr[data-row="event"]');
  await real.locator("body").click({ position: { x: 5, y: 5 } });
  await real.keyboard.press("8");
  await real.selectOption("#preset-period", "all");
  const exportLinks = await real.locator("a.dl").evaluateAll((a) => a.map((x) => x.getAttribute("href")));
  check("real export drawer offers md and csv links", exportLinks.length === 2, exportLinks.join(" "));
  for (const href of exportLinks) {
    const response = await real.context().request.get(origin + href);
    const type = response.headers()["content-type"] || "";
    check(
      `real ${new URL(href, origin).searchParams.get("format")} export responds with a report`,
      response.status() === 200 && /markdown|csv/.test(type) && (await response.text()).length > 0,
      `${response.status()} ${type}`,
    );
  }
  if (exportLinks.length) {
    const [download] = await Promise.all([real.waitForEvent("download"), real.click('a.dl[data-format="md"]')]);
    check(
      "clicking the Markdown link downloads routing-report.md",
      download.suggestedFilename() === "routing-report.md",
    );
  }
  await real.close();
  if (opts["--screenshots-dir"] || opts["--exchange"]) {
    const outDir = opts["--screenshots-dir"] || tmpdir();
    await exchangeChecks({ browser, origin, initial, outDir, check, problems });
    await laneBayChecks({ browser, origin, initial, outDir, check, problems });
  } else {
    skip("exchange harness", "Pass --screenshots-dir or --exchange to run the M9 exchange checks");
    skip("Lane Bay #33 shell checks", "Pass --screenshots-dir or --exchange to run the controlled DESIGN #39 checks");
  }
  if (appendPath) {
    // The synthetic record is based on the anonymized observe fixture, never on real logs.
    const template = {
      session: "ses_verify",
      agent: "orchestrator",
      prompt: "Synthetic verification event",
      model: "jev-1.13-free",
      status: 200,
      answers: {
        role: {
          type: "choice",
          choice: "fixer",
          confidence: 0.77,
          probabilities: { orchestrator: 0.2, explorer: 0, fixer: 0.77, designer: 0, oracle: 0.03 },
        },
        needs_oracle: { type: "noul", noul: 0.22 },
      },
      latency_ms: 379,
    };
    const records =
      Array.from({ length: 320 }, (_, i) =>
        JSON.stringify({ ...template, ts: new Date().toISOString(), message: `msg_verify_${i}_${Date.now()}` }),
      ).join("\n") + "\n";
    const latest = await (await fetch(`${origin}/api/state`)).json();
    if (
      latest.demo !== true ||
      resolve(latest.sources?.observe?.path || "") !== appendPath ||
      (await realpath(appendPath)) !== appendPath
    )
      throw new Error("Refusing writes: demo state or source changed");
    await appendFile(appendPath, records);
    await page.waitForSelector(".burst", { timeout: 10000 });
    check(
      "burst over 10/s collapses motion",
      /\+\d+ in 1 s.*motion collapsed/.test(await page.locator(".burst").innerText()),
    );
    await page.waitForFunction(() => document.querySelectorAll('tr[data-row="event"]').length === 300, null, {
      timeout: 10000,
    });
    check("render limit is 300", (await rows()) === 300);
  } else {
    skip("burst over 10/s collapses motion", "Pass --state-dir for safe demo appends");
    skip("render limit is 300", "Pass --state-dir for safe demo appends");
  }
  check("console and same-origin network", problems.length === 0, problems.join("; "));
} catch (error) {
  check("verification completed", false, error.stack || error.message);
} finally {
  if (browser) await browser.close();
  const failed = checks.filter((c) => c.ok === false).length;
  const result = {
    total: checks.length,
    passed: checks.filter((c) => c.ok === true).length,
    failed,
    skipped: checks.filter((c) => c.ok === null).length,
    checks,
  };
  const json = `${JSON.stringify(result, null, 2)}\n`;
  if (reportPath) {
    try {
      await writeFile(reportPath, json);
    } catch (error) {
      console.error(`Cannot write report: ${error.message}`);
      process.exitCode = 1;
    }
  } else process.stdout.write(json);
  if (failed) process.exitCode = 1;
}
