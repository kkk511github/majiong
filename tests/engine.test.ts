import { describe, expect, it } from "vitest";
import {
  act,
  botAction,
  createGame,
  dissolveGame,
  newPlayer,
  seats,
  selfKongs,
  startRound,
  viewFor,
} from "../shared/engine";
import { DEFAULT_RULES, type Game, type Seat } from "../shared/types";
import { createWall, isFlower, kind, seededRandom } from "../shared/tiles";
import { scoreHand, shapes } from "../shared/scoring";

function tiles(kinds: number[]) {
  const copies = new Map<number, number>();
  return kinds.map((k) => {
    const c = copies.get(k) ?? 0;
    copies.set(k, c + 1);
    return k * 4 + c;
  });
}
function game(seed = 1) {
  const g = createGame("123456", "test");
  g.players = seats.map((s) => {
    const p = newPlayer("p" + s, "牌友" + s);
    p.ready = true;
    return p;
  });
  return startRound(g, 1000, seededRandom(seed));
}
function scenario(hands: number[][]): Game {
  const g = game();
  g.phase = "playing";
  g.turn = 0;
  g.pending = undefined;
  g.canSelfWin = true;
  g.replacement = undefined;
  const used = new Map<number, number>();
  for (const seat of seats) {
    const p = g.players[seat]!;
    p.hand = hands[seat].map((k) => {
      const n = used.get(k) ?? 0;
      if (n >= 4) throw Error("Fixture has fifth copy");
      used.set(k, n + 1);
      return k * 4 + n;
    });
    p.melds = [];
    p.flowers = [];
    p.discards = [];
    p.score = 0;
    p.passedHu = false;
    p.passedPung = [];
  }
  g.wall = createWall(seededRandom(77)).filter(
    (t) => !g.players.some((p) => p!.hand.includes(t)),
  );
  g.roundStartScores = [0, 0, 0, 0];
  g.roundTransfers = [];
  return g;
}
function physical(g: Game) {
  return [
    ...g.wall,
    ...g.players.flatMap((p) =>
      p
        ? [
            ...p.hand,
            ...p.flowers,
            ...p.discards,
            ...p.melds.flatMap((m) => m.tiles),
          ]
        : [],
    ),
  ];
}
describe("南京牌组与判胡", () => {
  it("144 张唯一牌，124 张行牌，20 张花", () => {
    const wall = createWall();
    expect(wall).toHaveLength(144);
    expect(new Set(wall).size).toBe(144);
    expect(wall.filter(isFlower)).toHaveLength(20);
  });
  it("发牌自动补花，庄家 14 张，其余 13 张；总牌数与分数守恒", () => {
    const g = game();
    expect(g.players.map((p) => p!.hand.length)).toEqual([14, 13, 13, 13]);
    expect(g.players.every((p) => p!.hand.every((t) => !isFlower(t)))).toBe(
      true,
    );
    expect(physical(g)).toHaveLength(144);
    expect(new Set(physical(g)).size).toBe(144);
    expect(g.players.reduce((n, p) => n + p!.score, 0)).toBe(360);
  });
  it("识别普通顺子、刻子和将", () => {
    expect(
      shapes(tiles([0, 1, 2, 3, 4, 5, 9, 10, 11, 27, 27, 27, 28, 28])).length,
    ).toBeGreaterThan(0);
  });
  it("字牌不能组成顺子", () => {
    expect(
      shapes(tiles([0, 1, 2, 3, 4, 5, 9, 10, 11, 27, 28, 29, 30, 30])),
    ).toHaveLength(0);
  });
  it("顺子不能跨越花色边界", () => {
    expect(
      shapes(tiles([7, 8, 9, 10, 11, 12, 18, 19, 20, 27, 27, 27, 28, 28])),
    ).toHaveLength(0);
  });
  it("七对和豪华七对可识别，七对不重复计门清", () => {
    const p = newPlayer("p", "测试");
    p.hand = tiles([0, 0, 0, 0, 3, 3, 5, 5, 9, 9, 19, 19, 28, 28]);
    const score = scoreHand(p, DEFAULT_RULES)!;
    expect(score.items).toContainEqual({ label: "豪华七对", value: 160 });
    expect(score.items.find((i) => i.label === "门清")).toBeUndefined();
  });
  it("小胡开门且硬花不足时拒绝，四硬花后可胡", () => {
    const p = newPlayer("p", "测试");
    p.hand = tiles([0, 1, 2, 9, 10, 11, 18, 19, 20, 28, 28]);
    p.melds = [
      {
        type: "pung",
        tiles: [27 * 4, 27 * 4 + 1, 27 * 4 + 2],
        from: 1,
        concealed: false,
      },
    ];
    expect(scoreHand(p, DEFAULT_RULES)).toBeNull();
    p.flowers = [124, 125, 126, 127];
    expect(scoreHand(p, DEFAULT_RULES)).not.toBeNull();
  });
  it("错牌数和五张相同牌不能胡", () => {
    expect(shapes([0, 1])).toHaveLength(0);
    expect(
      shapes(tiles([0, 0, 0, 0, 0, 1, 2, 9, 10, 11, 27, 27, 27, 28])),
    ).toHaveLength(0);
  });
  it("单一听口的压档计分，压绝不重复叠加压档", () => {
    const p = newPlayer("p", "测试");
    p.hand = tiles([0, 2, 9, 10, 11, 18, 19, 20, 27, 27, 27, 28, 28]);
    const normal = scoreHand(p, DEFAULT_RULES, { tile: 4 })!;
    expect(normal.items).toContainEqual({ label: "压档", value: 2 });
    const last = scoreHand(p, DEFAULT_RULES, { tile: 4, visiblePungs: [1] })!;
    expect(last.items).toContainEqual({ label: "压绝", value: 40 });
    expect(last.items.find((i) => i.label === "压档")).toBeUndefined();
    expect(last.total - normal.total).toBe(38);
  });
  it("同一种手牌自摸和点炮采用一致的听口分值", () => {
    const p = newPlayer("p", "测试");
    p.hand = tiles([0, 2, 9, 10, 11, 18, 19, 20, 27, 27, 27, 28, 28]);
    const discard = scoreHand(p, DEFAULT_RULES, { tile: 4 })!;
    p.hand.push(4);
    const self = scoreHand(p, DEFAULT_RULES, { winTile: 4 })!;
    expect(self).toEqual(discard);
  });
});
describe("权威牌局状态与隐私", () => {
  it("自己能看到手牌，其他人手牌和牌墙从协议中移除", () => {
    const g = game(),
      v = viewFor(g, 0);
    expect(v.players[0]!.hand).toHaveLength(14);
    expect(v.players[1]!.hand).toEqual([]);
    expect(v.players[1]!.handCount).toBe(13);
    expect(v).not.toHaveProperty("wall");
    expect(v).not.toHaveProperty("replacement");
    expect(v.players[1]).not.toHaveProperty("passedHu");
  });
  it("拒绝越权出牌且不修改原始状态", () => {
    const g = game(),
      before = JSON.stringify(g);
    expect(() =>
      act(g, 1, { type: "discard", tile: g.players[1]!.hand[0] }),
    ).toThrow("还没轮到");
    expect(JSON.stringify(g)).toBe(before);
    expect(() => act(g, 0, { type: "discard", tile: -1 })).toThrow();
    expect(JSON.stringify(g)).toBe(before);
  });
  it("拒绝伪造胡牌", () => {
    const g = game(71);
    expect(() => act(g, 0, { type: "hu" })).toThrow();
  });
  it("四人未准备不能开局", () => {
    const g = createGame("123456", "x");
    expect(() => startRound(g)).toThrow();
  });
  it("同一张打牌不能提交两次", () => {
    let g = game(),
      action = { type: "discard" as const, tile: g.players[0]!.hand[0] };
    g = act(g, 0, action);
    expect(() => act(g, 0, action)).toThrow();
  });
  it("一炮多响等待所有响应并由点炮者承担，各家不串信息", () => {
    let g = scenario([
      [30],
      [0, 1, 2, 3, 4, 5, 9, 10, 11, 18, 19, 20, 30],
      [0, 1, 2, 3, 4, 5, 12, 13, 14, 21, 22, 23, 30],
      [6, 7, 8, 15, 16, 17, 24, 25, 26, 27, 27, 27, 28],
    ]);
    g = act(g, 0, { type: "discard", tile: g.players[0]!.hand[0] });
    expect(g.phase).toBe("claiming");
    expect(viewFor(g, 3).actions).toEqual([]);
    expect(viewFor(g, 3).pending).not.toHaveProperty("offers");
    g = act(g, 1, { type: "hu" });
    expect(g.phase).toBe("claiming");
    g = act(g, 2, { type: "hu" });
    expect(g.result!.winners).toEqual([1, 2]);
    expect(g.players[0]!.score).toBe(
      -g.players[1]!.score - g.players[2]!.score,
    );
    expect(g.players[3]!.score).toBe(0);
  });
  it("过水放弃胡牌后记录限制，重复响应拒绝", () => {
    let g = scenario([
      [30],
      [0, 1, 2, 3, 4, 5, 9, 10, 11, 18, 19, 20, 30],
      [0, 1, 2, 3, 4, 5, 12, 13, 14, 21, 22, 23, 30],
      [6, 7, 8, 15, 16, 17, 24, 25, 26, 27, 27, 27, 28],
    ]);
    g = act(g, 0, { type: "discard", tile: g.players[0]!.hand[0] });
    g = act(g, 1, { type: "pass" });
    expect(g.players[1]!.passedHu).toBe(true);
    expect(() => act(g, 1, { type: "hu" })).toThrow();
  });
  it("碰牌从弃牌堆移入副露，碰后不能伪装自摸", () => {
    let g = scenario([
      [30],
      [30, 30, 1, 3, 5, 7, 9, 11, 14, 17, 19, 22, 25],
      [0],
      [2],
    ]);
    const t = g.players[0]!.hand[0];
    g = act(g, 0, { type: "discard", tile: t });
    g = act(g, 1, { type: "pung" });
    expect(g.players[0]!.discards).toEqual([]);
    expect(g.players[1]!.melds[0].tiles).toContain(t);
    expect(g.turn).toBe(1);
    expect(g.canSelfWin).toBe(false);
    expect(() => act(g, 1, { type: "hu" })).toThrow("自摸");
  });
  it("暗杠收取每家 6 分，并从牌尾补牌", () => {
    let g = scenario([
      [0, 0, 0, 0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20],
      [1],
      [3],
      [5],
    ]);
    expect(selfKongs(g, 0)).toContain(0);
    g = act(g, 0, { type: "selfKong", tile: 0 });
    expect(g.players[0]!.melds[0].concealed).toBe(true);
    expect(g.players.map((p) => p!.score)).toEqual([18, -6, -6, -6]);
    expect(g.players[0]!.hand).toHaveLength(11);
    expect(g.replacement!.type).toBe("kong");
    expect(g.roundTransfers).toEqual([1, 2, 3].map(from => ({from, to: 0, amount: 6, reason: "暗杠"})));
  });
  it("补杠可被抢，抢杠成功不收杠分", () => {
    let g = scenario([
      [1],
      [0, 2, 9, 10, 11, 18, 19, 20, 27, 27, 27, 28, 28],
      [30],
      [29],
    ]);
    g.players[0]!.hand = [7];
    g.players[0]!.melds = [
      { type: "pung", tiles: [4, 5, 6], from: 2, concealed: false },
    ];
    g = act(g, 0, { type: "selfKong", tile: 7 });
    expect(g.phase).toBe("claiming");
    expect(g.pending!.kind).toBe("robKong");
    g = act(g, 1, { type: "hu" });
    expect(g.players[0]!.melds[0].type).toBe("pung");
    expect(g.players[0]!.score).toBe(-g.result!.details[1]!.total * 3);
    expect(g.players[2]!.score).toBe(0);
    expect(g.result!.transfers).toEqual([{from: 0, to: 1, amount: g.result!.details[1]!.total * 3, reason: "抢杠包三家"}]);
  });
});
describe("完整对局仿真", () => {
  it("旧版进行中牌局不伪造完整账本，下一局开始记录", () => {
    let g = scenario([
      [0, 1, 2, 9, 10, 11, 18, 19, 20, 27, 27, 27, 28, 28],
      [3], [5], [7],
    ]);
    delete g.roundTransfers;
    g.lastDraw = g.players[0]!.hand.at(-1);
    g = act(g, 0, {type: "hu"});
    expect(g.result!.transfers).toBeUndefined();
    g.players.forEach(p => {p!.ready = true;});
    const next = startRound(g, Date.now(), seededRandom(21));
    expect(Array.isArray(next.roundTransfers)).toBe(true);
    expect(next.roundStartScores).toEqual(g.players.map(p => p!.score));
  });
  it("一局结束后解散不会重复记录该局积分", () => {
    let g = game(31);
    for (let n = 0; n < 600 && ["playing", "claiming"].includes(g.phase); n++) {
      const seat =
        g.phase === "playing"
          ? g.turn
          : seats.find(
              (s) =>
                g.pending!.offers[s] && g.pending!.replies[s] === undefined,
            )!;
      g = act(g, seat, botAction(g, seat)!);
    }
    expect(g.phase).toBe("ended");
    const history = structuredClone(g.history);
    const scores = g.players.map((p) => p!.score);
    const closed = dissolveGame(g);
    expect(closed.phase).toBe("finished");
    expect(closed.history).toEqual(history);
    expect(closed.players.map((p) => p!.score)).toEqual(scores);
  });
  it("100 个洗牌种子都能结束，所有中间状态牌张与积分守恒", () => {
    for (let seed = 1; seed <= 100; seed++) {
      let g = game(seed),
        steps = 0;
      while (["playing", "claiming"].includes(g.phase) && steps++ < 600) {
        const seat =
          g.phase === "playing"
            ? g.turn
            : seats.find(
                (s) =>
                  g.pending!.offers[s] && g.pending!.replies[s] === undefined,
              )!;
        const action = botAction(g, seat);
        expect(action, `seed=${seed}`).not.toBeNull();
        g = act(g, seat, action!, 1000 + steps * 100);
        expect(g.players.reduce((sum, p) => sum + p!.score, 0)).toBe(360);
        expect(physical(g)).toHaveLength(144);
        expect(new Set(physical(g)).size).toBe(144);
        for (const s of seats) {
          const v = viewFor(g, s);
          if (!["ended", "finished"].includes(g.phase))
            for (const other of seats)
              if (other !== s) expect(v.players[other]!.hand).toEqual([]);
        }
      }
      expect(["ended", "finished"]).toContain(g.phase);
      expect(steps).toBeLessThan(600);
      expect(g.history).toHaveLength(1);
      expect(g.result!.deltas.reduce((a, b) => a + b, 0)).toBe(0);
      const ledgerDeltas = [0, 0, 0, 0];
      for (const entry of g.result!.transfers!) {
        expect(entry.amount).toBeGreaterThan(0);
        expect(Number.isInteger(entry.amount)).toBe(true);
        ledgerDeltas[entry.from] -= entry.amount;
        ledgerDeltas[entry.to] += entry.amount;
      }
      expect(ledgerDeltas, `ledger seed=${seed}`).toEqual(g.result!.deltas);
    }
  }, 60000);
});
