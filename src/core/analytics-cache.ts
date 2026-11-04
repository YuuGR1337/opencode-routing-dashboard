import { aggregate, type DashboardInput, type DashboardState } from "./aggregate";

/** Caller must invalidate after mutating an input in place. */
export function createAnalyticsCache(
  builder: (input: DashboardInput) => DashboardState = (input) =>
    aggregate(input, Date.now(), { maxBytes: Number.MAX_SAFE_INTEGER }),
) {
  const states = new WeakMap<DashboardInput, DashboardState>();
  return {
    get(input: DashboardInput) {
      let state = states.get(input);
      if (!state) {
        state = builder(input);
        states.set(input, state);
      }
      return state;
    },
    invalidate(input: DashboardInput) {
      states.delete(input);
    },
  };
}
