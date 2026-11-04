import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import type { DashboardState } from "../../src/core/aggregate";

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
