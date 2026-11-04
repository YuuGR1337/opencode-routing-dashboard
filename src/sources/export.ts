import type { Config } from "../config";
import { aggregate, type DashboardInput } from "../core/aggregate";
import { buildReport, type Report, type ReportRange } from "../core/reports";
import { startCollector } from "./collector";
import { startRemote } from "./remote";
import { loadSourceConfig } from "./source-config";

export async function collectReport(
  config: Config,
  range: ReportRange,
  env: NodeJS.ProcessEnv = process.env,
): Promise<Report> {
  const configured = config.configFile ? await loadSourceConfig(config.configFile) : [];
  if (configured.some((source) => source.id === "local")) throw new Error("Source id local is reserved");
  const tokens = configured.map((source) => {
    const token = source.tokenEnv ? env[source.tokenEnv] : undefined;
    if (source.tokenEnv && !token) throw new Error(`Missing token for source ${source.id}`);
    return token;
  });
  const clients: ReturnType<typeof startRemote>[] = [];
  let collector: Awaited<ReturnType<typeof startCollector>> | undefined;
  let local: Promise<DashboardInput> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const snapshots = configured.map(
      (source, index) =>
        new Promise<DashboardInput>((resolve) => {
          clients.push(startRemote(source, { token: tokens[index], onUpdate: resolve, onStatus() {} }));
        }),
    );
    const remote = Promise.race([
      Promise.all(snapshots),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Remote source unavailable: snapshot deadline exceeded")), 10000);
      }),
    ]);
    // Attach a handler immediately even if local startup is still in progress.
    local = (async () => {
      collector = await startCollector(config, () => {});
      await collector.ready;
      return collector.input;
    })();
    const [localInput, inputs] = await Promise.all([local, remote]);
    return buildReport(
      [
        { id: "local", label: "Local", state: aggregate(localInput) },
        ...configured.map((source, index) => ({
          id: source.id,
          label: source.label,
          state: aggregate(inputs[index]!),
        })),
      ],
      range,
    );
  } finally {
    if (timer) clearTimeout(timer);
    if (local && !collector) await local.catch(() => {});
    await Promise.all([...clients.map((client) => client.stop()), ...(collector ? [collector.stop()] : [])]);
  }
}
