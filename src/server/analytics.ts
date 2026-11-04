import type { DashboardState } from "../core/aggregate";
import { type AlertState, analyze, eventsFromState, reduceAlerts } from "../core/analytics";
import { type AnalyticsRuntimeSettings, notifyAlert } from "../sources/analytics";

export type AnalyticsSource = {
  id: string;
  state: DashboardState | null;
  status?: string;
  included?: boolean;
  reason?: string;
  uiOmitted?: number;
  uiReason?: string;
};
type SourceCoverage = {
  id: string;
  status: string;
  included: boolean;
  reason?: string;
  retained: number;
  omitted: number;
  uiOmitted: number;
  uiReason?: string;
  evicted: number;
  malformed: number;
  oldestRetainedTs: string | null;
  partialReasons: string[];
};

/** Standalone engine. Coverage is deliberately omitted: monitoring logs does not prove execution coverage. */
export function startAnalyticsEngine(
  settings: AnalyticsRuntimeSettings,
  getSources: () => AnalyticsSource[],
  onChange: () => void,
  options: {
    now?: () => number;
    intervalMs?: number;
    notify?: (alert: AlertState, signal: AbortSignal) => Promise<{ ok: boolean; reason?: string }>;
  } = {},
) {
  const clock = options.now ?? Date.now;
  const interval =
    options.intervalMs && Number.isFinite(options.intervalMs) && options.intervalMs > 0 ? options.intervalMs : 1000;
  const publicSettings = { quotas: settings.quotas, alerts: settings.alerts };
  let presetChanges: { sourceId: string; preset: string; at: number }[] = [];
  let active: AlertState[] = [];
  let alerts: AlertState[] = [];
  type Result = ReturnType<typeof analyze> & {
    sourceCoverage: SourceCoverage[];
    presetCoverage: ReturnType<typeof analyze>["presetCoverage"] & {
      partialReasons: { sourceId: string; reasons: string[] }[];
    };
  };
  const initial = analyze([], { from: clock() - 7 * 86400000, to: clock(), quotas: settings.quotas }, clock());
  let result: Result = {
    ...initial,
    sourceCoverage: [],
    presetCoverage: { ...initial.presetCoverage, partialReasons: [] },
  };
  let notificationStatus: { ok: boolean; reason?: string } | undefined;
  let pending: AlertState | undefined;
  let work: Promise<void> | undefined;
  let stopped = false;
  const controller = new AbortController();
  function queueNotification(alert: AlertState) {
    pending = alert;
    if (work) return;
    work = (async () => {
      while (pending && !stopped) {
        const next = pending;
        pending = undefined;
        if (
          next.lastFired === null ||
          clock() - next.lastFired > settings.alerts.activeMs ||
          !active.some((a) => a.sourceId === next.sourceId && a.kind === next.kind)
        )
          continue;
        const before = JSON.stringify(notificationStatus);
        try {
          notificationStatus = await (options.notify ?? ((alert, signal) => notifyAlert(alert, { signal })))(
            next,
            controller.signal,
          );
        } catch {
          notificationStatus = { ok: false, reason: "notification failed" };
        }
        if (!stopped && before !== JSON.stringify(notificationStatus)) onChange();
      }
    })().finally(() => {
      work = undefined;
    });
  }
  function update() {
    if (stopped) return;
    const now = clock();
    const sources = getSources();
    const included = sources.filter(
      (source): source is AnalyticsSource & { state: DashboardState } =>
        source.included !== false && source.state !== null,
    );
    const events = included.flatMap(({ id, state }) => eventsFromState(state, id));
    presetChanges = included.flatMap(({ id, state }) =>
      (state.presetChanges ?? []).map((change) => ({ sourceId: id, ...change })),
    );
    const presetCoverage = included.flatMap(({ id, state }) =>
      state.presetStatus?.status === "ok" &&
      state.presetStatus.observedFrom !== undefined &&
      state.presetStatus.observedTo !== undefined
        ? [{ sourceId: id, from: state.presetStatus.observedFrom, to: state.presetStatus.observedTo }]
        : [],
    );
    const sourceCoverage: SourceCoverage[] = sources.map((source) => {
      const state = source.state;
      const present = source.included !== false && state !== null;
      const evicted = state ? Object.values(state.window.evicted).reduce((a, b) => a + b, 0) : 0;
      const malformed = state ? Object.values(state.errors.malformed).reduce((a, b) => a + b, 0) : 0;
      const omitted = state?.window.events.omitted ?? 0;
      const partialReasons = [
        ...(!present ? [source.reason ?? "source unavailable"] : []),
        ...(present && source.status && source.status !== "live" ? ["source not live"] : []),
        ...(evicted ? ["source records evicted"] : []),
        ...(malformed ? ["malformed source records"] : []),
        ...(omitted ? ["retained event details omitted"] : []),
      ];
      return {
        id: source.id,
        status: source.status ?? "live",
        included: present,
        ...(source.reason ? { reason: source.reason } : {}),
        retained: state?.window.events.retained ?? 0,
        omitted,
        uiOmitted: source.uiOmitted ?? 0,
        ...(source.uiReason ? { uiReason: source.uiReason } : {}),
        evicted,
        malformed,
        oldestRetainedTs: state?.events[0]?.ts ?? null,
        partialReasons,
      };
    });
    const analyzed = analyze(
      events,
      { from: now - 7 * 86400000, to: now, quotas: settings.quotas, presetChanges, presetCoverage },
      now,
    );
    result = {
      ...analyzed,
      sourceCoverage,
      presetCoverage: {
        ...analyzed.presetCoverage,
        partialReasons: sourceCoverage
          .filter((source) => source.partialReasons.length)
          .map((source) => ({ sourceId: source.id, reasons: source.partialReasons })),
      },
    };
    const reduced = reduceAlerts(
      events.filter((e) => e.timestamp >= now - settings.alerts.activeMs && e.timestamp <= now),
      active,
      settings.alerts,
      now,
    );
    active = reduced.state;
    alerts = [...alerts, ...reduced.fired].slice(-100);
    if (settings.alerts.desktop) for (const alert of reduced.fired) queueNotification(alert);
  }
  update();
  const semantic = () =>
    JSON.stringify({ result, alerts, presetChanges, notificationStatus }, (key, value) =>
      ["from", "to", "observedTo"].includes(key) ? undefined : value,
    );
  let previous = semantic();
  const timer = setInterval(() => {
    update();
    const next = semantic();
    if (next !== previous) {
      previous = next;
      onChange();
    }
  }, interval);
  return {
    snapshot: () => ({
      settings: publicSettings,
      result,
      alerts: [...alerts],
      presetChanges,
      ...(settings.presetPath ? { presetStatus: "unverified" as const } : {}),
      ...(notificationStatus ? { notificationStatus } : {}),
    }),
    async stop() {
      stopped = true;
      clearInterval(timer);
      pending = undefined;
      controller.abort();
      await work;
    },
  };
}
