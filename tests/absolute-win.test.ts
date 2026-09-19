import { describe, expect, it } from "vitest";
import { act, createGame, newPlayer, seats, viewFor } from "../shared/engine";
import { ruleDefaults } from "../shared/nanjing-rules";
import { scoreHand } from "../shared/scoring";
import { structuralWaits } from "../shared/scoring-nanjing";
import { kind } from "../shared/tiles";
import type { Game, Meld, Seat } from "../shared/types";
import { listeningHints } from "../src/listening-hints";

const rules = ruleDefaults("nj-garden-b-v3");
const hardFlowers = [124, 128, 132, 136, 137, 138, 139, 140];
const middleWait = [1, 3, 18, 19, 20, 21, 22, 23, 8, 8];
const closedMiddleWait = [1, 3, 9, 10, 11, 18, 19, 20, 21, 22, 23, 8, 8];
const pureMiddleWait = [1, 3, 3, 4, 5, 6, 7, 8, 8, 8];
type Placement = "wall" | "self" | "discard" | "rob";
type PublicSource = "pung" | "hidden-triplet" | "concealed-kong" | "none";

function inventory(g: Game) {
  const tiles = [...g.wall, ...g.players.flatMap(player => player ? [
    ...player.hand, ...player.flowers, ...player.discards, ...player.melds.flatMap(meld => meld.tiles),
  ] : [])];
  expect(tiles).toHaveLength(144);
  expect(new Set(tiles).size).toBe(144);
  expect([...tiles].sort((a, b) => a - b)).toEqual(Array.from({ length: 144 }, (_, tile) => tile));
}

/** Complete the other seats and wall without inventing a fifth copy or reusing
 * an entity from a public meld. Referenced lastDraw/pending tiles are not stock. */
function completeTable(g: Game, winning: number, placement: Placement) {
  g.turn = placement === "self" ? 0 : placement === "rob" ? 1 : 3;
  if (placement !== "wall") g.players[g.turn]!.hand.push(winning);
  const held = new Set(g.players.flatMap(player => [
    ...player!.hand, ...player!.flowers, ...player!.melds.flatMap(meld => meld.tiles),
  ]));
  const available = Array.from({ length: 124 }, (_, tile) => tile)
    .filter(tile => !held.has(tile) && tile !== winning)
    .sort((a, b) => (a * 37 % 127) - (b * 37 % 127));
  for (const seat of [1, 2, 3] as Seat[]) {
    const player = g.players[seat]!;
    const target = 13 - player.melds.length * 3 + Number(seat === g.turn);
    while (player.hand.length < target) player.hand.push(available.shift()!);
  }
  const owned = new Set(g.players.flatMap(player => [
    ...player!.hand, ...player!.flowers, ...player!.melds.flatMap(meld => meld.tiles),
  ]));
  g.wall = [
    ...(placement === "wall" ? [winning] : []),
    ...Array.from({ length: 144 }, (_, tile) => tile).filter(tile => !owned.has(tile) && tile !== winning),
  ];
  g.lastDraw = placement === "wall" ? g.players[3]!.hand.at(-1) : winning;
  g.canSelfWin = true;
  inventory(g);
  return { game: g, winning };
}

function emptyTable() {
  const g = createGame("851650", "absolute-rule-regression", { ...rules, turnSeconds: 0 });
  g.players = seats.map(seat => ({ ...newPlayer(`absolute-${seat}`, `牌友${seat}`), score: 1000, ready: true }));
  g.phase = "playing"; g.round = 2; g.revision = 20;
  g.roundStartScores = [1000, 1000, 1000, 1000];
  g.roundStartExternalScores = [0, 0, 0, 0];
  g.ruleState = {
    multiplier: 1, nextMultiplier: 1, nextReasons: [], keepDealer: false,
    heavenlyEligible: false, heavenlyWaits: {}, discards: [], ownDiscards: [[], [], [], []], kongOccurred: false,
  };
  return g;
}

