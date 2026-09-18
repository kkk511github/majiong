import type { Game, Seat, Tile } from "./types";
import { kind } from "./tiles";
import { isNanjingV2 } from "./nanjing-rules";

export function canDeclareZhaozhi(g: Game, seat: Seat): boolean {
  // Retained protocol field for old clients; mobile rules do not support this declaration.
  return false;
}
/** Server-only wait tracking; changing the pair wait permanently ends this liability. */
export function recordGlobalAnchor(g: Game, seat: Seat, discarded: Tile) {
  const p = g.players[seat]!;
  if (!g.ruleState || p.melds.length !== 4 || p.hand.length !== 1) return;
  const anchors = (g.ruleState.globalAnchors ??= {});
  const previous = anchors[seat];
  if (!previous)
    anchors[seat] = {
      discardKind: kind(discarded),
      waitKind: kind(p.hand[0]),
      changed: false,
    };
  else if (previous.waitKind !== kind(p.hand[0])) previous.changed = true;
}
export function globalLiability(g: Game, seat: Seat, tile: Tile): boolean {
  const anchor = g.ruleState?.globalAnchors?.[seat];
  if (!anchor || anchor.changed) return false;
  const k = kind(tile),
    a = anchor.discardKind;
  return a >= 27
    ? k >= 27 && k <= 30
    : k < 27 && Math.floor(k / 9) === Math.floor(a / 9) && Math.abs(k - a) <= 2;
}
