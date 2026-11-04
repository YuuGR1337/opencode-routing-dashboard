import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadLocalSourceConfig, loadSourceConfig, parseSourceConfig } from "../src/sources/source-config";

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

test("local metadata file accepts only client and validated directory rules", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ord-local-source-"));
  const path = join(dir, "metadata.json");
  try {
    const value = { client: "TUI" as const, directoryRules: [{ prefix: "/work/orca", client: "Orca" as const }] };
    await writeFile(path, JSON.stringify(value));
    expect(await loadLocalSourceConfig(path)).toEqual(value);
    for (const invalid of [
      { token: "sentinel" },
      { id: "local" },
      { endpoint: "http://localhost" },
      { client: "bad" },
      { directoryRules: [{ prefix: "relative", client: "Orca" }] },
      [],
      null,
    ]) {
      await writeFile(path, JSON.stringify(invalid));
      await expect(loadLocalSourceConfig(path)).rejects.toThrow();
    }
    await writeFile(path, " ".repeat(256 * 1024 + 1));
    await expect(loadLocalSourceConfig(path)).rejects.toThrow();
    await expect(loadLocalSourceConfig("/tmp/.ssh/config.json")).rejects.toThrow("Invalid configuration path");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
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
