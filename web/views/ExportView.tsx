import { type Period } from "../analytics";
import { type ExchangeStatus, SOURCE_ICON } from "../exchange";
import type { ExportPlan } from "../export";
import { PeriodControl } from "./AnalyticsViews";
import { StateIcon } from "./parts";

const FORMATS = [
  { format: "md", label: "Markdown", file: "routing-report.md" },
  { format: "csv", label: "CSV", file: "routing-report.csv" },
] as const;
const iso = (ms: number) => new Date(ms).toISOString();

/**
 * Report download for the selected source and the preset comparison period. Plain same-origin GET links:
 * when the range is not valid or a source is not live, the endpoint would refuse, so there is no link, only the reason.
 */
export function ExportPanel({
  plan,
  period,
  onPeriod,
}: {
  plan: ExportPlan;
  period: Period;
  onPeriod: (next: Period) => void;
}) {
  return (
    <div className="view export">
      <section>
        <h3>report export</h3>
        <p className="note dim">
          uses the period of the preset comparison · the report covers only validated live sources
        </p>
        <PeriodControl period={period} onPeriod={onPeriod} range={plan.range} />
        <dl className="facts">
          <div>
            <dt>source</dt>
            <dd>{plan.sourceId ?? "all sources"}</dd>
          </div>
          <div>
            <dt>range (UTC)</dt>
            <dd>{plan.range ? `${iso(plan.range.from)} → ${iso(plan.range.to)} · end exclusive` : "—"}</dd>
          </div>
          {plan.sources.length > 0 ? (
            <div>
              <dt>health</dt>
              <dd>
                {plan.sources.map((s) => (
                  <span key={s.id} className={s.blocked ? "warn" : "ok"}>
                    <span className="glyph" aria-hidden="true">
                      <StateIcon kind={SOURCE_ICON[s.status as ExchangeStatus] ?? "missing"} />
                    </span>
                    {`${s.id} ${s.blocked ?? s.status}  `}
                  </span>
                ))}
              </dd>
            </div>
          ) : null}
        </dl>
        <div className="downloads" role="group" aria-label="download report">
          {FORMATS.map((f) =>
            plan.links ? (
              <a key={f.format} className="dl" data-format={f.format} href={plan.links[f.format]} download={f.file}>
                {`↓ ${f.label} (.${f.format})`}
              </a>
            ) : (
              <span key={f.format} className="dl off" data-format={f.format} aria-disabled="true">
                {`↓ ${f.label} (.${f.format})`}
              </span>
            ),
          )}
        </div>
        {plan.reason ? (
          <p className="empty" role="status">
            {plan.reason}
          </p>
        ) : null}
      </section>
    </div>
  );
}
