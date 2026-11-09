import type { DashboardState, FlowEvent, Source } from "../../src/core/aggregate";
import { fmtInt, fmtRange, fmtTs, SOURCES } from "./format";
import { PermissionTable } from "./PermissionTable";
import { StateIcon } from "./parts";

const isTimeout = (text: string) => /time-?out/i.test(text);

function failureSource(event: FlowEvent, text: string) {
  return event.observe?.error === text ? "observe" : "route";
}

export function ErrorsView({ state, rejected }: { state: DashboardState; rejected?: number }) {
  const { errors, stats, window: win } = state;
  const failing = [...state.events].filter((e) => e.errors.length > 0).reverse();
  const timeouts = failing.reduce((n, e) => n + e.errors.filter(isTimeout).length, 0);
  const verdicts = Object.entries(errors.permissions).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  const permissions = [...state.permissions].reverse();
  const failingTools = (stats?.tools.usage ?? []).filter((t) => t.failed > 0).sort((a, b) => b.failed - a.failed);
  return (
    <div className="view errors">
      <section>
        <h3>jev failures</h3>
        <dl className="facts">
          <div>
            <dt>observe errors</dt>
            <dd>{fmtInt(errors.observe)}</dd>
          </div>
          <div>
            <dt>route errors</dt>
            <dd>{fmtInt(errors.route)}</dd>
          </div>
          <div>
            <dt>timeouts</dt>
            <dd title="matched by text in the sent events">{`timeouts ${fmtInt(timeouts)} (sent events)`}</dd>
          </div>
          <div>
            <dt>scope</dt>
            <dd>retained window</dd>
          </div>
        </dl>
        {failing.length === 0 ? (
          <p className="empty">no jev failures in the sent detail rows</p>
        ) : (
          <table className="list">
            <thead>
              <tr>
                <th>ts</th>
                <th>session</th>
                <th>source</th>
                <th>error</th>
              </tr>
            </thead>
            <tbody>
              {failing.flatMap((e) =>
                e.errors.map((text, i) => (
                  <tr key={`${e.id}:${i}`}>
                    <td>{fmtTs(e.ts)}</td>
                    <td title={e.session}>{e.session}</td>
                    <td>{failureSource(e, text)}</td>
                    <td className="err">
                      <span className="glyph" aria-hidden="true">
                        <StateIcon kind="error" />
                      </span>
                      {text}
                    </td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h3>malformed (process lifetime)</h3>
        <dl className="facts">
          {SOURCES.map((s: Source) => (
            <div key={s}>
              <dt>{s}</dt>
              <dd>{fmtInt(errors.malformed[s])}</dd>
            </div>
          ))}
        </dl>
        <p className="note dim">lines that could not be parsed, skipped and counted since this process started.</p>
      </section>

      {rejected === undefined ? null : (
        <section>
          <h3>rejected payloads (this page)</h3>
          <dl className="facts">
            <div>
              <dt>rejected payloads</dt>
              <dd className={rejected > 0 ? "warn" : undefined} data-rejected={rejected}>
                {fmtInt(rejected)}
              </dd>
            </div>
          </dl>
          <p className="note dim">
            browser payloads that failed validation and were dropped since this page loaded. Not a count of log lines.
          </p>
        </section>
      )}

      <section>
        <h3>tool failures</h3>
        {stats ? (
          <>
            <p>
              {`${stats.tools.totals.failed} of ${stats.tools.totals.calls} calls failed · `}
              <b>{`stats range ${fmtRange(stats.range)}`}</b>
              <span className="dim"> (separate from the log window)</span>
            </p>
            {failingTools.length ? (
              <table className="list">
                <thead>
                  <tr>
                    <th>tool</th>
                    <th className="num">calls</th>
                    <th className="num">failed</th>
                  </tr>
                </thead>
                <tbody>
                  {failingTools.map((t) => (
                    <tr key={t.name}>
                      <td>{t.name}</td>
                      <td className="num">{fmtInt(t.calls)}</td>
                      <td className="num err">{fmtInt(t.failed)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="empty">no tool failures in the stats range</p>
            )}
          </>
        ) : (
          <p className="empty">{`stats unavailable${state.statsStatus ? ` · ${state.statsStatus.status}` : " · not read yet"}`}</p>
        )}
      </section>

      <section>
        <h3>permission gate</h3>
        {verdicts.length === 0 ? (
          <p className="empty">no permission verdicts in the retained window</p>
        ) : (
          <>
            <dl className="facts">
              {verdicts.map(([verdict, n]) => (
                <div key={verdict}>
                  <dt>{verdict}</dt>
                  <dd>{fmtInt(n)}</dd>
                </div>
              ))}
              <div>
                <dt>scope</dt>
                <dd>retained window</dd>
              </div>
            </dl>
            <p className="note dim">{`newest ${win.permissions.sent} of ${win.permissions.retained} retained verdicts listed`}</p>
            <PermissionTable permissions={permissions} />
          </>
        )}
      </section>
    </div>
  );
}
