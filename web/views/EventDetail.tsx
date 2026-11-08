import type { FlowEvent } from "../../src/core/aggregate";
import { clientText, evidence } from "../exchange";
import { fmt2, fmtTs } from "./format";
import { StateIcon } from "./parts";

export function EventDetail({
  event,
  events,
  retained,
  onSelect,
}: {
  event: FlowEvent;
  /** Sent events, used for the session timeline. Defaults to just this event. */
  events?: FlowEvent[];
  /** Retained events overall, to say how much of the session may be missing. */
  retained?: number;
  onSelect?: (id: string) => void;
}) {
  const tag = evidence(event);
  const tagged = tag.sourceId !== undefined || tag.client !== undefined || tag.directory !== undefined;
  const fields: [string, string | number | null, boolean][] = [
    ["ts", event.ts, false],
    ["session", event.session, false],
    ...(tagged
      ? ([
          ["sourceId", tag.sourceId ?? null, false],
          ["client", clientText(tag), false],
          ["directory", tag.directory ?? null, false],
        ] as [string, string | null, boolean][])
      : []),
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
  const timeline = (events ?? [event])
    .filter((e) => e.session === event.session)
    .sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts) || (a.id < b.id ? -1 : 1));
  const { observe: _o, route: _r, ...derived } = event;
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
      <h3>session timeline</h3>
      <p className="dim">
        {`sent events of this session: ${timeline.length}`}
        {retained === undefined ? "" : ` · ${retained} retained overall; older events of the session may be missing`}
      </p>
      <ol className="timeline">
        {timeline.map((e) => {
          const current = e.id === event.id;
          const body = (
            <>
              <span className="t-ts">{fmtTs(e.ts)}</span>
              <span className="t-msg">{e.message ?? "—"}</span>
              <span className="t-sug">{e.suggestion ? `${e.suggestion} ${fmt2(e.confidence)}` : "—"}</span>
              <span className="t-dec">{e.decision ?? "—"}</span>
              <span className="t-ctx">{e.contextAgent ?? "—"}</span>
              {e.errors.length ? (
                <span className="err" title={e.errors.join(" | ")}>
                  <span className="glyph" role="img" aria-label="error">
                    <StateIcon kind="error" />
                  </span>
                </span>
              ) : null}
            </>
          );
          return (
            <li
              key={e.id}
              data-timeline="row"
              aria-current={current ? "true" : undefined}
              className={current ? "cur" : undefined}
            >
              {onSelect && !current ? (
                <button type="button" onClick={() => onSelect(e.id)}>
                  {body}
                </button>
              ) : (
                <div>{body}</div>
              )}
            </li>
          );
        })}
      </ol>
      <h3>raw observe</h3>
      {event.observe ? <pre>{JSON.stringify(event.observe, null, 2)}</pre> : <p className="dim">no observe record</p>}
      <h3>raw route</h3>
      {event.route ? <pre>{JSON.stringify(event.route, null, 2)}</pre> : <p className="dim">no route record</p>}
      <h3>event json</h3>
      <pre>{JSON.stringify(derived, null, 2)}</pre>
      <h3>linked stats</h3>
      <p className="dim">none. Aggregate stats are not attributable to a message.</p>
    </div>
  );
}
