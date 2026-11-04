import type { DashboardState, FlowEvent } from "../src/core/aggregate";

export const SPEEDS = [0.5, 1, 2, 4] as const;
export type Speed = (typeof SPEEDS)[number];
export type ReplayCoverage = {
  /** Events of this session among the sent events. */
  inSession: number;
  omitted: number;
  evicted: number;
  /** True whenever older events of the session may be missing from this sample. */
  mayBeIncomplete: boolean;
};

const MIN_DELAY = 120;
const MAX_DELAY = 1500;
const FALLBACK_DELAY = 400;

/** The session's sent events, oldest first. Never mutates the input. */
export function sessionTimeline(events: FlowEvent[], session: string): FlowEvent[] {
  return events
    .filter((e) => e.session === session)
    .sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Pause before the next event: the recorded gap divided by speed, kept between 120 ms and 1.5 s. */
export function replayDelay(prevTs: string, nextTs: string, speed: number): number {
  const gap = Date.parse(nextTs) - Date.parse(prevTs);
  const raw = Number.isFinite(gap) ? Math.max(0, gap) / speed : FALLBACK_DELAY / speed;
  return Math.round(Math.min(MAX_DELAY, Math.max(MIN_DELAY, raw)));
}

export function stepIndex(index: number, delta: number, length: number): number {
  if (length <= 0) return 0;
  return Math.min(length - 1, Math.max(0, index + delta));
}

export function nextSpeed(speed: Speed, direction: 1 | -1): Speed {
  const at = SPEEDS.indexOf(speed);
  return SPEEDS[Math.min(SPEEDS.length - 1, Math.max(0, at + direction))]!;
}

/** What a replay sample can honestly claim: sent events only, with what was omitted or evicted beside it. */
export function replayCoverage(timeline: FlowEvent[], window: DashboardState["window"]): ReplayCoverage {
  const omitted = window.events.omitted;
  const evicted = window.evicted.observe + window.evicted.route;
  return { inSession: timeline.length, omitted, evicted, mayBeIncomplete: omitted > 0 || evicted > 0 };
}
