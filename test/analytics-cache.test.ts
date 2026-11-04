import { expect, test } from "bun:test";
import { aggregate, type DashboardInput } from "../src/core/aggregate";
import { createAnalyticsCache } from "../src/core/analytics-cache";

test("retained source aggregation is cached until explicit mutation invalidation", () => {
  const input: DashboardInput = {
    observe: [],
    route: [],
    permissions: [],
    stats: null,
    malformed: { observe: 0, route: 0, permissions: 0 },
  };
  let builds = 0;
  const cache = createAnalyticsCache((source) => {
    builds++;
    return aggregate(source);
  });
  const first = cache.get(input);
  for (let tick = 0; tick < 5; tick++) expect(cache.get(input)).toBe(first);
  expect(builds).toBe(1);
  input.malformed.observe++;
  cache.invalidate(input);
  expect(cache.get(input).errors.malformed.observe).toBe(1);
  expect(builds).toBe(2);
  expect(cache.get(input)).toBe(cache.get(input));
  expect(builds).toBe(2);
});
