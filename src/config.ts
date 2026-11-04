import { homedir } from "node:os";
import { join } from "node:path";

export type Config = ReturnType<typeof loadConfig>;
export function loadConfig(env: NodeJS.ProcessEnv = process.env, args = process.argv.slice(2)) {
  const values: Record<string, string | undefined> = { ...env };
  const flags: Record<string, string> = {
    "state-dir": "ORD_STATE_DIR",
    port: "ORD_PORT",
    "stats-interval": "ORD_STATS_INTERVAL",
    "snapshot-dir": "ORD_SNAPSHOT_DIR",
    "stats-command": "ORD_STATS_COMMAND",
    "stats-file": "ORD_STATS_FILE",
    "stats-enabled": "ORD_STATS_ENABLED",
    "max-records": "ORD_MAX_RECORDS",
    demo: "ORD_DEMO",
  };
  let help = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === "--help" || arg === "-h") {
      help = true;
      continue;
    }
    const option = arg.replace(/^--/, "");
    const equals = option.indexOf("=");
    const name = equals < 0 ? option : option.slice(0, equals);
    const inline = equals < 0 ? undefined : option.slice(equals + 1);
    const key = name && flags[name];
    if (!arg.startsWith("--") || !key) throw new Error(`Unknown option: ${arg}`);
    const value = inline ?? args[++i];
    if (value === undefined || value.startsWith("--")) throw new Error(`Missing value: ${arg}`);
    values[key] = value;
  }
  const expand = (p: string) => (p === "~" ? homedir() : p.startsWith("~/") ? join(homedir(), p.slice(2)) : p);
  const integer = (key: string, fallback: number, min: number, max: number) => {
    const raw = values[key];
    if (raw === undefined) return fallback;
    if (!/^\d+$/.test(raw)) throw new Error(`Invalid ${key}`);
    const n = Number(raw);
    if (!Number.isSafeInteger(n) || n < min || n > max) throw new Error(`Invalid ${key}`);
    return n;
  };
  const enabled = values.ORD_STATS_ENABLED ?? "true";
  if (!["true", "false", "1", "0"].includes(enabled)) throw new Error("Invalid ORD_STATS_ENABLED");
  const demo = values.ORD_DEMO ?? "false";
  if (!["true", "false", "1", "0"].includes(demo)) throw new Error("Invalid ORD_DEMO");
  const stateDir = expand(values.ORD_STATE_DIR ?? join(homedir(), ".local/state/opencode"));
  return {
    help,
    demo: demo === "true" || demo === "1",
    stateDir,
    port: integer("ORD_PORT", 4777, 0, 65535),
    statsInterval: integer("ORD_STATS_INTERVAL", 60, 1, 2147483),
    snapshotDir: expand(values.ORD_SNAPSHOT_DIR ?? join(stateDir, "snapshots")),
    statsCommand: values.ORD_STATS_COMMAND ?? "opencode",
    statsFile: values.ORD_STATS_FILE ? expand(values.ORD_STATS_FILE) : undefined,
    statsEnabled: enabled === "true" || enabled === "1",
    maxRecords: integer("ORD_MAX_RECORDS", 10000, 1, 1000000),
  };
}
