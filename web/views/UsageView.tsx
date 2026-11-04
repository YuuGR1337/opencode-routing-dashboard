import type { DashboardState } from "../../src/core/aggregate";
import { fmtCost, fmtInt, fmtRange } from "./format";
import { StatsMissing } from "./parts";

type Row = {
  key: string;
  label: string;
  tag?: string;
  steps: number;
  tokens: { input: number; output: number; reasoning: number; cache: { read: number; write: number } };
  cost: number;
};

function UsageTable({ title, rows, total }: { title: string; rows: Row[]; total?: Row | null }) {
  const max = Math.max(1, ...rows.map((r) => r.steps));
  const body = (r: Row, foot = false) => (
    <tr key={r.key} className={foot ? "total" : undefined}>
      <td className="name" title={r.label}>
        <div className="name-text">
          {r.label}
          {r.tag ? <span className="variant">{r.tag}</span> : null}
        </div>
        {foot ? null : (
          <svg width={140} height={3} aria-hidden="true">
            <rect className="share-bar" x={0} y={0} width={Math.max(1, Math.round((r.steps / max) * 140))} height={3} />
          </svg>
        )}
      </td>
      <td className="num">{fmtInt(r.steps)}</td>
      <td className="num">{fmtInt(r.tokens.input)}</td>
      <td className="num">{fmtInt(r.tokens.output)}</td>
      <td className="num">{fmtInt(r.tokens.reasoning)}</td>
      <td className="num">{fmtInt(r.tokens.cache.read)}</td>
      <td className="num">{fmtInt(r.tokens.cache.write)}</td>
      <td className={`num${r.cost === 0 ? " dim" : ""}`}>{fmtCost(r.cost)}</td>
    </tr>
  );
  return (
    <section>
      <h3>{title}</h3>
      <table className="usage">
        <thead>
          <tr>
            <th>name</th>
            <th className="num">steps</th>
            <th className="num">input</th>
            <th className="num">output</th>
            <th className="num">reasoning</th>
            <th className="num">cache read</th>
            <th className="num">cache write</th>
            <th className="num">cost</th>
          </tr>
        </thead>
        <tbody>{rows.map((r) => body(r))}</tbody>
        {total ? <tfoot>{body(total, true)}</tfoot> : null}
      </table>
    </section>
  );
}

export function UsageView({ state }: { state: DashboardState }) {
  const { stats, usage } = state;
  if (!stats) return <StatsMissing state={state} />;
  const byModel: Row[] = [...usage.models]
    .sort((a, b) => b.steps - a.steps)
    .map((m) => ({
      ...m,
      key: `${m.provider}/${m.model}/${m.variant}`,
      label: `${m.provider}/${m.model}`,
      tag: m.variant,
    }));
  const byProvider: Row[] = [...usage.providers]
    .sort((a, b) => b.steps - a.steps)
    .map((p) => ({ ...p, key: p.provider, label: p.provider }));
  const byVariant: Row[] = [...usage.variants]
    .sort((a, b) => b.steps - a.steps)
    .map((v) => ({ ...v, key: v.variant, label: v.variant }));
  const total: Row | null = usage.totals ? { ...usage.totals, key: "total", label: "total (stats top level)" } : null;
  return (
    <div className="view usage">
      <p className="lede">
        <b>{`stats range ${fmtRange(stats.range)}`}</b> · from opencode stats --json. Aggregate only; not attributable
        to any call.
      </p>
      <dl className="facts">
        <div>
          <dt>sessions</dt>
          <dd>{fmtInt(stats.sessions)}</dd>
        </div>
        <div>
          <dt>subagents</dt>
          <dd>{fmtInt(stats.subagents)}</dd>
        </div>
        <div>
          <dt>prompts</dt>
          <dd>{fmtInt(stats.prompts)}</dd>
        </div>
        <div>
          <dt>steps</dt>
          <dd>{fmtInt(stats.steps)}</dd>
        </div>
        <div>
          <dt>presets</dt>
          <dd>presets not available</dd>
        </div>
      </dl>
      <UsageTable title="by model" rows={byModel} total={total} />
      <UsageTable title="by provider" rows={byProvider} />
      <UsageTable title="by variant" rows={byVariant} />
      <p className="note dim">
        cost is as reported by opencode. 0 reported means the provider reported no cost (for example a subscription); no
        price inferred. Totals come from the stats top level and may differ from the sum of model rows.
      </p>
    </div>
  );
}
