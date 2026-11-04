#!/usr/bin/env bun
import { fileURLToPath } from "node:url";
import { loadConfig } from "./config";
import { startApp } from "./server";
import { startAgent } from "./server/agent";
export const VERSION = "0.1.0";
if (import.meta.main) {
  try {
    const args = process.argv.slice(2);
    const command = args[0] === "serve" || args[0] === "snapshot" || args[0] === "agent" ? args.shift() : "serve";
    const config = loadConfig(process.env, args);
    if (config.help)
      console.log(
        "Usage: opencode-routing-dashboard [serve|snapshot|agent] [--state-dir PATH] [--observe-path PATH] [--route-path PATH] [--permissions-path PATH] [--port PORT] [--stats-interval SECONDS] [--snapshot-dir PATH] [--stats-command COMMAND] [--stats-file PATH] [--stats-enabled true|false] [--max-records N] [--demo true|false] [--config PATH] [--bind IP] [--token-env NAME] [--redact-prompts true|false]\n  serve     Start the dashboard (default)\n  agent     Export local sources (redacts known observe/route prompt fields when enabled)\n  snapshot  Capture one weekly snapshot and exit",
      );
    else if (command === "snapshot") {
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
