import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import type { DashboardState, FlowEvent, Source } from "../src/core/aggregate";

const ROLES = ["orchestrator", "oracle", "fixer", "explorer", "designer"] as const;
type Role = (typeof ROLES)[number];
const isRole = (value: string | null): value is Role => value !== null && (ROLES as readonly string[]).includes(value);
const SOURCES: Source[] = ["observe", "route", "permissions"];
const DRAWERS = ["Agreement", "Usage", "Errors", "History"] as const;

const RAIL_CALLS = 10;
const RENDER_LIMIT = 300;
const BURST_LIMIT = 10;

// Patch bay geometry (SVG user units == CSS px at 1:1).
const BAY_W = 560;
const ROW_H = 40;
const BAY_H = RAIL_CALLS * ROW_H;
const JACK_X = 400;
const CTX_X = 426;
const jackY = (role: Role) => 40 + ROLES.indexOf(role) * 80;
const laneX = (i: number) => 60 + i * 22;

const pad = (n: number, w = 2) => String(n).padStart(w, "0");
function fmtTs(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}
function fmtDay(ms: number) {
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? "—" : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function fmtNum(n: number) {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e4) return `${(n / 1e3).toFixed(1)}k`;
  return String(n);
}
const fmt2 = (n: number | null) => (n === null ? "—" : n.toFixed(2));
const trunc = (s: string | null, n: number) => (s === null ? "—" : s.length > n ? `${s.slice(0, n - 1)}…` : s);

const STATUS_GLYPH = { ok: "●", missing: "○", error: "▲", unavailable: "○", disabled: "○" } as const;
const STATUS_CLASS = { ok: "ok", missing: "warn", error: "err", unavailable: "warn", disabled: "dim" } as const;

function useArrivals(events: FlowEvent[], ready: boolean) {
  const seen = useRef<Set<string> | null>(null);
  const stamps = useRef<number[]>([]);
  const timers = useRef<{ arrive?: ReturnType<typeof setTimeout>; burst?: ReturnType<typeof setTimeout> }>({});
  const [arrived, setArrived] = useState<ReadonlySet<string>>(new Set());
  const [burst, setBurst] = useState(0);
  useEffect(() => {
    // Until the first real snapshot arrives (sources known), nothing is an arrival. The first snapshot is the baseline.
    if (!ready) {
      seen.current = null;
      return;
    }
    const ids = new Set(events.map((e) => e.id));
    const prev = seen.current;
    seen.current = ids;
    if (!prev) return;
    const fresh = events.filter((e) => !prev.has(e.id)).map((e) => e.id);
    if (fresh.length === 0) return;
    const now = performance.now();
    stamps.current = stamps.current.filter((t) => now - t < 1000);
    for (let i = 0; i < fresh.length; i++) stamps.current.push(now);
    if (stamps.current.length > BURST_LIMIT) {
      // More than 10 arrivals in 1 s: collapse into a counter, no per-call motion.
      setArrived(new Set());
      setBurst(stamps.current.length);
      clearTimeout(timers.current.burst);
      timers.current.burst = setTimeout(() => setBurst(0), 2500);
      return;
    }
    setArrived(new Set(fresh));
    clearTimeout(timers.current.arrive);
    timers.current.arrive = setTimeout(() => setArrived(new Set()), 1500);
  }, [events, ready]);
  useEffect(
    () => () => {
      clearTimeout(timers.current.arrive);
      clearTimeout(timers.current.burst);
    },
    [],
  );
  return { arrived, burst };
}

function Unavailable({ title = "not available in the logs" }: { title?: string }) {
  return (
    <span data-unavailable="true" title={title}>
      —
    </span>
  );
}

function Readout({ label, value, note, title }: { label: string; value: string; note?: string; title?: string }) {
  return (
    <div className="readout" title={title}>
      <div className="readout-value">{value}</div>
      <div className="readout-label">{label}</div>
      {note ? <div className="readout-note">{note}</div> : null}
    </div>
  );
}

