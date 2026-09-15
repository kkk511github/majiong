import { describe, it, expect, vi } from "vitest";
import { createWall, secureShuffleRandom, seededRandom } from "../shared/tiles";
import {
  act,
  botAction,
  createGame,
  newPlayer,
  seats,
  startRound,
  viewFor,
} from "../shared/engine";

describe("洗牌与暗牌公平性", () => {
  it("安全随机拒绝超出均匀区间的尾数；默认洗牌不使用Math.random", () => {
    const spy = vi.spyOn(globalThis.crypto, "getRandomValues");
    let calls = 0;
    spy.mockImplementation(((arr: Uint32Array) => {
      arr[0] = calls++ === 0 ? 0xffffffff : 142;
      return arr;
    }) as typeof crypto.getRandomValues);
    try {
      expect(
        (secureShuffleRandom as { index: (n: number) => number }).index(144),
      ).toBe(142);
      expect(calls).toBe(2);
    } finally {
      spy.mockRestore();
    }
    const math = vi.spyOn(Math, "random").mockImplementation(() => {
      throw Error("不允许非安全随机");
    });
    try {
      const wall = createWall();
      expect(wall).toHaveLength(144);
      expect(new Set(wall).size).toBe(144);
    } finally {
      math.mockRestore();
    }
  });
  it("Fisher-Yates依次抽取144到2的均匀整数，非法随机源直接失败", () => {
    const bounds: number[] = [];
    const wall = createWall({
      index: (n) => {
        bounds.push(n);
        return n - 1;
      },
    });
    expect(bounds).toEqual(Array.from({ length: 143 }, (_, i) => 144 - i));
    expect(wall).toEqual(Array.from({ length: 144 }, (_, i) => i));
    expect(() => createWall(() => 1)).toThrow();
    expect(() => createWall({ index: () => -1 })).toThrow();
  });
  it("暗杠牌型和摸牌仅自己可见，事件不泄露暗杠牌；公开查看也拿不到牌墙", () => {
    let g = createGame("123456", "secrecy");
    g.players = seats.map((s) => ({
      ...newPlayer("p" + s, "玩家" + s),
      ready: true,
    }));
    g = startRound(g, 1000, seededRandom(5));
    g.turn = 0;
    g.players[0]!.hand = [0, 1, 2, 3, 8, 16, 24, 32, 40, 48, 56, 64, 72, 80];
    g.canSelfWin = true;
    g = act(g, 0, { type: "selfKong", tile: 0 }, 1001);
    expect(viewFor(g, 0).players[0]!.melds[0].tiles).toEqual([0, 1, 2, 3]);
    for (const seat of [1, 2, 3] as const) {
      const v = viewFor(g, seat);
      expect(v.players[0]!.melds[0].tiles).toEqual([]);
      expect(v.players[0]!.hand).toEqual([]);
      expect(v).not.toHaveProperty("wall");
      expect(v.lastDraw).toBeUndefined();
      expect(v.events.join(" ")).not.toContain("一万");
    }
    expect(g.players[0]!.melds[0].tiles).toHaveLength(4);
    g.phase = "ended";
    expect(viewFor(g, 1).players[0]!.melds[0].tiles).toHaveLength(4);
  });
  it("电脑决策不受对手暗手和牌墙次序影响", () => {
    let g = createGame("123456", "bot");
    g.players = seats.map((s) => ({
      ...newPlayer("p" + s, "玩家" + s),
      ready: true,
    }));
    g = startRound(g, 1000, seededRandom(17));
    const first = botAction(g, g.turn);
    const changed = structuredClone(g);
    changed.wall.reverse();
    changed.players.forEach((p, s) => {
      if (s !== g.turn) p!.hand = [0, 4, 8];
    });
    expect(botAction(changed, g.turn)).toEqual(first);
  });
  it("相同牌墙随机源不会因玩家账号、房主身份或历史分数改变发牌", () => {
    const first = createGame("111111", "first");
    first.players = seats.map((s) => newPlayer("ordinary-" + s, "普通玩家"));
    first.players.forEach((p) => {
      p!.ready = true;
    });
    first.ownerId = "ordinary-0";
    const second = structuredClone(first);
    second.ownerId = "guanli@1";
    second.players.forEach((p, s) => {
      p!.id = "admin-test-" + s;
      p!.score = s * 10000 - 5000;
    });
    const a = startRound(first, 1000, seededRandom(31415));
    const b = startRound(second, 1000, seededRandom(31415));
    expect(b.wall).toEqual(a.wall);
    expect(b.players.map((p) => p!.hand)).toEqual(
      a.players.map((p) => p!.hand),
    );
    expect(b.players.map((p) => p!.flowers)).toEqual(
      a.players.map((p) => p!.flowers),
    );
  });
});
