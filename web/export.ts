import { analyticsEvents, type Period, periodRange } from "./analytics";
import { COMBINED, type ExchangeState } from "./exchange";

export type ExportFormat = "md" | "csv";
export type ExportPlan = {
  range: { from: number; to: number } | null;
  /** Source id sent to the endpoint; null means every source (parameter omitted). */
  sourceId: string | null;
  /** Sources the report would read, with why any of them blocks the download. */
  sources: { id: string; status: string; blocked: string | null }[];
  /** Same-origin download URLs, present only when the range is valid and every targeted source is live. */
  links: Record<ExportFormat, string> | null;
  /** Why there are no links. */
  reason: string | null;
};

const url = (from: string, to: string, format: ExportFormat, sourceId: string | null) => {
  const params = new URLSearchParams({ from, to, format });
  if (sourceId !== null) params.set("source", sourceId);
  return `/api/export?${params}`;
};

/**
 * What the report download would be for the current view and period. The endpoint refuses ranges that are not
 * valid and sources that are not live, so no link is offered in those cases, with the reason instead.
 * The period is the one the preset comparison uses.
 */
export function exportPlan(state: ExchangeState, viewId: string, period: Period, now: number): ExportPlan {
  const all = state.exchange?.sources ?? [];
  const chosen = viewId === COMBINED ? undefined : all.find((s) => s.id === viewId);
  const sourceId = chosen ? chosen.id : null;
  const sources = (chosen ? [chosen] : all).map((s) => ({
    id: s.id,
    status: s.status,
    blocked: s.status !== "live" ? s.status : s.state === null ? "no state" : null,
  }));
  const range = periodRange(period, analyticsEvents(state, viewId), now);
  const blocked = sources.filter((s) => s.blocked !== null);
  const reason = !range
    ? "invalid range"
    : range.from >= range.to
      ? "empty range"
      : blocked.length
        ? `source unavailable: ${blocked.map((s) => `${s.id} ${s.blocked}`).join(" · ")}`
        : null;
  if (reason || !range) return { range, sourceId, sources, links: null, reason };
  const from = new Date(range.from).toISOString();
  const to = new Date(range.to).toISOString();
  return {
    range,
    sourceId,
    sources,
    links: { md: url(from, to, "md", sourceId), csv: url(from, to, "csv", sourceId) },
    reason: null,
  };
}
