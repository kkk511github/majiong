import { act, createGame, newPlayer, seats } from "../../shared/engine";
import { newGameRules } from "../../shared/nanjing-rules";
import { captureReplay } from "../../shared/replay";
import { createWall, seededRandom } from "../../shared/tiles";
import type { Game, Rules, Seat } from "../../shared/types";

/** A physical 144-tile fixture, with all unrelated tiles retained in the wall. */
export function externalRound(
  options: {
    kind?: "three" | "pure" | "global";
    multiplier?: number;
    payerBalance?: number;
    robbed?: boolean;
    rules?: Partial<Rules>;
    previous?: Game;
    ids?: string[];
    gameId?: string;
    alsoWin?: boolean;
  } = {},
) {
  const mode = options.kind ?? "three";
  const g = createGame(
    "789123",
    options.gameId ?? options.previous?.id ?? "external-ledger",
    newGameRules({ rounds: 4, ...options.rules }),
  );
  const payer = mode === "three" ? 0 : 3;
  g.players = seats.map((seat) => {
    const p = newPlayer(
      options.ids?.[seat] ?? `external-${seat}`,
      ["甲", "乙", "丙", "丁"][seat],
    );
    p.score = options.previous?.players[seat]?.score ?? 90;
    p.externalScore = options.previous?.players[seat]?.externalScore ?? 0;
    return p;
  });
  if (options.payerBalance !== undefined)
    g.players[payer]!.score = options.payerBalance;
  g.phase = "playing";
  g.round = (options.previous?.round ?? 0) + 1;
  g.history = structuredClone(options.previous?.history ?? []);
  g.roundStartScores = g.players.map((p) => p!.score);
  g.roundStartExternalScores = g.players.map((p) => p!.externalScore ?? 0);
  g.ruleState = {
    multiplier: options.multiplier ?? 1,
    nextMultiplier: 1,
    nextReasons: [],
    keepDealer: false,
    heavenlyEligible: false,
    heavenlyWaits: {},
    discards: [],
    ownDiscards: [[], [], [], []],
    kongOccurred: false,
  };
  g.players[2]!.hand = mode === "global" ? [24] : [4, 8, 24, 25];
  g.players[2]!.flowers = [124, 128, 132, 136];
  g.players[2]!.melds = (mode === "global" ? [0, 4, 8, 18] : [0, 4, 8]).map(
    (k, i) => ({
      type: "pung",
      tiles: [k * 4, k * 4 + 1, k * 4 + 2],
      from: mode === "three" ? 0 : ([0, 1, 3, 0][i] as Seat),
      concealed: false,
    }),
  );
  const winning = mode === "global" ? 25 : 12;
  g.players[3]!.hand = [winning];
  if (options.alsoWin)
    g.players[1]!.hand = [5, 9, 36, 40, 44, 48, 52, 56, 72, 76, 80, 120, 121];
  if (options.robbed)
    g.players[3]!.melds = [
      { type: "pung", tiles: [13, 14, 15], from: 1, concealed: false },
    ];
  const held = new Set(
    g.players.flatMap((p) => [
      ...p!.hand,
      ...p!.flowers,
      ...p!.melds.flatMap((m) => m.tiles),
    ]),
  );
  g.wall = createWall(seededRandom(77)).filter((t) => !held.has(t));
  g.turn = 3;
  g.lastDraw = winning;
  g.replay = {
    version: 1,
    id: `${g.id}-${g.round}`,
    code: g.code,
    round: g.round,
    rules: structuredClone(g.rules),
    multiplier: g.ruleState.multiplier,
    startedAt: 1000 * g.round,
    names: g.players.map((p) => p!.name),
    frames: [],
  };
  captureReplay(g, "start", 1000 * g.round);
  let completed = act(
    g,
    3,
    options.robbed
      ? { type: "selfKong", tile: winning }
      : { type: "discard", tile: winning },
    1000 * g.round + 100,
  );
  for (const seat of seats)
    if (
      completed.phase === "claiming" &&
      completed.pending?.offers[seat] &&
      completed.pending.replies[seat] === undefined
    )
      completed = act(
        completed,
        seat,
        { type: seat === 2 || (options.alsoWin && seat === 1) ? "hu" : "pass" },
        1000 * g.round + 200,
      );
  return completed;
}
