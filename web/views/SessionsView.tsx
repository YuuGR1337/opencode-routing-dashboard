import { useEffect, useMemo, useRef } from "react";
import type { DashboardState, FlowEvent } from "../../src/core/aggregate";
import {
  type EventFieldState,
  type EvidenceState,
  type FieldKey,
  inspectSession,
  listSessions,
  type SessionListEntry,
} from "../../src/core/session-inspection";
import { evidence } from "../exchange";
import { moveRow, sessionKey } from "../sessions";
import { fmt2, fmtClock, fmtTs, RENDER_LIMIT } from "./format";
import { PermissionTable } from "./PermissionTable";
import { StateIcon } from "./parts";

const GLYPH = { recorded: "▮", enriched: "＋", not_available: "—" } as const;

/**
 * One of the three evidence states as glyph + word, with a border pattern of its own (solid / solid / dashed).
 * Colour only reinforces. Enriched is defined by the contract but nothing feeds it yet.
 */
export function EvidenceChip({ state }: { state: EvidenceState }) {
  const word =
    state.state === "recorded" ? "recorded" : state.state === "enriched" ? "enriched · validated" : "not available";
  return (
    <span className="chip" data-evidence={state.state}>
      {`${GLYPH[state.state]} ${word}`}
    </span>
  );
}

/** Where a recorded value came from, or why it is missing. */
const why = (state: EvidenceState) =>
  state.state === "recorded" ? state.kind : state.state === "not_available" ? state.reason : "";

type Row = { key: FieldKey; label: string; value: string | null; note?: string };

