import type { DashboardState } from "../../src/core/aggregate";
import { fmtInt, pct, ROLES } from "./format";

const CELL_W = 60;
const CELL_H = 30;
const LABEL_W = 112;
const HEAD_H = 76;
const TOTAL_W = 44;

/** Axis keys: the five roles first, then any other agent names found in the data (never dropped). */
function axes(matrix: DashboardState["agreement"]["matrix"]) {
  const rows: string[] = [...ROLES];
  const cols: string[] = [...ROLES];
  for (const [suggested, row] of Object.entries(matrix)) {
    if (!rows.includes(suggested)) rows.push(suggested);
    for (const agent of Object.keys(row)) if (!cols.includes(agent)) cols.push(agent);
  }
  return { rows, cols };
}

export function AgreementView({ state }: { state: DashboardState }) {
  const a = state.agreement;
  const { rows, cols } = axes(a.matrix);
  const cell = (r: string, c: string) => a.matrix[r]?.[c] ?? 0;
  const max = Math.max(1, ...rows.flatMap((r) => cols.map((c) => cell(r, c))));
  const width = LABEL_W + cols.length * CELL_W + TOTAL_W;
  const height = HEAD_H + rows.length * CELL_H;
  const excluded = Math.max(0, state.window.events.retained - a.compared);
  const histTotal = a.histogram.reduce((x, y) => x + y, 0);
  const histMax = Math.max(1, ...a.histogram);
  return (
    <div className="view agreement">
      <p className="lede">
        <b>context agreement</b> · Jev suggestion equals the recorded context agent; not proof of delegation, because
        the agent that actually ran is not in the logs.
      </p>
      <dl className="facts">
        <div>
          <dt>agreement</dt>
          <dd>{pct(a.percent)}</dd>
        </div>
        <div>
          <dt>compared</dt>
          <dd>{a.compared ? `${a.agreed} of ${a.compared} compared` : "nothing compared"}</dd>
        </div>
        <div>
          <dt>excluded</dt>
          <dd title="events without a suggestion or without a recorded context agent">
            {`excluded ${fmtInt(excluded)} (no suggestion or no context agent)`}
          </dd>
        </div>
        <div>
          <dt>scope</dt>
          <dd>retained window</dd>
        </div>
      </dl>

      <h3>confusion matrix</h3>
      <svg
        className="matrix"
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        role="img"
        aria-label="Jev suggestion by recorded context agent"
      >
        <text className="axis" x={LABEL_W} y={10}>
          context agent →
        </text>
        <text className="axis" x={4} y={HEAD_H - 6}>
          suggestion ↓
        </text>
        {cols.map((c, ci) => {
          const x = LABEL_W + ci * CELL_W + CELL_W / 2;
          return (
            <text key={c} className="col-label" x={x} y={HEAD_H - 8} transform={`rotate(-35 ${x} ${HEAD_H - 8})`}>
              {c.length > 14 ? `${c.slice(0, 13)}…` : c}
            </text>
          );
        })}
        <text className="axis" x={LABEL_W + cols.length * CELL_W + TOTAL_W / 2} y={HEAD_H - 6} textAnchor="middle">
          n
        </text>
        {rows.map((r, ri) => {
          const y = HEAD_H + ri * CELL_H;
          const total = cols.reduce((sum, c) => sum + cell(r, c), 0);
          return (
            <g key={r}>
              <text className="row-label" x={LABEL_W - 8} y={y + CELL_H / 2 + 4} textAnchor="end">
                {r.length > 12 ? `${r.slice(0, 11)}…` : r}
              </text>
              {cols.map((c, ci) => {
                const n = cell(r, c);
                const x = LABEL_W + ci * CELL_W;
                return (
                  <g key={c}>
                    <rect
                      className={`cell${r === c ? " diag" : ""}${n > 0 ? " hit" : ""}`}
                      data-cell={`${r}:${c}`}
                      data-count={n}
                      x={x + 1}
                      y={y + 1}
                      width={CELL_W - 2}
                      height={CELL_H - 2}
                      fillOpacity={n > 0 ? 0.18 + 0.72 * (n / max) : 0}
                    />
                    <text
                      className={n > 0 ? "cell-n" : "cell-n zero"}
                      x={x + CELL_W / 2}
                      y={y + CELL_H / 2 + 4}
                      textAnchor="middle"
                    >
                      {n}
                    </text>
                  </g>
                );
              })}
              <text
                className="row-total"
                x={LABEL_W + cols.length * CELL_W + TOTAL_W / 2}
                y={y + CELL_H / 2 + 4}
                textAnchor="middle"
              >
                {total}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="note dim">
        outlined cells on the diagonal are context agreement. Off-diagonal cells are disagreement.
      </p>

      <h3>confidence histogram</h3>
      <svg className="hist" viewBox="0 0 360 120" width={360} height={120} role="img" aria-label="Jev role confidence">
        {a.histogram.map((n, i) => {
          const h = Math.round((n / histMax) * 70);
          return (
            <g key={`bin-${i}`}>
              <rect
                className={`bar${n > 0 ? " hit" : ""}`}
                data-bin={i}
                data-count={n}
                x={10 + i * 34}
                y={90 - h}
                width={28}
                height={Math.max(h, n > 0 ? 1 : 0)}
              />
              <text className="cell-n" x={24 + i * 34} y={86 - h} textAnchor="middle">
                {n > 0 ? n : ""}
              </text>
            </g>
          );
        })}
        <line className="baseline" x1={10} y1={90} x2={350} y2={90} />
        {[0, 5, 10].map((t) => (
          <text
            key={t}
            className="axis"
            x={10 + t * 34 - (t === 10 ? 4 : 0)}
            y={106}
            textAnchor={t === 10 ? "end" : "start"}
          >
            {(t / 10).toFixed(1)}
          </text>
        ))}
      </svg>
      <p className="note dim">{`Jev role confidence in 10 bins · n=${fmtInt(histTotal)} events with a confidence · retained window`}</p>
    </div>
  );
}
