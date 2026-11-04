#!/usr/bin/env node
import { existsSync } from "node:fs";
import { appendFile, mkdir, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const usage = `Usage: node scripts/verify-ui.mjs --url URL [--state-dir DIR] [--screenshots-dir DIR] [--report FILE]
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

try {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    console.log(usage);
    process.exit(0);
  }
  const opts = {};
  for (let i = 0; i < args.length; i += 2) {
    if (
      !["--url", "--state-dir", "--screenshots-dir", "--report"].includes(args[i]) ||
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
