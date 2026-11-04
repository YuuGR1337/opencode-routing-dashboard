type Extra = Record<string, unknown>;
type NullableString = string | null;

export type ObserveRecord = Extra & {
  ts: string;
  session: string;
  message: NullableString;
  agent: NullableString;
  prompt: string;
  model: string;
  status?: number;
  latency_ms: number;
} & ({ error: string; answers?: ObserveAnswers } | { answers: ObserveAnswers; error?: never; status: number });
type ObserveAnswers = Extra & {
  role: Extra & { type: "choice"; choice: string; confidence: number; probabilities: Record<string, number> };
  needs_oracle: Extra & { type: "noul"; noul: number };
};
export type RouteRecord = Extra & { ts: string; session: string } & (
    | {
        decision: "skipped";
        reason: string;
        message?: string;
        agent?: string;
        dir?: string;
        flag?: string;
        prompt?: string;
        role?: string;
        conf?: number;
        needs_oracle?: number;
        latency_ms?: number;
      }
    | {
        decision: "injected" | "skipped";
        reason: NullableString;
        message: string;
        agent: string;
        dir: string;
        flag: string;
        prompt: string;
        role: string;
        conf: number;
        needs_oracle: number;
        latency_ms: number;
      }
  );
export type PermissionRecord = Extra & {
  ts: string;
  session: string;
  commands: string[];
  scores?: Extra & { reversible: number; routine: number };
  verdict: string;
  latency_ms: number;
};
type Tokens = Extra & {
  input: number;
  output: number;
  reasoning: number;
  cache: Extra & { read: number; write: number };
};
type ToolCounts = Extra & { calls: number; succeeded: number; failed: number; unfinished: number };
export type StatsRecord = Extra & {
  range: Extra & { from: number; to: number };
  sessions: number;
  subagents: number;
  prompts: number;
  steps: number;
  tokens: Tokens;
  cost: number;
  tools: Extra & { mode: string; totals: ToolCounts; usage: (ToolCounts & { name: string; durationP50: number })[] };
  activeDays: number;
  streak: number;
  activity: unknown[];
  models: (Extra & {
    model: Extra & { id: string; providerID: string; variant: string };
    steps: number;
    tokens: Tokens;
    cost: number;
  })[];
};

const object = (v: unknown): v is Extra => typeof v === "object" && v !== null && !Array.isArray(v);
const string = (v: unknown): v is string => typeof v === "string";
const number = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const nullableString = (v: unknown): v is NullableString => v === null || string(v);
const timestamp = (v: unknown): v is string =>
  string(v) &&
  /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(v) &&
  Number.isFinite(Date.parse(v));
const optional = (v: Extra, key: string, check: (value: unknown) => boolean) => !(key in v) || check(v[key]);
const base = (v: Extra) => timestamp(v.ts) && string(v.session);
const answers = (v: unknown): v is ObserveAnswers => {
  if (!object(v) || !object(v.role) || !object(v.needs_oracle) || !object(v.role.probabilities)) return false;
  return (
    v.role.type === "choice" &&
    string(v.role.choice) &&
    number(v.role.confidence) &&
    Object.values(v.role.probabilities).every(number) &&
    v.needs_oracle.type === "noul" &&
    number(v.needs_oracle.noul)
  );
};

export function parseObserve(value: unknown): ObserveRecord | null {
  if (
    !object(value) ||
    !base(value) ||
    !nullableString(value.message) ||
    !nullableString(value.agent) ||
    !string(value.prompt) ||
    !string(value.model) ||
    !number(value.latency_ms) ||
    !optional(value, "status", number) ||
    !optional(value, "answers", answers) ||
    !optional(value, "error", string)
  )
    return null;
  if (!(string(value.error) || (answers(value.answers) && number(value.status)))) return null;
  return value as ObserveRecord;
}

export function parseRoute(value: unknown): RouteRecord | null {
  if (
    !object(value) ||
    !base(value) ||
    (value.decision !== "injected" && value.decision !== "skipped") ||
    !nullableString(value.reason)
  )
    return null;
  const strings = ["message", "agent", "dir", "flag", "prompt", "role"];
  const numbers = ["conf", "needs_oracle", "latency_ms"];
  if (!strings.every((key) => optional(value, key, string)) || !numbers.every((key) => optional(value, key, number)))
    return null;
  const exception = value.decision === "skipped" && string(value.reason) && value.reason.startsWith("exception:");
  if (!exception && (!strings.every((key) => string(value[key])) || !numbers.every((key) => number(value[key]))))
    return null;
  return value as RouteRecord;
}

export function parsePermission(value: unknown): PermissionRecord | null {
  if (
    !object(value) ||
    !base(value) ||
    !Array.isArray(value.commands) ||
    !value.commands.every(string) ||
    !string(value.verdict) ||
    !number(value.latency_ms) ||
    !optional(value, "scores", (v) => object(v) && number(v.reversible) && number(v.routine))
  )
    return null;
  return value as PermissionRecord;
}

const tokens = (v: unknown): v is Tokens =>
  object(v) &&
  number(v.input) &&
  number(v.output) &&
  number(v.reasoning) &&
  object(v.cache) &&
  number(v.cache.read) &&
  number(v.cache.write);
const counts = (v: unknown): v is ToolCounts =>
  object(v) && number(v.calls) && number(v.succeeded) && number(v.failed) && number(v.unfinished);
export function parseStats(value: unknown): StatsRecord | null {
  if (
    !object(value) ||
    !object(value.range) ||
    !number(value.range.from) ||
    !number(value.range.to) ||
    ![value.sessions, value.subagents, value.prompts, value.steps, value.cost, value.activeDays, value.streak].every(
      number,
    ) ||
    !tokens(value.tokens) ||
    !object(value.tools) ||
    !string(value.tools.mode) ||
    !counts(value.tools.totals) ||
    !Array.isArray(value.tools.usage) ||
    !value.tools.usage.every((v: unknown) => counts(v) && string(v.name) && number(v.durationP50)) ||
    !Array.isArray(value.activity) ||
    !Array.isArray(value.models) ||
    !value.models.every(
      (v: unknown) =>
        object(v) &&
        object(v.model) &&
        string(v.model.id) &&
        string(v.model.providerID) &&
        string(v.model.variant) &&
        number(v.steps) &&
        tokens(v.tokens) &&
        number(v.cost),
    )
  )
    return null;
  return value as StatsRecord;
}

type Source = "observe" | "route" | "permissions";
type Records = { observe: ObserveRecord; route: RouteRecord; permissions: PermissionRecord };
export type ParseLineResult<S extends Source = Source> = S extends Source
  ? { ok: true; source: S; record: Records[S] } | { ok: false; source: S; error: string }
  : never;
export function parseLine<S extends Source>(source: S, line: string): ParseLineResult<S> {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return { ok: false, source, error: "Invalid JSON" } as ParseLineResult<S>;
  }
  const record =
    source === "observe" ? parseObserve(value) : source === "route" ? parseRoute(value) : parsePermission(value);
  return (record ? { ok: true, source, record } : { ok: false, source, error: "Invalid record" }) as ParseLineResult<S>;
}
export function parseLines<S extends Source>(source: S, text: string): { records: Records[S][]; malformed: number } {
  const records: Records[S][] = [];
  let malformed = 0;
  if (text === "") return { records, malformed };
  const lines = text.split("\n");
  if (lines.at(-1) === "") lines.pop();
  for (const line of lines) {
    const result = parseLine(source, line);
    if (result.ok) records.push(result.record as Records[S]);
    else malformed++;
  }
  return { records, malformed };
}
