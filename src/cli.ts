#!/usr/bin/env bun
import { loadConfig } from "./config";
import { startApp } from "./server";
export const VERSION = "0.1.0";
if (import.meta.main) {
  try {
    const config = loadConfig();
    if (config.help)
      console.log(
        "Usage: opencode-routing-dashboard [--state-dir PATH] [--port PORT] [--stats-interval SECONDS] [--snapshot-dir PATH] [--stats-command COMMAND] [--stats-file PATH] [--stats-enabled true|false] [--max-records N] [--demo true|false]",
      );
    else {
      const app = await startApp(config);
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
