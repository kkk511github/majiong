import { describe, expect, it } from "vitest";
import { act, createGame, newPlayer, seats } from "../shared/engine";
import { newGameRules } from "../shared/nanjing-rules";
import { threeMouths } from "../shared/scoring-nanjing";
import type { Game, Meld, Seat } from "../shared/types";

type Source = "A" | "B" | "C" | "dark";
const at = (winner: Seat, offset: number) => ((winner + offset) % 4) as Seat;
function melds(winner: Seat, sources: Source[], kinds = [0, 9, 18, 27]): Meld[] {
  return sources.map((source, index) => ({
    type: source === "dark" ? "kong" : "pung", concealed: source === "dark",
    from: source === "dark" ? winner : at(winner, { A: 1, B: 2, C: 3 }[source]),
    tiles: Array.from({ length: source === "dark" ? 4 : 3 }, (_, copy) => kinds[index] * 4 + copy),
  }));
}

/** A local completed-mouth snapshot with full legal hand counts and 144 unique
 * physical tiles. Only the final discard/rob-kong and Hu response are executed. */
function readyGame(winner: Seat, source: Seat, groups: Meld[], hand: number[], winning: number, multiplier = 1, robbed = false): Game {
  const g = createGame("748965", "first-three-mouth-responsibility", newGameRules());
  g.players = seats.map(seat => newPlayer(`fixture-${seat}`, ["甲", "乙", "丙", "丁"][seat]));
  g.phase = "playing"; g.round = 1; g.turn = source; g.lastDraw = winning; g.canSelfWin = true;
  g.players.forEach((player, seat) => player!.score = seat === source ? 300 : 20);
  Object.assign(g.players[winner]!, { melds: groups, hand, flowers: [124, 128, 132, 136] });
  g.players[source]!.hand = [winning];
  if (robbed) g.players[source]!.melds = [{ type: "pung", tiles: [9, 10, 11], from: at(source, 1), concealed: false }];
  const held = new Set(g.players.flatMap(player => [...player!.hand, ...player!.flowers, ...player!.melds.flatMap(meld => meld.tiles)]));
  const remaining = Array.from({ length: 124 }, (_, tile) => tile).filter(tile => !held.has(tile));
  for (const seat of seats) {
    if (seat === winner) continue;
    const player = g.players[seat]!, count = 13 - player.melds.length * 3 + (seat === source ? 1 : 0);
    while (player.hand.length < count) { const tile = remaining.shift()!; player.hand.push(tile); held.add(tile); }
  }
  g.wall = Array.from({ length: 144 }, (_, tile) => tile).filter(tile => !held.has(tile));
  g.roundStartScores = g.players.map(player => player!.score); g.roundStartExternalScores = [0, 0, 0, 0];
  g.ruleState = { multiplier, nextMultiplier: 1, nextReasons: [], keepDealer: false, heavenlyEligible: false, heavenlyWaits: {}, discards: [], ownDiscards: [[], [], [], []], kongOccurred: groups.some(meld => meld.type === "kong") };
  const physical = [...g.wall, ...g.players.flatMap(player => [...player!.hand, ...player!.flowers, ...player!.melds.flatMap(meld => meld.tiles)])];
  expect(physical).toHaveLength(144); expect(new Set(physical).size).toBe(144);
  return g;
}
function finish(g: Game, winner: Seat, source: Seat, winning: number, robbed = false) {
  let next = act(g, source, { type: robbed ? "selfKong" : "discard", tile: winning }, 1000);
  expect(next.pending?.offers[winner]).toContain("hu");
  for (const seat of seats) if (next.pending?.offers[seat] && next.pending.replies[seat] === undefined)
    next = act(next, seat, { type: seat === winner ? "hu" : "pass" }, 1100);
  expect(next.result?.winners).toEqual([winner]);
  expect(next.players.reduce((sum, player) => sum + player!.score, 0)).toBe(360);
  return next;
}

