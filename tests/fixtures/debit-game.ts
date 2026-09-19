import {
  act,
  createGame,
  newPlayer,
  seats,
  selfKongs,
} from "../../shared/engine";
import { ruleDefaults } from "../../shared/nanjing-rules";
import type { Game } from "../../shared/types";

export type DebitExample =
  "concealed" | "open" | "added" | "winds" | "fourSame";
/** Deterministic real engine actions for UI previews and integration assertions. */
export function debitGame(
  example: DebitExample = "concealed",
  multiplier = 1,
): Game {
  const g = createGame(
    "127548",
    "debit-preview",
    ruleDefaults("nj-garden-b-v3"),
  );
  g.players = seats.map((seat) =>
    newPlayer(String(seat), ["金陵牌友", "秦淮", "钟山", "莫愁"][seat]),
  );
  g.phase = "playing";
  g.round = 1;
  g.turn = 0;
  g.revision = 10;
  g.deadline = Date.now() + 600000;
  g.ruleState = {
    multiplier,
    nextMultiplier: 1,
    nextReasons: [],
    keepDealer: false,
    heavenlyEligible: false,
    heavenlyWaits: {},
    discards: [],
    ownDiscards: [[], [], [], []],
    kongOccurred: false,
  };
  g.roundTransfers = [];
  g.roundStartScores = [90, 90, 90, 90];
  g.players[0]!.hand = [0, 1, 2, 3, 36, 40, 44, 72, 76, 80, 84, 88, 92, 96];
  if (example === "added") {
    g.players[0]!.hand = g.players[0]!.hand.filter((t) => t > 2);
    g.players[0]!.melds = [
      { type: "pung", tiles: [0, 1, 2], from: 1, concealed: false },
    ];
  }
  if (example === "open") {
    g.players[0]!.hand = g.players[0]!.hand.filter((t) => t !== 3);
    g.players[1]!.discards = [3];
    g.phase = "claiming";
    g.turn = 1;
    g.lastDiscard = { seat: 1, tile: 3 };
    g.pending = {
      from: 1,
      tile: 3,
      kind: "discard",
      openedAtRevision: g.revision,
      offers: { 0: ["kong", "pass"] },
      replies: {},
    };
  }
  if (example === "winds" || example === "fourSame") {
    const previous = example === "winds" ? [108, 112, 116] : [108, 109, 110];
    const tile = example === "winds" ? 120 : 111;
    g.players[0]!.hand = [tile, ...g.players[0]!.hand.slice(1)];
    g.players[0]!.discards = previous;
    g.ruleState.ownDiscards[0] = previous.map((t) => Math.floor(t / 4));
  }
  const used = new Set(
    g.players.flatMap((p) => [
      ...p!.hand,
      ...p!.discards,
      ...p!.melds.flatMap((m) => m.tiles),
    ]),
  );
  const rest = Array.from({ length: 124 }, (_, i) => i).filter(
    (t) => !used.has(t),
  );
  for (const seat of [1, 2, 3]) g.players[seat]!.hand = rest.splice(0, 13);
  g.wall = rest;
  g.lastDraw = g.players[0]!.hand.at(-1);
  return g;
}
export function applyDebit(g: Game, example: DebitExample) {
  let after = act(
    g,
    0,
    example === "open"
      ? { type: "kong" }
      : example === "winds" || example === "fourSame"
        ? { type: "discard", tile: g.players[0]!.hand[0] }
        : { type: "selfKong", tile: selfKongs(g, 0)[0] },
    Date.now(),
  );
  if (example === "added")
    for (const seat of seats)
      if (
        after.pending?.offers[seat] &&
        after.pending.replies[seat] === undefined
      )
        after = act(after, seat, { type: "pass" }, Date.now());
  return after;
}
