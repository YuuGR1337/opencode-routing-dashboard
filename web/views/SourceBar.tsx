import type { KeyboardEvent } from "react";
import { COMBINED, type ExchangeSource, SOURCE_ICON, sourceClientText } from "../exchange";
import { fmtClock, trunc } from "./format";
import { StateIcon } from "./parts";

/**
 * Source selector and health. One radio per configured source, plus the server's combined view.
 * Health is text and glyph, not colour alone. Arrow keys move the selection.
 */
export function SourceBar({
  sources,
  selected,
  onSelect,
}: {
  sources: ExchangeSource[];
  selected: string;
  onSelect: (id: string) => void;
}) {
  const ids = [COMBINED, ...sources.map((s) => s.id)];
  const move = (from: string, delta: number) => {
    const next = ids[(ids.indexOf(from) + delta + ids.length) % ids.length]!;
    onSelect(next);
    // Focus follows once the new radio has become the tab stop.
    setTimeout(() => document.querySelector<HTMLElement>(`[data-source="${CSS.escape(next)}"]`)?.focus(), 0);
  };
  const keys = (id: string) => (ev: KeyboardEvent) => {
    if (ev.key === "ArrowRight" || ev.key === "ArrowDown") move(id, 1);
    else if (ev.key === "ArrowLeft" || ev.key === "ArrowUp") move(id, -1);
    else return;
    ev.preventDefault();
  };
  return (
    <div className="exchange-bar">
      <span className="bar-title">source</span>
      <div className="source-bar" role="radiogroup" aria-label="data source">
        <button
          type="button"
          role="radio"
          className="source"
          data-source={COMBINED}
          aria-checked={selected === COMBINED}
          tabIndex={selected === COMBINED ? 0 : -1}
          title="Server's combined view of every source. Stats ranges stay per source."
          onClick={() => onSelect(COMBINED)}
          onKeyDown={keys(COMBINED)}
        >
          <span className="glyph" aria-hidden="true">
            ◆
          </span>
          <b>combined</b>
          <span className="dim">{`${sources.length} source${sources.length === 1 ? "" : "s"}`}</span>
        </button>
        {sources.map((s) => (
          <button
            key={s.id}
            type="button"
            role="radio"
            className="source"
            data-source={s.id}
            data-status={s.status}
            aria-checked={selected === s.id}
            tabIndex={selected === s.id ? 0 : -1}
            title={`${s.label} (${s.id}) · ${s.status}${s.lastSeenAt ? ` · last seen ${s.lastSeenAt}` : ""}${s.detail ? ` · ${s.detail}` : ""}${sourceClientText(s) ? ` · client ${sourceClientText(s)}` : ""}`}
            onClick={() => onSelect(s.id)}
            onKeyDown={keys(s.id)}
          >
            <span className="glyph" aria-hidden="true">
              <StateIcon kind={SOURCE_ICON[s.status]} />
            </span>
            <b>{s.label}</b>
            <span className="status">{s.status}</span>
            {sourceClientText(s) ? (
              <span className="client" title="Client is configured for this source unless its records observed it">
                {sourceClientText(s)}
              </span>
            ) : null}
            {s.lastSeenAt ? <span className="last-seen dim">{`last seen ${fmtClock(s.lastSeenAt)}`}</span> : null}
            {s.detail ? <span className="dim src-detail">{trunc(s.detail, 28)}</span> : null}
          </button>
        ))}
      </div>
    </div>
  );
}