function SourceHealth({ state, drawers }: { state: DashboardState; drawers: ReactNode }) {
  const { sources, statsStatus, errors, window: win } = state;
  const m = errors.malformed;
  return (
    <div className="sources" role="status">
      {sources ? (
        SOURCES.map((name) => {
          const s = sources[name];
          return (
            <span
              key={name}
              className={`src ${STATUS_CLASS[s.status]}`}
              title={`${s.path}${s.detail ? ` (${s.detail})` : ""}`}
            >
              <span className="glyph" aria-hidden="true">
                {STATUS_GLYPH[s.status]}
              </span>
              {name} {s.status}
              {s.detail ? ` · ${s.detail}` : ""}
            </span>
          );
        })
      ) : (
        <span className="src dim">○ waiting for sources</span>
      )}
      <span className={`src ${statsStatus ? STATUS_CLASS[statsStatus.status] : "dim"}`}>
        <span className="glyph" aria-hidden="true">
          {statsStatus ? STATUS_GLYPH[statsStatus.status] : "○"}
        </span>
        {`stats ${statsStatus?.status ?? "pending"}`}
        {statsStatus?.detail ? ` · ${statsStatus.detail}` : ""}
      </span>
      <span className="src dim">
        {`malformed (process lifetime) observe ${m.observe} · route ${m.route} · permissions ${m.permissions}`}
      </span>
      <span className="src dim">{`permissions newest ${state.window.permissions.sent} of ${win.permissions.retained} retained`}</span>
      <span className="spacer">{drawers}</span>
    </div>
  );
}

function PatchBay({
  state,
  rail,
  focus,
  arrived,
}: {
  state: DashboardState;
  rail: FlowEvent[];
  focus: FlowEvent | undefined;
  arrived: ReadonlySet<string>;
}) {
  const counts = new Map<string, { sug: number; ctx: number }>();
  for (const role of ROLES) counts.set(role, { sug: 0, ctx: 0 });
  for (const e of state.events) {
    if (isRole(e.suggestion)) counts.get(e.suggestion)!.sug++;
    if (isRole(e.contextAgent)) counts.get(e.contextAgent)!.ctx++;
  }
  const sug = focus && isRole(focus.suggestion) ? focus.suggestion : null;
  const ctx = focus && isRole(focus.contextAgent) ? focus.contextAgent : null;
  const agree = sug !== null && sug === ctx;
  const focusArrived = focus ? arrived.has(focus.id) : false;
  const empty = state.events.length === 0;
  return (
    <section className="panel bay" aria-label="patch bay">
      <h2 className="panel-title">
        patch bay{" "}
        <span className="dim">
          · dashed = Jev suggestion · hollow ctx = recorded context agent · no execution path recorded
        </span>
      </h2>
      <div className="bay-body">
        <svg
          className="bay-svg"
          viewBox={`0 0 ${BAY_W} ${BAY_H}`}
          width={BAY_W}
          height={BAY_H}
          role="img"
          aria-label="Jev suggestion wires to role jacks"
        >
          {rail.map((e, i) => {
            if (!isRole(e.suggestion)) return null;
            const y0 = i * ROW_H + ROW_H / 2;
            const y1 = jackY(e.suggestion) + ((i % 5) - 2) * 3;
            const isFocus = focus?.id === e.id;
            return (
              <g key={e.id} className={`wire-g${isFocus ? " focus" : ""}`}>
                <circle className="origin" cx={6} cy={y0} r={2.5} />
                <path
                  className="ghost"
                  data-wire="ghost"
                  data-role={e.suggestion}
                  d={`M6,${y0} H${laneX(i)} V${y1} H${JACK_X - 9}`}
                />
                {arrived.has(e.id) ? <circle className="token" cx={JACK_X - 9} cy={y1} r={3.5} /> : null}
              </g>
            );
          })}
          {ROLES.map((role) => {
            const y = jackY(role);
            const c = counts.get(role)!;
            const lit = agree && role === sug;
            return (
              <g key={role} className={`jack r-${role}${lit ? " lit" : ""}`} data-role={role} data-jack="role">
                {focusArrived && role === sug ? <circle className="pulse" cx={JACK_X} cy={y} r={9} /> : null}
                <circle className="jack-ring" cx={JACK_X} cy={y} r={9} />
                <circle className="jack-hole" cx={JACK_X} cy={y} r={3.5} />
                <circle className={`ctx-jack${ctx === role ? " on" : ""}`} data-jack="ctx" cx={CTX_X} cy={y} r={5} />
                {lit ? (
                  <text className="tick" x={CTX_X} y={y - 11} textAnchor="middle">
                    =
                  </text>
                ) : null}
                <text className="jack-label" x={CTX_X + 16} y={y - 2}>
                  {role}
                </text>
                <text className="jack-count" x={CTX_X + 16} y={y + 12}>
                  {`sug ${c.sug} · ctx ${c.ctx}`}
                </text>
              </g>
            );
          })}
          {sug && ctx && sug !== ctx ? (
            <path className="kink" d={`M${JACK_X + 9},${jackY(sug)} H${CTX_X - 14} V${jackY(ctx)} H${CTX_X - 5}`} />
          ) : null}
        </svg>
        {empty ? <SilentExchange state={state} /> : null}
        {focus ? <FocusReadout event={focus} /> : null}
      </div>
      <p className="panel-foot dim">
        {focus
          ? `focus ${fmtTs(focus.ts)} · ${
              sug && ctx ? (agree ? "context agreement" : "context disagreement") : "no context comparison"
            }`
          : "no call in focus"}
        {" · counts over sent window"}
      </p>
    </section>
  );
}

