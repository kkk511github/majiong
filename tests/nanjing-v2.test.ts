import { armGlobalAnchor, globalLiability, recordGlobalAnchor } from "../shared/reference-rules";
import { describe, expect, it } from "vitest";
import {
  act,
  botAction,
  createGame,
  newPlayer,
  normalizeRules,
  seats,
  selfKongs,
  startRound,
  viewFor,
} from "../shared/engine";
import {
  DEFAULT_NEW_RULES,
  newGameRules,
  ruleDefaults,
} from "../shared/nanjing-rules";
import { scoreHand } from "../shared/scoring";
import { settlementRows } from "../shared/settlement";
import { structuralWaits, threeMouths } from "../shared/scoring-nanjing";
import { createWall, kind, seededRandom } from "../shared/tiles";
import { listeningHints } from "../src/listening-hints";
import { ruleSections } from "../src/rule-copy";
import type { Game, Player, Rules, Seat } from "../shared/types";
import { lastWallAction, lastWallGame, LAST_WIN_TILE, takeLastWallDraw } from "./fixtures/last-wall";

const garden = ruleDefaults("nj-garden-v2"),
  open = ruleDefaults("nj-open-v2");
function makeTiles(kinds: number[]) {
  const used = new Map<number, number>();
  return kinds.map((k) => {
    const n = used.get(k) ?? 0;
    used.set(k, n + 1);
    if (n >= 4) throw Error("fifth copy");
    return k * 4 + n;
  });
}
function hand(kinds: number[], flowers = 1) {
  const p = newPlayer("p", "牌友");
  p.hand = makeTiles(kinds);
  p.flowers = [124, 128, 132, 136].slice(0, flowers);
  return p;
}
function fixture(hands: number[][], rules: Partial<Rules> = {}): Game {
  const g = createGame(
    "123456",
    "v2",
    newGameRules({ id: "nj-garden-v2", twoBankrupt: false, ...rules }),
  );
  const used = new Map<number, number>();
  g.players = seats.map((s) => {
    const p = newPlayer(`p${s}`, `牌友${s}`);
    p.hand = (hands[s] ?? []).map((k) => {
      const n = used.get(k) ?? 0;
      if (n >= 4) throw Error("fifth copy");
      used.set(k, n + 1);
      return k * 4 + n;
    });
    p.score = 10000;
    return p;
  });
  g.phase = "playing";
  g.round = 1;
  g.turn = 0;
  g.canSelfWin = true;
  g.lastDraw = g.players[0]!.hand.at(-1);
  g.wall = createWall(seededRandom(81)).filter(
    (t) => !g.players.some((p) => p!.hand.includes(t)),
  );
  g.roundStartScores = [10000, 10000, 10000, 10000];
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
function pendingDone(
  g: Game,
  claims: Partial<Record<Seat, "hu" | "pung" | "kong" | "pass">> = {},
) {
  for (const s of seats)
    if (
      g.phase === "claiming" &&
      g.pending?.offers[s] &&
      g.pending.replies[s] === undefined
    )
      g = act(g, s, { type: claims[s] ?? "pass" }, 1000);
  return g;
}
function ledger(g: Game) {
  const delta = [0, 0, 0, 0];
  const external = [0, 0, 0, 0];
  for (const t of g.roundTransfers ?? []) {
    expect(t.amount).toBeGreaterThan(0);
    expect(Number.isSafeInteger(t.amount)).toBe(true);
    const account = t.scope === "external" ? external : delta;
    account[t.from] -= t.amount;
    account[t.to] += t.amount;
  }
  expect(g.players.map((p, i) => p!.score - g.roundStartScores[i])).toEqual(
    delta,
  );
  expect(
    g.players.map(
      (p, i) =>
        (p!.externalScore ?? 0) - (g.roundStartExternalScores?.[i] ?? 0),
    ),
  ).toEqual(external);
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

describe("荔枝南京计分档案", () => {
  it("默认进园子、开桌可选敞开头，旧桌版本保持", () => {
    expect(normalizeRules(newGameRules()).id).toBe("nj-garden-b-v3");
    expect(normalizeRules(newGameRules({ id: undefined })).id).toBe(
      "nj-garden-b-v3",
    );
    expect(normalizeRules(newGameRules()).turnSeconds).toBe(10);
    expect(normalizeRules(newGameRules()).twoBankrupt).toBe(true);
    expect(normalizeRules(newGameRules({ id: "nj-open-v2" })).twoBankrupt).toBe(
      false,
    );
    expect(
      normalizeRules(newGameRules({ id: "nj-open-v2" })).protectWinner,
    ).toBe(false);
    expect(normalizeRules({ id: "nj-casual-v1" }).id).toBe("nj-casual-v1");
    expect(() => normalizeRules({ id: "fake" as Rules["id"] })).toThrow();
    expect(ruleSections().flat().join(" ")).toContain("成牌 10");
    expect(ruleSections(open).flat().join(" ")).toContain("成牌 20");
  });
  it.each([
    [garden, 10, 10, 20],
    [open, 20, 20, 40],
  ] as const)(
    "门清基础分、无花果独立计分 %j",
    (rules, base, closed, noFlower) => {
      const p = hand([0, 1, 2, 3, 4, 5, 9, 10, 11, 18, 19, 20, 30, 30]);
      expect(scoreHand(p, rules)?.total).toBe(base + closed + 2 + 2);
      p.flowers = [];
      expect(scoreHand(p, rules)?.total).toBe(base + closed + noFlower + 2);
    },
  );
  it.each([0, 1, 2, 3])("七对含 %i 组四张的分值与门清互斥", (quads) => {
    const kinds: number[] = [];
    for (let i = 0; i < quads; i++) kinds.push(i * 9, i * 9, i * 9, i * 9);
    const rest = [3, 12, 21, 27, 28, 29, 30];
    for (let i = 0; kinds.length < 14; i++) kinds.push(rest[i], rest[i]);
    const p = hand(kinds);
    for (const [rules, amount] of [
      [garden, [30, 80, 120, 160][quads]],
      [open, [80, 160, 240, 320][quads]],
    ] as const) {
      const s = scoreHand(p, rules)!;
      expect(s.total).toBe((rules === garden ? 10 : 20) + amount + 2);
      expect(s.items.some((i) => i.label === "门清")).toBe(false);
    }
  });
  it("花砸2只翻硬软花；比下胡翻整份，大杠开花按房型计算", () => {
    const p = hand([0, 1, 2, 3, 4, 5, 9, 10, 11, 18, 19, 20, 30, 30], 2);
    expect(scoreHand(p, { ...garden, flowerDouble: false })?.total).toBe(23);
    expect(scoreHand(p, garden)?.total).toBe(26);
    expect(scoreHand(p, garden, { multiplier: 2 })?.total).toBe(52);
    expect(scoreHand(p, garden, { replacement: "flower" })?.total).toBe(36);
    expect(
      scoreHand(p, garden, { replacement: "kong", multiplier: 2 })?.total,
    ).toBe(92);
    expect(
      scoreHand(p, open, { replacement: "kong", multiplier: 2 })?.total,
    ).toBe(184);
    expect(() => scoreHand(p, garden, { multiplier: Infinity })).toThrow();
  });
  it("直杠仍门清，碰后补杠开门；杠软花单独计算", () => {
    const p = hand([0, 1, 2, 9, 10, 11, 18, 19, 20, 28, 28], 4);
    p.melds = [
      { type: "kong", tiles: [108, 109, 110, 111], from: 1, concealed: false },
    ];
    expect(scoreHand(p, garden)?.items).toContainEqual({
      label: "门清",
      value: 10,
    });
    expect(scoreHand(p, garden)?.items).toContainEqual({
      label: "软花 3 × 2",
      value: 6,
    });
    p.melds[0].added = true;
    expect(scoreHand(p, garden)?.items.some((i) => i.label === "门清")).toBe(
      false,
    );
    p.melds[0].concealed = true;
    expect(scoreHand(p, garden)?.items).toContainEqual({
      label: "软花 4 × 2",
      value: 8,
    });
  });
  it("开门小胡四硬花门槛、压绝大胡无花资格与公开听牌提示一致", () => {
    const p = hand([0, 2, 9, 10, 11, 18, 19, 20, 28, 28], 0);
    p.melds = [
      { type: "pung", tiles: [108, 109, 110], from: 1, concealed: false },
    ];
    expect(scoreHand(p, garden, { tile: 4 })).toBeNull();
    const s = scoreHand(p, garden, { tile: 4, visiblePungs: [1] })!;
    expect(s.total).toBe(54);
    expect(s.items.some((i) => i.label === "压档")).toBe(false);
    const publicP = { ...p, handCount: p.hand.length };
    expect(listeningHints(publicP, garden)).not.toContain(1);
    expect(
      listeningHints(publicP, garden, undefined, [
        {
          melds: [
            { type: "pung", tiles: [5, 6, 7], from: 2, concealed: false },
          ],
        },
      ]),
    ).toContain(1);
    p.flowers = [124, 128, 132, 136];
    expect(scoreHand(p, garden, { tile: 4 })).not.toBeNull();
  });
  it("全球独钓不再重复计独占，三种花色和字牌不误判清一色", () => {
    const p = hand([30, 30]);
    p.melds = [0, 9, 18, 27].map((k, i) => ({
      type: "pung",
      tiles: [k * 4, k * 4 + 1, k * 4 + 2],
      from: ((i % 3) + 1) as Seat,
      concealed: false,
    }));
    const s = scoreHand(p, garden, { winTile: 121 })!;
    expect(s.items).toContainEqual({ label: "全球独钓", value: 30 });
    expect(
      s.items.some((i) => ["独占", "清一色", "混一色"].includes(i.label)),
    ).toBe(false);
  });
  it.each([
    ["混一色", [0, 1, 2, 3, 4, 5, 6, 7, 8, 27, 27, 27, 28, 28], 20, 40],
    ["清一色", [0, 1, 2, 0, 1, 2, 3, 4, 5, 6, 7, 8, 4, 4], 30, 60],
    ["对对胡", [0, 0, 0, 9, 9, 9, 18, 18, 18, 27, 27, 27, 28, 28], 20, 40],
  ] as const)("两套牌型分值 %s", (label, kinds, a, b) => {
    for (const [rules, value] of [
      [garden, a],
      [open, b],
    ] as const) {
      const score = scoreHand(hand([...kinds]), rules)!;
      expect(score.items).toContainEqual({ label, value });
      expect(score.items.reduce((n, i) => n + i.value, 0)).toBe(score.total);
      if (label === "清一色")
        expect(score.items.some((i) => i.label === "混一色")).toBe(false);
    }
  });
  it("海底捞月只加20，关闭或点炮不计；地胡另加30", () => {
    const p = hand([0, 1, 2, 3, 4, 5, 9, 10, 11, 18, 19, 20, 30, 30]);
    const base = scoreHand(p, garden)!.total;
    expect(scoreHand(p, garden, { seaBottom: true })!.total).toBe(base + 20);
    expect(
      scoreHand(p, { ...garden, seaBottom: false }, { seaBottom: true })!.total,
    ).toBe(base);
    expect(scoreHand(p, garden, { earthly: true })!.total).toBe(base + 30);
    const tile = p.hand.pop()!;
    expect(
      scoreHand(p, garden, { seaBottom: true, tile })!.items.some(
        (i) => i.label === "海底捞月",
      ),
    ).toBe(false);
  });
  it("不允许用第五张牌当作听口，也不接受花牌成牌", () => {
    const p = hand([0, 2, 9, 10, 11, 18, 19, 20, 28, 28]);
    p.melds = [
      { type: "kong", tiles: [4, 5, 6, 7], from: 1, concealed: false },
    ];
    expect(scoreHand(p, garden, { tile: 4 })).toBeNull();
    expect(structuralWaits(p)).not.toContain(1);
    expect(scoreHand(p, garden, { tile: 124 })).toBeNull();
  });
});

describe("不能胡已归零的供牌者", () => {
  const waiting = [0, 1, 2, 3, 4, 5, 9, 10, 11, 18, 19, 20, 30];
  function discardGame(id: Rules["id"] = "nj-garden-v2", balance = 0) {
    const g = fixture([[30], waiting, [], []], {
      id,
      twoBankrupt: id !== "nj-open-v2",
    });
    g.players[0]!.score = balance;
    g.roundStartScores[0] = balance;
    return g;
  }
  it.each(["nj-garden-v2", "nj-garden-b-v3"] as const)(
    "%s 零分出牌不提供胡牌，正分仍可点胡",
    (id) => {
      for (const balance of [0, 1]) {
        const g = discardGame(id, balance);
        const after = act(
          g,
          0,
          { type: "discard", tile: g.players[0]!.hand[0] },
          1000,
        );
        expect(viewFor(after, 1).actions.includes("hu")).toBe(balance > 0);
        if (balance === 0) {
          expect(after.phase).toBe("playing");
          expect(after.turn).toBe(1);
          expect(after.result).toBeUndefined();
        } else {
          const ended = pendingDone(after, { 1: "hu" });
          expect(ended.result!.winners).toEqual([1]);
          expect(ended.roundTransfers).toContainEqual({
            from: 0,
            to: 1,
            amount: 1,
            reason: "点炮",
          });
        }
      }
    },
  );
  it("实际记录的点炮牌型：出牌者零分时不能再产生零转分胡牌", () => {
    const g = fixture([[], [], [], []], { twoBankrupt: true });
    g.players[0]!.hand = [95];
    g.players[1]!.hand = [10, 12, 15, 16, 19, 22, 44, 47, 81, 84, 90, 93, 94];
    g.players[1]!.flowers = [136, 141, 128, 135, 137];
    g.players.forEach((p, i) => (p!.score = [0, 102, 168, 90][i]));
    g.roundStartScores = [0, 102, 168, 90];
    g.ruleState!.multiplier = 2;
    g.wall = g.wall.filter(
      (t) =>
        !g.players.some((p) => p!.hand.includes(t) || p!.flowers.includes(t)),
    );
    expect(scoreHand(g.players[1]!, g.rules, { tile: 95 })).not.toBeNull();
    const after = act(g, 0, { type: "discard", tile: 95 }, 1000);
    expect(after.pending!.offers[1]).toEqual(["pung", "pass"]);
    expect(viewFor(after, 1).actions).not.toContain("hu");
    expect(() => act(after, 1, { type: "hu" }, 1001)).toThrow();
    const continued = pendingDone(after);
    expect(continued.phase).toBe("playing");
    expect(continued.result).toBeUndefined();
    expect(continued.players.map((p) => p!.score)).toEqual([0, 102, 168, 90]);
    expect(continued.players[1]!.passedHu).toBe(false);
  });
  it("零分供牌仍可碰、直杠", () => {
    const g = fixture([[30], [30, 30, 30], [], []], { twoBankrupt: true });
    g.players[0]!.score = 0;
    const after = act(
      g,
      0,
      { type: "discard", tile: g.players[0]!.hand[0] },
      1000,
    );
    expect(viewFor(after, 1).actions).toEqual(["kong", "pung", "pass"]);
    expect(
      act(after, 1, { type: "pung" }, 1001).players[1]!.melds[0].type,
    ).toBe("pung");
    expect(
      act(after, 1, { type: "kong" }, 1001).players[1]!.melds[0].type,
    ).toBe("kong");
  });
  it("旧待操作状态隐藏胡按钮、拒绝胡请求，过牌不记过水", () => {
    const g = discardGame("nj-garden-v2", 10);
    const pending = act(
      g,
      0,
      { type: "discard", tile: g.players[0]!.hand[0] },
      1000,
    );
    pending.players[0]!.score = 0;
    expect(viewFor(pending, 1).actions).toEqual(["pass"]);
    expect(botAction(pending, 1)).toEqual({ type: "pass" });
    expect(() => act(pending, 1, { type: "hu" }, 1001)).toThrow(
      "不能胡桌内余额已归零的玩家",
    );
    expect(pending.pending!.replies).toEqual({});
    const continued = act(pending, 1, { type: "pass" }, 1001);
    expect(continued.players[1]!.passedHu).toBe(false);
    expect(continued.result).toBeUndefined();
  });
  it("旧状态已收到的非法胡回复不会在其他人过牌后结算", () => {
    const g = discardGame("nj-garden-v2", 10);
    const pending = act(
      g,
      0,
      { type: "discard", tile: g.players[0]!.hand[0] },
      1000,
    );
    pending.players[0]!.score = 0;
    pending.pending!.replies[1] = "hu";
    pending.pending!.offers[2] = ["pass"];
    const continued = act(pending, 2, { type: "pass" }, 1001);
    expect(continued.phase).toBe("playing");
    expect(continued.result).toBeUndefined();
  });
  it.each([0, 100])("补杠者余额 %i：零分不能抢杠，正分仍可抢杠", (balance) => {
    const g = fixture([[3], [1, 2, 6, 6], [], []], { twoBankrupt: true });
    g.players[0]!.score = balance;
    g.players[0]!.melds = [
      { type: "pung", tiles: [13, 14, 15], from: 2, concealed: false },
    ];
    g.players[1]!.melds = [9, 18, 27].map((k, i) => ({
      type: "pung",
      tiles: [k * 4, k * 4 + 1, k * 4 + 2],
      from: (i % 2 === 0 ? 2 : 3) as Seat,
      concealed: false,
    }));
    g.players[1]!.flowers = [124, 128, 132, 136];
    const held = new Set(
      g.players.flatMap((p) => [
        ...p!.hand,
        ...p!.flowers,
        ...p!.melds.flatMap((m) => m.tiles),
      ]),
    );
    g.wall = g.wall.filter((t) => !held.has(t));
    const after = act(g, 0, { type: "selfKong", tile: 12 }, 1000);
    expect(viewFor(after, 1).actions.includes("hu")).toBe(balance > 0);
    if (balance === 0) expect(after.players[0]!.melds[0].type).toBe("kong");
    else expect(pendingDone(after, { 1: "hu" }).result!.winners).toEqual([1]);
  });
  it.each([0, -10])("敞开头出牌者余额 %i 仍可被点胡", (balance) => {
    const g = discardGame("nj-open-v2", balance);
    const after = act(
      g,
      0,
      { type: "discard", tile: g.players[0]!.hand[0] },
      1000,
    );
    expect(viewFor(after, 1).actions).toContain("hu");
    expect(pendingDone(after, { 1: "hu" }).players[0]!.score).toBeLessThan(
      balance,
    );
  });
  it("零分玩家可点胡有余额的人，也可自摸", () => {
    const g = discardGame("nj-garden-b-v3", 100);
    g.players[1]!.score = 0;
    const after = act(
      g,
      0,
      { type: "discard", tile: g.players[0]!.hand[0] },
      1000,
    );
    expect(pendingDone(after, { 1: "hu" }).players[1]!.score).toBeGreaterThan(
      0,
    );
    const self = fixture([[...waiting, 30], [], [], []], {
      id: "nj-garden-b-v3",
      twoBankrupt: true,
    });
    self.players[0]!.score = 0;
    expect(viewFor(self, 0).actions).toContain("hu");
    expect(
      act(self, 0, { type: "hu" }, 1000).players[0]!.score,
    ).toBeGreaterThan(0);
  });
});

describe("南京特殊牌局状态", () => {
  it.each(["nj-garden-v2", "nj-garden-b-v3"] as const)(
    "用户保米牌例 %s：甲16、乙0、丙8、丁336；丙胡甲后丁补76",
    (id) => {
      let g = fixture(
        [[30], [], [0, 1, 2, 3, 4, 5, 9, 10, 11, 18, 19, 20, 30], []],
        { id, twoBankrupt: true, protectWinner: true },
      );
      g.players.forEach((p, i) => (p!.score = [16, 0, 8, 336][i]));
      g.roundStartScores = [16, 0, 8, 336];
      g.settlementBase = 100;
      g = act(g, 0, { type: "discard", tile: g.players[0]!.hand[0] });
      g = pendingDone(g, { 2: "hu" });
      expect(g.phase).toBe("finished");
      expect(g.players.map((p) => p!.score)).toEqual([0, 0, 100, 260]);
      expect(g.roundTransfers).toEqual([
        { from: 0, to: 2, amount: 16, reason: "点炮" },
        { from: 3, to: 2, amount: 76, reason: "保米" },
      ]);
      expect(g.result!.deltas).toEqual([-16, 0, 92, -76]);
      expect(settlementRows(g.history[0]).find(row => row.seat === 2)).toMatchObject({ net: 0, recorded: 0 });
      ledger(g);
    },
  );
  it("图示规则：同家前三碰后普通顺子单钓不触发外包", () => {
    let g = fixture([[0, 1, 2, 30, 30], [], [], []]);
    g.players[0]!.melds = [9, 18, 27].map((k) => ({
      type: "pung",
      tiles: [k * 4, k * 4 + 1, k * 4 + 2],
      from: 1,
      concealed: false,
    }));
    g.players[0]!.flowers = [124, 128, 132, 136];
    g = act(g, 0, { type: "hu" });
    expect(g.roundTransfers).toEqual(
      [1, 2, 3].map((from) => ({
        from,
        to: 0,
        amount: g.result!.details[0]!.total,
        reason: "自摸",
      })),
    );
    ledger(g);
  });
  it.each(
    [garden, open].flatMap((rules) =>
      seats.map((rotation) => ({ rules, rotation })),
    ),
  )(
    "图示优先：丙顺子单钓抢丁补杠，不向甲收三嘴外包 $rules.id / 座位 $rotation",
    ({ rules, rotation }) => {
      const [jia, yi, bing, ding] = seats.map(
        (s) => ((s + rotation) % 4) as Seat,
      );
      const hands: number[][] = [[], [], [], []];
      hands[bing] = [1, 2, 6, 6];
      hands[ding] = [3, 4, 4, 5, 7, 8, 10, 12, 14, 16, 19];
      let g = fixture(hands, {
        ...rules,
        twoBankrupt: false,
        protectWinner: false,
      });
      [jia, yi, bing, ding].forEach(
        (s, i) => (g.players[s]!.name = ["甲", "乙", "丙", "丁"][i]),
      );
      g.players[bing]!.melds = [9, 18, 27].map((k) => ({
        type: "pung",
        tiles: [k * 4, k * 4 + 1, k * 4 + 2],
        from: jia,
        concealed: false,
      }));
      g.players[bing]!.flowers = [124, 128, 132, 136];
      g.players[ding]!.melds = [
        { type: "pung", tiles: [13, 14, 15], from: yi, concealed: false },
      ];
      g.wall = createWall(seededRandom(81)).filter(
        (t) =>
          !g.players.some(
            (p) =>
              p &&
              [
                ...p.hand,
                ...p.flowers,
                ...p.melds.flatMap((m) => m.tiles),
              ].includes(t),
          ),
      );
      g.turn = ding;
      g.lastDraw = 12;
      g.replay = {
        version: 1,
        id: `${g.id}-${g.round}`,
        code: g.code,
        round: g.round,
        startedAt: 0,
        names: g.players.map((p) => p!.name),
        frames: [],
      };
      expect(structuralWaits(g.players[bing]!)).toEqual([0, 3]);
      expect(physical(g)).toHaveLength(144);
      expect(new Set(physical(g)).size).toBe(144);
      g = act(g, ding, { type: "selfKong", tile: 12 }, 100);
      expect(g.pending?.kind).toBe("robKong");
      expect(viewFor(g, bing).actions).toContain("hu");
      expect(g.roundTransfers).toEqual([]);
      g = pendingDone(g, { [bing]: "hu" });
      expect(g.result?.winners).toEqual([bing]);
      expect(g.result?.from).toBe(ding);
      expect(g.result?.winningTile).toBe(12);
      expect(g.result!.details[bing]!.snapshot).toBeUndefined();
      expect(g.roundTransfers).toEqual([
        {
          from: ding,
          to: bing,
          amount: g.result!.details[bing]!.total * 3,
          reason: "抢杠包三家",
        },
      ]);
      expect(g.players[yi]!.score).toBe(10000);
      expect(g.players[ding]!.score).toBe(
        10000 - g.result!.details[bing]!.total * 3,
      );
      expect(g.players[ding]!.melds[0].type).toBe("pung");
      expect(g.players[ding]!.melds[0].tiles).toEqual([13, 14, 15]);
      expect(g.history.at(-1)!.result.transfers).toEqual(g.roundTransfers);
      expect(g.replay!.frames.at(-1)!.result?.transfers).toEqual(
        g.roundTransfers,
      );
      expect(new Set(physical(g)).size).toBe(144);
      ledger(g);
    },
  );
  it("天胡收三家可用余额并结束；快照与天听状态不泄漏", () => {
    let g = fixture([
      [0, 1, 2, 3, 4, 5, 9, 10, 11, 18, 19, 20, 30, 30],
      [],
      [],
      [],
    ]);
    g.ruleState!.heavenlyEligible = true;
    g.ruleState!.heavenlyWaits[1] = [3, 5];
    expect(viewFor(g, 0)).not.toHaveProperty("ruleState");
    expect(viewFor(g, 0).earthlyWaits).toEqual([]);
    expect(viewFor(g, 1).earthlyWaits).toEqual([3, 5]);
    g = act(g, 0, { type: "hu" }, 1234);
    expect(g.phase).toBe("finished");
    expect(g.players.map((p) => p!.score)).toEqual([40000, 0, 0, 0]);
    expect(g.result!.details[0]!.total).toBe(30000);
    ledger(g);
  });
  it("普通胡牌结束记录规则快照，比下胡多个条件只触发一次", () => {
    let g = fixture([
      [0, 0, 0, 1, 1, 1, 9, 9, 9, 27, 27, 27, 28, 28],
      [],
      [],
      [],
    ]);
    g = act(g, 0, { type: "hu" }, 1000);
    expect(g.ruleState!.nextMultiplier).toBe(2);
    expect(g.ruleState!.keepDealer).toBe(true);
    expect(g.history[0].rules).toEqual(g.rules);
    expect(g.history[0].multiplier).toBe(1);
    g.players.forEach((p) => (p!.ready = true));
    g = startRound(g, 2000, seededRandom(19));
    expect(g.dealer).toBe(0);
    expect(g.ruleState!.multiplier).toBe(2);
    expect(g.replay!.rules).toEqual(g.rules);
    expect(g.replay!.multiplier).toBe(2);
    expect(viewFor(g, 1).roundMultiplier).toBe(2);
    g.rules.biXiaHu = "off";
    expect(g.history[0].rules!.biXiaHu).toBe("next");
  });
  it("下一位庄家胡牌才触发接庄比，接庄比独立于连庄", () => {
    let g = fixture([
      [30],
      [0, 1, 2, 3, 4, 5, 9, 10, 11, 18, 19, 20, 30],
      [],
      [],
    ]);
    g.players[1]!.flowers = [124];
    g = act(g, 0, { type: "discard", tile: g.players[0]!.hand[0] }, 1000);
    g = pendingDone(g, { 1: "hu" });
    expect(g.ruleState!.keepDealer).toBe(false);
    expect(g.ruleState!.nextReasons).toEqual(["接庄"]);
    g.players.forEach((p) => (p!.ready = true));
    g = startRound(g, 2000, seededRandom(3));
    expect(g.dealer).toBe(1);
    expect(g.ruleState!.multiplier).toBe(2);
  });
  it.each([2, 3] as const)("座位%s普通胡牌不触发下一位庄家的接庄比", (winner) => {
    const hands = [[30], [], [], []];
    hands[winner] = [0, 1, 2, 3, 4, 5, 9, 10, 11, 18, 19, 20, 30];
    let g = fixture(hands, { id: "nj-garden-b-v3" });
    g.players[winner]!.flowers = [124];
    g = act(g, 0, { type: "discard", tile: g.players[0]!.hand[0] }, 1000);
    g = pendingDone(g, { [winner]: "hu" });
    expect(g.result!.winners).toEqual([winner]);
    expect(g.ruleState!.keepDealer).toBe(false);
    expect(g.ruleState!.nextReasons).toEqual([]);
    expect(g.ruleState!.nextMultiplier).toBe(1);
    g.players.forEach((p) => (p!.ready = true));
    g = startRound(g, 2000, seededRandom(3));
    expect(g.dealer).toBe(1);
    expect(g.ruleState!.multiplier).toBe(1);
  });
  it.each([
    ["next", 2],
    ["off", 1],
  ] as const)("闲家大胡仍轮到下一家坐庄，比下胡配置为%s", (biXiaHu, multiplier) => {
    let g = fixture(
      [[], [], [0, 0, 0, 9, 9, 9, 18, 18, 18, 27, 27, 27, 28, 28], []],
      { id: "nj-garden-b-v3", biXiaHu },
    );
    g.turn = 2;
    g.lastDraw = g.players[2]!.hand.at(-1);
    g = act(g, 2, { type: "hu" }, 1000);
    expect(g.result!.winners).toEqual([2]);
    expect(g.result!.details[2]!.major).toBe(true);
    expect(g.ruleState!.keepDealer).toBe(false);
    expect(g.ruleState!.nextReasons).toContain("大胡");
    g.players.forEach((p) => (p!.ready = true));
    g = startRound(g, 2000, seededRandom(3));
    expect(g.dealer).toBe(1);
    expect(g.ruleState!.multiplier).toBe(multiplier);
  });
  it.each(["花杠", "四张同牌", "四家跟牌", "四连风"])(
    "本把发生%s后闲家普通胡牌，只翻倍不连庄",
    (reason) => {
      let g = fixture(
        [[30], [], [0, 1, 2, 3, 4, 5, 9, 10, 11, 18, 19, 20, 30], []],
        { id: "nj-garden-b-v3" },
      );
      g.players[2]!.flowers = [124];
      g.ruleState!.nextReasons = [reason];
      g = act(g, 0, { type: "discard", tile: g.players[0]!.hand[0] }, 1000);
      g = pendingDone(g, { 2: "hu" });
      expect(g.result!.winners).toEqual([2]);
      expect(g.result!.details[2]!.major).toBe(false);
      expect(g.ruleState!.nextReasons).toEqual([reason]);
      expect(g.ruleState!.keepDealer).toBe(false);
      g.players.forEach((p) => (p!.ready = true));
      g = startRound(g, 2000, seededRandom(3));
      expect(g.dealer).toBe(1);
      expect(g.ruleState!.multiplier).toBe(2);
    },
  );
  it("恢复旧快照时，闲家大胡留下的旧连庄标记不阻止正常轮庄", () => {
    let g = fixture(
      [[], [], [0, 0, 0, 9, 9, 9, 18, 18, 18, 27, 27, 27, 28, 28], []],
      { id: "nj-garden-b-v3" },
    );
    g.turn = 2;
    g.lastDraw = g.players[2]!.hand.at(-1);
    g = act(g, 2, { type: "hu" }, 1000);
    expect(g.result!.details[2]!.major).toBe(true);
    g.ruleState!.keepDealer = true;
    g = JSON.parse(JSON.stringify(g)) as Game;
    g.players.forEach((p) => (p!.ready = true));
    g = startRound(g, 2000, seededRandom(3));
    expect(g.dealer).toBe(1);
    expect(g.ruleState!.multiplier).toBe(2);
  });
  it.each([
    ["next", 2],
    ["off", 1],
  ] as const)("庄家普通胡牌仍连庄，比下胡配置为%s", (biXiaHu, multiplier) => {
    let g = fixture(
      [[0, 1, 2, 3, 4, 5, 9, 10, 11, 18, 19, 20, 30, 30], [], [], []],
      { id: "nj-garden-b-v3", biXiaHu },
    );
    g.players[0]!.flowers = [124];
    g = act(g, 0, { type: "hu" }, 1000);
    expect(g.result!.details[0]!.major).toBe(false);
    expect(g.ruleState!.keepDealer).toBe(true);
    g.players.forEach((p) => (p!.ready = true));
    g = startRound(g, 2000, seededRandom(3));
    expect(g.dealer).toBe(0);
    expect(g.ruleState!.multiplier).toBe(multiplier);
  });
  it("末位庄家下一位胡牌，回环到首位接庄并翻倍", () => {
    let g = fixture(
      [[0, 1, 2, 3, 4, 5, 9, 10, 11, 18, 19, 20, 30], [], [], [30]],
      { id: "nj-garden-b-v3" },
    );
    g.dealer = 3;
    g.turn = 3;
    g.lastDraw = g.players[3]!.hand[0];
    g.players[0]!.flowers = [124];
    g = act(g, 3, { type: "discard", tile: g.players[3]!.hand[0] }, 1000);
    g = pendingDone(g, { 0: "hu" });
    expect(g.ruleState!.keepDealer).toBe(false);
    expect(g.ruleState!.nextReasons).toEqual(["接庄"]);
    g.players.forEach((p) => (p!.ready = true));
    g = startRound(g, 2000, seededRandom(3));
    expect(g.dealer).toBe(0);
    expect(g.ruleState!.multiplier).toBe(2);
  });
  it("连续比下胡默认保持2倍，不重复翻成4倍；关闭时下一把1倍", () => {
    for (const [mode, expected] of [
      ["next", 2],
      ["off", 1],
      ["cumulative", 4],
    ] as const) {
      let g = fixture(
        [[0, 0, 0, 1, 1, 1, 9, 9, 9, 27, 27, 27, 28, 28], [], [], []],
        { biXiaHu: mode },
      );
      g.ruleState!.multiplier = 2;
      g.ruleState!.nextReasons = ["花杠", "四张同牌"];
      g = act(g, 0, { type: "hu" });
      expect(g.ruleState!.nextMultiplier).toBe(expected);
    }
  });
  it("流局触发下一把比下胡并保留庄家", () => {
    let g = fixture([[5], [], [], []]);
    g.wall = [];
    g = act(g, 0, { type: "discard", tile: g.players[0]!.hand[0] });
    expect(g.result!.reason).toBe("draw");
    expect(g.ruleState!.nextMultiplier).toBe(2);
    expect(g.ruleState!.keepDealer).toBe(true);
    g.players.forEach((p) => (p!.ready = true));
    g = startRound(g, 2000, seededRandom(3));
    expect(g.dealer).toBe(0);
    expect(g.ruleState!.multiplier).toBe(2);
  });
  it("天听换听失效，天听可胡地胡但不能通过碰牌保留", () => {
    let g = fixture([
      [0, 1, 2, 3, 4, 5, 9, 10, 11, 18, 19, 20, 30, 30],
      [],
      [],
      [],
    ]);
    g.turn = 0;
    g.dealer = 1;
    g.ruleState!.heavenlyWaits[0] = [30];
    expect(act(g, 0, { type: "hu" }).result!.details[0]!.items).toContainEqual({
      label: "地胡",
      value: 30,
    });
    g = act(g, 0, { type: "discard", tile: 0 });
    expect(g.ruleState!.heavenlyWaits[0]).toBeUndefined();
  });
  it("天听杠牌只允许保持或缩小听口，补牌仍由当前人摸", () => {
    let g = fixture([
      [0, 0, 0, 0, 9, 10, 11, 18, 19, 20, 27, 27, 27, 28],
      [],
      [],
      [],
    ]);
    g.ruleState!.heavenlyWaits[0] = [28];
    expect(selfKongs(g, 0)).toContain(0);
    g.ruleState!.heavenlyWaits[0] = [1];
    expect(selfKongs(g, 0)).not.toContain(0);
    g.ruleState!.heavenlyWaits[0] = [28];
    g = act(g, 0, { type: "selfKong", tile: 0 });
    expect(g.turn).toBe(0);
    expect(g.ruleState!.heavenlyWaits[0]).toEqual([28]);
  });
  it("三口快照剩两张不成对也能主动胡，原弃牌不重复", () => {
    let g = fixture([[27], [27, 27, 5, 14], [], []]);
    g.players[1]!.melds = [0, 9, 18].map((k) => ({
      type: "pung",
      tiles: [k * 4, k * 4 + 1, k * 4 + 2],
      from: 2,
      concealed: false,
    }));
    const t = g.players[0]!.hand[0];
    g = act(g, 0, { type: "discard", tile: t });
    const v = viewFor(g, 1);
    expect(
      listeningHints(v.players[1]!, v.rules, undefined, v.players, { seat: 1 }),
    ).toContain(27);
    expect(viewFor(g, 1).actions).toContain("hu");
    g = pendingDone(g, { 1: "hu" });
    expect(g.result!.details[1]!.snapshot).toBe(true);
    expect(g.result!.details[1]!.items).toContainEqual({
      label: "软花 1 × 2",
      value: 2,
    });
    expect(
      g.roundTransfers!.filter((t) => t.reason === "三口承包"),
    ).toHaveLength(1);
    expect(g.players[0]!.discards).toContain(t);
    expect(g.players[1]!.hand).not.toContain(t);
    ledger(g);
  });
  it("图示三清快照只允许被碰的第四嘴，顺子不能忽略余牌", () => {
    let g = fixture([[5], [3, 4, 9, 18], [], []]);
    g.players[1]!.melds = [0, 1, 2].map((k, i) => ({
      type: "pung",
      tiles: [k * 4, k * 4 + 1, k * 4 + 2],
      from: ([0, 2, 3] as Seat[])[i],
      concealed: false,
    }));
    g = act(g, 0, { type: "discard", tile: g.players[0]!.hand[0] });
    const v = viewFor(g, 1);
    expect(
      listeningHints(v.players[1]!, v.rules, undefined, v.players, { seat: 1 }),
    ).not.toContain(5);
    expect(v.actions).not.toContain("hu");
  });
  it("一炮双响余额不足按比例分配，零头分配确定且不为负", () => {
    let g = fixture(
      [
        [30],
        [0, 1, 2, 3, 4, 5, 9, 10, 11, 18, 19, 20, 30],
        [0, 1, 2, 3, 4, 5, 12, 13, 14, 21, 22, 23, 30],
        [],
      ],
      { twoBankrupt: true, protectWinner: false },
    );
    g.players[0]!.score = 11;
    g.roundStartScores[0] = 11;
    g = act(g, 0, { type: "discard", tile: g.players[0]!.hand[0] });
    g = pendingDone(g, { 1: "hu", 2: "hu" });
    expect(g.players[0]!.score).toBe(0);
    expect(g.players[1]!.score).toBe(10006);
    expect(g.players[2]!.score).toBe(10005);
    ledger(g);
  });
});

describe("南京倍率覆盖现场杠与罚分", () => {
  it.each([1, 2, 4])("暗杠本把倍率 %i，不只是胡牌分翻倍", (multiplier) => {
    let g = fixture([
      [0, 0, 0, 0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20],
      [],
      [],
      [],
    ]);
    g.ruleState!.multiplier = multiplier;
    g.wall = g.wall.filter((t) => t < 124);
    g = act(g, 0, { type: "selfKong", tile: 0 });
    expect(
      g.roundTransfers!.filter((t) => t.reason === "暗杠").map((t) => t.amount),
    ).toEqual([6, 6, 6].map((n) => n * multiplier));
    ledger(g);
  });
  it("未建立三口责任时补杠被抢不收杠分", () => {
    let g = fixture([
      [1],
      [0, 2, 9, 10, 11, 18, 19, 20, 27, 27, 27, 28, 28],
      [],
      [],
    ]);
    g.players[0]!.hand = [7];
    g.players[0]!.melds = [
      { type: "pung", tiles: [4, 5, 6], from: 2, concealed: false },
    ];
    g.ruleState!.multiplier = 2;
    g = act(g, 0, { type: "selfKong", tile: 7 });
    g = pendingDone(g, { 1: "hu" });
    expect(g.roundTransfers!.some((t) => t.reason === "补杠")).toBe(false);
    expect(g.roundTransfers!.at(-1)!.reason).toBe("抢杠包三家");
    ledger(g);
  });
  it("连续杠保留第一位供牌者，不能被后续暗杠覆盖", () => {
    let g = fixture([
      [0, 0, 0, 0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20],
      [],
      [],
      [],
    ]);
    g.replacement = { type: "kong", from: 2, direct: true };
    g.wall = g.wall.filter((t) => t < 124);
    g = act(g, 0, { type: "selfKong", tile: 0 });
    expect(g.replacement).toEqual({ type: "kong", from: 2, direct: true });
  });
  it("四连风奖励和同牌罚分按本把倍率，单笔账本不重复", () => {
    let g = fixture([[30], [], [], []]);
    g.ruleState!.multiplier = 2;
    g.ruleState!.ownDiscards[0] = [27, 28, 29];
    g = act(g, 0, { type: "discard", tile: g.players[0]!.hand[0] });
    expect(
      g
        .roundTransfers!.filter((t) => t.reason === "四连风")
        .map((t) => t.amount),
    ).toEqual([20, 20, 20]);
    ledger(g);
    g = fixture([[0], [], [], []]);
    g.ruleState!.multiplier = 2;
    g.ruleState!.ownDiscards[0] = [0, 0, 0];
    g = act(g, 0, { type: "discard", tile: 0 });
    expect(
      g
        .roundTransfers!.filter((t) => t.reason === "四张同牌")
        .map((t) => t.amount),
    ).toEqual([24, 24, 24]);
    ledger(g);
  });
  it("四家跟牌由首家支付，并在小余额时同时分配", () => {
    let g = fixture([[], [], [], [0]], { twoBankrupt: true });
    g.turn = 3;
    g.ruleState!.multiplier = 2;
    g.ruleState!.discards = [
      { seat: 0, tile: 1 },
      { seat: 1, tile: 2 },
      { seat: 2, tile: 3 },
    ];
    g.players[0]!.score = 5;
    g.roundStartScores[0] = 5;
    g = act(g, 3, { type: "discard", tile: g.players[3]!.hand[0] });
    expect(
      g
        .roundTransfers!.filter((t) => t.reason === "四家跟牌")
        .map((t) => t.amount),
    ).toEqual([2, 2, 1]);
    ledger(g);
  });
  it("普通出牌结束补杠责任，下轮摸牌清除 replacement", () => {
    let g = fixture([[5], [], [], []]);
    g.replacement = { type: "kong", from: 2, direct: true };
    g = act(g, 0, { type: "discard", tile: g.players[0]!.hand[0] });
    expect(g.replacement?.type).not.toBe("kong");
  });
  it("四连风和弃牌罚分开关关闭后不扣分", () => {
    let g = fixture([[30], [], [], []], {
      fourWinds: false,
      discardPenalties: false,
    });
    g.ruleState!.ownDiscards[0] = [27, 28, 29];
    g = act(g, 0, { type: "discard", tile: g.players[0]!.hand[0] });
    expect(g.roundTransfers).toEqual([]);
    g = fixture([[0], [], [], []], { discardPenalties: false });
    g.ruleState!.ownDiscards[0] = [0, 0, 0];
    g = act(g, 0, { type: "discard", tile: 0 });
    expect(g.roundTransfers).toEqual([]);
  });
});

describe("两套南京规则完整对局验证", () => {
  it.each([garden, open])(
    "每个规则跑 100 个种子，始终144张唯一牌、分数及账本守恒：%j",
    (rules) => {
      for (let seed = 1; seed <= 100; seed++) {
        let g = createGame("123456", `soak-${seed}`, rules);
        g.players = seats.map((s) => ({
          ...newPlayer(`p${s}`, `玩家${s}`, true),
          ready: true,
        }));
        g = startRound(g, 1000, seededRandom(seed));
        if (g.phase === "playing")
          expect(g.players.map((p) => p!.hand.length)).toEqual([
            14, 13, 13, 13,
          ]);
        for (
          let step = 0;
          step < 600 && ["playing", "claiming"].includes(g.phase);
          step++
        ) {
          const s =
            g.phase === "playing"
              ? g.turn
              : seats.find(
                  (s) =>
                    g.pending?.offers[s] && g.pending.replies[s] === undefined,
                )!;
          const action = botAction(g, s);
          expect(action, `seed=${seed}`).toBeTruthy();
          g = act(g, s, action!, 1100 + step * 100);
          expect(physical(g)).toHaveLength(144);
          expect(new Set(physical(g)).size).toBe(144);
          expect(g.players.reduce((n, p) => n + p!.score, 0)).toBe(360);
          ledger(g);
          if (rules.twoBankrupt)
            expect(g.players.every((p) => p!.score >= 0)).toBe(true);
          expect(viewFor(g, 0)).not.toHaveProperty("ruleState");
        }
        expect(["ended", "finished"], `seed=${seed}`).toContain(g.phase);
        expect(g.history).toHaveLength(1);
      }
    },
    60000,
  );
});

describe("2026-09-16 用户规则图回归", () => {
  it("三嘴只看前三嘴；A、B、B、B不能由B外包", () => {
    const p = hand([27, 27]);
    p.melds = [0, 9, 18, 20].map((k, i) => ({
      type: "pung",
      tiles: [k * 4, k * 4 + 1, k * 4 + 2],
      from: (i === 0 ? 1 : 2) as Seat,
      concealed: false,
    }));
    expect(threeMouths(p, 0)).toBeUndefined();
    p.melds.forEach((m) => (m.from = 2));
    expect(threeMouths(p, 0)).toBe(2);
    p.melds[1].concealed = true;
    p.melds[1].from = 0;
    expect(threeMouths(p, 0)).toBe(2);
    p.melds.slice(0, 3).forEach((m) => (m.concealed = true));
    expect(threeMouths(p, 0)).toBeUndefined();
  });
  it("规则图计分示例：底10+五花5+卡张1+暗杠2+杠开20+门清10=48", () => {
    const p = hand([0, 1, 2, 9, 10, 11, 18, 19, 20, 24, 24]);
    p.flowers = [124, 125, 126, 128, 129];
    p.melds = [
      { type: "kong", tiles: [104, 105, 106, 107], from: 0, concealed: true },
    ];
    expect(
      scoreHand(
        p,
        { ...garden, flowerDouble: false },
        { replacement: "kong", winTile: 40 },
      )?.total,
    ).toBe(48);
  });
  it("补杠后补花胡按花开计分，仍由原点杠者支付三份", () => {
    let g = fixture([[0, 3, 4, 5, 9, 10, 11, 18, 19, 20, 27], [], [], []]);
    g.players[0]!.hand[0] = 3;
    g.players[0]!.melds = [
      { type: "pung", tiles: [0, 1, 2], from: 2, concealed: false },
    ];
    g.wall = [112, 116, 109, 124];
    g = act(g, 0, { type: "selfKong", tile: 3 });
    expect(g.replacement).toEqual({ type: "flower", from: 2, direct: true });
    g = act(g, 0, { type: "hu" });
    expect(g.result!.details[0]!.items).toContainEqual({
      label: "小杠开花",
      value: 10,
    });
    expect(
      g.result!.details[0]!.items.some((i) => i.label.startsWith("大杠开花")),
    ).toBe(false);
    expect(g.roundTransfers!.at(-1)).toEqual({
      from: 2,
      to: 0,
      amount: g.result!.details[0]!.total * 3,
      reason: "杠开包三家",
    });
    ledger(g);
  });
  it("无其他大胡的海底捞月也触发比下胡", () => {
    let g = takeLastWallDraw(lastWallGame({
      wall: [LAST_WIN_TILE], rules: { id: "nj-garden-v2", twoBankrupt: false, successorDouble: false },
    }));
    expect(g.wall).toHaveLength(0);
    g = lastWallAction(g, 0, { type: "hu" }, 2000);
    expect(g.result!.details[0]!.major).toBe(false);
    expect(g.ruleState!.nextReasons).toEqual(["海底捞月"]);
    expect(g.ruleState!.nextMultiplier).toBe(2);
    ledger(g);
  });
  it("三清普通清一色点炮也外包，混一色不算三清", () => {
    let g = fixture([[5], [3, 4, 7, 7], [], []]);
    g.players[1]!.melds = [0, 1, 2].map((k, i) => ({
      type: "pung",
      tiles: [k * 4, k * 4 + 1, k * 4 + 2],
      from: ([0, 2, 3] as Seat[])[i],
      concealed: false,
    }));
    g = act(g, 0, { type: "discard", tile: g.players[0]!.hand[0] });
    g = pendingDone(g, { 1: "hu" });
    expect(g.result!.details[1]!.snapshot).toBeUndefined();
    expect(g.roundTransfers!.at(-1)).toEqual({
      from: 0,
      to: 1,
      amount: 50,
      reason: "清一色承包",
      scope: "external",
    });
    ledger(g);
  });
});

describe("规则图架牌、改支与照直", () => {
  function globalGame() {
    const g = fixture([[24], [], [], []]);
    g.players[0]!.melds = [0, 9, 18, 27].map((k, i) => ({
      type: "pung" as const,
      tiles: [k * 4, k * 4 + 1, k * 4 + 2],
      from: ([1, 2, 3, 1] as Seat[])[i],
      concealed: false,
    }));
    const retained=g.players[0]!.hand[0];
    g.players[0]!.hand.push(92);armGlobalAnchor(g,0);g.players[0]!.hand=[retained];
    return g;
  }
  it("同花色前后两张才外包，不越过花色边界", () => {
    const g = globalGame();
    recordGlobalAnchor(g, 0, 16);
    expect(
      [4, 8, 12, 16, 20, 24, 28, 36].map((t) => globalLiability(g, 0, t)),
    ).toEqual([false, true, true, true, true, true, false, false]);
    recordGlobalAnchor(g, 0, 4);
    expect(g.ruleState!.globalAnchors![0]!.discardKind).toBe(4);
    expect(viewFor(g, 1)).not.toHaveProperty("globalAnchors");
    expect(viewFor(g, 1)).not.toHaveProperty("ruleState");
  });
  it("摸切不改支，换听口后即使换回也不恢复外包", () => {
    const g = globalGame();
    recordGlobalAnchor(g, 0, 16);
    recordGlobalAnchor(g, 0, 36);
    expect(globalLiability(g, 0, 24)).toBe(true);
    g.players[0]!.hand = [20];
    recordGlobalAnchor(g, 0, 24);
    expect(globalLiability(g, 0, 20)).toBe(false);
    g.players[0]!.hand = [24];
    recordGlobalAnchor(g, 0, 20);
    expect(globalLiability(g, 0, 24)).toBe(false);
  });
  it("架风牌四风均有责任，数牌没有", () => {
    const g = globalGame();
    g.players[0]!.hand = [116];
    recordGlobalAnchor(g, 0, 112);
    expect([108, 112, 116, 120].every((t) => globalLiability(g, 0, t))).toBe(
      true,
    );
    expect(globalLiability(g, 0, 104)).toBe(false);
  });
  it("手机规则拒绝照直声明且不展示入口", () => {
    const g = fixture([[0,1,2,9,10,11,18,19,20,27,27,27,28,28],[],[],[]]);
    expect(viewFor(g, 0).canZhaozhi).toBe(false);
    expect(() => act(g, 0, { type: "zhaozhi" })).toThrow();
    expect(viewFor(g, 1).players[0]!.hand).toEqual([]);
  });
  it("旧状态照直标记不再禁止对对胡或杠牌", () => {
    const p = hand([0,0,0,9,9,9,18,18,18,27,27,27,28,28]);
    p.zhaozhi = true;
    expect(scoreHand(p, garden)).not.toBeNull();
    const g=fixture([[0,0,0,0,28],[],[],[]]);
    g.players[0]!.zhaozhi=true;
    g.players[0]!.melds=[9,18,27].map(k=>({type:"pung",tiles:[k*4,k*4+1,k*4+2],from:1,concealed:false}));
    expect(selfKongs(g,0)).toContain(0);
  });
});

it("图示三嘴后第四嘴暗杠，外包胡时不再收现场暗杠费", () => {
  let g = fixture([[27, 27, 27, 27, 28], [], [], []]);
  g.players[0]!.melds = [0, 9, 18].map((k) => ({
    type: "pung",
    tiles: [k * 4, k * 4 + 1, k * 4 + 2],
    from: 1,
    concealed: false,
  }));
  g.wall = [116, 120, 113];
  g = act(g, 0, { type: "selfKong", tile: 108 });
  expect(g.roundTransfers).toEqual([]);
  expect(g.ruleState!.deferredConcealed).toHaveLength(3);
  g = act(g, 0, { type: "hu" });
  expect(g.roundTransfers).toEqual([
    { from: 1, to: 0, amount: 50, reason: "三口承包", scope: "external" },
  ]);
  expect(g.ruleState!.deferredConcealed).toEqual([]);
  ledger(g);
});

it.each([
  [4, 6, true],
  [0, 8, false],
  [28, 30, true],
] as const)("架牌实际出牌和结算 %i → %i", (anchor, wait, external) => {
  let g = fixture([[anchor, wait], [], [], []]);
  g.players[0]!.melds = [1, 9, 18, 27].map((k, i) => ({
    type: "pung",
    tiles: [k * 4, k * 4 + 1, k * 4 + 2],
    from: ([1, 2, 3, 1] as Seat[])[i],
    concealed: false,
  }));
  armGlobalAnchor(g, 0);
  g = act(g, 0, { type: "discard", tile: anchor * 4 });
  expect(g.ruleState!.globalAnchors![0]).toEqual({
    source: "fourth-pung",
    discardTile: anchor * 4,
    discardKind: anchor,
    waitKind: wait,
    changed: false,
  });
  g.turn = 3;
  g.players[3]!.hand = [wait * 4 + 1];
  g = act(g, 3, { type: "discard", tile: wait * 4 + 1 });
  g = pendingDone(g, { 0: "hu" });
  expect(g.roundTransfers!.at(-1)).toEqual(
    external
      ? {
          from: 3,
          to: 0,
          amount: 50,
          reason: "全球独钓承包",
          scope: "external",
        }
      : { from: 3, to: 0, amount: g.result!.details[0]!.total, reason: "点炮" },
  );
  ledger(g);
});