function fixture({ flowers = 4, waiting = middleWait, ownPungs = [9], winningKind = 2,
  source = "pung", sourceKind = winningKind, placement = "self" }: {
  flowers?: number; waiting?: number[]; ownPungs?: number[]; winningKind?: number;
  source?: PublicSource; sourceKind?: number; placement?: Placement;
} = {}) {
  const g = emptyTable(), used = new Map<number, number>();
  const tile = (k: number) => {
    const copy = used.get(k) ?? 0;
    if (copy >= 4) throw Error(`Fixture would invent a fifth copy of kind ${k}`);
    used.set(k, copy + 1); return k * 4 + copy;
  };
  const pung = (k: number, from: Seat): Meld => ({ type: "pung", tiles: [tile(k), tile(k), tile(k)], from, concealed: false });
  g.players[0]!.hand = waiting.map(tile);
  g.players[0]!.melds = ownPungs.map(k => pung(k, 2));
  g.players[0]!.flowers = hardFlowers.slice(0, flowers);
  if (source === "pung") g.players[1]!.melds = [pung(sourceKind, 3)];
  if (source === "hidden-triplet") g.players[1]!.hand = [tile(sourceKind), tile(sourceKind), tile(sourceKind)];
  if (source === "concealed-kong") g.players[1]!.melds = [{
    type: "kong", tiles: [tile(sourceKind), tile(sourceKind), tile(sourceKind), tile(sourceKind)], from: 1, concealed: true,
  }];
  return completeTable(g, tile(winningKind), placement);
}

function scoreFixture({ game: g, winning }: ReturnType<typeof fixture>, placement: Placement = "self") {
  return scoreHand(g.players[0]!, g.rules, {
    seat: 0,
    ...(placement === "self" ? { winTile: winning } : { tile: winning, robbed: placement === "rob" }),
    visiblePungs: g.players.flatMap(player => player!.melds
      .filter(meld => meld.type === "pung" && !meld.concealed)
      .map(meld => kind(meld.tiles[0]))),
  });
}

function reply(g: Game, winner?: Seat) {
  let next = g;
  for (const seat of seats) if (next.phase === "claiming" && next.pending?.offers[seat] && next.pending.replies[seat] === undefined)
    next = act(next, seat, { type: seat === winner ? "hu" : "pass" }, 3000 + seat);
  return next;
}

function offer({ game: g, winning }: ReturnType<typeof fixture>, placement: Placement) {
  return placement === "rob" ? act(g, 1, { type: "selfKong", tile: winning }, 2000)
    : act(g, 3, { type: "discard", tile: winning }, 2000);
}

function finishWin(value: ReturnType<typeof fixture>, placement: Placement) {
  if (placement === "self") {
    expect(viewFor(value.game, 0).actions).toContain("hu");
    return act(value.game, 0, { type: "hu" }, 2000);
  }
  const offered = offer(value, placement);
  expect(viewFor(offered, 0).actions).toContain("hu");
  return reply(offered, 0);
}

