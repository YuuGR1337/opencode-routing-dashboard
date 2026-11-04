import type { DashboardState } from "./aggregate";
import type { StatsRecord } from "./schema";

export type ReportRange = { from: number; to: number };
type ReportEvent = {
  id: string;
  ts: string;
  session: string;
  message: string | null;
  suggestion: string | null;
  contextAgent: string | null;
  contextAgreement: boolean | null;
  decision: string | null;
  latency: number | null;
  errors: string[];
};
export type Report = {
  range: ReportRange;
  sources: {
    id: string;
    label: string;
    events: ReportEvent[];
    rangeComplete: boolean;
    rangeCompleteReason: string;
    oldestIncludedTs: string | null;
    coverage: DashboardState["window"];
    malformed: DashboardState["errors"]["malformed"];
    stats: { status: "matches" | "different range" | "unavailable"; data: StatsRecord | null; reason: string };
  }[];
};

// Date-only endpoints denote UTC days: the end date includes its entire day.
// Date-time endpoints are exact instants. All ranges are [from, to).
function instant(value: string, end: boolean): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2}))?$/.exec(value);
  if (!match) throw new Error("Invalid ISO date or date-time");
  const [, y, m, d, h, min, sec, , zone] = match;
  const year = Number(y),
    month = Number(m),
    day = Number(d);
  const calendar = new Date(0);
  calendar.setUTCFullYear(year, month - 1, day);
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    calendar.getUTCFullYear() !== year ||
    calendar.getUTCMonth() !== month - 1 ||
    calendar.getUTCDate() !== day ||
    (h !== undefined && (Number(h) > 23 || Number(min) > 59 || Number(sec) > 59)) ||
    (zone && zone !== "Z" && (Number(zone.slice(1, 3)) > 23 || Number(zone.slice(4, 6)) > 59))
  )
    throw new Error("Invalid ISO date or date-time");
  const time = Date.parse(value);
  if (!Number.isFinite(time)) throw new Error("Invalid ISO date or date-time");
  return time + (end && h === undefined ? 86400000 : 0);
}
export function parseReportRange(from: string, to: string): ReportRange {
  const range = { from: instant(from, false), to: instant(to, true) };
  if (!Number.isFinite(range.to) || range.from >= range.to) throw new Error("Invalid report range");
  return range;
}
export function buildReport(
  sources: { id: string; label: string; state: DashboardState }[],
  range: ReportRange,
): Report {
  if (!Number.isFinite(range.from) || !Number.isFinite(range.to) || range.from >= range.to)
    throw new Error("Invalid report range");
  return {
    range: { ...range },
    sources: sources.map(({ id, label, state }) => {
      const rangeComplete =
        state.window.events.omitted === 0 &&
        state.window.permissions.omitted === 0 &&
        Object.values(state.window.evicted).every((count) => count === 0) &&
        Object.values(state.errors.malformed).every((count) => count === 0);
      const oldestIncludedTs = state.events.reduce<string | null>((oldest, event) => {
        const timestamp = Date.parse(event.ts);
        return timestamp >= range.from && timestamp < range.to && (oldest === null || timestamp < Date.parse(oldest))
          ? event.ts
          : oldest;
      }, null);
      return {
        id,
        label,
        rangeComplete,
        rangeCompleteReason: rangeComplete
          ? "Complete within retained source evidence; historical logs before retention are not guaranteed."
          : "Omitted, evicted or malformed evidence may overlap the requested range.",
        oldestIncludedTs,
        events: state.events
          .filter((e) => {
            const t = Date.parse(e.ts);
            return t >= range.from && t < range.to;
          })
          .map((e) => ({
            id: e.id,
            ts: e.ts,
            session: e.session,
            message: e.message,
            suggestion: e.suggestion,
            contextAgent: e.contextAgent,
            contextAgreement: e.suggestion !== null && e.contextAgent !== null ? e.suggestion === e.contextAgent : null,
            decision: e.decision,
            latency: e.latency,
            errors: [...e.errors],
          })),
        coverage: structuredClone(state.window),
        malformed: { ...state.errors.malformed },
        stats: {
          status: state.stats
            ? state.stats.range.from === range.from && state.stats.range.to === range.to
              ? ("matches" as const)
              : ("different range" as const)
            : ("unavailable" as const),
          data: state.stats ? structuredClone(state.stats) : null,
          reason: state.stats
            ? "Stats retain their own range; not allocated to events."
            : (state.statsStatus?.detail ?? "Stats unavailable"),
        },
      };
    }),
  };
}

