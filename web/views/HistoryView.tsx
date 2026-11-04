import type { DashboardState } from "../../src/core/aggregate";
import type { StatsRecord } from "../../src/core/schema";
import { fmtInt, fmtRange } from "./format";

type Snapshot = DashboardState["history"][number];

const tokenTotal = (s: StatsRecord) =>
  s.tokens.input + s.tokens.output + s.tokens.reasoning + s.tokens.cache.read + s.tokens.cache.write;

const METRICS: { key: string; value: (s: StatsRecord) => number; format: (n: number) => string }[] = [
  { key: "steps", value: (s) => s.steps, format: fmtInt },
  { key: "prompts", value: (s) => s.prompts, format: fmtInt },
  { key: "sessions", value: (s) => s.sessions, format: fmtInt },
  { key: "tokens", value: tokenTotal, format: fmtInt },
  { key: "cost", value: (s) => s.cost, format: (n) => (n === 0 ? "0 reported" : `$${n.toFixed(2)}`) },
  { key: "tool failures", value: (s) => s.tools.totals.failed, format: fmtInt },
];

const W = 168;
const H = 64;

function Multiple({ metric, snaps }: { metric: (typeof METRICS)[number]; snaps: Snapshot[] }) {
  const values = snaps.map((s) => metric.value(s.stats));
  const max = Math.max(1, ...values);
  const slot = W / snaps.length;
  const bar = Math.max(2, Math.min(24, slot - 3));
  const last = values[values.length - 1] ?? 0;
  return (
    <figure className="multiple" data-multiple={metric.key}>
      <figcaption>
        <span className="mname">{metric.key}</span>
        <span className="mlast">{metric.format(last)}</span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={`${metric.key} per snapshot`}>
        <line className="baseline" x1={0} y1={H - 1} x2={W} y2={H - 1} />
        {snaps.map((s, i) => {
          const v = values[i] ?? 0;
          const h = Math.max(v > 0 ? 2 : 0, Math.round((v / max) * (H - 6)));
          return (
            <rect
              key={s.date}
              className={`bar${i === snaps.length - 1 ? " hit" : ""}`}
              data-point={s.date}
              x={i * slot + (slot - bar) / 2}
              y={H - 1 - h}
              width={bar}
              height={h}
            >
              <title>{`${s.date}: ${metric.format(v)}`}</title>
            </rect>
          );
        })}
      </svg>
    </figure>
  );
}

export function HistoryView({ state }: { state: DashboardState }) {
  const snaps = [...state.history].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  if (snaps.length === 0) {
    return (
      <div className="view history">
        <div className="empty" role="status">
          <div>no snapshots</div>
          <div className="dim">
            weekly snapshots of opencode stats --json are stored as YYYY-MM-DD.json. None are recorded yet.
          </div>
          <div className="dim">snapshot recording and loading arrive in M5.</div>
        </div>
      </div>
    );
  }
  const first = snaps[0]!;
  const last = snaps[snaps.length - 1]!;
  return (
    <div className="view history">
      <p className="lede">
        <b>{`${snaps.length} ${snaps.length === 1 ? "snapshot" : "snapshots"}`}</b>
        {` · ${first.date}${snaps.length > 1 ? ` → ${last.date}` : ""} · each snapshot covers its own stats range; values are not normalized`}
      </p>
      <div className="multiples">
        {METRICS.map((m) => (
          <Multiple key={m.key} metric={m} snaps={snaps} />
        ))}
      </div>
      <h3>snapshots</h3>
      <table className="list">
        <thead>
          <tr>
            <th>date</th>
            <th>stats range</th>
            <th className="num">steps</th>
          </tr>
        </thead>
        <tbody>
          {snaps.map((s) => (
            <tr key={s.date}>
              <td>{s.date}</td>
              <td>{fmtRange(s.stats.range)}</td>
              <td className="num">{fmtInt(s.stats.steps)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
