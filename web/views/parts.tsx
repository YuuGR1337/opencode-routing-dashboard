import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import type { DashboardState } from "../../src/core/aggregate";
import type { Role } from "./format";

/** Role shapes identify roles without hue: orchestrator diamond, oracle hexagon, fixer circle, explorer square, designer pentagon. */
export const ROLE_SHAPE = {
  orchestrator: "diamond",
  oracle: "hexagon",
  fixer: "circle",
  explorer: "square",
  designer: "pentagon",
} as const;
const SHAPE_POINTS = {
  diamond: "6,0.5 11.5,6 6,11.5 0.5,6",
  hexagon: "3.2,1 8.8,1 11.5,6 8.8,11 3.2,11 0.5,6",
  pentagon: "6,0.5 11.5,4.7 9.4,11.3 2.6,11.3 0.5,4.7",
} as const;

/** A role shape in a 12-unit box. Decorative: the role name is always written next to it. Colour comes from `--c`. */
export function RoleShape({ role, size = 12, x, y }: { role: Role; size?: number; x?: number; y?: number }) {
  const shape = ROLE_SHAPE[role];
  return (
    <svg
      className="shape"
      data-shape={shape}
      aria-hidden="true"
      viewBox="-1 -1 14 14"
      width={size}
      height={size}
      x={x}
      y={y}
    >
      {shape === "circle" ? (
        <circle cx={6} cy={6} r={5.5} />
      ) : shape === "square" ? (
        <rect x={0.5} y={0.5} width={11} height={11} />
      ) : (
        <polygon points={SHAPE_POINTS[shape]} />
      )}
    </svg>
  );
}

/** Recorded context agent: a hollow ring in ink, never an accent colour. */
export function CtxRing() {
  return (
    <svg className="ctx-ring" data-ctx-ring="true" aria-hidden="true" viewBox="0 0 12 12" width={12} height={12}>
      <circle cx={6} cy={6} r={4.5} />
    </svg>
  );
}

export type StateKind = "live" | "connecting" | "stale" | "missing" | "down" | "error";
/**
 * State icons from DESIGN "States use icon shape + word": live filled disc, connecting dashed ring, stale half-filled
 * disc, missing hollow ring, link down ring with ✕, error triangle with !. Colour only reinforces the word beside it.
 */
export function StateIcon({ kind }: { kind: StateKind }) {
  return (
    <svg className="state-icon" data-state={kind} aria-hidden="true" viewBox="0 0 12 12" width={11} height={11}>
      {kind === "live" ? <circle className="solid" cx={6} cy={6} r={4.5} /> : null}
      {kind === "connecting" ? <circle cx={6} cy={6} r={4.5} strokeDasharray="2.2 1.9" /> : null}
      {kind === "stale" ? (
        <>
          <circle cx={6} cy={6} r={4.5} />
          <path className="solid" d="M6 1.5A4.5 4.5 0 0 1 6 10.5Z" />
        </>
      ) : null}
      {kind === "missing" ? <circle cx={6} cy={6} r={4.5} /> : null}
      {kind === "down" ? (
        <>
          <circle cx={6} cy={6} r={5} />
          <line x1={4} y1={4} x2={8} y2={8} />
          <line x1={8} y1={4} x2={4} y2={8} />
        </>
      ) : null}
      {kind === "error" ? (
        <>
          <polygon points="6,0.8 11.4,10.6 0.6,10.6" />
          <line x1={6} y1={4.4} x2={6} y2={7.2} />
        </>
      ) : null}
    </svg>
  );
}

export function Unavailable({ title = "not available in the logs" }: { title?: string }) {
  return (
    <span data-unavailable="true" title={title}>
      —
    </span>
  );
}

/** Explains why stats are missing instead of showing zeros. */
export function StatsMissing({ state }: { state: DashboardState }) {
  const s = state.statsStatus;
  const label = !s || s.status === "ok" ? "not read yet" : s.status;
  return (
    <div className="empty" role="status">
      <div>{`stats unavailable · ${label}`}</div>
      {s?.detail ? <div className="dim">{s.detail}</div> : null}
      <div className="dim">source: opencode stats --json</div>
    </div>
  );
}

export function Drawer({
  name,
  title,
  scope,
  tabs,
  onTab,
  onClose,
  children,
}: {
  name: string;
  title: string;
  scope: string;
  /** Other views, so the drawer stays operable when it covers the header buttons. */
  tabs: readonly { name: string; title: string }[];
  onTab: (name: string) => void;
  onClose: () => void;
  children: ReactNode;
}) {
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    close.current?.focus();
  }, []);
  return (
    <aside id={`drawer-${name}`} className="drawer" role="dialog" aria-label={title}>
      <header className="drawer-head">
        <nav className="tabs" aria-label="views">
          {tabs.map((t) => (
            <button
              key={t.name}
              type="button"
              data-tab={t.name}
              aria-pressed={t.name === name}
              onClick={() => onTab(t.name)}
            >
              {t.title}
            </button>
          ))}
        </nav>
        <button ref={close} type="button" className="close" aria-label="close drawer" onClick={onClose}>
          close · esc
        </button>
      </header>
      <p className="drawer-scope dim">{scope}</p>
      <div className="drawer-body">{children}</div>
    </aside>
  );
}
