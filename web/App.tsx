import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import type { DashboardState, FlowEvent } from "../src/core/aggregate";
import { livePrompts } from "./clock";
import { EMPTY_FILTERS, type FlowFilters, filterEvents } from "./filters";
import { AgreementView } from "./views/AgreementView";
import { ErrorsView } from "./views/ErrorsView";
import { EventDetail } from "./views/EventDetail";
import { FilterBar, isFiltered } from "./views/FilterBar";
import { FlowView } from "./views/FlowView";
import { fmtNum, fmtTs, pct, RENDER_LIMIT, SOURCES, STATUS_CLASS, STATUS_GLYPH } from "./views/format";
import { HistoryView } from "./views/HistoryView";
import { Drawer } from "./views/parts";
import { UsageView } from "./views/UsageView";

export { EventDetail };

const BURST_LIMIT = 10;
const CLOCK_TICK_MS = 5000;
const DRAWERS = [
  { name: "agreement", title: "Agreement", scope: "retained window · context agreement" },
  { name: "usage", title: "Usage", scope: "opencode stats range · aggregate" },
  { name: "errors", title: "Errors", scope: "retained window · tool failures use the stats range" },
  { name: "history", title: "History", scope: "weekly stats snapshots" },
] as const;
export type DrawerName = (typeof DRAWERS)[number]["name"];

function useArrivals(events: FlowEvent[], ready: boolean) {
  const seen = useRef<Set<string> | null>(null);
  const stamps = useRef<number[]>([]);
  const timers = useRef<{ arrive?: ReturnType<typeof setTimeout>; burst?: ReturnType<typeof setTimeout> }>({});
  const [arrived, setArrived] = useState<ReadonlySet<string>>(new Set());
  const [burst, setBurst] = useState(0);
  useEffect(() => {
    // Until the first real snapshot arrives (sources known), nothing is an arrival. The first snapshot is the baseline.
    if (!ready) {
      seen.current = null;
      return;
    }
    const ids = new Set(events.map((e) => e.id));
    const prev = seen.current;
    seen.current = ids;
    if (!prev) return;
    const fresh = events.filter((e) => !prev.has(e.id)).map((e) => e.id);
    if (fresh.length === 0) return;
    const now = performance.now();
    stamps.current = stamps.current.filter((t) => now - t < 1000);
    for (let i = 0; i < fresh.length; i++) stamps.current.push(now);
    if (stamps.current.length > BURST_LIMIT) {
      // More than 10 arrivals in 1 s: collapse into a counter, no per-call motion.
      setArrived(new Set());
      setBurst(stamps.current.length);
      clearTimeout(timers.current.burst);
      timers.current.burst = setTimeout(() => setBurst(0), 2500);
      return;
    }
    setArrived(new Set(fresh));
    clearTimeout(timers.current.arrive);
    timers.current.arrive = setTimeout(() => setArrived(new Set()), 1500);
  }, [events, ready]);
  useEffect(
    () => () => {
      clearTimeout(timers.current.arrive);
      clearTimeout(timers.current.burst);
    },
    [],
  );
  return { arrived, burst };
}

/** Page clock, refreshed every few seconds so time windows move without any server update. */
function useNow(override?: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (override !== undefined) return;
    const id = setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);
    return () => clearInterval(id);
  }, [override]);
  return override ?? now;
}

function Readout({
  label,
  value,
  note,
  title,
  wrapNote,
}: {
  label: string;
  value: string;
  note?: string;
  title?: string;
  wrapNote?: boolean;
}) {
  return (
    <div className="readout" title={title}>
      <div className="readout-value">{value}</div>
      <div className="readout-label">{label}</div>
      {note ? <div className={wrapNote ? "readout-note wrap" : "readout-note"}>{note}</div> : null}
    </div>
  );
}

function SourceHealth({ state, drawers }: { state: DashboardState; drawers: ReactNode }) {
  const { sources, statsStatus, errors, window: win } = state;
  const m = errors.malformed;
  return (
    <div className="sources" role="status">
      {sources ? (
        SOURCES.map((name) => {
          const s = sources[name];
          return (
            <span
              key={name}
              className={`src ${STATUS_CLASS[s.status]}`}
              title={`${s.path}${s.detail ? ` (${s.detail})` : ""}`}
            >
              <span className="glyph" aria-hidden="true">
                {STATUS_GLYPH[s.status]}
              </span>
              {name} {s.status}
              {s.detail ? ` · ${s.detail}` : ""}
            </span>
          );
        })
      ) : (
        <span className="src dim">○ waiting for sources</span>
      )}
      <span className={`src ${statsStatus ? STATUS_CLASS[statsStatus.status] : "dim"}`}>
        <span className="glyph" aria-hidden="true">
          {statsStatus ? STATUS_GLYPH[statsStatus.status] : "○"}
        </span>
        {`stats ${statsStatus?.status ?? "pending"}`}
        {statsStatus?.detail ? ` · ${statsStatus.detail}` : ""}
      </span>
      <span className="src dim">
        {`malformed (process lifetime) observe ${m.observe} · route ${m.route} · permissions ${m.permissions}`}
      </span>
      <span className="src dim">{`permissions newest ${win.permissions.sent} of ${win.permissions.retained} retained`}</span>
      <span className="spacer">{drawers}</span>
    </div>
  );
}

