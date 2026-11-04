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
test("local source config supports env and overrides via flag", () => {
  expect(loadConfig({}, []).localSourceConfigFile).toBeUndefined();
  expect(loadConfig({ ORD_LOCAL_SOURCE_CONFIG: "~/local.json" }, []).localSourceConfigFile).toBe(
    join(homedir(), "local.json"),
  );
  expect(
    loadConfig({ ORD_LOCAL_SOURCE_CONFIG: "env.json" }, ["--local-source-config=chosen.json"]).localSourceConfigFile,
  ).toBe("chosen.json");
});
test("demo is explicit, validated and overridden by flags", () => {
  expect(loadConfig({}, []).demo).toBe(false);
  expect(loadConfig({ ORD_DEMO: "true" }, []).demo).toBe(true);
  expect(loadConfig({ ORD_DEMO: "true" }, ["--demo", "false"]).demo).toBe(false);
  expect(loadConfig({}, ["--demo=true"]).demo).toBe(true);
  expect(() => loadConfig({ ORD_DEMO: "invalid" }, [])).toThrow();
});

test("agent options are parsed without exposing token values", () => {
  const config = loadConfig({ MY_TOKEN: "secret-value" }, [
    "--config",
    "remote.json",
    "--bind",
    "127.0.0.2",
    "--token-env",
    "MY_TOKEN",
    "--redact-prompts",
    "true",
  ]);
  expect(config.configFile).toBe("remote.json");
  expect(config.bind).toBe("127.0.0.2");
  expect(config.tokenEnv).toBe("MY_TOKEN");
  expect(config.redactPrompts).toBe(true);
  expect(JSON.stringify(config)).not.toContain("secret-value");
  expect(loadConfig({}, []).bind).toBe("127.0.0.1");
  expect(() => loadConfig({}, ["--redact-prompts", "yes"])).toThrow();
});

test("CLI rejects recursive agent config and non-loopback dashboard binds", async () => {
  for (const args of [
    ["agent", "--config", "x"],
    ["serve", "--bind", "0.0.0.0"],
  ]) {
    const proc = Bun.spawn([process.execPath, "src/cli.ts", ...args], {
      env: { PATH: process.env.PATH },
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(await proc.exited).toBe(1);
  }
});
