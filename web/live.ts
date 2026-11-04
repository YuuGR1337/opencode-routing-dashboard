import type { DashboardState } from "../src/core/aggregate";
import { parseObserve, parsePermission, parseRoute, parseStats } from "../src/core/schema";
import { COMBINED, EXCHANGE_STATUSES, type ExchangeState } from "./exchange";

export type Envelope = { state: ExchangeState; seq: number; demo: boolean };
export function applyLiveEvent(
  current: { envelope: Envelope | null; sseSeen: boolean },
  next: Envelope,
  kind: "snapshot" | "delta" | "http",
): { envelope: Envelope | null; sseSeen: boolean } {
  if (kind === "http" && current.sseSeen) return current;
  if (kind === "snapshot") return { envelope: next, sseSeen: true };
  const envelope = applyEnvelope(current.envelope, next);
  const sseSeen = current.sseSeen || kind === "delta";
  return envelope === current.envelope && sseSeen === current.sseSeen ? current : { envelope, sseSeen };
}
const object = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const number = (v: unknown) => typeof v === "number" && Number.isFinite(v);
const nullableNumber = (v: unknown) => v === null || number(v);
const counts = (v: unknown) => object(v) && number(v.observe) && number(v.route) && number(v.permissions);
const windowCounts = (v: unknown) => object(v) && number(v.retained) && number(v.sent) && number(v.omitted);
const string = (v: unknown) => typeof v === "string";
const nullableString = (v: unknown) => v === null || string(v);
const numberMap = (v: unknown) => object(v) && Object.values(v).every(number);
const usageItem = (v: unknown) =>
  object(v) &&
  number(v.steps) &&
  number(v.cost) &&
  object(v.tokens) &&
  number(v.tokens.input) &&
  number(v.tokens.output) &&
  number(v.tokens.reasoning) &&
  object(v.tokens.cache) &&
  number(v.tokens.cache.read) &&
  number(v.tokens.cache.write);
const provenance = (v: unknown) =>
  object(v) &&
  (v.directory === null || string(v.directory)) &&
  ["Orca", "TUI", "service", "unknown"].includes(v.client as string) &&
  ["observed", "configured", "unknown"].includes(v.evidence as string) &&
  (v.label === undefined || string(v.label));
const event = (v: unknown) =>
  object(v) &&
  string(v.id) &&
  string(v.ts) &&
  string(v.session) &&
  [v.message, v.prompt, v.suggestion, v.routeSuggestion, v.decision, v.reason, v.contextAgent, v.classifierModel].every(
    nullableString,
  ) &&
  [v.confidence, v.needsOracle, v.routeConfidence, v.routeNeedsOracle, v.latency].every(nullableNumber) &&
  v.executionAgent === null &&
  v.executionModel === null &&
  v.executionProvider === null &&
  v.executionVariant === null &&
  v.tokens === null &&
  v.cost === null &&
  v.fallback === "not detectable" &&
  [v.sourceId, v.directory, v.client].every((x) => x === undefined || string(x)) &&
  (v.provenance === undefined || provenance(v.provenance)) &&
  Array.isArray(v.errors) &&
  v.errors.every(string) &&
  (v.observe === null || parseObserve(v.observe) !== null) &&
  (v.route === null || parseRoute(v.route) !== null);
const source = (v: unknown) =>
  object(v) &&
  (v.status === "ok" || v.status === "missing" || v.status === "error") &&
  string(v.path) &&
  (v.detail === undefined || string(v.detail));
const statsStatus = (v: unknown) =>
  object(v) &&
  (v.status === "ok" || v.status === "unavailable" || v.status === "error" || v.status === "disabled") &&
  (v.detail === undefined || string(v.detail)) &&
  (v.fetchedAt === undefined || string(v.fetchedAt));

const ALERT_KINDS = ["classifier-rate-limit", "rate-limit", "quota", "fallback"];
const QUOTA_STATUS = ["estimate", "partial", "unknown"];
const nullableNumberValue = (v: unknown) => v === null || number(v);
const quotaWindow = (v: unknown) =>
  object(v) &&
  number(v.from) &&
  number(v.to) &&
  nullableNumberValue(v.limit) &&
  nullableNumberValue(v.observed) &&
  QUOTA_STATUS.includes(v.status as string) &&
  object(v.coverage) &&
  number(v.coverage.sources) &&
  typeof v.coverage.complete === "boolean" &&
  typeof v.coverage.attributionGaps === "boolean";
