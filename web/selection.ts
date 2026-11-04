import type { FlowEvent } from "../src/core/aggregate";
import { evidence } from "./exchange";

export const OPTION_FIELDS = ["session", "role", "agent", "model", "decision", "source", "client"] as const;
export type OptionField = (typeof OPTION_FIELDS)[number];
export type OptionMemory = Record<OptionField, string[]>;
export type OptionItem = { value: string; label: string; gone: boolean };

/**
 * When `id` leaves the list, pick the closest entry that is still alive: the following neighbour first,
 * then the preceding one. Returns `id` itself when it survived and null when nothing is left.
 */
export function nearestSurvivor(prevOrder: string[], id: string, alive: ReadonlySet<string>): string | null {
  if (alive.has(id)) return id;
  const at = prevOrder.indexOf(id);
  if (at < 0) return null;
  for (let i = at + 1; i < prevOrder.length; i++) if (alive.has(prevOrder[i]!)) return prevOrder[i]!;
  for (let i = at - 1; i >= 0; i--) if (alive.has(prevOrder[i]!)) return prevOrder[i]!;
  return null;
}

const sorted = (values: Iterable<string>) => [...new Set(values)].sort();
const present = (values: (string | null | undefined)[]) => values.filter((v): v is string => typeof v === "string");

export function currentOptions(events: FlowEvent[]): OptionMemory {
  return {
    session: sorted(events.map((e) => e.session)),
    role: sorted(present(events.map((e) => e.suggestion))),
    agent: sorted(present(events.map((e) => e.contextAgent))),
    model: sorted(present(events.map((e) => e.classifierModel))),
    decision: sorted(present(events.map((e) => e.decision))),
    source: sorted(present(events.map((e) => evidence(e).sourceId))),
    client: sorted(present(events.map((e) => evidence(e).client))),
  };
}

/** Union of everything seen so far. Returns `prev` itself when nothing new appeared, so state updates can bail out. */
export function rememberOptions(prev: OptionMemory | null, events: FlowEvent[]): OptionMemory {
  const now = currentOptions(events);
  if (!prev) return now;
  let changed = false;
  const next = {} as OptionMemory;
  for (const field of OPTION_FIELDS) {
    const merged = sorted([...prev[field], ...now[field]]);
    if (merged.length !== prev[field].length) changed = true;
    next[field] = merged;
  }
  return changed ? next : prev;
}

/**
 * Options for one filter. `base` values are always offered in their given order; others follow sorted.
 * A value that is neither in the current window nor in `base` is marked, never dropped while remembered or active.
 */
export function optionList(
  known: string[],
  current: string[],
  active: string,
  base: readonly string[] = [],
  show: (value: string) => string = (v) => v,
): OptionItem[] {
  const now = new Set(current);
  const fixed = new Set(base);
  const rest = sorted([...known, ...current, ...(active ? [active] : [])]).filter((v) => !fixed.has(v));
  return [...base, ...rest].map((value) => {
    const gone = !now.has(value) && !fixed.has(value);
    return { value, label: gone ? `${show(value)} · not in window` : show(value), gone };
  });
}

export const sameOptions = (a: OptionMemory, b: OptionMemory) =>
  OPTION_FIELDS.every((f) => a[f].length === b[f].length && a[f].every((v, i) => v === b[f][i]));
