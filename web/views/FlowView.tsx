import type { ReactNode } from "react";
import type { DashboardState, FlowEvent } from "../../src/core/aggregate";
import { bayLayout } from "../bay";
import { clientText, evidence } from "../exchange";
import type { ReplayCoverage, Speed } from "../replay";
import {
  fmt2,
  fmtDay,
  fmtNum,
  fmtSession,
  fmtTs,
  isRole,
  RAIL_CALLS,
  RENDER_LIMIT,
  ROLES,
  type Role,
  SOURCES,
  STATUS_CLASS,
  STATUS_GLYPH,
  trunc,
} from "./format";
import { Unavailable } from "./parts";
import { ReplayBar, ReplayStart } from "./ReplayBar";

// Patch bay geometry comes from bayLayout (SVG user units == CSS px at 1:1).
const laneX = (i: number) => 60 + i * 22;
/** The per-role tally needs room under the bay; beyond this many calls the jack counts carry the numbers. */
const TALLY_MAX_CALLS = 4;

export type ReplayView = {
  /** Session events up to and including the cursor, oldest first. */
  played: FlowEvent[];
  length: number;
  index: number;
  playing: boolean;
  speed: Speed;
  coverage: ReplayCoverage;
  onPlay: () => void;
  onStep: (delta: number) => void;
  onSpeed: (speed: Speed) => void;
  onStop: () => void;
};
export type WaitingSource = { id: string; status: string; detail?: string };

