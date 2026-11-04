import { expect, test } from "bun:test";
import { loadConfig } from "../src/config";

test("config defaults and validates ports", () => {
  expect(loadConfig({}, []).port).toBe(4777);
  expect(() => loadConfig({ ORD_PORT: "65536" }, [])).toThrow();
});
test("flag values preserve equals signs", () => {
  expect(loadConfig({}, ["--stats-file=a=b.json"]).statsFile).toBe("a=b.json");
});
test("demo is explicit, validated and overridden by flags", () => {
  expect(loadConfig({}, []).demo).toBe(false);
  expect(loadConfig({ ORD_DEMO: "true" }, []).demo).toBe(true);
  expect(loadConfig({ ORD_DEMO: "true" }, ["--demo", "false"]).demo).toBe(false);
  expect(loadConfig({}, ["--demo=true"]).demo).toBe(true);
  expect(() => loadConfig({ ORD_DEMO: "invalid" }, [])).toThrow();
});
