import { expect, test } from "bun:test";
import { loadSourceConfig, parseSourceConfig } from "../src/sources/source-config";

test("validates explicit source definitions and rejects credentials", () => {
  const source = { id: "pc", label: "PC", endpoint: "http://127.0.0.1:1234", tokenEnv: "AGENT_TOKEN" };
  expect(parseSourceConfig([source])).toEqual([source]);
  expect(() => parseSourceConfig([{ ...source, endpoint: "http://user:secret@localhost" }])).toThrow();
  expect(() => parseSourceConfig([source, source])).toThrow();
  expect(() => parseSourceConfig([{ ...source, token: "secret" }])).toThrow();
  expect(() => parseSourceConfig([{ ...source, id: "local" }])).toThrow();
});

test("rejects credential directory paths before opening", async () => {
  expect(loadSourceConfig("/tmp/.ssh/config.json")).rejects.toThrow("Invalid configuration path");
});

test("validates bounded absolute directory classification rules", () => {
  const source = {
    id: "pc",
    label: "PC",
    endpoint: "http://localhost",
    directoryRules: [{ prefix: "/work/orca", client: "Orca" as const, label: "Worktree" }],
  };
  expect(parseSourceConfig([source])).toEqual([source]);
  for (const rules of [
    [{ prefix: "relative", client: "Orca" }],
    [{ prefix: "/work/../other", client: "Orca" }],
    [{ prefix: "/x", client: "unknown" }],
    [{ prefix: "/x", client: "TUI", token: "x" }],
    Array(65).fill({ prefix: "/x", client: "TUI" }),
  ]) {
    expect(() => parseSourceConfig([{ ...source, directoryRules: rules }])).toThrow();
  }
});