type Cell = string | number | boolean | null;
export function formatReport(report: Report, format: "md" | "csv"): string {
  const rows: Cell[][] = [["section", "source_id", "source_label", "item", "value", "status_or_reason"]];
  const add = (section: string, id: string, label: string, item: string, value: Cell, reason = "") =>
    rows.push([section, id, label, item, value, reason]);
  add("range", "", "", "from inclusive (epoch ms)", report.range.from);
  add("range", "", "", "to exclusive (epoch ms)", report.range.to);
  for (const s of report.sources) {
    add("coverage", s.id, s.label, "range completeness", s.rangeComplete, s.rangeCompleteReason);
    add(
      "coverage",
      s.id,
      s.label,
      "oldest included event",
      s.oldestIncludedTs,
      s.oldestIncludedTs === null ? "No included events" : "",
    );
    for (const kind of ["events", "permissions"] as const)
      for (const field of ["retained", "sent", "omitted"] as const)
        add(
          "coverage",
          s.id,
          s.label,
          `${kind} ${field}`,
          s.coverage[kind][field],
          "Entire retained window, not filtered range",
        );
    for (const kind of ["observe", "route", "permissions"] as const) {
      add("coverage", s.id, s.label, `${kind} evicted`, s.coverage.evicted[kind], "Process lifetime");
      add("diagnostics", s.id, s.label, `${kind} malformed`, s.malformed[kind], "Process lifetime; not range filtered");
    }
    s.events.forEach((e, index) => {
      const section = `event ${index + 1}`;
      for (const [key, value] of Object.entries({
        id: e.id,
        timestamp: e.ts,
        session: e.session,
        message: e.message,
        suggestion: e.suggestion,
        "context agent": e.contextAgent,
        "context agreement": e.contextAgreement,
        decision: e.decision,
        "latency ms": e.latency,
      }))
        add(section, s.id, s.label, key, value, value === null ? "not available" : "");
      for (const error of e.errors) add(section, s.id, s.label, "error", error);
      for (const key of [
        "execution agent",
        "execution model",
        "execution provider",
        "execution variant",
        "tokens",
        "cost",
      ])
        add(section, s.id, s.label, key, null, "not available per event");
      add(section, s.id, s.label, "fallback", null, "not detectable");
    });
    add("stats", s.id, s.label, "status", s.stats.status, s.stats.reason);
    const st = s.stats.data;
    if (st) {
      add("stats", s.id, s.label, "from (epoch ms)", st.range.from);
      add("stats", s.id, s.label, "to (epoch ms)", st.range.to);
      for (const key of ["sessions", "subagents", "prompts", "steps", "cost"] as const)
        add(
          "stats",
          s.id,
          s.label,
          key,
          st[key],
          key === "cost" && st[key] === 0 ? "Reported zero cost; not zero quota" : "",
        );
      for (const key of ["input", "output", "reasoning"] as const)
        add("stats", s.id, s.label, `tokens ${key}`, st.tokens[key]);
      for (const key of ["read", "write"] as const)
        add("stats", s.id, s.label, `tokens cache ${key}`, st.tokens.cache[key]);
      add("stats", s.id, s.label, "tool failures", st.tools.totals.failed);
      st.models.forEach((m) => {
        const name = JSON.stringify([m.model.providerID, m.model.id, m.model.variant]);
        for (const key of ["steps", "cost"] as const) add("stats model", s.id, s.label, `${name} ${key}`, m[key]);
        for (const key of ["input", "output", "reasoning"] as const)
          add("stats model", s.id, s.label, `${name} tokens ${key}`, m.tokens[key]);
        for (const key of ["read", "write"] as const)
          add("stats model", s.id, s.label, `${name} tokens cache ${key}`, m.tokens.cache[key]);
      });
    }
  }
  if (format === "csv")
    return (
      rows
        .map((row) =>
          row
            .map((cell) => {
              let text = cell === null ? "" : String(cell);
              if (/^[\s]*[=+\-@\t\r]/.test(text)) text = `'${text}`;
              return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
            })
            .join(","),
        )
        .join("\r\n") + "\r\n"
    );
  if (format !== "md") throw new Error("Unsupported report format");
  const md = (cell: Cell) =>
    (cell === null ? "" : String(cell))
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\|/g, "\\|")
      .replace(/\r\n|\r|\n/g, "<br>");
  return `# Routing report\n\n${rows.map((r, i) => `| ${r.map(md).join(" | ")} |${i === 0 ? "\n| --- | --- | --- | --- | --- | --- |" : ""}`).join("\n")}\n`;
}
