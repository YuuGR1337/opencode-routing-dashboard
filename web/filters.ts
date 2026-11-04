import type { FlowEvent } from "../src/core/aggregate";
import { evidence } from "./exchange";

export type FlowFilters = {
  query: string;
  timeRange: "all" | "5m" | "1h" | "24h";
  session: string;
  role: string;
  agent: string;
  model: string;
  decision: string;
  source: string;
  client: string;
  errorsOnly: boolean;
};
export const EMPTY_FILTERS: FlowFilters = {
  query: "",
  timeRange: "all",
  session: "",
  role: "",
  agent: "",
  model: "",
  decision: "",
  source: "",
  client: "",
  errorsOnly: false,
};
export function filterEvents(events: FlowEvent[], filters: FlowFilters, now: number): FlowEvent[] {
  const windows: Record<Exclude<FlowFilters["timeRange"], "all">, number> = {
    "5m": 5 * 60_000,
    "1h": 60 * 60_000,
    "24h": 24 * 60 * 60_000,
  };
  const query = filters.query.toLowerCase();
  return events.filter((event) => {
    if (filters.timeRange !== "all") {
      const window = windows[filters.timeRange];
      const timestamp = Date.parse(event.ts);
      if (!Number.isFinite(window) || !Number.isFinite(timestamp) || timestamp > now || timestamp < now - window)
        return false;
    }
    if (filters.session && event.session !== filters.session) return false;
    if (filters.role && event.suggestion !== filters.role) return false;
    if (filters.agent && event.contextAgent !== filters.agent) return false;
    if (filters.model && event.classifierModel !== filters.model) return false;
    if (filters.decision && event.decision !== filters.decision) return false;
    if (filters.errorsOnly && event.errors.length === 0) return false;
    const tag = evidence(event);
    if (filters.source && tag.sourceId !== filters.source) return false;
    if (filters.client && tag.client !== filters.client) return false;
    return (
      !query ||
      [
        event.prompt,
        event.session,
        event.message,
        event.reason,
        ...event.errors,
        event.suggestion,
        event.routeSuggestion,
        event.contextAgent,
        event.classifierModel,
        tag.directory,
        tag.client,
      ].some((value) => value?.toLowerCase().includes(query))
    );
  });
}
