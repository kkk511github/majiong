import { describe, expect, it } from "vitest";
import { act, createGame, newPlayer, seats, viewFor } from "../shared/engine";
import { ruleDefaults } from "../shared/nanjing-rules";
import { createWall, seededRandom } from "../shared/tiles";
import type { Game, Seat } from "../shared/types";

function fixture(hand = [72, 73, 74, 76], flowers = 1, payerBalance = 90, multiplier = 1) {
  const g = createGame("118526", "three-mouth-completion", ruleDefaults("nj-garden-b-v3"));
  g.round = 6; g.phase = "playing"; g.turn = 3;
  g.players = seats.map(s => newPlayer(String(s), String(s)));
  g.players[0]!.hand = hand;
  g.players[0]!.flowers = Array.from({ length: flowers }, (_, i) => 124 + i);
  g.players[0]!.melds = [0, 9, 27].map(k => ({ type: "pung", tiles: [k * 4, k * 4 + 1, k * 4 + 2], from: 1, concealed: false }));
  g.players[1]!.score = payerBalance;
  g.roundStartScores = g.players.map(p => p!.score);
  g.roundStartExternalScores = [0, 0, 0, 0];
  g.ruleState = { multiplier, nextMultiplier: 1, nextReasons: [], keepDealer: false, heavenlyEligible: false, heavenlyWaits: {}, discards: [], ownDiscards: [[], [], [], []], kongOccurred: false };
  g.replay = { version: 1, id: `${g.id}-6`, code: g.code, round: 6, names: g.players.map(p => p!.name), startedAt: 1000, frames: [], rules: g.rules };
  const held = new Set(g.players.flatMap(p => [...p!.hand, ...p!.flowers, ...p!.melds.flatMap(m => m.tiles)]));
  g.wall = createWall(seededRandom(6)).filter(t => !held.has(t));
  return g;
}
function discard(g: Game, from: Seat, tile: number) {
  g.turn = from;
  g.players[from]!.hand = [tile];
  g.wall = g.wall.filter(t => t !== tile);
  return act(g, from, { type: "discard", tile }, 2000);
}
function external(g: Game, amount: number) {
  expect(g.phase).toBe("ended");
  expect(g.result!.winners).toEqual([0]);
  expect(g.result!.deltas).toEqual([0, 0, 0, 0]);
  expect(g.result!.externalDeltas).toEqual([amount, -amount, 0, 0]);
  expect(g.result!.transfers).toEqual([{ from: 1, to: 0, amount, reason: "三口承包", scope: "external" }]);
  expect(g.players.map(p => p!.score)).toEqual(g.roundStartScores);
  expect(g.history).toHaveLength(1);
  expect(g.history.at(-1)!.result).toEqual(g.result);
  expect(g.replay!.frames.at(-1)!.type).toBe("finish");
  expect(g.replay!.frames.filter(f => f.type === "finish")).toHaveLength(1);
  expect(g.pending).toBeUndefined();
  expect(g.deadline).toBe(0);
  expect(viewFor(g, 0).actions).toEqual([]);
  expect(g.ruleState!.pendingGlobalPung?.[0]).toBeUndefined();
  expect(viewFor(g, 0).globalAnchorDiscards).toEqual([]);
}

describe("三嘴同家，第四嘴即结算外包", () => {
  for (const from of [1, 2, 3] as Seat[])
    for (const action of ["pung", "kong"] as const)
      it(`${from}家供第四嘴${action}，原责任人零分也结算且不收杠费`, () => {
        const g = discard(fixture(action === "pung" ? [72, 73, 76, 80] : undefined, 1, 0, 2), from, 75);
        expect(viewFor(g, 0).actions).toContain("hu");
        expect(g.pending!.offers[0]).toContain(action);
        const ended = act(g, 0, { type: action }, 3000);
        external(ended, 100);
        expect(ended.wall).toEqual(g.wall);
        expect(ended.players[0]!.hand).toHaveLength(action === "pung" ? 2 : 1);
        expect(ended.players[0]!.melds).toHaveLength(4);
        expect(ended.players[0]!.melds[3].from).toBe(from);
        expect(ended.replay!.frames.at(-2)!.type).toBe(action);
        expect(() => act(ended, 0, { type: action }, 4000)).toThrow();
      });
  it.each([1, 2])("自己暗杠第四嘴立即结束，不收杠费也不补牌，倍率%s", multiplier => {
    const g = fixture([72, 73, 74, 75, 76], 1, 0, multiplier);
    g.turn = 0;
    const ended = act(g, 0, { type: "selfKong", tile: 72 }, 3000);
    external(ended, multiplier === 1 ? 50 : 100);
    expect(ended.wall).toEqual(g.wall);
    expect(ended.players[0]!.hand).toEqual([76]);
  });
  it("111条+2条胡2条只结算外包，零分责任人也可被胡", () => {
    const g = discard(fixture(undefined, 1, 0), 1, 77);
    expect(viewFor(g, 0).actions).toContain("hu");
    external(act(g, 0, { type: "hu" }, 3000), 50);
  });
  it("111条+2条来3条，花数不足不能胡", () => {
    const g = discard(fixture(undefined, 1), 3, 80);
    expect(viewFor(g, 0).actions).not.toContain("hu");
    expect(g.result).toBeUndefined();
  });
  it("111条+2条有足够花胡3条，只收小胡，不收外包", () => {
    const g = discard(fixture(undefined, 4), 3, 80);
    expect(viewFor(g, 0).actions).toContain("hu");
    const ended = act(g, 0, { type: "hu" }, 3000);
    expect(ended.result!.details[0]!.major).toBe(false);
    expect(ended.result!.details[0]!.snapshot).toBeUndefined();
    expect(ended.result!.externalDeltas).toEqual([0, 0, 0, 0]);
    expect(ended.result!.transfers).toEqual([{ from: 3, to: 0, amount: ended.result!.details[0]!.total, reason: "点炮" }]);
  });
  it("前三嘴责任已成立也不能胡零分玩家的小胡", () => {
    const g = discard(fixture(undefined, 4, 0), 1, 80);
    expect(viewFor(g, 0).actions).not.toContain("hu");
    expect(g.result).toBeUndefined();
    expect(g.history).toEqual([]);
  });
  it("前三嘴不是同家，第四嘴杠仍正常收杠费并继续", () => {
    const g = fixture(); g.players[0]!.melds[0].from = 2;
    const pending = discard(g, 3, 75);
    const continued = act(pending, 0, { type: "kong" }, 3000);
    expect(continued.phase).toBe("playing");
    expect(continued.result).toBeUndefined();
    expect(continued.roundTransfers).toEqual([{ from: 3, to: 0, amount: 10, reason: "直杠" }]);
  });
});
