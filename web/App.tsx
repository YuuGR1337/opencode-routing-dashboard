import { useEffect, useMemo, useRef, useState } from "react";
import type { DashboardState, FlowEvent } from "../src/core/aggregate";
import { ALERT_LABEL, alertsView, DEFAULT_PERIOD, type Period, presetView, quotaView } from "./analytics";
import { livePrompts } from "./clock";
import { COMBINED, type ExchangeState, resolveView } from "./exchange";
import { exportPlan } from "./export";
import { EMPTY_FILTERS, type FlowFilters, filterEvents } from "./filters";
import { nextSpeed, replayCoverage, replayDelay, type Speed, sessionTimeline, stepIndex } from "./replay";
import { nearestSurvivor, type OptionMemory, rememberOptions, sameOptions } from "./selection";
import { AgreementView } from "./views/AgreementView";
import { AlertsPanel, PresetsPanel, QuotaPanel } from "./views/AnalyticsViews";
import { ErrorsView } from "./views/ErrorsView";
import { EventDetail } from "./views/EventDetail";
import { ExportPanel } from "./views/ExportView";
import { FilterBar, isFiltered } from "./views/FilterBar";
import { FlowView, type ReplayView } from "./views/FlowView";
import { fmtClock, fmtNum, fmtTs, pct, RENDER_LIMIT, SOURCES, STATUS_CLASS, STATUS_ICON } from "./views/format";
import { HistoryView } from "./views/HistoryView";
import { Drawer, StateIcon } from "./views/parts";
import { SourceBar } from "./views/SourceBar";
import { UsageView } from "./views/UsageView";

export { EventDetail };

const BURST_LIMIT = 10;
const CLOCK_TICK_MS = 5000;
const DRAWERS = [
  { name: "agreement", title: "Agreement", scope: "retained window · context agreement" },
  { name: "usage", title: "Usage", scope: "opencode stats range · aggregate" },
  { name: "errors", title: "Errors", scope: "retained window · tool failures use the stats range" },
  { name: "history", title: "History", scope: "weekly stats snapshots" },
  { name: "alerts", title: "Alerts", scope: "explicit rate-limit, quota and fallback evidence" },
  { name: "quota", title: "Quota", scope: "your configured limits · rolling 5 h and weekly estimates" },
  { name: "presets", title: "Presets", scope: "recorded or observed preset intervals · chosen period" },
  { name: "export", title: "Export", scope: "Markdown or CSV report · selected source and period" },
] as const;
export type DrawerName = (typeof DRAWERS)[number]["name"];

function useArrivals(events: FlowEvent[], ready: boolean, viewId: string) {
  const seen = useRef<Set<string> | null>(null);
  const lastView = useRef(viewId);
  const stamps = useRef<number[]>([]);
  const timers = useRef<{ arrive?: ReturnType<typeof setTimeout>; burst?: ReturnType<typeof setTimeout> }>({});
  const [arrived, setArrived] = useState<ReadonlySet<string>>(new Set());
  const [burst, setBurst] = useState(0);
  useEffect(() => {
    // Switching source is a new baseline, never a burst of arrivals.
    if (lastView.current !== viewId) {
      lastView.current = viewId;
      seen.current = null;
    }
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
  }, [events, ready, viewId]);
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

/** Browser time zone name for the tooltip; the clock itself is never relabeled. */
const localZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "unknown zone";

/**
 * Scope strip: the viewed source, its state, the last event time and the retained count, then file lamps.
 * It reuses existing values and adds no metric. Intake counters live in the ticker title.
 */
function ScopeStrip({
  state,
  viewing,
  sourceStatus,
  staleNote,
  combinedExchange,
  connected,
}: {
  state: DashboardState;
  viewing: string | null;
  sourceStatus: string | null;
  staleNote: string | null;
  combinedExchange: boolean;
  connected?: boolean;
}) {
  const { sources, statsStatus, window: win, events } = state;
  const last = events[events.length - 1];
  const scope = [
    viewing,
    sourceStatus,
    last ? `last event ${fmtClock(last.ts)}` : null,
    `${win.events.retained} calls retained`,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className="scope-strip" role="status">
      <span className="viewing" title={`Times are shown in this browser's local time (${localZone()}).`}>
        {scope}
      </span>
      {connected === false ? <span className="src dim">last known:</span> : null}
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
                <StateIcon kind={STATUS_ICON[s.status]} />
              </span>
              {name} {s.status}
              {s.detail ? ` · ${s.detail}` : ""}
            </span>
          );
        })
      ) : (
        <span className="src dim">
          <span className="glyph" aria-hidden="true">
            <StateIcon kind="missing" />
          </span>
          {combinedExchange ? "source health above" : "waiting for sources"}
        </span>
      )}
      <span className={`src ${statsStatus ? STATUS_CLASS[statsStatus.status] : "dim"}`}>
        <span className="glyph" aria-hidden="true">
          <StateIcon kind={statsStatus ? STATUS_ICON[statsStatus.status] : "missing"} />
        </span>
        {`stats ${statsStatus?.status ?? (combinedExchange ? "per source" : "pending")}`}
        {statsStatus?.detail ? ` · ${statsStatus.detail}` : ""}
      </span>
      {staleNote ? <span className="src warn">{staleNote}</span> : null}
    </div>
  );
}

