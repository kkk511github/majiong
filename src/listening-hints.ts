import type { PublicPlayer, Rules, Tile } from "../shared/types";
import { winningKinds } from "../shared/scoring";

/** Only the local hand and its exposed melds enter this calculation. */
export function listeningHints(
  player: PublicPlayer,
  rules: Rules,
  discard?: Tile,
): number[] {
  if (discard !== undefined && !player.hand.includes(discard)) return [];
  const hand =
    discard === undefined
      ? player.hand
      : player.hand.filter((t) => t !== discard);
  if (hand.length % 3 !== 1) return [];
  return winningKinds(
    { ...player, hand, passedHu: false, passedPung: [] },
    rules,
  );
}
