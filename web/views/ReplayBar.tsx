import type { ReplayCoverage, Speed } from "../replay";
import { SPEEDS } from "../replay";
import { fmtTs } from "./format";

export function ReplayStart({ disabled, onStart }: { disabled: boolean; onStart: () => void }) {
  return (
    <div className="replay-slot">
      <button
        id="replay-start"
        type="button"
        className="replay-start"
        aria-label="start replay"
        disabled={disabled}
        title="Replay the focused call's session from its first retained event (r)"
        onClick={onStart}
      >
        ▷ replay session
      </button>
      <span className="dim">{disabled ? "no call in focus" : "client-side cursor over retained events"}</span>
    </div>
  );
}

/**
 * Transport for the one replay cursor. The cursor drives Call in focus, the patch bay and the detail timeline.
 * The sample line says what the replay is made of; it is never presented as complete history.
 */
export function ReplayBar({
  index,
  length,
  current,
  playing,
  speed,
  coverage,
  onPlay,
  onStep,
  onSpeed,
  onStop,
}: {
  index: number;
  length: number;
  current: string;
  playing: boolean;
  speed: Speed;
  coverage: ReplayCoverage;
  onPlay: () => void;
  onStep: (delta: number) => void;
  onSpeed: (speed: Speed) => void;
  onStop: () => void;
}) {
  const atEnd = index >= length - 1;
  return (
    <div className="replay-slot replaying" role="group" aria-label="session replay">
      <div className="transport">
        <button type="button" aria-label="previous event" disabled={index <= 0} onClick={() => onStep(-1)}>
          ◀
        </button>
        <button
          type="button"
          className="play"
          aria-label={playing ? "pause" : "play"}
          aria-pressed={playing}
          autoFocus
          onClick={onPlay}
        >
          {playing ? "❚❚ pause" : atEnd ? "▶ restart" : "▶ play"}
        </button>
        <button type="button" aria-label="next event" disabled={atEnd} onClick={() => onStep(1)}>
          ▶
        </button>
        <span className="speeds" role="group" aria-label="replay speed">
          {SPEEDS.map((s) => (
            <button key={s} type="button" data-speed={s} aria-pressed={s === speed} onClick={() => onSpeed(s)}>
              {`${s}×`}
            </button>
          ))}
        </span>
        <span className="pos">{`replay ${index + 1} of ${length}`}</span>
        <span className="dim rts">{fmtTs(current)}</span>
        <button type="button" className="stop" aria-label="stop replay" onClick={onStop}>
          stop · r
        </button>
      </div>
      <p className="sample dim">
        {`sample of retained events · session events sent ${coverage.inSession} · not durable history`}
        {coverage.omitted > 0 ? ` · ${coverage.omitted} omitted from payload` : ""}
        {coverage.evicted > 0 ? ` · evicted ${coverage.evicted}` : ""}
        {coverage.mayBeIncomplete ? " · session may be incomplete" : ""}
      </p>
    </div>
  );
}