const quotaRow = (v: unknown) =>
  object(v) &&
  string(v.id) &&
  string(v.label) &&
  string(v.provider) &&
  (v.metric === "tokens" || v.metric === "messages") &&
  (v.sourceId === null || string(v.sourceId)) &&
  quotaWindow(v.fiveHour) &&
  quotaWindow(v.weekly);
/** Only what the analytics panels read is validated; other fields of the server block are ignored. */
function analytics(v: unknown): boolean {
  if (!object(v) || !object(v.settings) || !object(v.result) || !Array.isArray(v.alerts)) return false;
  const { quotas, alerts } = v.settings;
  return (
    Array.isArray(quotas) &&
    quotas.every((q: unknown) => object(q) && string(q.id) && string(q.label) && string(q.provider)) &&
    object(alerts) &&
    number(alerts.holdMs) &&
    number(alerts.repeatMs) &&
    number(alerts.activeMs) &&
    typeof alerts.desktop === "boolean" &&
    Array.isArray(v.result.quotas) &&
    v.result.quotas.every(quotaRow) &&
    (v.result.sourceCoverage === undefined ||
      (Array.isArray(v.result.sourceCoverage) &&
        v.result.sourceCoverage.every(
          (c: unknown) =>
            object(c) &&
            string(c.id) &&
            Array.isArray(c.partialReasons) &&
            c.partialReasons.every(string) &&
            (c.status === undefined || string(c.status)) &&
            (c.included === undefined || typeof c.included === "boolean") &&
            (c.retained === undefined || number(c.retained)) &&
            (c.omitted === undefined || number(c.omitted)) &&
            (c.evicted === undefined || number(c.evicted)) &&
            (c.oldestRetainedTs === undefined || nullableString(c.oldestRetainedTs)),
        ))) &&
    (v.result.presetCoverage === undefined ||
      (object(v.result.presetCoverage) &&
        (v.result.presetCoverage.partialReasons === undefined ||
          (Array.isArray(v.result.presetCoverage.partialReasons) &&
            v.result.presetCoverage.partialReasons.every(
              (item: unknown) =>
                object(item) && string(item.sourceId) && Array.isArray(item.reasons) && item.reasons.every(string),
            ))))) &&
    v.alerts.every(
      (a: unknown) =>
        object(a) &&
        string(a.sourceId) &&
        ALERT_KINDS.includes(a.kind as string) &&
        number(a.since) &&
        nullableNumberValue(a.lastFired),
    ) &&
    (v.notificationStatus === undefined ||
      (object(v.notificationStatus) &&
        typeof v.notificationStatus.ok === "boolean" &&
        optionalString(v.notificationStatus.reason)))
  );
}

const MAX_EXCHANGE_SOURCES = 32;
const optionalString = (v: unknown) => v === undefined || string(v);
/** Sources carry their own flat state: a source state may not hold another exchange. */
function exchange(v: unknown): boolean {
  if (!object(v) || !Array.isArray(v.sources) || v.sources.length > MAX_EXCHANGE_SOURCES) return false;
  const ids = new Set<string>();
  return v.sources.every((s: unknown) => {
    if (!object(s) || !string(s.id) || s.id === "" || s.id === COMBINED || ids.has(s.id)) return false;
    ids.add(s.id);
    return (
      string(s.label) &&
      (EXCHANGE_STATUSES as readonly unknown[]).includes(s.status) &&
      optionalString(s.client) &&
      optionalString(s.lastSeenAt) &&
      optionalString(s.detail) &&
      (s.state === null || (isState(s.state) && (s.state as { exchange?: unknown }).exchange === undefined))
    );
  });
}

