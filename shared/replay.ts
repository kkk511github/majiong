import type { Game, ReplayFrame, Seat, Tile } from "./types";

export function captureReplay(
  g: Game,
  type: ReplayFrame["type"],
  now: number,
  seat?: Seat,
  tile?: Tile,
) {
  if (!g.replay || g.replay.id !== `${g.id}-${g.round}` || g.replay.endedAt)
    return;
  g.replay.frames.push({
    at: now,
    type,
    seat,
    tile,
    turn: g.turn,
    remaining: g.wall.length,
    players: g.players.map((p) => ({
      hand: [...(p?.hand ?? [])],
      flowers: [...(p?.flowers ?? [])],
      melds: (p?.melds ?? []).map((m) => ({ ...m, tiles: [...m.tiles] })),
      discards: [...(p?.discards ?? [])],
      score: p?.score ?? 0,
    })),
    ...(type === "finish" && g.result
      ? { result: structuredClone(g.result) }
      : {}),
  });
  if (type === "finish") g.replay.endedAt = now;
}
