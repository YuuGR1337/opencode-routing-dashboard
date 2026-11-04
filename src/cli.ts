#!/usr/bin/env bun
import { fileURLToPath } from "node:url";
import { loadConfig } from "./config";
import { formatReport, parseReportRange } from "./core/reports";
import { startApp } from "./server";
import { startAgent } from "./server/agent";
export const VERSION = "0.2.0";
if (import.meta.main) {
  try {
    const args = process.argv.slice(2);
    const command =
      args[0] === "serve" || args[0] === "snapshot" || args[0] === "agent" || args[0] === "export"
        ? args.shift()
        : "serve";
    const reportOptions: Record<string, string> = {};
    if (command === "export") {
      for (let i = 0; i < args.length; ) {
        const match = /^--(from|to|format)(?:=(.*))?$/.exec(args[i]!);
        if (!match) {
          i++;
          continue;
        }
        const name = match[1]!;
        if (name in reportOptions) throw new Error(`Duplicate --${name}`);
        const value = match[2] ?? args[i + 1];
        if (!value || value.startsWith("--")) throw new Error(`Missing value: --${name}`);
        reportOptions[name] = value;
        args.splice(i, match[2] === undefined ? 2 : 1);
      }
    }
    const config = loadConfig(process.env, args);
    if (config.help)
      console.log(
        "Usage: opencode-routing-dashboard [serve|snapshot|agent|export] [--state-dir PATH] [--observe-path PATH] [--route-path PATH] [--permissions-path PATH] [--port PORT] [--stats-interval SECONDS] [--snapshot-dir PATH] [--stats-command COMMAND] [--stats-file PATH] [--stats-enabled true|false] [--max-records N] [--demo true|false] [--config PATH] [--local-source-config PATH] [--bind IP] [--token-env NAME] [--redact-prompts true|false]\n  serve     Start the dashboard (default)\n  agent     Export local sources (redacts known observe/route prompt fields when enabled)\n  snapshot  Capture one weekly snapshot and exit\n  export    Print report (--from DATE --to DATE --format md|csv)",
      );
    else if (command === "export") {
      const { from, to, format } = reportOptions;
      if (!from || !to || (format !== "md" && format !== "csv"))
        throw new Error("Export requires --from, --to and --format md|csv");
      const range = parseReportRange(from, to);
      const { collectReport } = await import("./sources/export");
      process.stdout.write(formatReport(await collectReport(config, range), format));
    } else if (command === "snapshot") {
      const { snapshotOnce } = await import("./sources/snapshots");
      const result = await snapshotOnce(config);
      console.log(`${result.created ? "Created" : "Already exists"}: ${result.path}`);
    } else {
      if (command === "agent" && config.configFile) throw new Error("Agent cannot use a config file");
      const token = config.tokenEnv ? process.env[config.tokenEnv] : undefined;
      if (command === "agent" && config.tokenEnv && !token) throw new Error("Token environment variable is missing");
      const app =
        command === "agent"
          ? await startAgent(config, { bind: config.bind, token, redactPrompts: config.redactPrompts })
          : await startApp(config, { staticDir: fileURLToPath(new URL("../dist/", import.meta.url)) });
      console.log(`opencode-routing-dashboard ${VERSION}: ${app.url}`);
      let stopping = false;
      const stop = async () => {
        if (stopping) return;
        stopping = true;
        await app.stop();
      };
      process.on("SIGINT", stop);
      process.on("SIGTERM", stop);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
