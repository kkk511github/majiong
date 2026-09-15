import type { Seat, View } from "../shared/types";

export interface GameFeedback {
  key: string;
  type:
    "deal" | "draw" | "discard" | "pung" | "kong" | "flower" | "hu" | "ready";
  seat: Seat;
  tile?: number;
  count?: number;
  concealed?: boolean;
  upgraded?: boolean;
}

/** Only confirmed transitions of the same live table; joining/restoring is not a new deal. */
export function gameFeedback(
  before: View | null,
  after: View | null,
): GameFeedback[] {
  if (
    !before ||
    !after ||
    before.id !== after.id ||
    before.me !== after.me ||
    after.revision <= before.revision
  )
    return [];
  const events: GameFeedback[] = [];
  const add = (
    type: GameFeedback["type"],
    seat: Seat,
    extra: Partial<GameFeedback> = {},
  ) => {
    events.push({
      key: `${after.id}:${after.round}:${after.revision}:${type}:${seat}`,
      type,
      seat,
      ...extra,
    });
  };
  if (after.round > before.round) {
    if (!after.result) {
      add("deal", after.dealer);
      after.players.forEach((player, seat) => {
        if (player?.flowers.length) add("flower", seat as Seat, {count: player.flowers.length});
      });
    }
    return events;
  }
  if (after.round !== before.round) return [];
  if (after.result && !before.result) {
    after.result.winners.forEach((seat) => add("hu", seat));
    return events;
  }
  after.players.forEach((player, index) => {
    const prior = before.players[index],
      seat = index as Seat;
    if (!player || !prior) return;
    player.melds.forEach((meld, i) => {
      const old = prior.melds[i];
      if (!old || (old.type === "pung" && meld.type === "kong")) {
        // A concealed kong deliberately has no tile value for other players.
        add(meld.type, seat, {
          concealed: meld.concealed,
          upgraded: old?.type === "pung" && meld.type === "kong",
          tile: meld.concealed ? undefined : meld.tiles[0],
        });
      }
    });
    const count = player.flowers.filter(
      (tile) => !prior.flowers.includes(tile),
    ).length;
    if (count) add("flower", seat, { count });
    if (after.phase === "waiting" && player.ready && !prior.ready)
      add("ready", seat);
  });
  if (
    after.lastDiscard &&
    after.lastDiscard.tile !== before.lastDiscard?.tile
  ) {
    add("discard", after.lastDiscard.seat, { tile: after.lastDiscard.tile });
  }
  if (
    after.lastDraw !== undefined &&
    after.lastDraw !== before.lastDraw &&
    after.players[after.me]?.hand.includes(after.lastDraw)
  ) {
    add("draw", after.me, { tile: after.lastDraw });
  }
  return events;
}
