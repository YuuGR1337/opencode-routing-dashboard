import type { FlowEvent } from "../src/core/aggregate";

export function livePrompts(events: FlowEvent[], omitted: number, now: number): { count: number; lowerBound: boolean } {
  const boundary = now - 60_000;
  let count = 0;
  let oldest = Number.POSITIVE_INFINITY;
  for (const event of events) {
    const timestamp = Date.parse(event.ts);
    if (!Number.isFinite(timestamp)) continue;
    oldest = Math.min(oldest, timestamp);
    if (timestamp > boundary && timestamp <= now && (event.observe !== null || event.message !== null)) count++;
  }
  return { count, lowerBound: omitted > 0 && oldest > boundary };
}
