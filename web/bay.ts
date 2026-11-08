import { ROLES, type Role } from "./views/format";

export type BayLayout = {
  width: number;
  height: number;
  rowH: number;
  jackX: number;
  ctxX: number;
  jackY: (role: Role) => number;
  /** Fewer calls than rail rows: jacks are packed toward the calls instead of spread over empty space. */
  sparse: boolean;
};

/** 1024 px stage: 1024 - 256 (calls) - 232 (aggregate) = 536. The bay drawing fits that exactly. */
const WIDTH = 536;
const ROW_H = 40;
/** Call rail row height at <= 1280 px (DESIGN: 36 px at 1024). */
export const NARROW_ROW_H = 36;
const MIN_GAP = 44;
const MAX_GAP = 80;
const TOP = 22;
const FULL_TOP = 40;
const LABEL_ROOM = 30;

/**
 * Patch bay geometry. Call rows match the calls rail (40 px, or 36 px at narrow widths) so wires start level with
 * the calls. With a full rail the jacks spread over the drawing; with fewer calls they pack toward the calls, so a
 * quiet exchange is compact instead of showing five jacks across empty space. No calls are invented.
 */
export function bayLayout(calls: number, railCalls: number, rowH = ROW_H): BayLayout {
  const n = Math.max(0, Math.min(calls, railCalls));
  const sparse = n < railCalls;
  const fullGap = Math.min(MAX_GAP, Math.floor((railCalls * rowH - FULL_TOP - LABEL_ROOM) / (ROLES.length - 1)));
  const gap = sparse
    ? Math.min(MAX_GAP, Math.max(MIN_GAP, Math.round((Math.max(n, 1) * rowH) / (ROLES.length - 1))))
    : fullGap;
  const mid = (Math.max(n, 1) * rowH) / 2;
  const top = sparse ? Math.max(TOP, Math.round(mid - ((ROLES.length - 1) * gap) / 2)) : FULL_TOP;
  const height = sparse ? Math.max(n * rowH, top + (ROLES.length - 1) * gap + LABEL_ROOM) : railCalls * rowH;
  return {
    width: WIDTH,
    height,
    rowH,
    jackX: 372,
    ctxX: 398,
    jackY: (role) => top + ROLES.indexOf(role) * gap,
    sparse,
  };
}
