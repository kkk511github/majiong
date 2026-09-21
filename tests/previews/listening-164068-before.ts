// Preview-only historical source. Production never imports this file.
// Original: src/listening-hints.ts
// Commit: 8b1c03f8258de9085325cd5845b94a28dd91a2b7 (parent of the 5d34034 fix)
// Original SHA-256: 344b27556982c6b74488953bcf0e95aac97e354c3dc28ba734e7a831fa026327
// Only import paths changed; all original scoring semantics are preserved.
import type { PublicPlayer, Rules, Tile, Seat } from "../../shared/types";
import { kind } from "../../shared/tiles";
import { winningKinds } from "./listening-164068-scoring-before";
import { structuralWaits } from "./listening-164068-scoring-nanjing-before";

/** Uses our own hand and public melds only; never consults opponents' hidden hands. */
export function listeningHints(
  player: PublicPlayer,
  rules: Rules,
  discard?: Tile,
  tablePlayers: (Pick<PublicPlayer, "melds"> | null)[] = [],
  ownContext: { seat?: Seat; earthlyWaits?: number[] } = {},
): number[] {
  if (discard !== undefined && !player.hand.includes(discard)) return [];
  const hand =
    discard === undefined
      ? player.hand
      : player.hand.filter((t) => t !== discard);
  if (hand.length % 3 !== 1) return [];
  const waits = ownContext.earthlyWaits?.length
    ? structuralWaits({ ...player, hand })
    : [];
  return winningKinds(
    { ...player, hand, passedHu: false, passedPung: [] },
    rules,
    {
      seat: ownContext.seat,
      earthly:
        waits.length > 0 &&
        waits.every((k) => ownContext.earthlyWaits!.includes(k)),
      visiblePungs: tablePlayers.flatMap(
        (p) =>
          p?.melds
            .filter(
              (m) => m.type === "pung" && !m.concealed && m.tiles.length === 3,
            )
            .map((m) => kind(m.tiles[0])) ?? [],
      ),
    },
  );
}

/** Unseen is not wall stock: it includes opponents' concealed tiles. */
export function unseenHintCounts(
  view: { me: number; players: (PublicPlayer | null)[] },
  kinds: number[],
): Record<number, number> {
  const visible = new Set<number>();
  view.players.forEach((p, seat) => {
    if (!p) return;
    if (seat === view.me) p.hand.forEach((t) => visible.add(t));
    p.discards.forEach((t) => visible.add(t));
    p.flowers.forEach((t) => visible.add(t));
    p.melds.forEach((m) => {
      if (m.concealed && m.tiles.length) {
        // The displayed face identifies all four copies in this public kong.
        const base = kind(m.tiles[0]) * 4;
        for (let i = 0; i < 4; i++) visible.add(base + i);
      } else m.tiles.forEach((t) => visible.add(t));
    });
  });
  return Object.fromEntries(
    kinds.map((k) => [
      k,
      Math.max(0, 4 - [...visible].filter((t) => kind(t) === k).length),
    ]),
  );
}

/** One calculation per tile kind; duplicate physical copies receive the same hint. */
export function readyDiscardTiles(view: import("../../shared/types").View): number[] {
  const player=view.players[view.me];
  if(!player||view.phase!=="playing"||!view.canDiscard||player.trustee)return [];
  const readyKinds=new Set<number>();
  const tested=new Set<number>();
  for(const tile of player.hand){
    const k=kind(tile);if(tested.has(k))continue;tested.add(k);
    if(listeningHints(player,view.rules,tile,view.players,{seat:view.me,earthlyWaits:view.earthlyWaits}).length)readyKinds.add(k);
  }
  return player.hand.filter(tile=>readyKinds.has(kind(tile)));
}
