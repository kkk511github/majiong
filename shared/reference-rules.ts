import type { Game, GlobalAnchorDiscard, Seat, Tile } from "./types";
import { kind } from "./tiles";
import { isNanjingV2 } from "./nanjing-rules";

export function canDeclareZhaozhi(g: Game, seat: Seat): boolean {
  // Retained protocol field for old clients; mobile rules do not support this declaration.
  return false;
}
/** Called when the fourth meld completes, before a kong's replacement draw. */
export function armGlobalAnchor(g: Game, seat: Seat) {
  const p = g.players[seat];
  if (!isNanjingV2(g.rules) || !g.ruleState || !p || p.melds.length !== 4 ||
      p.hand.length !== (p.melds[3].type === "kong" ? 1 : 2)) return;
  (g.ruleState.pendingGlobalPung ??= {})[seat] = true;
}
/** Server-only wait tracking; changing the wait deletes both colour and liability. */
export function recordGlobalAnchor(g: Game, seat: Seat, discarded: Tile) {
  const p = g.players[seat]!;
  if (!g.ruleState) return;
  const armed = g.ruleState.pendingGlobalPung?.[seat] === true;
  if (g.ruleState.pendingGlobalPung) delete g.ruleState.pendingGlobalPung[seat];
  const anchors = (g.ruleState.globalAnchors ??= {});
  const previous = anchors[seat];
  if (previous) {
    if (!activeGlobalAnchor(g, seat)) delete anchors[seat];
    return;
  }
  if (armed && p.melds.length === 4 && p.hand.length === 1)
    anchors[seat] = {
      source: p.melds[3].type === "pung" ? "fourth-pung" : "fourth-meld",
      discardTile: discarded,
      discardKind: kind(discarded),
      waitKind: kind(p.hand[0]),
      changed: false,
    };
}
function activeGlobalAnchor(g: Game, seat: Seat) {
  const anchor = g.ruleState?.globalAnchors?.[seat], p = g.players[seat];
  if (!isNanjingV2(g.rules) || !anchor || anchor.changed ||
      !["fourth-pung", "fourth-meld"].includes(anchor.source ?? "") || anchor.discardTile === undefined ||
      kind(anchor.discardTile) !== anchor.discardKind || !p || p.melds.length !== 4 ||
      ![1, 2].includes(p.hand.length) || !p.hand.some(t => kind(t) === anchor.waitKind)) return;
  return anchor;
}
/** This exact projection drives both live yellow tiles and replay snapshots. */
export function globalAnchorDiscards(g: Game): GlobalAnchorDiscard[] {
  return ([0, 1, 2, 3] as Seat[]).flatMap(seat => {
    const anchor = activeGlobalAnchor(g, seat);
    return anchor ? [{ seat, tile: anchor.discardTile! }] : [];
  });
}
export function inGlobalAnchorRange(anchorKind: number, candidateKind: number): boolean {
  if (anchorKind >= 27 && anchorKind <= 30)
    return candidateKind >= 27 && candidateKind <= 30;
  return anchorKind >= 0 && anchorKind < 27 && candidateKind >= 0 && candidateKind < 27 &&
    Math.floor(candidateKind / 9) === Math.floor(anchorKind / 9) && Math.abs(candidateKind - anchorKind) <= 2;
}
export function globalLiability(g: Game, seat: Seat, tile: Tile): boolean {
  const anchor = activeGlobalAnchor(g, seat);
  return !!anchor && inGlobalAnchorRange(anchor.discardKind, kind(tile));
}
