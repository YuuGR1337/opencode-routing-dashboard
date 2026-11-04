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

const WIDTH = 560;
const ROW_H = 40;
const MIN_GAP = 44;
const MAX_GAP = 80;
const TOP = 22;
const LABEL_ROOM = 30;

/**
 * Patch bay geometry. Call rows stay 40 px so wires start level with the calls rail. With a full rail the jacks
 * spread over 400 px as before; with fewer calls they pack toward the calls, so a quiet exchange is compact
 * instead of showing five jacks across empty space. No calls are invented.
 */
export function bayLayout(calls: number, railCalls: number): BayLayout {
  const n = Math.max(0, Math.min(calls, railCalls));
  const sparse = n < railCalls;
  const gap = sparse
    ? Math.min(MAX_GAP, Math.max(MIN_GAP, Math.round((Math.max(n, 1) * ROW_H) / (ROLES.length - 1))))
    : MAX_GAP;
  const mid = (Math.max(n, 1) * ROW_H) / 2;
  const top = sparse ? Math.max(TOP, Math.round(mid - ((ROLES.length - 1) * gap) / 2)) : 40;
  const height = sparse ? Math.max(n * ROW_H, top + (ROLES.length - 1) * gap + LABEL_ROOM) : railCalls * ROW_H;
  return {
    width: WIDTH,
    height,
    rowH: ROW_H,
    jackX: 400,
    ctxX: 426,
    jackY: (role) => top + ROLES.indexOf(role) * gap,
    sparse,
  };
}
