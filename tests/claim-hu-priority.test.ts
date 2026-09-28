import { describe, expect, it } from "vitest";
import { act, createGame, newPlayer, seats } from "../shared/engine";
import { ruleDefaults } from "../shared/nanjing-rules";
import type { Game } from "../shared/types";

// Two sequence waits leave enough physical copies for another player's kong.
function claimGame(copies: 2 | 3, secondWinner = false): Game {
  const g = createGame("claim-priority", "test");
  const hands = [
    [4],
    [2, 3, 9, 10, 11, 18, 19, 20, 27, 27, 27, 28, 28],
    secondWinner ? [5, 6, 12, 13, 14, 21, 22, 23, 29, 29, 29, 30, 30] : [0],
    Array(copies).fill(4) as number[],
  ];
  const used = new Map<number, number>();
  g.players = seats.map(seat => {
    const p = newPlayer(`p${seat}`, `玩家${seat}`, false, 500);
    p.hand = hands[seat].map(k => {
      const copy = used.get(k) ?? 0;
      used.set(k, copy + 1);
      return k * 4 + copy;
    });
    return p;
  });
  const dealt = new Set(g.players.flatMap(p => p!.hand));
  g.wall = Array.from({ length: 144 }, (_, t) => t).filter(t => !dealt.has(t));
  g.phase = "playing";
  g.turn = 0;
  g.round = 1;
  g.roundStartScores = [500, 500, 500, 500];
  return act(g, 0, { type: "discard", tile: g.players[0]!.hand[0] }, 1000);
}

describe("确认胡牌只等待其他可胡玩家", () => {
  it.each([2, 3] as const)("已胡不等待持有 %i 张的碰/杠玩家", copies => {
    const pending = claimGame(copies);
    expect(pending.pending!.offers[1]).toEqual(["hu", "pass"]);
    expect(pending.pending!.offers[3]).toEqual(copies === 3 ? ["kong", "pung", "pass"] : ["pung", "pass"]);
    const done = act(pending, 1, { type: "hu" }, 1100);
    expect(done.phase).toBe("ended");
    expect(done.result!.winners).toEqual([1]);
    expect(done.pending).toBeUndefined();
    expect(done.players[3]!.melds).toEqual([]);
    expect(done.players[3]!.score).toBe(500);
    expect(done.history).toHaveLength(1);
    expect(() => act(done, 3, { type: "pung" }, 1200)).toThrow();
    expect(() => act(done, 1, { type: "hu" }, 1200)).toThrow();
    expect(done.history).toHaveLength(1);
    expect(pending.pending!.replies).toEqual({});
  });

  it.each(["hu", "pass"] as const)("仍等待另一可胡玩家，其选择 %s 后不等碰杠直接结算", response => {
    let g = claimGame(3, true);
    g = act(g, 1, { type: "hu" }, 1100);
    expect(g.phase).toBe("claiming");
    expect(g.pending!.replies).toEqual({ 1: "hu" });
    expect(g.result).toBeUndefined();
    g = act(g, 2, { type: response }, 1200);
    expect(g.phase).toBe("ended");
    expect(g.result!.winners).toEqual(response === "hu" ? [1, 2] : [1]);
    expect(g.players[3]!.score).toBe(500);
    expect(g.players.reduce((sum, p) => sum + p!.score, 0)).toBe(2000);
  });

  it.each(["pung", "kong"] as const)("先提交的 %s 不能抢在胡牌前成立", response => {
    let g = act(claimGame(3), 3, { type: response }, 1100);
    expect(g.phase).toBe("claiming");
    expect(g.players[3]!.melds).toEqual([]);
    g = act(g, 1, { type: "hu" }, 1200);
    expect(g.result!.winners).toEqual([1]);
    expect(g.players[3]!.melds).toEqual([]);
    expect(g.players[3]!.score).toBe(500);
  });

  it.each(["pung", "kong", "pass"] as const)("无人确认胡牌时继续等待碰杠玩家，正常处理 %s", response => {
    let g = act(claimGame(3), 1, { type: "pass" }, 1100);
    expect(g.phase).toBe("claiming");
    expect(g.result).toBeUndefined();
    g = act(g, 3, { type: response }, 1200);
    expect(g.phase).toBe("playing");
    expect(g.turn).toBe(response === "pass" ? 1 : 3);
    expect(g.players[3]!.melds.map(m => m.type)).toEqual(response === "pass" ? [] : [response]);
  });

  it("299995 第三把匿名牌面：胡九万后不再等另一家的碰/过", () => {
    const g = createGame("regression", "test");
    g.rules = ruleDefaults("nj-garden-b-v3");
    const hands = [
      [26, 31, 45, 46, 52, 53, 55, 58, 60, 66],
      [33, 34, 36, 38, 39, 40, 44, 84, 88, 94, 95, 117, 119],
      [1, 7, 11, 12, 13, 14, 21, 27, 32, 54, 92, 93, 97, 102],
      [24, 29, 30, 61, 63, 78, 81, 83, 85, 91, 104, 105, 106],
    ];
    g.players = seats.map(s => Object.assign(newPlayer(`p${s}`, `玩家${s}`), { hand: hands[s] }));
    g.players[0]!.flowers = [131, 139, 130, 125];
    g.players[0]!.melds = [{ type: "pung", tiles: [72, 74, 75], from: 2, concealed: false }];
    g.wall = [56, 57, 59, 62, 64, 68, 69, 70, 71, 73, 77, 79, 82, 86, 87, 90, 96, 98];
    g.phase = "playing";
    g.turn = 2;
    g.round = 3;
    const pending = act(g, 2, { type: "discard", tile: 32 }, 1000);
    expect(pending.pending!.offers).toEqual({ 0: ["hu", "pass"], 1: ["pung", "pass"] });
    const done = act(pending, 0, { type: "hu" }, 2850);
    expect(done.phase).toBe("ended");
    expect(done.result!.winners).toEqual([0]);
    expect(done.deadline).toBe(0);
    expect(done.pending).toBeUndefined();
  });
});