describe("B档压绝：唯一夹张、他人公开碰牌的第四张", () => {
  it.each(["self", "discard", "rob"] as Placement[])("四硬花卡3万，%s成牌加30且不叠加压档", placement => {
    const value = fixture({ placement });
    expect(value.winning).toBe(11);
    expect(value.game.players[1]!.melds[0].tiles).toEqual([8, 9, 10]);
    const score = scoreFixture(value, placement)!;
    expect(score.total).toBe(48);
    expect(score.items).toContainEqual({ label: "压绝", value: 30 });
    expect(score.items.some(item => item.label === "压档")).toBe(false);
    const ended = finishWin(value, placement);
    expect(ended.result!.details[0]).toEqual(score);
    inventory(ended);
  });

  it.each([1, 2, 3].flatMap(flowers => ["self", "discard", "rob"].map(placement => ({ flowers, placement: placement as Placement }))))(
    "普通开门$flowers硬花，$placement合法卡绝不能单独豁免四花门槛", ({ flowers, placement }) => {
      const value = fixture({ flowers, placement });
      expect(scoreFixture(value, placement)).toBeNull();
      const checked = placement === "self" ? value.game : offer(value, placement);
      expect(viewFor(checked, 0).actions).not.toContain("hu");
      expect(() => act(checked, 0, { type: "hu" }, 2100)).toThrow();
    },
  );

  it("三硬花加缺门和风刻软花仍不能冒充四硬花", () => {
    const value = fixture({ flowers: 3, ownPungs: [27] });
    expect(scoreFixture(value)).toBeNull();
    expect(viewFor(value.game, 0).actions).not.toContain("hu");
    expect(() => act(value.game, 0, { type: "hu" }, 2100)).toThrow();
  });

  it.each([1, 2, 3].flatMap(flowers => ["self", "discard"].map(placement => ({ flowers, placement: placement as Placement }))))(
    "清一色$flowers花+$placement合法卡绝，独立大胡资格仍允许两项相加", ({ flowers, placement }) => {
      const value = fixture({ flowers, waiting: pureMiddleWait, ownPungs: [0], placement });
      const score = scoreFixture(value, placement)!;
      expect(score.items).toEqual(expect.arrayContaining([{ label: "清一色", value: 40 }, { label: "压绝", value: 30 }]));
      expect(score.total).toBe(80 + flowers * 2);
      expect(finishWin(value, placement).result!.details[0]!.items).toEqual(score.items);
    },
  );

  it.each([1, 2, 3].flatMap(flowers => ["self", "discard"].map(placement => ({ flowers, placement: placement as Placement }))))(
    "门清$flowers花+$placement合法卡绝仍能胡", ({ flowers, placement }) => {
      const value = fixture({ flowers, waiting: closedMiddleWait, ownPungs: [], placement });
      const score = scoreFixture(value, placement)!;
      expect(score.items).toEqual(expect.arrayContaining([{ label: "门清", value: 10 }, { label: "压绝", value: 30 }]));
      expect(score.total).toBe(50 + flowers * 2);
      expect(finishWin(value, placement).result!.details[0]!.items).toEqual(score.items);
    },
  );

  it.each(["self", "discard", "rob"] as Placement[])("零花无花果独立允许%s胡，也可叠合法压绝", placement => {
    const value = fixture({ flowers: 0, placement });
    const score = scoreFixture(value, placement)!;
    expect(score.items).toEqual(expect.arrayContaining([{ label: "无花果", value: 30 }, { label: "压绝", value: 30 }]));
    expect(score.total).toBe(70);
    expect(finishWin(value, placement).result!.details[0]!.items).toEqual(score.items);
  });

  it.each([
    { name: "边张一二万等三万", waiting: [0, 1, 18, 19, 20, 21, 22, 23, 8, 8], winningKind: 2, source: "pung" as const, waits: [2], label: "边枝" },
    { name: "双面二三万等一四万", waiting: [1, 2, 18, 19, 20, 21, 22, 23, 8, 8], winningKind: 0, source: "pung" as const, waits: [0, 3], label: undefined },
    // A real pair wait already holds copies of its winning kind; adding another
    // player's same-kind pung would require a fifth/sixth physical copy.
    { name: "对碰五万五条", waiting: [0, 1, 2, 18, 19, 20, 4, 4, 22, 22], winningKind: 4, source: "none" as const, waits: [4, 22], label: undefined },
    { name: "单钓五万", waiting: [0, 1, 2, 18, 19, 20, 21, 22, 23, 4], winningKind: 4, source: "none" as const, waits: [4], label: "独占" },
  ])("$name不能算压绝", ({ waiting, winningKind, source, waits, label }) => {
    const waitingValue = fixture({ waiting, winningKind, source, placement: "wall" });
    expect(structuralWaits(waitingValue.game.players[0]!)).toEqual(waits);
    const value = fixture({ waiting, winningKind, source });
    const score = scoreFixture(value)!;
    expect(score).not.toBeNull();
    expect(score.items.some(item => item.label === "压绝")).toBe(false);
    if (label) expect(score.items).toContainEqual({ label, value: 2 });
    expect(finishWin(value, "self").result!.details[0]!.items.some(item => item.label === "压绝")).toBe(false);
  });

  it.each(["hidden-triplet", "none"] as PublicSource[])("对手%s未公开碰三万，只按普通压档计分", source => {
    const value = fixture({ source });
    const score = scoreFixture(value)!;
    expect(score.items).toContainEqual({ label: "压档", value: 2 });
    expect(score.items.some(item => item.label === "压绝")).toBe(false);
    expect(score.total).toBe(20);
    expect(finishWin(value, "self").result!.details[0]!.total).toBe(20);
  });

  it("自己此前碰三万后又摸第四张，不构成他人公开碰牌来源", () => {
    const value = fixture({ ownPungs: [2], source: "none" });
    expect(value.game.players[0]!.melds[0].tiles).toEqual([8, 9, 10]);
    expect(value.winning).toBe(11);
    const score = scoreFixture(value)!;
    expect(score.items).toContainEqual({ label: "压档", value: 2 });
    expect(score.items.some(item => item.label === "压绝")).toBe(false);
    expect(finishWin(value, "self").result!.details[0]!.items).toEqual(score.items);
  });

  it("三万已被他人暗杠占满四张，自己摸八万不产生虚构的第四张胡牌", () => {
    const value = fixture({ source: "concealed-kong", sourceKind: 2, winningKind: 7 });
    expect(value.game.players[1]!.melds[0].tiles).toEqual([8, 9, 10, 11]);
    expect(value.game.players[0]!.hand.some(tile => kind(tile) === 2)).toBe(false);
    expect(scoreFixture(value)).toBeNull();
    expect(viewFor(value.game, 0).actions).not.toContain("hu");
    expect(() => act(value.game, 0, { type: "hu" }, 2100)).toThrow();
  });

  it("四硬花合法卡张仍列听牌，实际摸到第四张的服务端动作一致", () => {
    const value = fixture({ placement: "wall" });
    const view = viewFor(value.game, 0);
    expect(structuralWaits(value.game.players[0]!)).toEqual([2]);
    expect(listeningHints(view.players[0]!, view.rules, undefined, view.players, { seat: 0 })).toEqual([2]);
    const drawn = reply(act(value.game, 3, { type: "discard", tile: value.game.players[3]!.hand[0] }, 2000));
    expect(drawn.lastDraw).toBe(value.winning);
    expect(drawn.turn).toBe(0);
    expect(viewFor(drawn, 0).actions).toContain("hu");
    expect(act(drawn, 0, { type: "hu" }, 4000).result!.details[0]!.items).toContainEqual({ label: "压绝", value: 30 });
    inventory(drawn);
  });
});

