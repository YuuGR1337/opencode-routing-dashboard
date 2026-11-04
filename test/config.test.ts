import { expect, test } from "bun:test";
import { homedir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../src/config";

test("source paths default to state directory and support environment and flag overrides", () => {
  expect(loadConfig({ ORD_STATE_DIR: "/state" }, []).sourcePaths).toEqual({
    observe: "/state/jev-observe.jsonl",
    route: "/state/jev-route.jsonl",
    permissions: "/state/jev-permissions.jsonl",
  });
  expect(
    loadConfig({ ORD_OBSERVE_PATH: "~/observe", ORD_ROUTE_PATH: "env", ORD_PERMISSIONS_PATH: "~/permissions" }, [
      "--route-path=a=b",
      "--observe-path",
      "~/override",
    ]).sourcePaths,
  ).toEqual({
    observe: join(homedir(), "override"),
    route: "a=b",
    permissions: join(homedir(), "permissions"),
  });
});

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
