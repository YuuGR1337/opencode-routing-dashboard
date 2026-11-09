import type { FlowEvent } from "../src/core/aggregate";
import type { SessionListEntry } from "../src/core/session-inspection";

/**
 * The id the rest of the dashboard uses for a session: the federated string `JSON.stringify([sourceId, session])`
 * when the entry came from a configured source, otherwise the session string as recorded.
 */
export const sessionKey = (entry: Pick<SessionListEntry, "sourceId" | "session">): string =>
  entry.sourceId === null ? entry.session : JSON.stringify([entry.sourceId, entry.session]);

/** Next row id for arrow / j / k movement. Clamped at both ends; with nothing current it starts at the first row. */
export function moveRow(ids: string[], current: string | null, delta: number): string | null {
  if (ids.length === 0) return null;
  const at = current === null ? -1 : ids.indexOf(current);
  if (at < 0) return ids[0]!;
  return ids[Math.min(ids.length - 1, Math.max(0, at + delta))]!;
}

/** Key `s` and the event detail action: the selected event's session and the same event, or nothing. */
export function sessionEntry(events: FlowEvent[], selected: string | null): { session: string; event: string } | null {
  const event = selected === null ? undefined : events.find((e) => e.id === selected);
  return event ? { session: event.session, event: event.id } : null;
}

/** Esc inside the inspector: detail goes back to the list, anything else closes the overlay. */
export const escapeAction = (drawer: string | null, inspected: string | null): "to-list" | "close" =>
  drawer === "sessions" && inspected !== null ? "to-list" : "close";