function FieldRows({ rows, states }: { rows: Row[]; states: EventFieldState }) {
  return (
    <table className="kv s-fields">
      <tbody>
        {rows.map((row) => {
          const state = states[row.key];
          return (
            <tr key={row.key} data-field={row.key}>
              <th>{row.label}</th>
              <td className={state.state === "not_available" ? "unavail" : undefined}>{row.value ?? "—"}</td>
              <td className="s-state">
                <EvidenceChip state={state} />
                <span className="s-why dim">{why(state)}</span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

const errorKind = (event: FlowEvent, text: string) => (event.observe?.error === text ? "observe" : "route");

function SessionList({
  state,
  viewSource,
  hasExchange,
  inspected,
  onOpen,
  rowRefs,
}: {
  state: DashboardState;
  viewSource: string | null;
  hasExchange: boolean;
  inspected: string | null;
  onOpen: (session: string) => void;
  rowRefs: React.MutableRefObject<Map<string, HTMLButtonElement>>;
}) {
  const entries = useMemo(() => listSessions(state), [state]);
  // Events can carry their source only as a tag (older shape); the federated session id is the primary evidence.
  const tagged = useMemo(() => {
    const byKey = new Map<string, string>();
    for (const e of state.events) {
      const id = evidence(e).sourceId;
      if (id && !byKey.has(e.session)) byKey.set(e.session, id);
    }
    return byKey;
  }, [state.events]);
  const shown = entries.slice(0, RENDER_LIMIT);
  const keys = shown.map(sessionKey);
  const sourceOf = (entry: SessionListEntry, key: string) =>
    entry.sourceId ?? tagged.get(key) ?? viewSource ?? (hasExchange ? "unknown" : "local");
  const onKeyDown = (ev: React.KeyboardEvent) => {
    if (ev.key !== "ArrowDown" && ev.key !== "ArrowUp") return;
    ev.preventDefault();
    const active = [...rowRefs.current.entries()].find(([, el]) => el === document.activeElement)?.[0] ?? null;
    const next = moveRow(keys, active, ev.key === "ArrowDown" ? 1 : -1);
    if (next) rowRefs.current.get(next)?.focus();
  };
  return (
    <section className="s-list" aria-label="session list">
      <h3>{`sessions · ${entries.length} in the sent events`}</h3>
      {entries.length === 0 ? (
        <p className="empty">no sessions in the sent events. This view is a sample of the retained window.</p>
      ) : (
        <>
          <div className="s-cols dim" aria-hidden="true">
            <span className="s-src s-h">source</span>
            <span className="s-name s-h">session</span>
            <span className="s-span s-h">first–last</span>
            <span className="s-n s-h">sent</span>
            <span className="s-err s-h">errors</span>
            <span className="s-perm s-h">gate</span>
          </div>
          <ul className="s-rows" onKeyDown={onKeyDown}>
            {shown.map((entry, i) => {
              const key = keys[i]!;
              return (
                <li key={key}>
                  <button
                    type="button"
                    className="s-row"
                    data-s-row={key}
                    aria-current={key === inspected ? "true" : undefined}
                    ref={(el) => {
                      if (el) rowRefs.current.set(key, el);
                      else rowRefs.current.delete(key);
                    }}
                    onClick={() => onOpen(key)}
                  >
                    <span className="s-src">{sourceOf(entry, key)}</span>
                    <span className="s-name">{entry.session}</span>
                    <span className="s-span">{`${fmtClock(entry.firstTs)}–${fmtClock(entry.lastTs)}`}</span>
                    <span className="s-n">{`sent ${entry.sent}`}</span>
                    <span className="s-err err">
                      {entry.errorCount > 0 ? (
                        <>
                          <span className="glyph" aria-hidden="true">
                            <StateIcon kind="error" />
                          </span>
                          {`${entry.errorCount} error${entry.errorCount > 1 ? "s" : ""}`}
                        </>
                      ) : null}
                    </span>
                    <span className="s-perm">{`${entry.permissionCount} perm`}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
      <p className="note dim">
        {entries.length > shown.length ? `newest ${shown.length} of ${entries.length} sessions listed · ` : ""}
        sessions are named as recorded; no titles, task names or outcomes are inferred
      </p>
    </section>
  );
}

function SessionDetail({
  state,
  viewSource,
  hasExchange,
  session,
  selected,
  replay,
  lastKnown,
  onBack,
  onSelect,
}: {
  state: DashboardState;
  viewSource: string | null;
  hasExchange: boolean;
  session: string;
  selected: string | null;
  replay: { playing: boolean; speed: number } | null;
  lastKnown: string | null;
  onBack: () => void;
  onSelect: (id: string) => void;
}) {
  const inspection = useMemo(() => inspectSession(state, session), [state, session]);
  const { scope, events, fields } = inspection;
  const index = events.findIndex((e) => e.id === selected);
  const current = index >= 0 ? events[index]! : null;
  const states = index >= 0 ? fields[index]! : null;
  const source =
    scope.sourceId ??
    (events[0] ? evidence(events[0]).sourceId : undefined) ??
    viewSource ??
    (hasExchange ? "unknown" : "local");
  const win = state.window;
  const list = useRef<HTMLOListElement>(null);

  // Arrow keys move the one replay cursor; focus follows so the focused row is always the current one.
  useEffect(() => {
    const ol = list.current;
    if (!ol || !ol.contains(document.activeElement)) return;
    const row = ol.querySelector<HTMLElement>('[aria-current="true"] button');
    if (row && row !== document.activeElement) row.focus();
    row?.scrollIntoView?.({ block: "nearest" });
  }, [selected]);
  const onKeyDown = (ev: React.KeyboardEvent) => {
    if (ev.key !== "ArrowDown" && ev.key !== "ArrowUp") return;
    ev.preventDefault();
    const next = moveRow(
      events.map((e) => e.id),
      selected,
      ev.key === "ArrowDown" ? 1 : -1,
    );
    if (next) onSelect(next);
  };

  const scopeItems = [
    `source ${source}`,
    `session ${scope.session}`,
    `sent ${scope.sent}`,
    `retained ${scope.retained} (source window)`,
    `omitted ${scope.omitted}`,
    `evicted ${scope.evicted}`,
    "sample, not a complete archive",
  ];
  const span = scope.observedSpan;
  const permissions = [...inspection.permissions].reverse();

  const router: Row[] = current
    ? [
        { key: "suggestion", label: "suggestion", value: current.suggestion },
        {
          key: "confidence",
          label: "confidence",
          value: current.confidence === null ? null : fmt2(current.confidence),
        },
        {
          key: "needsOracle",
          label: "needs oracle",
          value: current.needsOracle === null ? null : fmt2(current.needsOracle),
        },
        { key: "decision", label: "decision", value: current.decision },
        { key: "reason", label: "reason", value: current.reason },
        { key: "contextAgent", label: "ctx agent", value: current.contextAgent },
        { key: "classifierModel", label: "classifier model", value: current.classifierModel },
      ]
    : [];
  const recorded: Row[] = current
    ? [
        { key: "message", label: "message", value: current.message },
        { key: "prompt", label: "prompt", value: current.prompt },
        { key: "latency", label: "latency", value: current.latency === null ? null : `${current.latency} ms` },
      ]
    : [];
  const exec: Row[] = current
    ? [
        { key: "executionAgent", label: "exec agent", value: current.executionAgent },
        { key: "executionModel", label: "exec model", value: current.executionModel },
        { key: "executionProvider", label: "exec provider", value: current.executionProvider },
        { key: "executionVariant", label: "exec variant", value: current.executionVariant },
        { key: "tokens", label: "tokens", value: current.tokens === null ? null : String(current.tokens) },
        { key: "cost", label: "cost", value: current.cost === null ? null : String(current.cost) },
        { key: "fallback", label: "fallback", value: current.fallback === null ? null : String(current.fallback) },
      ]
    : [];

  return (
    <section className="s-detail" aria-label="session detail">
      <div className="s-top">
        <button type="button" className="s-back" onClick={onBack}>
          ← sessions
        </button>
      </div>
      <div className="s-scope" role="group" aria-label="session scope">
        {scopeItems.map((item, i) => (
          <span key={item} className={i === 0 || i === 1 ? "s-item s-id" : "s-item"}>
            {item}
          </span>
        ))}
        {scope.mayBeIncomplete ? (
          <span className="s-item warn">older events of this session may be missing</span>
        ) : null}
        {lastKnown ? <span className="s-item warn">{`last known · ${lastKnown}`}</span> : null}
      </div>

      {events.length === 0 ? (
        <p className="empty">
          no events of this session in the sent sample. It may have left the retained window, or it was never part of
          it.
        </p>
      ) : (
        <>
          <h3>
            {`timeline · observed event span ${span.firstTs ? fmtClock(span.firstTs) : "—"}–${span.lastTs ? fmtClock(span.lastTs) : "—"}`}
          </h3>
          <p className="note dim">
            {`replay cursor ${index >= 0 ? index + 1 : "—"} of ${events.length}`}
            {replay ? ` · ${replay.playing ? "playing" : "paused"} · ${replay.speed}×` : " · replay not started"}
            {" · shared with the ticker and call in focus · ↑↓ or j k move · , . step · p play · [ ] speed"}
          </p>
          <ol className="timeline s-timeline" aria-label="session timeline" ref={list} onKeyDown={onKeyDown}>
            {events.map((e) => (
              <li key={e.id} data-s-event={e.id} aria-current={e.id === selected ? "true" : undefined}>
                <button type="button" onClick={() => onSelect(e.id)}>
                  <span className="t-ts">{fmtTs(e.ts)}</span>
                  <span className="t-msg">{e.message ?? "—"}</span>
                  <span className="t-sug">{e.suggestion ? `${e.suggestion} ${fmt2(e.confidence)}` : "—"}</span>
                  <span className="t-dec">{e.decision ?? "—"}</span>
                  <span className="t-ctx">{e.contextAgent ?? "—"}</span>
                  {e.errors.length ? (
                    <span className="err t-err">
                      <span className="glyph" role="img" aria-label="error">
                        <StateIcon kind="error" />
                      </span>
                      {e.errors[0]}
                      {e.errors.length > 1 ? ` +${e.errors.length - 1}` : ""}
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ol>

          {current && states ? (
            <>
              <h3>{`selected row · ${fmtTs(current.ts)}`}</h3>
              <FieldRows rows={recorded} states={states} />
              {current.errors.length ? (
                <table className="kv s-fields">
                  <tbody>
                    {current.errors.map((text, i) => (
                      <tr key={`${text}:${i}`} data-field="errors">
                        <th>error</th>
                        <td className="err">
                          <span className="glyph" aria-hidden="true">
                            <StateIcon kind="error" />
                          </span>
                          {text}
                        </td>
                        <td className="s-state">
                          <EvidenceChip state={{ state: "recorded", kind: errorKind(current, text) }} />
                          <span className="s-why dim">{errorKind(current, text)}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
            </>
          ) : (
            <p className="note dim">no row selected · choose a timeline row to read its fields</p>
          )}
        </>
      )}

      <h3>permission gate · this session</h3>
      {permissions.length === 0 ? (
        <p className="empty">no permission verdicts in the retained window for this session</p>
      ) : (
        <>
          {win.permissions.retained > 0 ? (
            <p className="note dim">{`newest ${win.permissions.sent} of ${win.permissions.retained} retained verdicts listed`}</p>
          ) : null}
          <PermissionTable permissions={permissions} session={false} />
          <p className="note dim">a verdict is the gate's recorded output, not an approval event</p>
        </>
      )}

      {current && states ? (
        <>
          <section className="s-router" aria-label="router recommendation">
            <h3>ROUTER · recommendation, not execution</h3>
            <FieldRows rows={router} states={states} />
            <p className="note dim s-legend">
              ctx agent: recorded context agent, not proof of delegation · classifier model: the observe model is the
              classifier, not the execution model · injected: recommendation injected, not proof that the suggested
              agent ran
            </p>
          </section>
          <section className="s-exec" aria-label="execution not available">
            <p className="note">
              exec agent/model — not available · tokens/cost — not available · fallback not detectable · linked stats
              none (aggregate stats are not attributable to a session)
            </p>
            <FieldRows rows={exec} states={states} />
          </section>
        </>
      ) : null}
    </section>
  );
}

/**
 * Read-only Sessions inspector: one session of one source, from the sent events only. It never says what ran, whether
 * it worked, or that the session is complete. `inspected` is the federated session id (null shows only the list).
 */
export function SessionsView({
  state,
  viewSource,
  hasExchange,
  inspected,
  selected,
  replay,
  lastKnown,
  onOpen,
  onBack,
  onSelect,
}: {
  state: DashboardState;
  /** The viewed source id when one source is selected; null in the combined view or without an exchange. */
  viewSource: string | null;
  hasExchange: boolean;
  inspected: string | null;
  selected: string | null;
  replay: { playing: boolean; speed: number } | null;
  /** Wording for a stale or disconnected view, so the inspector never claims fresher data than the scope strip. */
  lastKnown: string | null;
  onOpen: (session: string) => void;
  onBack: () => void;
  onSelect: (id: string) => void;
}) {
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());
  const previous = useRef<string | null>(inspected);
  // Focus return: detail opens on its selected row; going back lands on the session's row in the list.
  useEffect(() => {
    const before = previous.current;
    previous.current = inspected;
    if (before === inspected) return;
    const timer = setTimeout(() => {
      if (inspected !== null) {
        document.querySelector<HTMLElement>('.s-timeline [aria-current="true"] button, .s-timeline button')?.focus();
      } else if (before !== null) {
        rowRefs.current.get(before)?.focus();
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [inspected]);
  return (
    <div className="view sessions" data-pane={inspected === null ? "list" : "detail"}>
      <SessionList
        state={state}
        viewSource={viewSource}
        hasExchange={hasExchange}
        inspected={inspected}
        onOpen={onOpen}
        rowRefs={rowRefs}
      />
      {inspected === null ? (
        <section className="s-detail" aria-label="session detail">
          <p className="empty">select a session to read its retained events, fields and permission verdicts</p>
        </section>
      ) : (
        <SessionDetail
          state={state}
          viewSource={viewSource}
          hasExchange={hasExchange}
          session={inspected}
          selected={selected}
          replay={replay}
          lastKnown={lastKnown}
          onBack={onBack}
          onSelect={onSelect}
        />
      )}
    </div>
  );
}
