import raw from "./snapshot-display.json" with { type: "json" };
import { createGame, newPlayer, seats } from "../../shared/engine";
import type { Game, RoundRecord, RoundReplay } from "../../shared/types";

/** Anonymized completed-hand evidence: only the last discard and finish frames.
 * Three exposed sets, 77万88万, an 8万 win, 204 scored points and 100 external.
 * This is a local presentation fixture, never a game submitted to production. */
export function snapshotDisplayFixture(code = "749903", id = "snapshot-display-fixture", at = Date.now()) {
  const { record, replay } = structuredClone(raw) as unknown as { record: RoundRecord; replay: RoundReplay };
  const offset = at - record.at;
  record.id = `${id}-3`; record.at += offset;
  replay.id = record.id; replay.code = code; replay.startedAt += offset; replay.endedAt! += offset;
  replay.frames.forEach(frame => frame.at += offset);
  const game = createGame(code, id, record.rules);
  const last = replay.frames.at(-1)!;
  game.players = seats.map(seat => ({ ...newPlayer(`snapshot-player-${seat}`, record.names[seat], seat !== 0), ...structuredClone(last.players[seat]) }));
  // Reconstruct only the unused physical IDs to display the saved wall count;
  // no rules action is taken and no hidden historical wall order is invented.
  const held = new Set(game.players.flatMap(player => [...player!.hand, ...player!.flowers, ...player!.discards, ...player!.melds.flatMap(meld => meld.tiles)]));
  game.wall = Array.from({ length: 144 }, (_, tile) => tile).filter(tile => !held.has(tile));
  Object.assign(game, {
    phase: "ended", round: 3, dealer: 1, turn: record.result.from,
    result: structuredClone(record.result), history: [record], replay,
    lastDiscard: { seat: record.result.from!, tile: record.result.winningTile! },
    ruleState: { multiplier: 2, nextMultiplier: 2, nextReasons: [], keepDealer: true, heavenlyEligible: false, heavenlyWaits: {}, discards: [], ownDiscards: [[], [], [], []], kongOccurred: true },
  } satisfies Partial<Game>);
  return { record, replay, game };
}
