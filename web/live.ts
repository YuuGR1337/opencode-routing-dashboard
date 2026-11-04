import type { DashboardState } from "../src/core/aggregate";
import { parseObserve, parsePermission, parseRoute, parseStats } from "../src/core/schema";

export type Envelope = { state: DashboardState; seq: number; demo: boolean };
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

function isState(v: unknown): v is DashboardState {
  if (!object(v) || !Array.isArray(v.events) || !Array.isArray(v.permissions) || !Array.isArray(v.history))
    return false;
  const { window, agreement, usage, errors, readouts } = v;
  return (
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
  return isState(state) ? { state, seq: seq as number, demo } : null;
}

export function applyEnvelope(current: Envelope | null, next: Envelope): Envelope {
  return current === null || next.seq > current.seq ? next : current;
}