const isTyping = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return (
    !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)
  );
};

export function DashboardShell({
  state,
  demo = false,
  connected,
  initialDrawer = null,
  now: nowOverride,
}: {
  state: DashboardState;
  demo?: boolean;
  connected?: boolean;
  /** Opens a drawer on first render (screenshots and smoke tests). */
  initialDrawer?: DrawerName | null;
  /** Fixed page clock for tests and screenshots. Without it the clock ticks every 5 s. */
  now?: number;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [drawer, setDrawer] = useState<DrawerName | null>(initialDrawer);
  const [filters, setFilters] = useState<FlowFilters>(EMPTY_FILTERS);
  const now = useNow(nowOverride);
  const { arrived, burst } = useArrivals(state.events, state.sources !== null);

  // Time ranges and prompts/min follow the page clock, so they expire even when no update arrives.
  const matched = filterEvents(state.events, filters, now);
  const prompts = livePrompts(state.events, state.window.events.omitted, now);
  const rows = [...matched].reverse().slice(0, RENDER_LIMIT);
  const filtered = isFiltered(filters);
  const filterNote = filtered ? `filtered: ${matched.length} of ${state.events.length} sent` : null;
  const selectedEvent = state.events.find((e) => e.id === selected);

  const live = useRef({ rows, selected, drawer, detailOpen });
  live.current = { rows, selected, drawer, detailOpen };
  const opener = useRef<HTMLElement | null>(null);

  const restoreFocus = () => {
    const el = opener.current;
    opener.current = null;
    // Return to whatever opened the overlay; fall back to the ticker so keyboard users keep their place.
    const target = el && el.isConnected && el !== document.body ? el : document.getElementById("ticker");
    target?.focus();
  };
  const remember = () => {
    const active = document.activeElement as HTMLElement | null;
    opener.current = active && active !== document.body ? active : null;
  };
  const openDrawer = (name: DrawerName) => {
    if (live.current.drawer === null && !live.current.detailOpen) remember();
    setDetailOpen(false);
    setDrawer(name);
  };
  const closeOverlay = () => {
    setDrawer(null);
    setDetailOpen(false);
    // Wait for the overlay to unmount before moving focus.
    setTimeout(restoreFocus, 0);
  };
  const toggleDrawer = (name: DrawerName) => (live.current.drawer === name ? closeOverlay() : openDrawer(name));
  const openDetail = (id: string) => {
    if (live.current.drawer === null && !live.current.detailOpen) remember();
    setSelected(id);
    setDrawer(null);
    setDetailOpen(true);
  };

  const actions = useRef({ closeOverlay, toggleDrawer, openDetail });
  actions.current = { closeOverlay, toggleDrawer, openDetail };

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
      const { rows: list, selected: sel, drawer: dr, detailOpen: det } = live.current;
      if (ev.key === "Escape") {
        if (isTyping(ev.target)) {
          (ev.target as HTMLElement).blur();
          return;
        }
        if (dr !== null || det) actions.current.closeOverlay();
        return;
      }
      if (isTyping(ev.target)) return;
      if (ev.key === "/") {
        ev.preventDefault();
        document.getElementById("flt-search")?.focus();
      } else if (ev.key === "f") {
        ev.preventDefault();
        document.getElementById("flt-role")?.focus();
      } else if (ev.key >= "1" && ev.key <= "4") {
        actions.current.toggleDrawer(DRAWERS[Number(ev.key) - 1]!.name);
      } else if (ev.key === "j" || ev.key === "k") {
        if (list.length === 0 || dr !== null) return;
        const idx = list.findIndex((e) => e.id === sel);
        const next = ev.key === "j" ? Math.min(list.length - 1, idx + 1) : Math.max(0, idx < 0 ? 0 : idx - 1);
        setSelected(list[next]!.id);
        ev.preventDefault();
      } else if (ev.key === "Enter") {
        // A focused button or link owns Enter (header views, drawer tabs, close, clear, timeline rows).
        if ((ev.target as Element | null)?.closest?.("button, a, [role=button]")) return;
        if (dr === null && list.some((e) => e.id === sel)) {
          // Without this, the Enter keypress would land on the close button that just took focus and close the detail.
          ev.preventDefault();
          actions.current.openDetail(sel!);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!selected) return;
    document.querySelector(`tr[aria-selected="true"]`)?.scrollIntoView?.({ block: "nearest" });
  }, [selected]);

  const drawers = (
    <nav className="drawers" aria-label="views">
      {DRAWERS.map((d, i) => (
        <button
          key={d.name}
          type="button"
          data-drawer={d.name}
          aria-expanded={drawer === d.name}
          aria-controls={`drawer-${d.name}`}
          title={`${d.title} (${i + 1})`}
          onClick={() => toggleDrawer(d.name)}
        >
          {d.title}
          <sup>{i + 1}</sup>
        </button>
      ))}
    </nav>
  );
  const r = state.readouts;
  const a = state.agreement;
  const view = DRAWERS.find((d) => d.name === drawer);
  return (
    <div className={demo ? "app has-demo" : "app"}>
      {demo ? (
        <div className="demo-band" role="note">
          DEMO · fixtures replay, not live data
        </div>
      ) : null}
      <header className="head">
        <div className="brand">
          <span className="brand-name">routing exchange</span>
          <span className="brand-sub">opencode · jev</span>
        </div>
        <div className="readouts">
          <Readout
            label="prompts/min"
            value={prompts.lowerBound ? `≥${prompts.count}` : String(prompts.count)}
            note={prompts.lowerBound ? "sent events · last 60 s" : "last 60 s"}
            wrapNote={prompts.lowerBound}
            title={
              prompts.lowerBound
                ? "Events in the last 60 s among the sent events. Older events were omitted from the payload, so this is a lower bound."
                : "Events in the last 60 s on this page's clock."
            }
          />
          <Readout
            label="context agreement"
            value={pct(r.agreementPercent)}
            note={a.compared ? `${a.agreed} of ${a.compared} compared` : "nothing compared"}
            title="Jev suggestion equals the recorded context agent. Not proof of delegation."
          />
          <Readout label="fallback" value="n/d" note="not detectable" title="No fallback event in the logs" />
          <Readout label="error rate" value={pct(r.errorPercent)} note="retained window" />
          <Readout
            label="p50 latency"
            value={r.p50Latency === null ? "—" : `${Math.round(r.p50Latency)}ms`}
            note="retained window"
          />
          <Readout
            label="tokens today"
            value={r.tokensToday === null ? "—" : fmtNum(r.tokensToday)}
            note={r.tokensToday === null ? "stats range ≠ today" : "stats"}
          />
        </div>
        <div className="head-side">
          {connected === undefined ? null : (
            <span className={`link ${connected ? "ok" : "err"}`}>
              <span className="glyph" aria-hidden="true">
                {connected ? "●" : "▲"}
              </span>
              {connected ? "link live" : "link down"}
            </span>
          )}
        </div>
      </header>
      <SourceHealth state={state} drawers={drawers} />
      <FlowView
        state={state}
        rows={rows}
        selected={selected}
        arrived={arrived}
        burst={burst}
        filterNote={filterNote}
        filterBar={<FilterBar events={state.events} filters={filters} matched={matched.length} onChange={setFilters} />}
        onSelect={openDetail}
      />
      {view ? (
        <Drawer
          name={view.name}
          title={view.title}
          scope={view.scope}
          tabs={DRAWERS}
          onTab={(name) => openDrawer(name as DrawerName)}
          onClose={closeOverlay}
        >
          {view.name === "agreement" ? <AgreementView state={state} /> : null}
          {view.name === "usage" ? <UsageView state={state} /> : null}
          {view.name === "errors" ? <ErrorsView state={state} /> : null}
          {view.name === "history" ? <HistoryView state={state} /> : null}
        </Drawer>
      ) : null}
      {detailOpen && selectedEvent ? (
        <aside className="detail" role="dialog" aria-label="event detail">
          <header className="detail-head">
            <span>{`event ${fmtTs(selectedEvent.ts)}`}</span>
            <button type="button" aria-label="close detail" autoFocus onClick={closeOverlay}>
              close · esc
            </button>
          </header>
          <EventDetail
            event={selectedEvent}
            events={state.events}
            retained={state.window.events.retained}
            onSelect={(id) => setSelected(id)}
          />
        </aside>
      ) : null}
    </div>
  );
}
