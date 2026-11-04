import { open, realpath } from "node:fs/promises";
import { resolve } from "node:path";

/** The JSON configuration is an array of sources; tokens are environment-variable references. */
export type DirectoryRule = { prefix: string; client: "Orca" | "TUI" | "service"; label?: string };
export type SourceConfig = {
  id: string;
  label: string;
  endpoint: string;
  tokenEnv?: string;
  client?: "Orca" | "TUI" | "service" | "unknown";
  directoryRules?: DirectoryRule[];
};
export function parseSourceConfig(value: unknown): SourceConfig[] {
  if (!Array.isArray(value) || value.length > 16) throw new Error("Invalid source configuration");
  const ids = new Set<string>();
  return value.map((item: unknown) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("Invalid source configuration");
    const v = item as Record<string, unknown>;
    if (
      Object.keys(v).some((k) => !["id", "label", "endpoint", "tokenEnv", "client", "directoryRules"].includes(k)) ||
      typeof v.id !== "string" ||
      v.id === "local" ||
      !/^[a-zA-Z0-9_-]{1,128}$/.test(v.id) ||
      ids.has(v.id) ||
      typeof v.label !== "string" ||
      !v.label.trim() ||
      v.label.length > 256 ||
      typeof v.endpoint !== "string" ||
      (v.tokenEnv !== undefined && (typeof v.tokenEnv !== "string" || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(v.tokenEnv))) ||
      (v.client !== undefined && !["Orca", "TUI", "service", "unknown"].includes(v.client as string))
    )
      throw new Error("Invalid source configuration");
    if (v.directoryRules !== undefined) {
      if (!Array.isArray(v.directoryRules) || v.directoryRules.length > 64)
        throw new Error("Invalid source configuration");
      const prefixes = new Set<string>();
      for (const rule of v.directoryRules) {
        if (
          !rule ||
          typeof rule !== "object" ||
          Array.isArray(rule) ||
          Object.keys(rule).some((k) => !["prefix", "client", "label"].includes(k)) ||
          typeof rule.prefix !== "string" ||
          !rule.prefix.startsWith("/") ||
          rule.prefix.length > 4096 ||
          /[\u0000\\]/.test(rule.prefix) ||
          rule.prefix.split("/").some((part: string) => part === "." || part === "..") ||
          !["Orca", "TUI", "service"].includes(rule.client) ||
          (rule.label !== undefined &&
            (typeof rule.label !== "string" || !rule.label.trim() || rule.label.length > 256))
        )
          throw new Error("Invalid source configuration");
        const prefix = rule.prefix.replace(/\/+$/, "") || "/";
        if (prefixes.has(prefix)) throw new Error("Invalid source configuration");
        prefixes.add(prefix);
      }
    }
    let url: URL;
    try {
      url = new URL(v.endpoint);
    } catch {
      throw new Error("Invalid source configuration");
    }
    if (
      !/^https?:\/\//i.test(v.endpoint) ||
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/"
    )
      throw new Error("Invalid source configuration");
    ids.add(v.id);
    return v as SourceConfig;
  });
}
const credentialPath = (path: string) =>
  resolve(path)
    .split(/[\\/]/)
    .some((part) => /^(?:\.ssh|\.env.*|auth\.json|service\.json)$/i.test(part));
export async function loadSourceConfig(path: string): Promise<SourceConfig[]> {
  if (credentialPath(path)) throw new Error("Invalid configuration path");
  const actual = await realpath(path);
  if (credentialPath(actual)) throw new Error("Invalid configuration path");
  const file = await open(actual, "r");
  try {
    const info = await file.stat();
    if (!info.isFile() || info.size > 256 * 1024) throw new Error("Invalid configuration file");
    const buffer = Buffer.alloc(256 * 1024 + 1);
    let used = 0;
    while (used < buffer.length) {
      const { bytesRead } = await file.read(buffer, used, buffer.length - used, null);
      if (!bytesRead) break;
      used += bytesRead;
    }
    if (used > 256 * 1024) throw new Error("Invalid configuration file");
    return parseSourceConfig(JSON.parse(buffer.subarray(0, used).toString("utf8")));
  } finally {
    await file.close();
  }
}
