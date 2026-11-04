import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { aggregate } from "../src/core/aggregate";
import { DashboardShell } from "./App";
import { applyLiveEvent, decodeEnvelope, type Envelope } from "./live";
import "./styles.css";

const empty = aggregate({
  observe: [],
  route: [],
  permissions: [],
  stats: null,
  malformed: { observe: 0, route: 0, permissions: 0 },
});

function LiveDashboard() {
  const [live, setLive] = useState<{ envelope: Envelope | null; sseSeen: boolean }>({ envelope: null, sseSeen: false });
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    let active = true;
    const accept = (value: unknown, kind: "http" | "snapshot" | "delta") => {
      const next = decodeEnvelope(value);
      if (active && next) setLive((current) => applyLiveEvent(current, next, kind));
    };
    const controller = new AbortController();
    fetch("/api/state", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Snapshot unavailable");
        return response.json();
      })
      .then((value) => accept(value, "http"))
      .catch(() => {});
    const events = new EventSource("/api/events");
    events.onopen = () => {
      if (active) setConnected(true);
    };
    events.onerror = () => {
      if (active) setConnected(false);
    };
    const receive = (kind: "snapshot" | "delta") => (event: MessageEvent) => {
      try {
        accept(JSON.parse(event.data), kind);
      } catch {
        /* Ignore malformed events. */
      }
    };
    events.addEventListener("snapshot", receive("snapshot"));
    events.addEventListener("delta", receive("delta"));
    return () => {
      active = false;
      controller.abort();
      events.close();
    };
  }, []);
  return (
    <DashboardShell state={live.envelope?.state ?? empty} demo={live.envelope?.demo ?? false} connected={connected} />
  );
}

const root = document.getElementById("root");
if (root) createRoot(root).render(<LiveDashboard />);
