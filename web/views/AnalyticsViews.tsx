import {
  ALERT_LABEL,
  type AlertsView as AlertsData,
  PERIOD_KINDS,
  PERIOD_LABEL,
  type Period,
  type PresetView,
  type QuotaRow,
  type QuotaView,
  type SourceCoverage,
} from "../analytics";
import { fmtClock, fmtCost, fmtDay, fmtInt } from "./format";

const stamp = (ms: number) => `${fmtDay(ms)} ${fmtClock(new Date(ms).toISOString())}`;
const seconds = (ms: number) => `${Math.round(ms / 100) / 10} s`;
const pctOf = (ratio: number) => `${Math.round(ratio * 100)}%`;
const Unavailable = ({ why }: { why: string }) => (
  <td data-unavailable="true" title={why} className="num">
    —
  </td>
);

function Coverage({ sources }: { sources: SourceCoverage[] }) {
  if (!sources.length) return <p className="note dim">source coverage unavailable</p>;
  return (
    <section aria-label="source coverage">
      <h3>source coverage</h3>
      <ul className="evidence">
        {sources.map((source) => (
          <li key={source.id} className={source.partialReasons.length || source.included === false ? "warn" : "dim"}>
            <b>{source.id}</b>
            {` · ${source.status ?? "unknown"}${source.included === false ? " · not included" : ""}`}
            {source.retained === undefined ? "" : ` · retained ${fmtInt(source.retained)}`}
            {source.omitted === undefined ? "" : ` · omitted ${fmtInt(source.omitted)}`}
            {source.evicted === undefined ? "" : ` · evicted ${fmtInt(source.evicted)}`}
            {source.oldestRetainedTs ? ` · oldest ${source.oldestRetainedTs}` : ""}
            {source.partialReasons.length ? ` · ${source.partialReasons.join(" · ")}` : ""}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Alerts: server history when published, otherwise explicit evidence found in the sent events. */
export function AlertsPanel({ view, now }: { view: AlertsData; now: number }) {
  const { evidence, settings, notification } = view;
  return (
    <div className="view alerts" data-mode={view.mode}>
      <section>
        <h3>alerts</h3>
        <p className="note dim">
          {view.mode === "server"
            ? "server alerts · newest first · the last 100 fired · hold and repeat applied by the server"
            : "derived in browser from the last 5 min of sent events · no hold or repeat state · nothing is notified"}
        </p>
        <dl className="facts">
          <div>
            <dt>evidence</dt>
            <dd>{`events analysed ${fmtInt(evidence.events)} · sources ${evidence.sources}`}</dd>
          </div>
          <div>
            <dt>execution</dt>
            <dd title="Execution alerts need a recorded status, error or fallback flag">{`with execution evidence ${fmtInt(evidence.withExecution)}`}</dd>
          </div>
          {settings ? (
            <>
              <div>
                <dt>debounce</dt>
                <dd>{`hold ${seconds(settings.holdMs)} · repeat ${seconds(settings.repeatMs)} · active ${seconds(settings.activeMs)}`}</dd>
              </div>
              <div>
                <dt>desktop</dt>
                <dd>{`desktop notifications ${settings.desktop ? "on" : "off"}${
                  notification ? ` · last result ${notification.ok ? "ok" : (notification.reason ?? "failed")}` : ""
                }`}</dd>
              </div>
            </>
          ) : null}
        </dl>
        {view.rows.length === 0 ? (
          <p className="empty">
            no alert evidence in the sent events
            <span className="dim">
              {" "}
              · unknown never fires. Rate-limit, quota and fallback alerts need explicit recorded evidence.
            </span>
          </p>
        ) : (
          <table className="list">
            <thead>
              <tr>
                <th>state</th>
                <th>source</th>
                <th>alert</th>
                <th>since</th>
                <th>last fired</th>
              </tr>
            </thead>
            <tbody>
              {view.rows.map((r) => (
                <tr
                  key={`${r.sourceId}/${r.kind}/${r.lastFired ?? r.since}`}
                  data-alert={r.kind}
                  data-source-id={r.sourceId}
                >
                  <td className={r.active ? "warn" : "dim"}>
                    <span className="glyph" aria-hidden="true">
                      {r.active ? "▲" : "○"}
                    </span>
                    {r.active ? "active" : "cleared"}
                  </td>
                  <td>{r.sourceId}</td>
                  <td className={r.kind === "classifier-rate-limit" ? undefined : "err"}>{ALERT_LABEL[r.kind]}</td>
                  <td>{r.since === null ? "—" : stamp(r.since)}</td>
                  <td>
                    {r.lastFired === null
                      ? "—"
                      : `${stamp(r.lastFired)} (${seconds(Math.max(0, now - r.lastFired))} ago)`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="note dim">
          classifier rate limits come from Jev's own records. Execution alerts come only from recorded execution
          evidence.
        </p>
      </section>
    </div>
  );
}

function Window({ label, w }: { label: "5h" | "weekly"; w: QuotaRow["fiveHour"] }) {
  const measured = w.observed !== null;
  const ratio = measured && w.limit !== null ? Math.min(1, w.observed! / w.limit) : null;
  return (
    <td data-window={label} data-status={w.status} className="win">
      <div className="win-line">
        <span className={w.status === "estimate" ? "ok" : w.status === "partial" ? "warn" : "dim"}>
          <span className="glyph" aria-hidden="true">
            {w.status === "estimate" ? "●" : w.status === "partial" ? "◐" : "○"}
          </span>
          {w.status}
        </span>
        <span>
          {measured ? fmtInt(w.observed!) : "—"}
          {w.limit !== null ? ` / ${fmtInt(w.limit)}` : ""}
        </span>
        {w.limit === null ? <span className="dim">limit not set</span> : null}
      </div>
      {ratio !== null ? (
        <svg className={`quota-bar ${w.status}`} width={140} height={6} data-quota-bar={w.status} aria-hidden="true">
          <rect className="track" x={0.5} y={0.5} width={139} height={5} />
          <rect className="fill" x={0.5} y={0.5} width={Math.max(1, Math.round(139 * ratio))} height={5} />
        </svg>
      ) : null}
      <div className="dim win-note">
        {!measured
          ? "unknown · coverage not proven"
          : w.coverage.attributionGaps
            ? "attribution gaps"
            : w.coverage.complete
              ? "coverage complete"
              : "coverage not proven"}
      </div>
    </td>
  );
}

/** Quota estimates per source, against limits the user configured. Never summed across sources. */
export function QuotaPanel({ view }: { view: QuotaView }) {
  return (
    <div className="view quota" data-mode={view.mode}>
      <section>
        <h3>quota estimates</h3>
        {view.configured.length === 0 ? (
          <div className="empty" role="status">
            <div>no quotas configured</div>
            <div className="dim">
              add quotas[] with your own limits to the analytics settings file and start with --analytics-config
              (ORD_ANALYTICS_CONFIG). Limits are never defaulted.
            </div>
          </div>
        ) : (
          <>
            <p className="note dim">
              {view.mode === "server"
                ? "server estimate · rolling 5 h and 7 d windows · one row per quota and source"
                : "derived in browser from sent events · coverage is not proven here, so nothing reads as a complete estimate"}
            </p>
            {view.rows.length === 0 ? (
              <p className="empty">no rows for this source</p>
            ) : (
              <table className="list quota-table">
                <thead>
                  <tr>
                    <th>quota</th>
                    <th>source</th>
                    <th>5 h</th>
                    <th>weekly</th>
                  </tr>
                </thead>
                <tbody>
                  {view.rows.map((r) => (
                    <tr key={`${r.id}/${r.sourceId}`} data-quota={r.id} data-source-id={r.sourceId ?? ""}>
                      <td className="name" title={`${r.provider}${r.model ? `/${r.model}` : ""} · ${r.metric}`}>
                        <div className="name-text">{r.label}</div>
                        <div className="dim">{`${r.provider}${r.model ? `/${r.model}` : ""} · ${r.metric}`}</div>
                      </td>
                      <td>{r.sourceId ?? "—"}</td>
                      <Window label="5h" w={r.fiveHour} />
                      <Window label="weekly" w={r.weekly} />
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
        <p className="note dim">
          subscription cost 0 is not quota 0. Windows are measured from timestamped records that name the provider;
          stats ranges are never differenced.
        </p>
        <Coverage sources={view.coverage} />
      </section>
    </div>
  );
}

/** Period picker shared by the preset comparison and the report export. */
export function PeriodControl({
  period,
  onPeriod,
  range,
}: {
  period: Period;
  onPeriod: (next: Period) => void;
  range: { from: number; to: number } | null;
}) {
  return (
    <div className="period" role="group" aria-label="period">
      <label>
        period{" "}
        <select
          id="preset-period"
          value={period.kind}
          onChange={(e) => onPeriod({ ...period, kind: e.target.value as Period["kind"] })}
        >
          {PERIOD_KINDS.map((k) => (
            <option key={k} value={k}>
              {PERIOD_LABEL[k]}
            </option>
          ))}
        </select>
      </label>
      {period.kind === "custom" ? (
        <>
          <label>
            from{" "}
            <input
              id="preset-from"
              type="datetime-local"
              value={period.from}
              onChange={(e) => onPeriod({ ...period, from: e.target.value })}
            />
          </label>
          <label>
            to{" "}
            <input
              id="preset-to"
              type="datetime-local"
              value={period.to}
              onChange={(e) => onPeriod({ ...period, to: e.target.value })}
            />
          </label>
        </>
      ) : null}
      <span className="dim">{range ? `${stamp(range.from)} → ${stamp(range.to)}` : ""}</span>
    </div>
  );
}

const SHORT = "—";
/** Preset comparison over a user-chosen period, from recorded presets or observed file intervals. */
export function PresetsPanel({
  view,
  period,
  onPeriod,
}: {
  view: PresetView;
  period: Period;
  onPeriod: (next: Period) => void;
}) {
  const result = view.result;
  const total = result?.presetCoverage;
  return (
    <div className="view presets">
      <section>
        <h3>preset comparison</h3>
        <PeriodControl period={period} onPeriod={onPeriod} range={view.range} />
        {view.range === null || result === null ? (
          <p className="empty">invalid range · set both ends, start before end</p>
        ) : (
          <>
            <dl className="facts">
              <div>
                <dt>events in period</dt>
                <dd>{fmtInt(view.events)}</dd>
              </div>
              <div>
                <dt>attribution</dt>
                <dd>{`attributed ${fmtInt(total!.attributed)} · unattributed ${fmtInt(total!.unattributed)}`}</dd>
              </div>
              <div>
                <dt>sample</dt>
                <dd>
                  {`sent events only${view.omitted > 0 ? ` · ${fmtInt(view.omitted)} omitted from payload` : ""}${
                    view.evicted > 0 ? ` · evicted ${fmtInt(view.evicted)}` : ""
                  }`}
                </dd>
              </div>
            </dl>
            {result.presets.length === 0 ? (
              <p className="empty">
                no preset recorded in this period
                <span className="dim"> · events carry no preset label and no observed preset interval covers them</span>
              </p>
            ) : (
              <table className="list presets-table">
                <thead>
                  <tr>
                    <th>preset</th>
                    <th className="num">events</th>
                    <th className="num" title="Jev suggestion equals the recorded context agent">
                      ctx agree
                    </th>
                    <th className="num" title="Jev classifier latency, not execution latency">
                      jev p50
                    </th>
                    <th className="num" title="Jev classifier latency, not execution latency">
                      jev p95
                    </th>
                    <th className="num">errors</th>
                    <th className="num">fallback</th>
                    <th className="num">tokens</th>
                    <th className="num">cost</th>
                    <th>attribution</th>
                  </tr>
                </thead>
                <tbody>
                  {result.presets.map((p) => (
                    <tr key={p.preset} data-preset={p.preset}>
                      <td className="name">{p.preset}</td>
                      <td className="num">{fmtInt(p.count)}</td>
                      {p.contextAgreement === null ? (
                        <Unavailable why="no event with both a suggestion and a context agent" />
                      ) : (
                        <td className="num" title={`${p.coverage.agreement} compared`}>
                          {pctOf(p.contextAgreement)}
                        </td>
                      )}
                      {p.p50Latency === null ? (
                        <Unavailable why="no latency recorded" />
                      ) : (
                        <td className="num">{`${Math.round(p.p50Latency)}ms`}</td>
                      )}
                      {p.p95Latency === null ? (
                        <Unavailable why="no latency recorded" />
                      ) : (
                        <td className="num">{`${Math.round(p.p95Latency)}ms`}</td>
                      )}
                      <td className={`num${p.errors ? " err" : ""}`}>{fmtInt(p.errors)}</td>
                      {p.fallback === null ? (
                        <Unavailable why="no execution record states whether a fallback happened" />
                      ) : (
                        <td className="num" title="events with a recorded fallback flag">
                          {`${p.fallback} of ${p.coverage.fallback}`}
                        </td>
                      )}
                      {p.tokens === null ? (
                        <Unavailable why="no per-message token usage recorded for this preset" />
                      ) : (
                        <td className="num" title={`tokens recorded for ${p.coverage.tokens} of ${p.count} events`}>
                          {`${fmtInt(p.tokens)} (${p.coverage.tokens}/${p.count})`}
                        </td>
                      )}
                      {p.cost === null ? (
                        <Unavailable why="no per-message cost recorded for this preset" />
                      ) : (
                        <td className="num" title={`cost recorded for ${p.coverage.cost} of ${p.count} events`}>
                          {`${fmtCost(p.cost)} (${p.coverage.cost}/${p.count})`}
                        </td>
                      )}
                      <td title={p.coverage.explicitAttribution}>
                        {`explicit ${p.coverage.explicit}`}
                        {p.coverage.sampled > 0 ? ` · estimated ${p.coverage.sampled}` : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {result.presets.some((p) => p.coverage.sampled > 0) ? (
              <p className="note dim">sampled file selection · runtime use unverified</p>
            ) : null}
            <p className="note dim">
              tokens and cost show recorded events / attributed events; missing evidence is not counted as zero.
            </p>
          </>
        )}
        <h3>preset evidence by source</h3>
        <ul className="evidence">
          {view.sources.map((s) => (
            <li key={s.id}>
              <b>{s.id}</b>
              {` · preset file ${s.status}${s.detail ? ` · ${s.detail}` : ""} · changes ${s.changes}`}
            </li>
          ))}
          {view.partialReasons.map((r) => (
            <li key={`partial-${r.sourceId}`} className="warn">
              {`${r.sourceId}: ${r.reasons.join(" · ")}`}
            </li>
          ))}
        </ul>
        <Coverage sources={view.coverage} />
        <p className="note dim">
          context agreement compares the Jev suggestion with the recorded context agent. The classifier model is not
          execution identity, and aggregate stats are not allocated to presets. Missing evidence reads {SHORT}, never 0.
        </p>
      </section>
    </div>
  );
}
