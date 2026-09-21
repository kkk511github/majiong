import { describe, expect, it } from "vitest";
import { act, createGame, newPlayer, seats, viewFor } from "../shared/engine";
import { ruleDefaults } from "../shared/nanjing-rules";
import { structuralWaits } from "../shared/scoring-nanjing";
import { kind } from "../shared/tiles";
import type { Game, Seat } from "../shared/types";

const waits147Bamboo = [18, 21, 24];
const waitingHand147Bamboo = [0, 1, 2, 9, 10, 11, 18, 19, 20, 21, 22, 23, 24];

function fixture(
  hands: number[][],
  { turn = 1, front = [] }: { turn?: Seat; front?: number[] } = {},
): Game {
  const g = createGame("147147", "follow-discard-water", {
    ...ruleDefaults("nj-garden-b-v3"),
    turnSeconds: 0,
  });
  const copies = new Map<number, number>();
  const used = new Set<number>();
  const tile = (tileKind: number) => {
    const copy = copies.get(tileKind) ?? 0;
    if (copy >= 4) throw Error(`fixture has a fifth copy of kind ${tileKind}`);
    copies.set(tileKind, copy + 1);
    const physical = tileKind * 4 + copy;
    used.add(physical);
    return physical;
  };

  g.players = seats.map((seat) => {
    const player = newPlayer(`water-${seat}`, `牌友${seat}`, false, 1000);
    player.ready = true;
    player.hand = (hands[seat] ?? []).map(tile);
    return player;
  });
  const frontTiles = front.map(tile);
  g.wall = [
    ...frontTiles,
    ...Array.from({ length: 124 }, (_, physical) => physical).filter(
      (physical) => !used.has(physical),
    ),
  ];
  g.phase = "playing";
  g.round = 1;
  g.turn = turn;
  g.canSelfWin = true;
  g.lastDraw = g.players[turn]!.hand.at(-1);
  g.pending = undefined;
  g.replacement = undefined;
  g.roundStartScores = g.players.map((player) => player!.score);
  g.roundStartExternalScores = [0, 0, 0, 0];
  g.roundTransfers = [];
  g.ruleState = {
    multiplier: 1,
    nextMultiplier: 1,
    nextReasons: [],
    keepDealer: false,
    heavenlyEligible: false,
    heavenlyWaits: {},
    discards: [],
    ownDiscards: [[], [], [], []],
    kongOccurred: false,
  };
  return g;
}

function tileInHand(g: Game, seat: Seat, tileKind: number) {
  const tile = g.players[seat]!.hand.find(
    (physical) => kind(physical) === tileKind,
  );
  if (tile === undefined) throw Error(`seat ${seat} lacks kind ${tileKind}`);
  return tile;
}

function passHu(g: Game) {
  expect(viewFor(g, 0).actions).toContain("hu");
  return act(g, 0, { type: "pass" }, 1001);
}

describe("跟牌胡过水", () => {
  it("放过一条后，自己出牌前四条也不能胡；自己出牌后七条恢复可胡", () => {
    let g = fixture([waitingHand147Bamboo, [18, 24], [21], [26]], {
      front: [7, 8, 28, 6],
    });
    expect(structuralWaits(g.players[0]!)).toEqual(waits147Bamboo);

    g = act(g, 1, { type: "discard", tile: tileInHand(g, 1, 18) }, 1000);
    g = passHu(g);
    expect(g.players[0]!.passedHu).toBe(true);

    g = act(g, 2, { type: "discard", tile: tileInHand(g, 2, 21) }, 1002);
    expect(g.phase).toBe("playing");
    expect(g.turn).toBe(3);
    expect(viewFor(g, 0).actions).not.toContain("hu");
    expect(g.players[0]!.passedHu).toBe(true);

    g = act(g, 3, { type: "discard", tile: tileInHand(g, 3, 26) }, 1003);
    expect(g.turn).toBe(0);
    const ownDiscard = g.lastDraw!;
    g = act(g, 0, { type: "discard", tile: ownDiscard }, 1004);
    expect(g.players[0]!.passedHu).toBe(false);

    g = act(g, 1, { type: "discard", tile: tileInHand(g, 1, 24) }, 1005);
    expect(g.phase).toBe("claiming");
    expect(viewFor(g, 0).actions).toEqual(["hu", "pass"]);
  });

  it.each(["pung", "kong"] as const)(
    "其他玩家%s后插打七条，不能绕过此前的一条过水",
    (claim) => {
      const copies = claim === "kong" ? [27, 27, 27] : [27, 27];
      let g = fixture([waitingHand147Bamboo, [18, 24, ...copies], [18], [27]], {
        front: [7, 8, 28],
      });

      g = act(g, 1, { type: "discard", tile: tileInHand(g, 1, 18) }, 1000);
      g = passHu(g);
      g = act(g, 2, { type: "discard", tile: tileInHand(g, 2, 18) }, 1002);
      expect(g.players[0]!.passedHu).toBe(true);
      expect(g.turn).toBe(3);

      g = act(g, 3, { type: "discard", tile: tileInHand(g, 3, 27) }, 1003);
      expect(viewFor(g, 1).actions).toContain(claim);
      g = act(g, 1, { type: claim }, 1004);
      expect(g.players[0]!.passedHu).toBe(true);
      expect(g.turn).toBe(1);

      g = act(g, 1, { type: "discard", tile: tileInHand(g, 1, 24) }, 1005);
      expect(g.phase).toBe("playing");
      expect(g.turn).toBe(2);
      expect(g.result).toBeUndefined();
      expect(g.players[0]!.passedHu).toBe(true);
      expect(viewFor(g, 0).actions).not.toContain("hu");
    },
  );

  it("零分供牌者不显示胡，但本可胡的弃牌仍触发过水锁", () => {
    let g = fixture([waitingHand147Bamboo, [18], [21], []], { front: [7, 8] });
    g.players[1]!.score = 0;
    g.roundStartScores[1] = 0;

    g = act(g, 1, { type: "discard", tile: tileInHand(g, 1, 18) }, 1000);
    expect(g.phase).toBe("playing");
    expect(g.pending).toBeUndefined();
    expect(viewFor(g, 0).actions).not.toContain("hu");
    expect(g.players[0]!.passedHu).toBe(true);

    g = act(g, 2, { type: "discard", tile: tileInHand(g, 2, 21) }, 1001);
    expect(g.phase).toBe("playing");
    expect(g.turn).toBe(3);
    expect(g.result).toBeUndefined();
    expect(g.players[0]!.passedHu).toBe(true);
    expect(viewFor(g, 0).actions).not.toContain("hu");
  });

  it("点炮过水期间，合法自摸仍显示胡并正常结算", () => {
    const g = fixture([[...waitingHand147Bamboo, 21], [], [], []], { turn: 0 });
    g.players[0]!.passedHu = true;
    g.lastDraw = g.players[0]!.hand.filter((tile) => kind(tile) === 21).at(-1);

    expect(viewFor(g, 0).actions).toContain("hu");
    const ended = act(g, 0, { type: "hu" }, 1000);
    expect(ended.result).toMatchObject({
      reason: "hu",
      winners: [0],
      from: undefined,
    });
    expect(ended.result!.transfers).toEqual(
      [1, 2, 3].map((from) =>
        expect.objectContaining({ from, to: 0, reason: "自摸" }),
      ),
    );
  });
});