const isTyping = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return (
    !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)
  );
};

type ReplayState = { session: string; cursor: string; playing: boolean; speed: Speed };
const seedReplay = (events: FlowEvent[]): ReplayState | null => {
  const focus = events[events.length - 1];
  const first = focus ? sessionTimeline(events, focus.session)[0] : undefined;
  return focus && first ? { session: focus.session, cursor: first.id, playing: false, speed: 1 } : null;
};
const focusTicker = () => setTimeout(() => document.getElementById("ticker")?.focus(), 0);

export function DashboardShell({
  state,
  demo = false,
  connected,
  rejected,
  initialDrawer = null,
  initialView = COMBINED,
  initialReplay = false,
  initialPeriod = DEFAULT_PERIOD,
  now: nowOverride,
}: {
  state: ExchangeState;
  demo?: boolean;
  connected?: boolean;
  /** Browser payloads dropped by validation since page load. Omit to hide the counter. */
  rejected?: number;
  /** Opens a drawer on first render (screenshots and smoke tests). */
  initialDrawer?: DrawerName | null;
  /** Source shown on first render (screenshots and smoke tests). */
  initialView?: string;
  /** Starts a replay of the newest call's session on first render (screenshots and smoke tests). */
  initialReplay?: boolean;
  /** Period of the preset comparison on first render (screenshots and smoke tests). */
  initialPeriod?: Period;
  /** Fixed page clock for tests and screenshots. Without it the clock ticks every 5 s. */
  now?: number;
}) {
  const [viewId, setViewId] = useState(initialView);
  const view = resolveView(state, viewId);
  const vs = view.state;
  const [replay, setReplay] = useState<ReplayState | null>(() => (initialReplay ? seedReplay(vs.events) : null));
  const [selected, setSelected] = useState<string | null>(() =>
    initialReplay ? (seedReplay(vs.events)?.cursor ?? null) : null,
  );
  const [detailOpen, setDetailOpen] = useState(false);
  const [drawer, setDrawer] = useState<DrawerName | null>(initialDrawer);
  const [filters, setFilters] = useState<FlowFilters>(EMPTY_FILTERS);
  const [known, setKnown] = useState<OptionMemory | undefined>(undefined);
  const [notice, setNotice] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>(initialPeriod);
  const now = useNow(nowOverride);
  // Alert evidence is cheap and drives the header badge; quota and preset views are computed only while open.
  const alerts = useMemo(() => alertsView(state, view.id, now), [state, view.id, now]);
  const { arrived, burst } = useArrivals(vs.events, vs.sources !== null, view.id);

  // Time ranges and prompts/min follow the page clock, so they expire even when no update arrives.
  const matched = filterEvents(vs.events, filters, now);
  const prompts = livePrompts(vs.events, vs.window.events.omitted, now);
  const rows = [...matched].reverse().slice(0, RENDER_LIMIT);
  const filtered = isFiltered(filters);
  const filterNote = filtered ? `filtered: ${matched.length} of ${vs.events.length} sent` : null;
  const selectedEvent = vs.events.find((e) => e.id === selected);

  // One replay cursor: Call in focus, the patch bay, the ticker selection and the detail timeline all follow it.
  const timeline = useMemo(
    () => (replay ? sessionTimeline(vs.events, replay.session) : []),
    [vs.events, replay?.session],
  );
  const cursorIdx = replay ? timeline.findIndex((e) => e.id === replay.cursor) : -1;
  const replayView: ReplayView | undefined =
    replay && cursorIdx >= 0
      ? {
          played: timeline.slice(0, cursorIdx + 1),
          length: timeline.length,
          index: cursorIdx,
          playing: replay.playing,
          speed: replay.speed,
          coverage: replayCoverage(timeline, vs.window),
          onPlay: () => actions.current.togglePlay(),
          onStep: (d) => actions.current.step(d),
          onSpeed: (speed) => setReplay((r) => (r ? { ...r, speed } : r)),
          onStop: () => actions.current.stopReplay(),
        }
      : undefined;

  const live = useRef({ rows, selected, drawer, detailOpen, replay, timeline, cursorIdx, events: vs.events });
  const opener = useRef<HTMLElement | null>(null);
  useEffect(() => {
    live.current = { rows, selected, drawer, detailOpen, replay, timeline, cursorIdx, events: vs.events };
  });

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
    setNotice(null);
    // Wait for the overlay to unmount before moving focus.
    setTimeout(restoreFocus, 0);
  };
  const toggleDrawer = (name: DrawerName) => (live.current.drawer === name ? closeOverlay() : openDrawer(name));
  /** Selecting inside a replayed session moves the cursor too, and pauses. */
  const focusEvent = (id: string) => {
    setSelected(id);
    setNotice(null);
    const { replay: r, timeline: tl } = live.current;
    if (r && tl.some((e) => e.id === id)) setReplay({ ...r, cursor: id, playing: false });
  };
  const openDetail = (id: string) => {
    if (live.current.drawer === null && !live.current.detailOpen) remember();
    focusEvent(id);
    setDrawer(null);
    setDetailOpen(true);
  };
  const startReplay = () => {
    const { rows: list, selected: sel, events } = live.current;
    const focus = list.find((e) => e.id === sel) ?? list[0];
    const first = focus ? sessionTimeline(events, focus.session)[0] : undefined;
    if (!focus || !first) return;
    setReplay({ session: focus.session, cursor: first.id, playing: false, speed: 1 });
    setSelected(first.id);
    setNotice(null);
  };
  const stopReplay = () => {
    setReplay(null);
    setTimeout(() => document.getElementById("replay-start")?.focus(), 0);
  };
  const moveCursor = (id: string, playing: boolean) => {
    setReplay((r) => (r ? { ...r, cursor: id, playing } : r));
    setSelected(id);
  };
  const step = (delta: number) => {
    const { timeline: tl, cursorIdx: at } = live.current;
    const to = tl[stepIndex(at, delta, tl.length)];
    if (to) moveCursor(to.id, false);
  };
  const togglePlay = () => {
    const { replay: r, timeline: tl, cursorIdx: at } = live.current;
    if (!r) return;
    if (r.playing) setReplay({ ...r, playing: false });
    else if (at >= tl.length - 1 && tl[0]) moveCursor(tl[0].id, true);
    else setReplay({ ...r, playing: true });
  };
  const selectView = (id: string) => {
    if (id === viewId) return;
    setViewId(id);
    setSelected(null);
    setDetailOpen(false);
    setReplay(null);
    setKnown(undefined);
    setNotice(null);
    // Source and client filters name the previous view's evidence.
    setFilters((f) => ({ ...f, source: "", client: "" }));
  };

  const actions = useRef({
    closeOverlay,
    toggleDrawer,
    openDetail,
    focusEvent,
    startReplay,
    stopReplay,
    step,
    togglePlay,
  });
  useEffect(() => {
    actions.current = { closeOverlay, toggleDrawer, openDetail, focusEvent, startReplay, stopReplay, step, togglePlay };
  });

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
      const { rows: list, selected: sel, drawer: dr, detailOpen: det, replay: rp } = live.current;
      if (ev.key === "Escape") {
        if (isTyping(ev.target)) {
          (ev.target as HTMLElement).blur();
          return;
        }
        if (dr !== null || det) actions.current.closeOverlay();
        else if (rp) actions.current.stopReplay();
        return;
      }
      if (isTyping(ev.target)) return;
      if (ev.key === "/") {
        ev.preventDefault();
        document.getElementById("flt-search")?.focus();
      } else if (ev.key === "f") {
        ev.preventDefault();
        document.getElementById("flt-role")?.focus();
      } else if (ev.key >= "1" && ev.key <= String(DRAWERS.length)) {
        actions.current.toggleDrawer(DRAWERS[Number(ev.key) - 1]!.name);
      } else if (ev.key === "r") {
        if (dr !== null) return;
        if (rp) actions.current.stopReplay();
        else actions.current.startReplay();
      } else if (
        rp &&
        dr === null &&
        (ev.key === "p" || ev.key === "," || ev.key === "." || ev.key === "[" || ev.key === "]")
      ) {
        ev.preventDefault();
        if (ev.key === "p") actions.current.togglePlay();
        else if (ev.key === ",") actions.current.step(-1);
        else if (ev.key === ".") actions.current.step(1);
        else setReplay((r) => (r ? { ...r, speed: nextSpeed(r.speed, ev.key === "]" ? 1 : -1) } : r));
      } else if (ev.key === "j" || ev.key === "k") {
        if (list.length === 0 || dr !== null) return;
        const idx = list.findIndex((e) => e.id === sel);
        const next = ev.key === "j" ? Math.min(list.length - 1, idx + 1) : Math.max(0, idx < 0 ? 0 : idx - 1);
        actions.current.focusEvent(list[next]!.id);
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

  // Playback: wait the recorded gap (scaled by speed), then advance. Stops at the last retained event.
  useEffect(() => {
    if (!replay?.playing || cursorIdx < 0) return;
    const current = timeline[cursorIdx]!;
    const next = timeline[cursorIdx + 1];
    if (!next) {
      setReplay((r) => (r ? { ...r, playing: false } : r));
      return;
    }
    const timer = setTimeout(
      () => {
        setReplay((r) => (r && r.cursor === current.id ? { ...r, cursor: next.id } : r));
        setSelected(next.id);
      },
      replayDelay(current.ts, next.ts, replay.speed),
    );
    return () => clearTimeout(timer);
  }, [replay?.playing, replay?.speed, timeline, cursorIdx]);

  // Eviction. The selected event can leave the retained window while it is open: move to its nearest neighbour,
  // say so, and put keyboard focus somewhere real instead of letting it fall to the page body.
  const lastRows = useRef<string[]>([]);
  useEffect(() => {
    const prev = lastRows.current;
    lastRows.current = rows.map((e) => e.id);
    if (!selected || replay) return;
    if (vs.events.some((e) => e.id === selected)) return;
    const next = nearestSurvivor(prev, selected, new Set(lastRows.current));
    const target = next ? vs.events.find((e) => e.id === next) : undefined;
    setSelected(next);
    setNotice(
      target
        ? `selected event left the retained window · moved to ${fmtTs(target.ts)}`
        : "selected event left the retained window · nothing left to select",
    );
    if (detailOpen) setDetailOpen(false);
    if (detailOpen || document.activeElement === document.body) focusTicker();
  }, [rows, selected, replay, detailOpen, vs.events]);

  // Replay cursor eviction: move to the nearest retained event of the session and pause, or stop.
  const lastTimeline = useRef<string[]>([]);
  useEffect(() => {
    const prev = lastTimeline.current;
    lastTimeline.current = timeline.map((e) => e.id);
    if (!replay || cursorIdx >= 0) return;
    const next = nearestSurvivor(prev, replay.cursor, new Set(lastTimeline.current));
    if (next) {
      setReplay({ ...replay, cursor: next, playing: false });
      setSelected(next);
      setNotice("replay event left the retained window · paused at the nearest retained event");
    } else {
      setReplay(null);
      setNotice("replay session left the retained window · replay stopped");
    }
    focusTicker();
  }, [timeline, cursorIdx, replay]);

  // Filter options that left the window stay selectable while a filter is active; clearing filters resets them.
  useEffect(() => {
    setKnown((prev) => {
      const next = filtered ? rememberOptions(prev ?? null, vs.events) : rememberOptions(null, vs.events);
      return prev && sameOptions(prev, next) ? prev : next;
    });
  }, [vs.events, filtered]);

  const drawers = (
    <nav className="views-nav" aria-label="views">
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
          {d.name === "alerts" && alerts.active > 0 ? (
            <span className="badge" data-badge="alerts" title={`${alerts.active} active alert evidence`}>
              {`▲${alerts.active}`}
            </span>
          ) : null}
        </button>
      ))}
    </nav>
  );
  const r = vs.readouts;
  const a = vs.agreement;
  const drawerView = DRAWERS.find((d) => d.name === drawer);
  const src = view.source;
  const staleNote =
    src && !view.waiting && src.status !== "live"
      ? `${src.id} ${src.status}${src.lastSeenAt ? ` · last seen ${fmtClock(src.lastSeenAt)}` : ""} · showing last retained state`
      : null;
  // Stats are per source. Combined carries one source's stats only when exactly one is configured (federation);
  // with several, no source is named and nothing is summed.
  const onlySource = state.exchange?.sources.length === 1 ? state.exchange.sources[0] : undefined;
  const aggregateSource = !state.exchange
    ? "source opencode stats --json"
    : view.source
      ? `source ${view.source.id}`
      : onlySource
        ? `source ${onlySource.id}`
        : "combined view · stats stay per source, nothing summed";
  const classes = ["app", demo ? "has-demo" : "", state.exchange ? "has-exchange" : ""].filter(Boolean).join(" ");
  return (
    <div className={classes}>
      {demo ? (
        <div className="demo-band" role="note">
          DEMO · fixtures replay, not live data
        </div>
      ) : null}
      <header className="head">
        <div className="brand">
          <span className="brand-name">Routing exchange</span>
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
                <StateIcon kind={connected ? "live" : "down"} />
              </span>
              {connected ? "link live" : "link down"}
            </span>
          )}
        </div>
      </header>
      {state.exchange ? <SourceBar sources={state.exchange.sources} selected={view.id} onSelect={selectView} /> : null}
      {drawers}
      <ScopeStrip
        state={vs}
        viewing={state.exchange ? `viewing ${view.id}` : null}
        sourceStatus={state.exchange && src ? src.status : null}
        staleNote={staleNote}
        combinedExchange={Boolean(state.exchange && view.id === COMBINED)}
        connected={connected}
      />
      <FlowView
        state={vs}
        rows={rows}
        selected={selected}
        arrived={arrived}
        burst={burst}
        filterNote={filterNote}
        notice={notice}
        replay={replayView}
        rejected={rejected}
        aggregateSource={aggregateSource}
        onReplayStart={startReplay}
        waiting={view.waiting && src ? { id: src.id, status: src.status, detail: src.detail } : undefined}
        filterBar={
          <>
            {alerts.rows.some((alert) => alert.active) ? (
              <div className="ticker-alerts" aria-label="active alerts">
                <span className="ticker-alerts-label">▲ alerts</span>
                <div className="ticker-alerts-list">
                  {alerts.rows
                    .filter((alert) => alert.active)
                    .map((alert, index) => (
                      <span className="ticker-alert" key={`${alert.sourceId}/${alert.kind}/${index}`}>
                        <b>{alert.sourceId}</b> · {ALERT_LABEL[alert.kind]}
                      </span>
                    ))}
                </div>
                <button type="button" aria-controls="drawer-alerts" onClick={() => openDrawer("alerts")}>
                  view alerts →
                </button>
              </div>
            ) : null}
            <FilterBar
              events={vs.events}
              filters={filters}
              known={known}
              matched={matched.length}
              onChange={setFilters}
            />
          </>
        }
        onSelect={openDetail}
      />
      {drawerView ? (
        <Drawer
          name={drawerView.name}
          title={drawerView.title}
          scope={drawerView.scope}
          tabs={DRAWERS}
          onTab={(name) => openDrawer(name as DrawerName)}
          onClose={closeOverlay}
        >
          {drawerView.name === "agreement" ? <AgreementView state={vs} /> : null}
          {drawerView.name === "usage" ? <UsageView state={vs} /> : null}
          {drawerView.name === "errors" ? <ErrorsView state={vs} rejected={rejected} /> : null}
          {drawerView.name === "history" ? <HistoryView state={vs} /> : null}
          {drawerView.name === "alerts" ? <AlertsPanel view={alerts} now={now} /> : null}
          {drawerView.name === "quota" ? <QuotaPanel view={quotaView(state, view.id, now)} /> : null}
          {drawerView.name === "export" ? (
            <ExportPanel plan={exportPlan(state, view.id, period, now)} period={period} onPeriod={setPeriod} />
          ) : null}
          {drawerView.name === "presets" ? (
            <PresetsPanel view={presetView(state, view.id, period, now)} period={period} onPeriod={setPeriod} />
          ) : null}
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
            events={vs.events}
            retained={vs.window.events.retained}
            onSelect={focusEvent}
          />
        </aside>
      ) : null}
    </div>
  );
}