describe("851650原局：一硬花六九筒双面不能借压绝资格胡九筒", () => {
  function actualRound(placement: Placement) {
    const g = emptyTable();
    g.players[0]!.hand = [15, 16, 22, 60, 67, 77, 79];
    g.players[0]!.melds = [
      { type: "pung", tiles: [105, 107, 104], from: 2, concealed: false },
      { type: "pung", tiles: [44, 46, 45], from: 3, concealed: false },
    ];
    g.players[0]!.flowers = [136];
    g.players[1]!.melds = [{ type: "pung", tiles: [69, 70, 68], from: 2, concealed: false }];
    return completeTable(g, 71, placement);
  }
  it("听口结构为六九筒，公开碰九筒不能让一硬花提示可胡九筒", () => {
    const { game } = actualRound("wall"), view = viewFor(game, 0);
    expect(structuralWaits(game.players[0]!)).toEqual([14, 17]);
    expect(listeningHints(view.players[0]!, view.rules, undefined, view.players, { seat: 0 })).toEqual([]);
  });
  it.each(["self", "discard", "rob"] as Placement[])("%s九筒都不显示胡，强行动作也由服务端拒绝", placement => {
    const value = actualRound(placement);
    expect(scoreFixture(value, placement)).toBeNull();
    const checked = placement === "self" ? value.game : offer(value, placement);
    expect(viewFor(checked, 0).actions).not.toContain("hu");
    expect(() => act(checked, 0, { type: "hu" }, 4000)).toThrow();
    inventory(checked);
  });
});