describe("用户最终确认的严格头三嘴责任", () => {
  it.each(["AABA", "ABAA", "BAAA"])("%s头三嘴不同家，第四组补足也不建立三口责任，四座及倍率一致", pattern => {
    for (const winner of seats) for (const multiplier of [1, 2]) {
      const source = at(winner, 3);
      const g = readyGame(winner, source, melds(winner, [...pattern] as Source[]), [24], 25, multiplier);
      expect(threeMouths(g.players[winner]!, winner)).toBeUndefined();
      const ended = finish(g, winner, source, 25);
      const price = ended.result!.details[winner]!.total;
      expect(ended.result!.transfers).toEqual([{ from: source, to: winner, amount: price, reason: "点炮" }]);
      expect(ended.result!.deltas[winner]).toBe(price); expect(ended.result!.deltas[source]).toBe(-price);
      expect(ended.result!.externalDeltas?.some(amount => amount !== 0)).not.toBe(true);
    }
  });

  it("2+2没有三口责任，普通点炮仍按实际点炮人付款", () => {
    const g = readyGame(0, 3, melds(0, ["A", "A", "B", "B"]), [24], 25);
    expect(threeMouths(g.players[0]!, 0)).toBeUndefined();
    const ended = finish(g, 0, 3, 25);
    expect(ended.result!.transfers).toEqual([{ from: 3, to: 0, amount: ended.result!.details[0]!.total, reason: "点炮" }]);
    expect(ended.result!.externalDeltas?.some(amount => amount !== 0)).not.toBe(true);
  });

  it.each([
    { sources: ["A", "A", "A", "A"] as Source[] }, { sources: ["A", "A", "A", "B"] as Source[] },
    { sources: ["A", "A", "A", "C"] as Source[] }, { sources: ["A", "dark", "dark", "B"] as Source[] },
  ])("头三嘴已明确责任A时，第四组不会改绑：$sources", ({ sources }) => {
    const g = readyGame(0, 3, melds(0, sources), [24], 25);
    expect(threeMouths({ ...g.players[0]!, melds: g.players[0]!.melds.slice(0, 3) }, 0)).toBe(1);
    expect(threeMouths(g.players[0]!, 0)).toBe(1);
    expect(finish(g, 0, 3, 25).result!.transfers).toEqual([{ from: 1, to: 0, amount: 50, reason: "三口承包", scope: "external" }]);
  });

  it("头三组均暗，第四暗或后来明供都不能补造责任，也不会把本人当供应者", () => {
    for (const fourth of ["dark", "A"] as Source[]) {
      const g = readyGame(0, 3, melds(0, ["dark", "dark", "dark", fourth]), [24], 25);
      expect(threeMouths({ ...g.players[0]!, melds: g.players[0]!.melds.slice(0, 3) }, 0)).toBeUndefined();
      expect(threeMouths(g.players[0]!, 0)).toBeUndefined();
      const ended = finish(g, 0, 3, 25);
      expect(ended.result!.transfers!.some(entry => entry.reason === "三口承包")).toBe(false);
      expect(ended.result!.transfers![0].from).toBe(3);
    }
  });

  it("头三嘴已经有A和B两个不同明供者，第四暗杠不能补成三口", () => {
    const g = readyGame(0, 3, melds(0, ["A", "B", "dark", "dark"]), [24], 25);
    expect(threeMouths(g.players[0]!, 0)).toBeUndefined();
    expect(finish(g, 0, 3, 25).result!.transfers!.some(entry => entry.reason === "三口承包")).toBe(false);
  });

  it.each([1, 2])("抢杠优先赔三家，不回退到已有三口供应者，倍率%i", multiplier => {
    const g = readyGame(0, 3, melds(0, ["A", "A", "A"]), [4, 12, 24, 25], 8, multiplier, true);
    expect(threeMouths(g.players[0]!, 0)).toBe(1);
    const ended = finish(g, 0, 3, 8, true), price = ended.result!.details[0]!.total;
    expect(ended.result!.robbedKong).toBe(true);
    expect(ended.result!.details[0]!.snapshot).toBeUndefined();
    expect(ended.result!.transfers).toEqual(([0, 1, 2] as Seat[]).map(to => ({ from: 3, to, amount: price, reason: "抢杠赔三家" })));
    expect(ended.result!.externalDeltas?.some(amount => amount !== 0)).not.toBe(true);
    expect(ended.players[3]!.melds[0].type).toBe("pung");
  });

  it("头三嘴AAA已成立时，第四张来自任意其他玩家仍可快照，责任仍在A", () => {
    for (const source of [1, 2, 3] as Seat[]) for (const multiplier of [1, 2]) {
      const g = readyGame(0, source, melds(0, ["A", "A", "A"], [30, 8, 11]), [24, 27, 28, 29], 30, multiplier);
      const ended = finish(g, 0, source, 30);
      expect(ended.result!.details[0]!.snapshot).toBe(true);
      expect(ended.result!.from).toBe(source);
      expect(ended.players[0]!.melds).toHaveLength(3);
      expect(ended.result!.transfers).toEqual([{ from: 1, to: 0, amount: 50 * multiplier, reason: "三口承包", scope: "external" }]);
    }
  });

  it("混花A、A、B不能靠待胡张的虚拟第四碰新增快照或三口资格", () => {
    const g = readyGame(0, 1, melds(0, ["A", "A", "B"], [30, 8, 11]), [24, 27, 28, 29], 30, 2);
    expect(threeMouths(g.players[0]!, 0)).toBeUndefined();
    const ended = finish(g, 0, 1, 30), score = ended.result!.details[0]!;
    expect(ended.players[0]!.melds).toHaveLength(3);
    expect(score.snapshot).toBeUndefined();
    expect(score.items.some(item => item.label === "全球独钓")).toBe(false);
    expect(ended.result!.transfers).toEqual([{ from: 1, to: 0, amount: score.total, reason: "点炮" }]);
  });
});