function PatchBay({
  state,
  rows,
  rail,
  focus,
  arrived,
  scope,
  replay,
  onReplayStart,
  waiting,
}: {
  state: DashboardState;
  rows: FlowEvent[];
  rail: FlowEvent[];
  focus: FlowEvent | undefined;
  arrived: ReadonlySet<string>;
  scope: string;
  replay?: ReplayView;
  onReplayStart?: () => void;
  waiting?: WaitingSource;
}) {
  const bay = bayLayout(rail.length, RAIL_CALLS);
  const { jackX: JACK_X, ctxX: CTX_X, rowH: ROW_H, jackY } = bay;
  const counts = new Map<string, { sug: number; ctx: number; agree: number }>();
  for (const role of ROLES) counts.set(role, { sug: 0, ctx: 0, agree: 0 });
  // During a replay the counts describe the events replayed so far, not the whole window.
  for (const e of replay ? replay.played : rows) {
    if (isRole(e.suggestion)) counts.get(e.suggestion)!.sug++;
    if (isRole(e.contextAgent)) counts.get(e.contextAgent)!.ctx++;
    if (isRole(e.suggestion) && e.suggestion === e.contextAgent) counts.get(e.suggestion)!.agree++;
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
        <div className="bay-main">
          <svg
            className="bay-svg"
            data-sparse={bay.sparse}
            viewBox={`0 0 ${bay.width} ${bay.height}`}
            width={bay.width}
            height={bay.height}
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
          {bay.sparse && rail.length > 0 && rail.length <= TALLY_MAX_CALLS ? (
            <ul className="tally" aria-label="role tally">
              {ROLES.map((role) => {
                const c = counts.get(role)!;
                return (
                  <li key={role} className={`r-${role}`} data-tally="role">
                    <span className="tally-role">{role}</span>
                    <span>{`sug ${c.sug}`}</span>
                    <span>{`ctx ${c.ctx}`}</span>
                    <span>{`agree ${c.agree}`}</span>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
        {empty ? <SilentExchange state={state} waiting={waiting} /> : null}
        {focus ? <FocusReadout event={focus} /> : null}
      </div>
      {replay ? (
        <ReplayBar
          index={replay.index}
          length={replay.length}
          current={focus?.ts ?? ""}
          playing={replay.playing}
          speed={replay.speed}
          coverage={replay.coverage}
          onPlay={replay.onPlay}
          onStep={replay.onStep}
          onSpeed={replay.onSpeed}
          onStop={replay.onStop}
        />
      ) : (
        <ReplayStart disabled={!focus} onStart={onReplayStart ?? (() => {})} />
      )}
      <p className="panel-foot dim">
        {focus
          ? `focus ${fmtTs(focus.ts)} · ${
              sug && ctx ? (agree ? "context agreement" : "context disagreement") : "no context comparison"
            }`
          : "no call in focus"}
        {` · counts over ${replay ? "events replayed so far" : scope}`}
      </p>
    </section>
  );
}

function FocusReadout({ event: e }: { event: FlowEvent }) {
  const tag = evidence(e);
  const tagged = tag.sourceId !== undefined || tag.client !== undefined || tag.directory !== undefined;
  const rows: [string, string | null, boolean][] = [
    ["ts", fmtTs(e.ts), false],
    ...(tagged
      ? ([
          ["source", tag.sourceId ?? null, false],
          ["client", clientText(tag), false],
          ["directory", tag.directory ?? null, false],
        ] as [string, string | null, boolean][])
      : []),
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

function SilentExchange({ state, waiting }: { state: DashboardState; waiting?: WaitingSource }) {
  const { sources } = state;
  return (
    <div className="silent" role="status">
      <div className="silent-title">silent exchange</div>
      {waiting ? (
        <div className="silent-sub">
          {`waiting for ${waiting.id} · ${waiting.status}${waiting.detail ? ` · ${waiting.detail}` : ""}. No state received from this source yet.`}
        </div>
      ) : sources ? (
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
  footer,
}: {
  rail: FlowEvent[];
  selected: string | null;
  arrived: ReadonlySet<string>;
  burst: number;
  footer: string;
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
              {evidence(e).sourceId ? <span className="call-src">{`${evidence(e).sourceId} `}</span> : null}
              {fmtTs(e.ts)}
            </span>
            <span className="call-text">{e.prompt ?? "(no prompt recorded)"}</span>
          </li>
        ))}
        {rail.length === 0 ? <li className="call none dim">no calls</li> : null}
      </ol>
      <p className="panel-foot dim">{footer}</p>
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
            <div className="dim">
              {statsStatus?.detail ??
                (statsStatus?.status === "disabled"
                  ? "stats polling disabled for this source"
                  : "stats unavailable · select a source and inspect its health")}
            </div>
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
  { key: "src", label: "src" },
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
  filterBar,
  filterNote,
  notice,
  onSelect,
}: {
  state: DashboardState;
  rows: FlowEvent[];
  selected: string | null;
  arrived: ReadonlySet<string>;
  filterBar: ReactNode;
  filterNote: string | null;
  notice: string | null;
  onSelect: (id: string) => void;
}) {
  const w = state.window;
  const ev = w.events;
  const ev_ev = w.evicted;
  // The source column exists only when events carry source evidence; single-source views are unchanged.
  const columns = rows.some((e) => evidence(e).sourceId !== undefined)
    ? COLUMNS
    : COLUMNS.filter((c) => c.key !== "src");
  return (
    <section id="ticker" className="panel ticker" aria-label="ticker tape" tabIndex={-1}>
      <h2 className="panel-title">
        ticker tape{" "}
        <span className="dim">
          {`· newest ${ev.sent} of ${ev.retained} retained`}
          {ev.omitted > 0 ? ` · ${ev.omitted} omitted from payload` : ""}
          {` · evicted observe ${ev_ev.observe} · route ${ev_ev.route} · permissions ${ev_ev.permissions}`}
          {filterNote ? ` · ${filterNote}` : ""}
          {rows.length >= RENDER_LIMIT ? ` · rendering newest ${RENDER_LIMIT}` : ""}
        </span>
        <span className="keys dim">/ search · f filters · j/k row · enter detail · 1-8 views · esc close</span>
      </h2>
      {notice ? (
        <p className="notice" role="status" data-evicted="true">
          {notice}
        </p>
      ) : null}
      {filterBar}
      <div className="ticker-scroll">
        <table>
          <thead>
            <tr>
              {columns.map((c) => (
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
                {columns.length === COLUMNS.length ? (
                  <td
                    className="c-src"
                    title={[evidence(e).sourceId, evidence(e).client, evidence(e).directory]
                      .filter(Boolean)
                      .join(" · ")}
                  >
                    {evidence(e).sourceId ?? "—"}
                  </td>
                ) : null}
                <td className="c-session lo" title={e.session}>
                  {fmtSession(e.session)}
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
        {rows.length === 0 ? (
          <p className="ticker-empty dim">{filterNote ? "no events match the filters" : "no events retained"}</p>
        ) : null}
      </div>
    </section>
  );
}

export function FlowView({
  state,
  rows,
  selected,
  arrived,
  burst,
  filterBar,
  filterNote,
  notice = null,
  replay,
  onReplayStart,
  waiting,
  onSelect,
}: {
  state: DashboardState;
  rows: FlowEvent[];
  selected: string | null;
  arrived: ReadonlySet<string>;
  burst: number;
  filterBar: ReactNode;
  filterNote: string | null;
  /** Announcement shown above the ticker filters (selected event evicted). */
  notice?: string | null;
  replay?: ReplayView;
  onReplayStart?: () => void;
  waiting?: WaitingSource;
  onSelect: (id: string) => void;
}) {
  // A replay shows the session's events up to the cursor, newest first like the live rail; the cursor is the focus.
  const rail = replay ? [...replay.played].reverse().slice(0, RAIL_CALLS) : rows.slice(0, RAIL_CALLS);
  const focus = replay ? rail[0] : (rows.find((e) => e.id === selected) ?? rows[0]);
  const scope = filterNote ? "filtered sent window" : "sent window";
  const footer = replay
    ? `replay · ${replay.played.length} of ${replay.length} played`
    : filterNote
      ? `${rows.length} of ${state.events.length} sent · filtered`
      : `${state.events.length} sent`;
  return (
    <>
      <main className="stage">
        <CallsRail rail={rail} selected={focus?.id ?? null} arrived={arrived} burst={burst} footer={footer} />
        <PatchBay
          state={state}
          rows={rows}
          rail={rail}
          focus={focus}
          arrived={arrived}
          scope={scope}
          replay={replay}
          onReplayStart={onReplayStart}
          waiting={waiting}
        />
        <ModelRail state={state} />
      </main>
      <Ticker
        state={state}
        rows={rows}
        selected={selected}
        arrived={arrived}
        filterBar={filterBar}
        filterNote={filterNote}
        notice={notice}
        onSelect={onSelect}
      />
    </>
  );
}
