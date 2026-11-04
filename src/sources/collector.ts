import type { Config } from "../config";
import type { DashboardInput, Source } from "../core/aggregate";
import { parseLine } from "../core/schema";
import { loadSnapshots } from "./snapshots";
import { startStats } from "./stats";
import { startTail } from "./tail";

export async function startCollector(
  config: Config,
  onChange: (input: DashboardInput) => void,
  options: { historyRefreshMs?: number } = {},
): Promise<{ input: DashboardInput; ready: Promise<void>; stop(): Promise<void> }> {
  const names: Source[] = ["observe", "route", "permissions"];
  const paths = config.sourcePaths;
  const input: DashboardInput = {
    observe: [],
    route: [],
    permissions: [],
    stats: null,
    malformed: { observe: 0, route: 0, permissions: 0 },
    evicted: { observe: 0, route: 0, permissions: 0 },
    sources: {
      observe: { status: "missing", path: paths.observe },
      route: { status: "missing", path: paths.route },
      permissions: { status: "missing", path: paths.permissions },
    },
  };
  let ready = false;
  let stopped = false;
  let historyTimer: ReturnType<typeof setTimeout> | undefined;
  let historyLoading: Promise<void> | undefined;
  const tails: Awaited<ReturnType<typeof startTail>>[] = [];
  let stats: Awaited<ReturnType<typeof startStats>> | undefined;
  const changed = () => {
    if (ready && !stopped) onChange(input);
  };
  const refresh = async () => {
    const result = await loadSnapshots(config.snapshotDir);
    if (stopped) return;
    const different =
      JSON.stringify([input.history, input.historyStatus]) !== JSON.stringify([result.snapshots, result.status]);
    input.history = result.snapshots;
    input.historyStatus = result.status;
    if (different) changed();
  };
  const schedule = () => {
    historyTimer = setTimeout(() => {
      historyLoading = refresh().finally(() => {
        if (!stopped) schedule();
      });
    }, options.historyRefreshMs ?? 5000);
  };
  let stopping: Promise<void> | undefined;
  const stop = () =>
    (stopping ??= (async () => {
      stopped = true;
      ready = false;
      if (historyTimer) clearTimeout(historyTimer);
      await Promise.all([
        ...tails.map((tail) => tail.stop()),
        ...(stats ? [stats.stop()] : []),

        ...(historyLoading ? [historyLoading] : []),
      ]);
    })());
  try {
    await refresh();
    for (const source of names) {
      tails.push(
        await startTail({
          path: paths[source],
          onLine(line) {
            const parsed = parseLine(source, line);
            if (!parsed.ok) input.malformed[source]++;
            else {
              if (parsed.source === "observe") input.observe.push(parsed.record);
              else if (parsed.source === "route") input.route.push(parsed.record);
              else input.permissions.push(parsed.record);
              const records = input[source];
              if (records.length > config.maxRecords) {
                const excess = records.length - config.maxRecords;
                input.evicted![source] += excess;
                records.splice(0, excess);
              }
            }
            changed();
          },
          onMalformed() {
            input.malformed[source]++;
            changed();
          },
          onStatus(status, detail) {
            input.sources![source] = { status, path: paths[source], ...(detail ? { detail } : {}) };
            changed();
          },
        }),
      );
    }
    stats = await startStats({
      enabled: config.statsEnabled,
      interval: config.statsInterval,
      command: config.statsCommand,
      file: config.statsFile,
      onUpdate(value, status) {
        input.stats = value;
        input.statsStatus = status;
        changed();
      },
    });
    ready = true;
    schedule();
    return { input, ready: stats.ready, stop };
  } catch (error) {
    await stop();
    throw error;
  }
}