describe("用户七九筒卡八筒：抢他人补杠的实收算例", () => {
  const waiting = [3, 4, 5, 15, 17, 18, 19, 20, 22, 22];
  const pureWaiting = [15, 17, 10, 11, 12, 11, 12, 13, 14, 14];
  function example(flowers: number, multiplier = 1, pure = false) {
    const value = fixture({ flowers, placement: "rob", winningKind: 16,
      waiting: pure ? pureWaiting : waiting, ownPungs: [pure ? 9 : 0] });
    value.game.ruleState!.multiplier = multiplier;
    expect(value.winning).toBe(67);
    expect(value.game.players[1]!.melds[0].tiles).toEqual([64, 65, 66]);
    expect(structuralWaits(value.game.players[0]!)).toEqual([16]);
    return value;
  }

  it("普通开门三硬花不能抢八筒补杠，胡按钮和服务端资格一致", () => {
    const value = example(3);
    expect(scoreFixture(value, "rob")).toBeNull();
    const offered = offer(value, "rob");
    expect(offered.pending?.offers[0] ?? []).not.toContain("hu");
    expect(viewFor(offered, 0).actions).not.toContain("hu");
    expect(() => act(offered, 0, { type: "hu" }, 4000)).toThrow();
    inventory(offered);
  });

  it.each([1, 2])("普通开门四硬花、倍率%i：补杠者向其余三家各付48乘倍率且不收本次杠分", multiplier => {
    const value = example(4, multiplier), offered = offer(value, "rob");
    expect(offered.pending?.kind).toBe("robKong");
    expect(offered.roundTransfers).toEqual([]);
    expect(viewFor(offered, 0).actions).toContain("hu");
    const ended = reply(offered, 0), score = ended.result!.details[0]!;
    expect(score.total).toBe(48 * multiplier);
    expect(score.items).toEqual(expect.arrayContaining([
      { label: "成牌", value: 10 }, { label: "压绝", value: 30 }, { label: "硬花 4 × 2", value: 8 },
    ]));
    expect(score.items.some(item => /压档|软花|门清/.test(item.label))).toBe(false);
    expect([...ended.result!.transfers!].sort((a, b) => a.to - b.to)).toEqual(
      ([0, 2, 3] as Seat[]).map(to => ({ from: 1, to, amount: 48 * multiplier, reason: "抢杠赔三家" })),
    );
    expect(ended.result!.winners).toEqual([0]);
    expect(ended.result!.deltas).toEqual([48 * multiplier, -144 * multiplier, 48 * multiplier, 48 * multiplier]);
    expect(ended.players[1]!.melds[0].type).toBe("pung");
    expect(ended.roundTransfers!.some(transfer => ["补杠", "暗杠", "直杠"].includes(transfer.reason))).toBe(false);
    inventory(ended);
  });

  it.each([1, 2])("清一色三硬花、倍率%i：补杠者向其余三家各付86乘倍率", multiplier => {
    const value = example(3, multiplier, true), ended = finishWin(value, "rob");
    const score = ended.result!.details[0]!;
    expect(score.total).toBe(86 * multiplier);
    expect(score.items).toEqual(expect.arrayContaining([
      { label: "成牌", value: 10 }, { label: "清一色", value: 40 },
      { label: "压绝", value: 30 }, { label: "硬花 3 × 2", value: 6 },
    ]));
    expect(score.items.some(item => /压档|软花|门清/.test(item.label))).toBe(false);
    expect([...ended.result!.transfers!].sort((a, b) => a.to - b.to)).toEqual(
      ([0, 2, 3] as Seat[]).map(to => ({ from: 1, to, amount: 86 * multiplier, reason: "抢杠赔三家" })),
    );
    expect(ended.result!.winners).toEqual([0]);
    expect(ended.result!.deltas).toEqual([86 * multiplier, -258 * multiplier, 86 * multiplier, 86 * multiplier]);
    expect(ended.players[1]!.melds[0].type).toBe("pung");
    inventory(ended);
  });

  it.each([1, 2])("补杠者仅余90、倍率%i：理论三份账单按桌内余额封顶实付90", multiplier => {
    const value = example(4, multiplier);
    value.game.players[1]!.score = 90;
    value.game.roundStartScores[1] = 90;
    const ended = finishWin(value, "rob");
    expect(ended.result!.details[0]!.total).toBe(48 * multiplier);
    expect([...ended.result!.transfers!].sort((a, b) => a.to - b.to)).toEqual(
      ([0, 2, 3] as Seat[]).map(to => ({ from: 1, to, amount: 30, reason: "抢杠赔三家" })),
    );
    expect(ended.result!.winners).toEqual([0]);
    expect(ended.result!.deltas).toEqual([30, -90, 30, 30]);
    expect(ended.players.map(player => player!.score)).toEqual([1030, 0, 1030, 1030]);
    expect(ended.players.reduce((sum, player) => sum + player!.score, 0)).toBe(3090);
    inventory(ended);
  });
});