function isState(v: unknown): v is DashboardState {
  if (!object(v) || !Array.isArray(v.events) || !Array.isArray(v.permissions) || !Array.isArray(v.history))
    return false;
  const { window, agreement, usage, errors, readouts } = v;
  return (
    (v.exchange === undefined || exchange(v.exchange)) &&
    (v.analytics === undefined || analytics(v.analytics)) &&
    (v.presetChanges === undefined ||
      (Array.isArray(v.presetChanges) &&
        v.presetChanges.every((change: unknown) => object(change) && string(change.preset) && number(change.at)))) &&
    (v.presetStatus === undefined ||
      (object(v.presetStatus) &&
        ["ok", "missing", "error", "unconfigured"].includes(v.presetStatus.status as string) &&
        optionalString(v.presetStatus.detail) &&
        (v.presetStatus.observedFrom === undefined || number(v.presetStatus.observedFrom)) &&
        (v.presetStatus.observedTo === undefined || number(v.presetStatus.observedTo)))) &&
    object(window) &&
    windowCounts(window.events) &&
    windowCounts(window.permissions) &&
    counts(window.evicted) &&
    number(window.maxBytes) &&
    object(agreement) &&
    number(agreement.compared) &&
    number(agreement.agreed) &&
    nullableNumber(agreement.percent) &&
    object(agreement.matrix) &&
    Object.values(agreement.matrix).every(numberMap) &&
    Array.isArray(agreement.histogram) &&
    agreement.histogram.every(number) &&
    object(usage) &&
    Array.isArray(usage.models) &&
    Array.isArray(usage.providers) &&
    Array.isArray(usage.variants) &&
    usage.models.every(
      (item: unknown) =>
        object(item) && string(item.model) && string(item.provider) && string(item.variant) && usageItem(item),
    ) &&
    usage.providers.every((item: unknown) => object(item) && string(item.provider) && usageItem(item)) &&
    usage.variants.every((item: unknown) => object(item) && string(item.variant) && usageItem(item)) &&
    (usage.totals === null || usageItem(usage.totals)) &&
    usage.presets === "not available" &&
    object(errors) &&
    number(errors.observe) &&
    number(errors.route) &&
    counts(errors.malformed) &&
    number(errors.total) &&
    nullableNumber(errors.toolFailures) &&
    numberMap(errors.permissions) &&
    object(readouts) &&
    number(readouts.promptsPerMinute) &&
    nullableNumber(readouts.agreementPercent) &&
    readouts.fallbackPercent === null &&
    nullableNumber(readouts.errorPercent) &&
    nullableNumber(readouts.p50Latency) &&
    nullableNumber(readouts.tokensToday) &&
    (v.stats === null || parseStats(v.stats) !== null) &&
    (v.sources === null ||
      (object(v.sources) && source(v.sources.observe) && source(v.sources.route) && source(v.sources.permissions))) &&
    (v.statsStatus === null || statsStatus(v.statsStatus)) &&
    (v.historyStatus === null ||
      (object(v.historyStatus) &&
        ["ok", "missing", "error"].includes(v.historyStatus.status as string) &&
        string(v.historyStatus.path) &&
        number(v.historyStatus.malformed) &&
        number(v.historyStatus.omitted) &&
        (v.historyStatus.detail === undefined || string(v.historyStatus.detail)))) &&
    v.fallback === "not detectable" &&
    v.events.every(event) &&
    v.permissions.every((item: unknown) => parsePermission(item) !== null) &&
    v.history.every((item: unknown) => object(item) && string(item.date) && parseStats(item.stats) !== null)
  );
}

export function decodeEnvelope(input: unknown): Envelope | null {
  if (
    !object(input) ||
    !Number.isSafeInteger(input.seq) ||
    (input.seq as number) < 0 ||
    typeof input.demo !== "boolean"
  )
    return null;
  const { seq, demo, state: nested, ...flat } = input;
  const state = nested === undefined ? flat : nested;
  return isState(state) ? { state: state as ExchangeState, seq: seq as number, demo } : null;
}

/** Decodes one SSE/HTTP message. Undecodable text is a rejection (null), never an exception. */
export function decodeMessage(data: string): Envelope | null {
  try {
    return decodeEnvelope(JSON.parse(data));
  } catch {
    return null;
  }
}

export function applyEnvelope(current: Envelope | null, next: Envelope): Envelope {
  return current === null || next.seq > current.seq ? next : current;
}