function FocusReadout({ event: e }: { event: FlowEvent }) {
  const rows: [string, string | null, boolean][] = [
    ["ts", fmtTs(e.ts), false],
    ["suggest", e.suggestion ? `${e.suggestion} ${fmt2(e.confidence)}` : null, false],
    ["needs oracle", e.needsOracle === null ? null : fmt2(e.needsOracle), false],
    ["decision", e.decision ? `${e.decision}${e.reason ? ` · ${e.reason}` : ""}` : null, false],
    ["ctx agent", e.contextAgent, false],
    ["exec agent", null, true],
    ["exec model", null, true],
    ["classifier", e.classifierModel, false],
    ["fallback", "not detectable", false],
    ["latency", e.latency === null ? null : `${e.latency} ms`, false],
    ["errors", e.errors.length ? e.errors.join(" | ") : null, false],
  ];
  return (
    <dl className="focus">
      <dt className="focus-title">call in focus</dt>
      <dd className="focus-prompt">{e.prompt ?? "(no prompt recorded)"}</dd>
      {rows.map(([k, v, unavailable]) => (
        <div key={k} className="focus-row">
          <dt>{k}</dt>
          <dd data-unavailable={unavailable ? "true" : undefined}>{v ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

function SilentExchange({ state }: { state: DashboardState }) {
  const { sources } = state;
  return (
    <div className="silent" role="status">
      <div className="silent-title">silent exchange</div>
      {sources ? (
        <>
          <div className="silent-sub">
            {SOURCES.every((n) => sources[n].status === "ok")
              ? "all sources readable, no events retained"
              : "waiting for Jev logs at"}
          </div>
          <ul>
            {SOURCES.map((name) => {
              const s = sources[name];
              return (
                <li key={name} className={STATUS_CLASS[s.status]}>
                  <span className="glyph" aria-hidden="true">
                    {STATUS_GLYPH[s.status]}
                  </span>
                  <b>{name}</b>
                  <span className="dim">{` ${s.status}${s.detail ? ` · ${s.detail}` : ""}`}</span>
                  <span className="path">{s.path}</span>
                </li>
              );
            })}
          </ul>
        </>
      ) : (
        <div className="silent-sub">waiting for sources</div>
      )}
    </div>
  );
}

function CallsRail({
  rail,
  selected,
  arrived,
  burst,
  state,
}: {
  rail: FlowEvent[];
  selected: string | null;
  arrived: ReadonlySet<string>;
  burst: number;
  state: DashboardState;
}) {
  return (
    <section className="panel calls" aria-label="calls">
      <h2 className="panel-title">
        calls <span className="dim">· newest {RAIL_CALLS}</span>
        {burst > 0 ? <span className="burst">{` +${burst} in 1 s · motion collapsed`}</span> : null}
      </h2>
      <ol className="call-list">
        {rail.map((e) => (
          <li
            key={e.id}
            className={`call${arrived.has(e.id) ? " arrive" : ""}${selected === e.id ? " sel" : ""}${e.errors.length ? " has-err" : ""}`}
          >
            <span className="call-ts">
              {e.errors.length ? (
                <span className="glyph err" aria-label="error">
                  ▲
                </span>
              ) : null}
              {fmtTs(e.ts)}
            </span>
            <span className="call-text">{e.prompt ?? "(no prompt recorded)"}</span>
          </li>
        ))}
        {rail.length === 0 ? <li className="call empty dim">no calls</li> : null}
      </ol>
      <p className="panel-foot dim">{`${state.events.length} sent`}</p>
    </section>
  );
}

function ModelRail({ state }: { state: DashboardState }) {
  const { usage, stats, statsStatus, errors } = state;
  const models = [...usage.models].sort((a, b) => b.steps - a.steps);
  const max = Math.max(1, ...models.map((m) => m.steps));
  return (
    <section className="panel models" aria-label="models">
      <h2 className="panel-title">
        models <span className="dim">· aggregate</span>
      </h2>
      <p className="rail-note">aggregate stats · not linked to calls</p>
      <div className="models-body">
        {models.length === 0 ? (
          <div className="rail-empty">
            <div>{statsStatus && statsStatus.status !== "ok" ? `stats ${statsStatus.status}` : "no model stats"}</div>
            <div className="dim">{statsStatus?.detail ?? "opencode stats --json not read yet"}</div>
          </div>
        ) : (
          <ul className="model-list">
            {models.map((m) => {
              const r = 3 + 8 * Math.sqrt(m.steps / max);
              return (
                <li key={`${m.provider}/${m.model}/${m.variant}`} className="model">
                  <svg className="model-jack" viewBox="0 0 24 24" width={24} height={24} aria-hidden="true">
                    <circle className="jack-ring" cx={12} cy={12} r={r} />
                    <circle className="jack-hole" cx={12} cy={12} r={2} />
                  </svg>
                  <div className="model-main">
                    <div className="model-name">
                      <span className="dim">{m.provider}/</span>
                      {m.model}
                      <span className="variant">{m.variant}</span>
                    </div>
                    <div className="model-nums">
                      {`${fmtNum(m.steps)} steps · in ${fmtNum(m.tokens.input)} · out ${fmtNum(m.tokens.output)} · rsn ${fmtNum(m.tokens.reasoning)} · cache ${fmtNum(m.tokens.cache.read + m.tokens.cache.write)} · $${m.cost.toFixed(2)}`}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <p className="panel-foot dim">
        {stats ? `stats range ${fmtDay(stats.range.from)} → ${fmtDay(stats.range.to)}` : "stats range —"}
        <br />
        {`tool failures ${errors.toolFailures ?? "—"}${stats ? ` of ${stats.tools.totals.calls} calls (stats range)` : ""}`}
        <br />
        {usage.totals ? `total ${fmtNum(usage.totals.steps)} steps · $${usage.totals.cost.toFixed(2)}` : "total —"}
      </p>
    </section>
  );
}

const COLUMNS: { key: string; label: string; lo?: boolean }[] = [
  { key: "ts", label: "ts" },
  { key: "session", label: "session", lo: true },
  { key: "message", label: "message", lo: true },
  { key: "suggest", label: "suggest" },
  { key: "conf", label: "conf" },
  { key: "oracle", label: "oracle" },
  { key: "decision", label: "decision" },
  { key: "reason", label: "reason" },
  { key: "ctx", label: "ctx agent" },
  { key: "xagent", label: "exec agent" },
  { key: "xmodel", label: "exec model" },
  { key: "classifier", label: "classifier", lo: true },
  { key: "fallback", label: "fallback" },
  { key: "latency", label: "latency", lo: true },
  { key: "tokens", label: "tokens", lo: true },
  { key: "cost", label: "cost", lo: true },
  { key: "err", label: "err" },
  { key: "prompt", label: "prompt", lo: true },
];

function Ticker({
  state,
  rows,
  selected,
  arrived,
  onSelect,
}: {
  state: DashboardState;
  rows: FlowEvent[];
  selected: string | null;
  arrived: ReadonlySet<string>;
  onSelect: (id: string) => void;
}) {
  const w = state.window;
  const ev = w.events;
  const ev_ev = w.evicted;
  return (
    <section className="panel ticker" aria-label="ticker tape">
      <h2 className="panel-title">
        ticker tape{" "}
        <span className="dim">
          {`· newest ${ev.sent} of ${ev.retained} retained`}
          {ev.omitted > 0 ? ` · ${ev.omitted} omitted from payload` : ""}
          {` · evicted observe ${ev_ev.observe} · route ${ev_ev.route} · permissions ${ev_ev.permissions}`}
          {rows.length < ev.sent ? ` · rendering newest ${rows.length}` : ""}
        </span>
        <span className="keys dim">j/k row · enter detail · esc close</span>
      </h2>
      <div className="ticker-scroll">
        <table>
          <thead>
            <tr>
              {COLUMNS.map((c) => (
                <th key={c.key} className={`c-${c.key}${c.lo ? " lo" : ""}`}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr
                key={e.id}
                data-row="event"
                data-id={e.id}
                aria-selected={selected === e.id}
                className={`row${selected === e.id ? " sel" : ""}${arrived.has(e.id) ? " arrive" : ""}${e.errors.length ? " has-err" : ""}`}
                onClick={() => onSelect(e.id)}
              >
                <td className="c-ts">{fmtTs(e.ts)}</td>
                <td className="c-session lo" title={e.session}>
                  {e.session}
                </td>
                <td className="c-message lo" title={e.message ?? ""}>
                  {e.message ?? "—"}
                </td>
                <td className={`c-suggest${isRole(e.suggestion) ? ` r-${e.suggestion}` : ""}`}>
                  {e.suggestion ? <span className="role-chip">{e.suggestion}</span> : "—"}
                </td>
                <td className="c-conf num">{fmt2(e.confidence)}</td>
                <td className="c-oracle num">{fmt2(e.needsOracle)}</td>
                <td className={`c-decision ${e.decision ?? ""}`}>{e.decision ?? "—"}</td>
                <td className="c-reason" title={e.reason ?? ""}>
                  {e.reason ?? "—"}
                </td>
                <td className="c-ctx">{e.contextAgent ?? "—"}</td>
                <td className="c-xagent">
                  <Unavailable />
                </td>
                <td className="c-xmodel">
                  <Unavailable />
                </td>
                <td className="c-classifier lo" title={e.classifierModel ?? ""}>
                  {e.classifierModel ?? "—"}
                </td>
                <td className="c-fallback" title="not detectable">
                  n/d
                </td>
                <td className="c-latency lo num">{e.latency === null ? "—" : `${e.latency}ms`}</td>
                <td className="c-tokens lo">
                  <Unavailable />
                </td>
                <td className="c-cost lo">
                  <Unavailable />
                </td>
                <td className="c-err" title={e.errors.join(" | ")}>
                  {e.errors.length ? (
                    <>
                      <span className="glyph err" aria-label="error">
                        ▲
                      </span>
                      {trunc(e.errors[0] ?? null, 14)}
                    </>
                  ) : (
                    ""
                  )}
                </td>
                <td className="c-prompt lo" title={e.prompt ?? ""}>
                  {e.prompt ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? <p className="ticker-empty dim">no events retained</p> : null}
      </div>
    </section>
  );
}

export function EventDetail({ event }: { event: FlowEvent }) {
  const fields: [string, string | number | null, boolean][] = [
    ["ts", event.ts, false],
    ["session", event.session, false],
    ["message", event.message, false],
    ["prompt", event.prompt, false],
    ["suggestion", event.suggestion, false],
    ["confidence", event.confidence, false],
    ["needsOracle", event.needsOracle, false],
    ["routeSuggestion", event.routeSuggestion, false],
    ["routeConfidence", event.routeConfidence, false],
    ["routeNeedsOracle", event.routeNeedsOracle, false],
    ["decision", event.decision, false],
    ["reason", event.reason, false],
    ["contextAgent", event.contextAgent, false],
    ["classifierModel", event.classifierModel, false],
    ["executionAgent", event.executionAgent, true],
    ["executionModel", event.executionModel, true],
    ["executionProvider", event.executionProvider, true],
    ["executionVariant", event.executionVariant, true],
    ["tokens", event.tokens, true],
    ["cost", event.cost, true],
    ["fallback", event.fallback, false],
    ["latency", event.latency === null ? null : `${event.latency} ms`, false],
    ["errors", event.errors.length ? event.errors.join(" | ") : null, false],
  ];
  return (
    <div className="detail-body">
      <table className="kv">
        <tbody>
          {fields.map(([k, v, unavailable]) => (
            <tr key={k}>
              <th>{k}</th>
              <td className={unavailable ? "unavail" : undefined} data-unavailable={unavailable ? "true" : undefined}>
                {v === null ? "—" : String(v)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3>raw observe</h3>
      {event.observe ? <pre>{JSON.stringify(event.observe, null, 2)}</pre> : <p className="dim">no observe record</p>}
      <h3>raw route</h3>
      {event.route ? <pre>{JSON.stringify(event.route, null, 2)}</pre> : <p className="dim">no route record</p>}
      <h3>linked stats</h3>
      <p className="dim">none. Aggregate stats are not attributable to a message.</p>
      <h3>session timeline</h3>
      <p className="dim">available in M4.</p>
    </div>
  );
}

export function DashboardShell({
  state,
  demo = false,
  connected,
}: {
  state: DashboardState;
  demo?: boolean;
  connected?: boolean;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const { arrived, burst } = useArrivals(state.events, state.sources !== null);
  const rows = [...state.events].reverse().slice(0, RENDER_LIMIT);
  const rail = rows.slice(0, RAIL_CALLS);
  const selectedEvent = rows.find((e) => e.id === selected);
  const focus = selectedEvent ?? rows[0];
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
      const t = ev.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const list = rowsRef.current;
      const idx = list.findIndex((e) => e.id === selectedRef.current);
      if (ev.key === "j" || ev.key === "k") {
        if (list.length === 0) return;
        const next = ev.key === "j" ? Math.min(list.length - 1, idx + 1) : Math.max(0, idx < 0 ? 0 : idx - 1);
        setSelected(list[next]!.id);
        ev.preventDefault();
      } else if (ev.key === "Enter") {
        if (idx >= 0) setDetailOpen(true);
      } else if (ev.key === "Escape") {
        setDetailOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!selected) return;
    document.querySelector(`tr[aria-selected="true"]`)?.scrollIntoView?.({ block: "nearest" });
  }, [selected]);

  const drawers = (
    <nav className="drawers" aria-label="drawers">
      {DRAWERS.map((name) => (
        <button key={name} type="button" data-drawer={name.toLowerCase()} disabled title="available in M4">
          {name}
          <sup>M4</sup>
        </button>
      ))}
    </nav>
  );
  const r = state.readouts;
  const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v)}%`);
  const a = state.agreement;
  return (
    <div className={demo ? "app has-demo" : "app"}>
      {demo ? (
        <div className="demo-band" role="note">
          DEMO · fixtures replay, not live data
        </div>
      ) : null}
      <header className="head">
        <div className="brand">
          <span className="brand-name">routing exchange</span>
          <span className="brand-sub">opencode · jev</span>
        </div>
        <div className="readouts">
          <Readout label="prompts/min" value={String(r.promptsPerMinute)} note="retained window" />
          <Readout
            label="context agreement"
            value={pct(r.agreementPercent)}
            note={a.compared ? `${a.agreed} of ${a.compared} compared` : "nothing compared"}
            title="Jev suggestion equals the recorded context agent. Not proof of delegation."
          />
          <Readout label="fallback" value="n/d" note="not detectable" title="No fallback event in the logs" />
          <Readout label="error rate" value={pct(r.errorPercent)} note="retained window" />
          <Readout
            label="p50 latency"
            value={r.p50Latency === null ? "—" : `${Math.round(r.p50Latency)}ms`}
            note="retained window"
          />
          <Readout
            label="tokens today"
            value={r.tokensToday === null ? "—" : fmtNum(r.tokensToday)}
            note={r.tokensToday === null ? "stats range ≠ today" : "stats"}
          />
        </div>
        <div className="head-side">
          {connected === undefined ? null : (
            <span className={`link ${connected ? "ok" : "err"}`}>
              <span className="glyph" aria-hidden="true">
                {connected ? "●" : "▲"}
              </span>
              {connected ? "link live" : "link down"}
            </span>
          )}
        </div>
      </header>
      <SourceHealth state={state} drawers={drawers} />
      <main className="stage">
        <CallsRail rail={rail} selected={focus?.id ?? null} arrived={arrived} burst={burst} state={state} />
        <PatchBay state={state} rail={rail} focus={focus} arrived={arrived} />
        <ModelRail state={state} />
      </main>
      <Ticker
        state={state}
        rows={rows}
        selected={selected}
        arrived={arrived}
        onSelect={(id) => {
          setSelected(id);
          setDetailOpen(true);
        }}
      />
      {detailOpen && selectedEvent ? (
        <aside className="detail" aria-label="event detail">
          <header className="detail-head">
            <span>{`event ${fmtTs(selectedEvent.ts)}`}</span>
            <button type="button" onClick={() => setDetailOpen(false)}>
              close · esc
            </button>
          </header>
          <EventDetail event={selectedEvent} />
        </aside>
      ) : null}
    </div>
  );
}
