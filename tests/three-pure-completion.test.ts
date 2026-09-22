import { describe, expect, it } from "vitest";
import { act, createGame, newPlayer, seats, viewFor } from "../shared/engine";
import { ruleDefaults } from "../shared/nanjing-rules";
import type { Game, Seat } from "../shared/types";

function fixture(concealed = false, multiplier = 1): Game {
  const g = createGame("735073", "three-pure", ruleDefaults("nj-garden-b-v3"));
  g.players = seats.map(s => newPlayer(String(s), String(s), false, 1000));
  g.phase = "playing"; g.round = 1; g.turn = 3;
  g.players[0]!.melds = [21, 22, 23].map((k, i) => ({
    type: concealed && i === 1 ? "kong" : "pung",
    concealed: concealed && i === 1,
    from: (concealed && i === 1 ? 0 : i + 1) as Seat,
    tiles: Array.from({ length: concealed && i === 1 ? 4 : 3 }, (_, n) => k * 4 + n),
  }));
  g.players[0]!.hand = [96, 97, 0, 36];
  g.players[3]!.hand = [99];
  g.roundStartScores = [1000, 1000, 1000, 1000];
  g.roundStartExternalScores = [0, 0, 0, 0];
  g.ruleState = { multiplier, nextMultiplier: 1, nextReasons: [], keepDealer: false,
    heavenlyEligible: false, heavenlyWaits: {}, discards: [], ownDiscards: [[], [], [], []], kongOccurred: concealed };
  const used = new Set(g.players.flatMap(p => [...p!.hand, ...p!.melds.flatMap(m => m.tiles)]));
  g.wall = Array.from({ length: 124 }, (_, t) => t).filter(t => !used.has(t));
  return g;
}
function resolve(g: Game, action: "pung" | "kong" | "hu") {
  g = act(g, 3, { type: "discard", tile: g.players[3]!.hand[0] }, 1000);
  expect(viewFor(g, 0).actions).toContain(action);
  for (const seat of seats) if (g.pending?.offers[seat] && g.pending.replies[seat] === undefined)
    g = act(g, seat, { type: seat === 0 ? action : "pass" }, 1100);
  return g;
}
function external(g: Game, multiplier: number, from: Seat = 3) {
  expect(g.phase).toBe("ended");
  expect(g.result!.transfers).toEqual([{ from, to: 0, amount: multiplier > 1 ? 100 : 50, reason: "清一色承包", scope: "external" }]);
  expect(g.result!.deltas).toEqual([0, 0, 0, 0]);
  expect(g.history).toHaveLength(1);
  expect(viewFor(g, 0).globalAnchorDiscards).toEqual([]);
}
describe("三清不要求同家，暗杠也占一嘴", () => {
  for (const concealed of [false, true]) for (const multiplier of [1, 2]) {
    it.each(["pung", "kong", "hu"] as const)(`前三嘴含暗杠=${concealed}，倍率${multiplier}，第四嘴%s立即收供牌者外包`, action => {
      const g = fixture(concealed, multiplier);
      if (action === "kong") g.players[0]!.hand = [96, 97, 98, 0];
      const ended = resolve(g, action);
      external(ended, multiplier);
      expect(ended.wall).toEqual(g.wall);
    });
    it(`含暗杠=${concealed}，最终清一色普通顺子点炮，倍率${multiplier}`, () => {
      const g = fixture(concealed, multiplier);
      g.players[0]!.hand = [72, 76, 104, 105];
      g.players[3]!.hand = [80];
      external(resolve(g, "hu"), multiplier);
    });
  }
  it("前三嘴同家又同花色时三嘴优先，只收一份", () => {
    const g = fixture(); g.players[0]!.melds.forEach(m => m.from = 1);
    const ended = resolve(g, "pung");
    expect(ended.result!.transfers).toEqual([{ from: 1, to: 0, amount: 50, reason: "三口承包", scope: "external" }]);
  });
  it("三清第四嘴为异色碰不立即外包", () => {
    const g = fixture(); g.players[0]!.hand = [40, 41, 0, 36]; g.players[3]!.hand = [43];
    const next = resolve(g, "pung");
    expect(next.phase).toBe("playing"); expect(next.result).toBeUndefined();
    expect(next.roundTransfers).toEqual([]);
  });
  it("三清第四嘴自己暗杠无外部供牌者，继续补牌", () => {
    const g = fixture(); g.turn = 0; g.players[0]!.hand = [96, 97, 98, 99, 72];
    g.wall = [4, 8, 12, 76];
    const next = act(g, 0, { type: "selfKong", tile: 96 }, 1000);
    expect(next.phase).toBe("playing"); expect(next.result).toBeUndefined();
    expect(next.roundTransfers!.every(t => t.reason === "暗杠")).toBe(true);
    expect(viewFor(next, 0).globalAnchorDiscards).toEqual([]);
  });
});
