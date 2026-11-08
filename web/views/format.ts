import type { Source } from "../../src/core/aggregate";
import type { StateKind } from "./parts";

export const ROLES = ["orchestrator", "oracle", "fixer", "explorer", "designer"] as const;
export type Role = (typeof ROLES)[number];
export const isRole = (value: string | null): value is Role =>
  value !== null && (ROLES as readonly string[]).includes(value);
export const SOURCES: Source[] = ["observe", "route", "permissions"];

export const RAIL_CALLS = 10;
export const RENDER_LIMIT = 300;

/** File and stats states map onto the DESIGN state icons: ok is live, everything not read is a hollow ring. */
export const STATUS_ICON: Record<"ok" | "missing" | "error" | "unavailable" | "disabled", StateKind> = {
  ok: "live",
  missing: "missing",
  error: "error",
  unavailable: "missing",
  disabled: "missing",
};
export const STATUS_CLASS = { ok: "ok", missing: "warn", error: "err", unavailable: "warn", disabled: "dim" } as const;

const pad = (n: number, w = 2) => String(n).padStart(w, "0");
export function fmtTs(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}
export function fmtDay(ms: number) {
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? "—" : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export const fmtRange = (range: { from: number; to: number }) => `${fmtDay(range.from)} → ${fmtDay(range.to)}`;
/** Compact count for tight places (rails, readouts). */
export function fmtNum(n: number) {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e4) return `${(n / 1e3).toFixed(1)}k`;
  return String(n);
}
/** Exact count with thousands separators (tables). Locale independent. */
export const fmtInt = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
export const fmt2 = (n: number | null) => (n === null ? "—" : n.toFixed(2));
export const trunc = (s: string | null, n: number) => (s === null ? "—" : s.length > n ? `${s.slice(0, n - 1)}…` : s);
export const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v)}%`);
/** Cost as reported by opencode. 0 is shown as reported, never replaced by an estimate. */
export const fmtCost = (cost: number) => (cost === 0 ? "0 reported" : `$${cost.toFixed(2)}`);
/** Wall-clock time of day, seconds precision. Unparsable input is shown as received. */
export function fmtClock(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
/** Federation namespaces sessions as a JSON pair [sourceId, session]; show the session, keep the raw id in titles. */
export function fmtSession(session: string) {
  if (!session.startsWith('["')) return session;
  try {
    const pair: unknown = JSON.parse(session);
    return Array.isArray(pair) && pair.length === 2 && typeof pair[1] === "string" ? pair[1] : session;
  } catch {
    return session;
  }
}
