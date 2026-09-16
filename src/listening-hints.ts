import type { PublicPlayer, Rules, Tile, Seat } from "../shared/types";
import { kind } from "../shared/tiles";
import { winningKinds } from "../shared/scoring";
import { structuralWaits } from "../shared/scoring-nanjing";

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
    p.melds
      .filter((m) => !m.concealed || seat === view.me)
      .forEach((m) => m.tiles.forEach((t) => visible.add(t)));
  });
  return Object.fromEntries(
    kinds.map((k) => [
      k,
      Math.max(0, 4 - [...visible].filter((t) => kind(t) === k).length),
    ]),
  );
}
