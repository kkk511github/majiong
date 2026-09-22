import { describe, expect, it } from "vitest";
import { act, createGame, newPlayer, normalizeRules, seats, viewFor } from "../shared/engine";
import { flowerFactor, newGameRules, ruleDefaults, ruleDisplayName } from "../shared/nanjing-rules";
import { scoreHand, type WinContext } from "../shared/scoring";
import { settlementRows } from "../shared/settlement";
import { createWall, seededRandom } from "../shared/tiles";
import type { Game, Player, Seat } from "../shared/types";
import { externalRound } from "./fixtures/external-round";

const rules = ruleDefaults("nj-garden-b-v3");
function player(kinds: number[], flowers = 5, pungs: number[] = []): Player {
  const p = newPlayer("player", "牌友");
  const used = new Map<number, number>();
  const tile = (k: number) => {
    const n = used.get(k) ?? 0;
    if (n >= 4) throw Error("fifth tile");
    used.set(k, n + 1);
    return k * 4 + n;
  };
  p.hand = kinds.map(tile);
  p.flowers = Array.from({ length: flowers }, (_, n) => 124 + n);
  p.melds = pungs.map((k, i) => ({ type: "pung", tiles: [tile(k), tile(k), tile(k)], from: (i % 3 + 1) as Seat, concealed: false }));
  return p;
}
const plain = () => player([3, 4, 5, 9, 10, 11, 18, 19, 20, 22, 22], 5, [0]);
function game(p: Player, balances = [90, 90, 90, 90]): Game {
  const g = createGame("123456", "b-score", rules);
  g.players = seats.map(s => s === 0 ? p : newPlayer(String(s), `牌友${s}`));
  g.players.forEach((p, i) => p!.score = balances[i]);
  g.phase = "playing"; g.round = 1; g.turn = 0;
  g.canSelfWin = true; g.lastDraw = p.hand.find(t => t >= 36 && t < 40) ?? p.hand.at(-1);
  g.roundStartScores = [...balances]; g.roundStartExternalScores = [0, 0, 0, 0];
  g.ruleState = { multiplier: 1, nextMultiplier: 1, nextReasons: [], keepDealer: false, heavenlyEligible: false, heavenlyWaits: {}, discards: [], ownDiscards: [[], [], [], []], kongOccurred: false };
  const held = new Set([...p.hand, ...p.flowers, ...p.melds.flatMap(m => m.tiles)]);
  g.wall = createWall(seededRandom(7)).filter(t => !held.has(t));
  return g;
}
describe("用户提供的 B 档牌例：五花为软花与硬花的合计", () => {
  const cases: [string, () => Player, WinContext, number][] = [
    ["平胡", plain, {}, 20],
    ["门清", () => player([0, 0, 0, 3, 4, 5, 9, 10, 11, 18, 19, 20, 22, 22]), {}, 30],
    ["碰碰胡", () => player([9, 9, 9, 18, 18, 18, 20, 20, 20, 5, 5], 5, [0]), {}, 50],
    ["混一色", () => player([0, 1, 2, 3, 4, 5, 6, 7, 8, 4, 4], 4, [27]), {}, 50],
    ["地胡", plain, { earthly: true }, 50],
    ["无花果", () => ({ ...plain(), flowers: [] }), {}, 40],
    ["压绝", () => player([0, 1, 2, 18, 19, 20, 21, 22, 23, 8, 8], 5, [9]), { winTile: 4, visiblePungs: [1] }, 50],
    ["清一色", () => player([1, 2, 3, 2, 3, 4, 5, 6, 7, 8, 8], 5, [0]), {}, 60],
    ["全球独钓", () => player([5, 5], 5, [0, 9, 18, 20]), {}, 100],
    ["七对", () => player([0, 0, 1, 1, 9, 9, 10, 10, 18, 18, 19, 19, 20, 20]), {}, 70],
    ["双七对", () => player([0, 0, 0, 0, 9, 9, 10, 10, 18, 18, 19, 19, 20, 20]), {}, 120],
    ["风一色", () => player([27, 27, 27, 27, 28, 28, 28, 28, 29, 29, 29, 29, 30, 30]), {}, 120],
  ];
  it.each(cases)("%s", (_label, make, context, expected) => {
    const score = scoreHand(make(), rules, context)!;
    expect(score).not.toBeNull();
    expect(score.total).toBe(expected);
    expect(score.items.reduce((n, item) => n + item.value, 0)).toBe(expected);
  });
  it("四硬花加两软花：底10+(4+2)*2=22，未门清不加门清", () => {
    const p = player([0, 1, 2, 3, 4, 5, 9, 10, 11, 12, 12], 4, [27]);
    const score = scoreHand(p, rules)!;
    expect(score.total).toBe(22);
    expect(score.items).toContainEqual({ label: "软花 2 × 2", value: 4 });
    expect(score.items.some(i => i.label === "门清")).toBe(false);
  });
  it.each([1, 2])("天胡每家固定400，不叠加其他分或倍率%i；150/50/100全部清零", (multiplier) => {
    const p = player([0, 0, 0, 3, 4, 5, 9, 10, 11, 18, 19, 20, 22, 22]);
    const g = game(p, [90,150,50,100]); g.ruleState!.heavenlyEligible = true;
    g.ruleState!.multiplier = multiplier;
    const ended = act(g, 0, { type: "hu" }, 1000);
    expect(ended.result!.details[0]!.items).toEqual([{ label: "天胡", value: 400 }]);
    expect(ended.result!.details[0]!.total).toBe(400);
    expect(ended.players.map(p => p!.score)).toEqual([390, 0, 0, 0]);
    expect(ended.result!.transfers).toEqual([150,50,100].map((amount,index)=>({from:index+1,to:0,amount,reason:"天胡"})));
    expect(ended.phase).toBe("finished");
  });
  it("天胡最多收每家400，余额充足者保留余额",()=>{
    const p=player([0,0,0,3,4,5,9,10,11,18,19,20,22,22]);
    const g=game(p,[90,650,500,400]);g.ruleState!.heavenlyEligible=true;
    const ended=act(g,0,{type:"hu"},1000);
    expect(ended.players.map(p=>p!.score)).toEqual([1290,250,100,0]);
    expect(ended.phase).toBe("ended");
    expect(ended.result!.deltas.reduce((a,b)=>a+b,0)).toBe(0);
  });
  it("普通自摸三家各20；单一付款不足只付余额", () => {
    const ended = act(game(plain(), [90, 90, 90, 8]), 0, { type: "hu" }, 1000);
    expect(ended.players.map(p => p!.score)).toEqual([138, 70, 70, 0]);
    expect(ended.result!.deltas).toEqual([48, -20, -20, -8]);
  });
});
it("地胡须闲家首张弃牌报听；报听前不加，换听后取消", () => {
  const initial = player([0, 0, 0, 3, 4, 5, 9, 10, 11, 18, 19, 20, 22, 22]);
  const before = game(initial, [1000, 1000, 1000, 1000]);
  before.dealer = 1; before.ruleState!.heavenlyWaits[0] = [22];
  const early = act(before, 0, { type: "hu" }, 1000);
  expect(early.result!.details[0]!.items.some(i => i.label === "地胡")).toBe(false);
  expect(viewFor(before, 0).earthlyWaits).toEqual([]);

  const candidate = player([0, 0, 0, 3, 4, 5, 9, 10, 11, 18, 19, 20, 22, 8]);
  let g = game(candidate, [1000, 1000, 1000, 1000]);
  g.dealer = 1; g.ruleState!.heavenlyWaits[0] = [22];
  g = act(g, 0, { type: "discard", tile: 32 }, 1000);
  expect(g.ruleState!.earthlyDeclared?.[0]).toBe(true);
  expect(g.events).toContain("牌友 地胡报听");
  expect(viewFor(g, 0).earthlyWaits).toEqual([22]);
  expect(viewFor(g, 1).earthlyWaits).toEqual([]);
  g.turn = 0; g.phase = "playing"; g.pending = undefined;
  g.players[0]!.hand.push(89); g.wall = g.wall.filter(t => t !== 89);
  g.canSelfWin = true; g.lastDraw = 89;
  expect(act(g, 0, { type: "hu" }, 2000).result!.details[0]!.items).toContainEqual({ label: "地胡", value: 30 });
  const changed = act(g, 0, { type: "discard", tile: 12 }, 2000);
  expect(changed.ruleState!.heavenlyWaits[0]).toBeUndefined();
  expect(viewFor(changed, 0).earthlyWaits).toEqual([]);
});

it("新桌固定花砸2和两家入园，旧版本分值和开关不变", () => {
  const b = normalizeRules(newGameRules({ flowerDouble: false, twoBankrupt: false }));
  expect(b).toMatchObject({ id: "nj-garden-b-v3", flowerDouble: true, twoBankrupt: true, rounds: 8 });
  expect(flowerFactor({ ...rules, flowerDouble: false })).toBe(2);
  expect(ruleDisplayName(b)).toBe("进园子 B档");
  const p = player([9, 9, 9, 18, 18, 18, 20, 20, 20, 5, 5], 5, [0]);
  expect(scoreHand(p, ruleDefaults("nj-garden-v2"))!.total).toBe(40);
  expect(normalizeRules({ id: "nj-garden-v2", flowerDouble: false, twoBankrupt: false })).toMatchObject({ flowerDouble: false, twoBankrupt: false });
});

it.each([1, 2])("暗杠即时每家5分，不乘花砸2，当前倍率%i", multiplier => {
  const g = game(player([0, 0, 0, 0, 3, 4, 5, 9, 10, 11, 18, 19, 20, 22]));
  g.ruleState!.multiplier = multiplier;
  const ended = act(g, 0, { type: "selfKong", tile: 0 }, 1000);
  expect(ended.roundTransfers).toEqual([1, 2, 3].map(from => ({ from, to: 0, amount: 5 * multiplier, reason: "暗杠" })));
});
it.each([1, 2])("杠费修正不改变胡牌软花和门清，当前倍率%i", multiplier => {
  for (const [concealed, added, soft, total] of [
    [true, false, 2, 34], [false, false, 1, 32], [false, true, 1, 22],
  ] as const) {
    const p = player([3, 4, 5, 9, 10, 11, 18, 19, 20, 22, 22]);
    p.melds = [{ type: "kong", tiles: [0, 1, 2, 3], from: concealed ? 0 : 1, concealed, added }];
    const score = scoreHand(p, rules, { multiplier })!;
    expect(score.total).toBe(total * multiplier);
    expect(score.items).toContainEqual({ label: `软花 ${soft} × 2`, value: soft * 2 });
    expect(score.items.some(i => i.label === "门清")).toBe(!added);
  }
});
it("B档三嘴后第四嘴暗杠立即结束，只记外包不收暗杠费", () => {
  const p = player([27, 27, 27, 27, 28], 0, [0, 9, 18]);
  p.melds.forEach(m => m.from = 1);
  const g = game(p);
  g.wall = [116, 120, 113];
  const kong = act(g, 0, { type: "selfKong", tile: 108 }, 1000);
  expect(kong.phase).toBe("ended");
  expect(kong.players.map(p => p!.score)).toEqual([90, 90, 90, 90]);
  expect(kong.roundTransfers).toEqual([
    { from: 1, to: 0, amount: 50, reason: "三口承包", scope: "external" },
  ]);
  expect(kong.ruleState!.deferredConcealed ?? []).toEqual([]);
  const ended = kong;
  expect(ended.result!.deltas).toEqual([0, 0, 0, 0]);
  expect(ended.result!.externalDeltas).toEqual([50, -50, 0, 0]);
  expect(() => act(ended, 0, { type: "hu" }, 2000)).toThrow();
});
it("B档前三嘴不同家，第四嘴暗杠收杠费并补牌，胡时算全球独钓而非外包", () => {
  const g = game(player([27, 27, 27, 27, 28], 0, [0, 9, 18]), [1000, 1000, 1000, 1000]);
  g.wall = [116, 120, 113];
  const kong = act(g, 0, { type: "selfKong", tile: 108 }, 1000);
  expect(kong.phase).toBe("playing");
  expect(kong.result).toBeUndefined();
  expect(kong.players.map(p => p!.score)).toEqual([1015, 995, 995, 995]);
  expect(kong.roundTransfers).toEqual([1, 2, 3].map(from => ({ from, to: 0, amount: 5, reason: "暗杠" })));
  expect(kong.players[0]!.hand).toEqual([112, 113]);
  expect(kong.wall).toEqual([116, 120]);
  expect(viewFor(kong, 0).globalAnchorDiscards).toEqual([]);
  const ended = act(kong, 0, { type: "hu" }, 2000);
  expect(ended.result!.details[0]!.items.some(i => i.label === "全球独钓")).toBe(true);
  expect(ended.result!.externalDeltas).toEqual([0, 0, 0, 0]);
  expect(ended.result!.transfers!.filter(t => t.reason === "自摸")).toHaveLength(3);
  expect(ended.result!.transfers!.some(t => t.reason === "三口承包" || t.reason === "全球独钓承包")).toBe(false);
});
it("B档第四嘴暗杠不收桌内杠费，也不补牌", () => {
  const p = player([27, 27, 27, 27, 28], 0, [0, 9, 18]);
  p.melds.forEach(m => m.from = 1);
  const g = game(p, [330, 5, 5, 20]);
  g.wall = [116, 120, 113];
  const ended = act(g, 0, { type: "selfKong", tile: 108 }, 1000);
  expect(ended.phase).toBe("ended");
  expect(ended.result!.reason).toBe("hu");
  expect(ended.players.map(p => p!.score)).toEqual([330, 5, 5, 20]);
  expect(ended.result!.deltas).toEqual([0, 0, 0, 0]);
  expect(ended.result!.externalDeltas).toEqual([50, -50, 0, 0]);
  expect(ended.result!.transfers).toEqual([
    { from: 1, to: 0, amount: 50, reason: "三口承包", scope: "external" },
  ]);
  expect(ended.wall).toEqual(g.wall);
  expect(ended.players[0]!.hand).toEqual([112]);
});
it.each([1, 2])("直杠由供牌者付10分，不乘花砸2，当前倍率%i", multiplier => {
  let g = game(player([0, 0, 0, 3, 4, 5, 9, 10, 11, 18, 19, 20, 22], 0));
  g.players[1]!.hand = [3];
  g.wall = g.wall.filter(t => t < 124 && t !== 3);
  g.turn = 1; g.ruleState!.multiplier = multiplier;
  g = act(g, 1, { type: "discard", tile: 3 }, 1000);
  expect(g.pending!.offers[0]).toContain("kong");
  g = act(g, 0, { type: "kong" }, 1001);
  expect(g.roundTransfers).toEqual([{ from: 1, to: 0, amount: 10 * multiplier, reason: "直杠" }]);
  expect(g.players[0]!.melds[0]).toMatchObject({ type: "kong", concealed: false, from: 1 });
});
it.each([1, 2])("补杠收原供碰者10分，花杠每家10分，均乘当前倍率%i", multiplier => {
  const p = player([3, 4, 5, 9, 10, 11, 18, 19, 20, 22], 0, [0]);
  p.hand.push(3);
  let g = game(p);
  g.ruleState!.multiplier = multiplier;
  g.wall = g.wall.filter(t => t < 124 && t !== 3);
  g = act(g, 0, { type: "selfKong", tile: 3 }, 1000);
  expect(g.roundTransfers).toEqual([{ from: 1, to: 0, amount: 10 * multiplier, reason: "补杠" }]);
  const f = game(player([8], 0));
  f.ruleState!.multiplier = multiplier;
  f.players[1]!.flowers = [124, 125, 126];
  f.wall = [127, ...f.wall.filter(t => t < 124)];
  const flowered = act(f, 0, { type: "discard", tile: 32 }, 1000);
  expect(flowered.roundTransfers?.filter(t => t.reason === "花杠"))
    .toEqual([0, 2, 3].map(from => ({ from, to: 1, amount: 10 * multiplier, reason: "花杠" })));
});
it.each(["暗杠","花杠"])("%s导致两家归零，杠牌者不足100同样保米", type=>{
  if(type==="暗杠") {
    const g=game(player([0,0,0,0,3,4,5,9,10,11,18,19,20,22]),[8,0,5,347]);
    const ended=act(g,0,{type:"selfKong",tile:0},1000);
    expect(ended.phase).toBe("finished");
    expect(ended.players.map(p=>p!.score)).toEqual([100,0,0,260]);
    expect(ended.result!.transfers).toContainEqual({from:3,to:0,amount:82,reason:"保米"});
    expect(ended.wall).toEqual(g.wall);
  }else{
    const g=game(player([8],0),[5,8,0,347]);
    g.players[1]!.flowers=[124,125,126];g.wall=[127,...g.wall.filter(t=>t<124)];
    const ended=act(g,0,{type:"discard",tile:32},1000);
    expect(ended.phase).toBe("finished");
    expect(ended.players.map(p=>p!.score)).toEqual([0,100,0,260]);
    expect(ended.result!.transfers).toContainEqual({from:3,to:1,amount:77,reason:"保米"});
    expect(ended.wall).toHaveLength(g.wall.length-1);
  }
});
it("B档直杠与暗杠保留门清，碰后补杠不恢复门清", () => {
  const p = player([3, 4, 5, 9, 10, 11, 18, 19, 20, 22, 22], 4, [0]);
  p.melds[0] = { type: "kong", tiles: [0, 1, 2, 3], from: 1, concealed: false };
  expect(scoreHand(p, rules)!.items).toContainEqual({ label: "门清", value: 10 });
  p.melds[0].added = true;
  expect(scoreHand(p, rules)!.items.some(i => i.label === "门清")).toBe(false);
  p.melds[0].concealed = true; p.melds[0].added = false;
  expect(scoreHand(p, rules)!.items).toContainEqual({ label: "门清", value: 10 });
});
it("两面听口胡到公开碰牌的第四张也不算压绝；三种花色不多加缺门花", () => {
  const p = player([3, 4, 5, 9, 10, 11, 19, 20, 22, 22], 5, [0]);
  const score = scoreHand(p, rules, { tile: 72, visiblePungs: [18] })!;
  expect(score.total).toBe(20);
  expect(score.items.some(item => item.label === "压绝")).toBe(false);
  expect(score.major).toBe(false);
  const selfDraw = scoreHand({ ...p, hand: [...p.hand, 72] }, rules, { winTile: 72, visiblePungs: [18] })!;
  expect(selfDraw).toEqual(score);
});
it("第二家桌内归零立即终桌，结算减本金100已包含桌费", () => {
  const ended = act(game(plain(), [330, 10, 0, 20]), 0, { type: "hu" }, 1000);
  expect(ended.phase).toBe("finished");
  expect(ended.players.map(p => p!.score)).toEqual([360, 0, 0, 0]);
  expect(ended.history[0]).toMatchObject({ initialScore: 90, settlementBase: 100 });
  expect(settlementRows(ended.history[0]).map(r => r.net)).toEqual([260, -100, -100, -100]);
});
it("两家桌外累计都低于-100，不参与桌内入园判断", () => {
  const old = externalRound({ rules: { id: "nj-garden-b-v3" } });
  old.players[0]!.externalScore = -150;
  old.players[1]!.externalScore = -150;
  old.players[2]!.externalScore = 300;
  const ended = externalRound({ previous: old, rules: { id: "nj-garden-b-v3" } });
  expect(ended.phase).toBe("ended");
  expect(ended.result!.bankrupt).toBe(false);
  expect(ended.players.every(p => p!.score === 90)).toBe(true);
  expect(ended.players.filter(p => p!.externalScore! <= -100)).toHaveLength(2);
});
it("桌内净亏50加外包100，最终亏150，距入园仍有50", () => {
  const ended = externalRound({ rules: { id: "nj-garden-b-v3" }, multiplier: 2, payerBalance: 50 });
  const payer = ended.players[0]!;
  expect(payer.score).toBe(50);
  expect(payer.externalScore).toBe(-100);
  expect(ended.result!.deltas[0]).toBe(0);
  expect(ended.result!.externalDeltas![0]).toBe(-100);
  expect(ended.result!.bankrupt).toBe(false);
  expect(ended.phase).toBe("ended");
  expect(settlementRows(ended.history[0]).find(r => r.seat === 0)).toMatchObject({ score: 50, external: -100, net: -150 });
  expect(ended.result!.transfers).toContainEqual({ from: 0, to: 2, amount: 100, reason: "三口承包", scope: "external" });
});

function windGame(hands: number[][], dealer: Seat = 0, balances?: number[]): Game {
  const g = game(player([], 0), balances);
  const used = new Map<number, number>();
  for (const seat of seats) {
    g.players[seat]!.hand = hands[seat].map(k => {
      const copy = used.get(k) ?? 0;
      if (copy >= 4) throw Error("fifth tile");
      used.set(k, copy + 1);
      return k * 4 + copy;
    });
  }
  const held = new Set(g.players.flatMap(p => p!.hand));
  g.wall = createWall(seededRandom(19)).filter(t => t < 124 && !held.has(t));
  g.dealer = dealer; g.turn = dealer;
  g.ruleState!.multiplier = 2;
  return g;
}
function discardKind(g: Game, seat: Seat, k: number): Game {
  expect(g.turn).toBe(seat);
  const tile = g.players[seat]!.hand.find(t => Math.floor(t / 4) === k);
  expect(tile).not.toBeUndefined();
  let result = act(g, seat, { type: "discard", tile: tile! }, 1000);
  for (const other of seats)
    if (result.phase === "claiming" && result.pending?.offers[other] && result.pending.replies[other] === undefined)
      result = act(result, other, { type: "pass" }, 1001);
  return result;
}
function discardWindSequence(g: Game, kinds: number[]): Game {
  let result = g;
  for (const [index, k] of kinds.entries()) {
    result = discardKind(result, 0, k);
    if (index < kinds.length - 1)
      for (const other of [1, 2, 3] as Seat[]) result = discardKind(result, other, index);
  }
  return result;
}
function windOrders(kinds: number[]): number[][] {
  return kinds.length === 0 ? [[]] : kinds.flatMap(k => windOrders(kinds.filter(other => other !== k)).map(rest => [k, ...rest]));
}
describe("B档风牌按本把倍率收付，不额外乘花砸2", () => {
  it.each(seats.flatMap(dealer => [27, 28, 29, 30].map(k => ({ dealer, k }))))(
    "庄位$dealer首张风$k，三家各自首张按座序跟牌，比下胡庄家各付10分",
    ({ dealer, k }) => {
      let g = windGame(seats.map(() => [k]), dealer);
      for (let offset = 0; offset < 4; offset++) g = discardKind(g, ((dealer + offset) % 4) as Seat, k);
      expect(g.roundTransfers).toHaveLength(3);
      expect(g.roundTransfers).toEqual(expect.arrayContaining(seats.filter(s => s !== dealer).map(to => ({ from: dealer, to, amount: 10, reason: "四家跟牌" }))));
      expect(g.players.map(p => p!.score)).toEqual(seats.map(s => s === dealer ? 60 : 100));
      expect(g.ruleState!.nextReasons).toEqual(["四家跟牌"]);
    },
  );
  it.each(windOrders([27, 28, 29, 30]).map(order => ({ order })))(
    "自己前四张为四种风$order，比下胡其余三家各付10分",
    ({ order }) => {
      const g = discardWindSequence(windGame([order, [0, 1, 2], [0, 1, 2], [0, 1, 2]]), order);
      expect(g.roundTransfers).toEqual([1, 2, 3].map(from => ({ from, to: 0, amount: 10, reason: "四连风" })));
      expect(g.players.map(p => p!.score)).toEqual([120, 80, 80, 80]);
      expect(g.ruleState!.nextReasons).toEqual(["四连风"]);
    },
  );
  const paymentCases = [
    { multiplier: 1, doubleSidePayments: true, amount: 5 },
    { multiplier: 2, doubleSidePayments: true, amount: 10 },
    { multiplier: 4, doubleSidePayments: true, amount: 20 },
    { multiplier: 2, doubleSidePayments: false, amount: 5 },
    { multiplier: 4, doubleSidePayments: false, amount: 5 },
  ].flatMap(testCase => [true, false].map(flowerDouble => ({ ...testCase, flowerDouble })));
  it.each(paymentCases)(
    "首轮跟风：倍率$multiplier、即时跟倍$doubleSidePayments、花砸2$flowerDouble，庄家各付$amount分",
    ({ multiplier, doubleSidePayments, flowerDouble, amount }) => {
      let g = windGame(seats.map(() => [27]));
      g.ruleState!.multiplier = multiplier;
      g.rules.doubleSidePayments = doubleSidePayments;
      g.rules.flowerDouble = flowerDouble;
      if (multiplier > 2) g.rules.biXiaHu = "cumulative";
      for (const s of seats) g = discardKind(g, s, 27);
      expect(g.roundTransfers).toEqual([1, 2, 3].map(to => ({ from: 0, to, amount, reason: "四家跟牌" })));
      expect(g.players.map(p => p!.score)).toEqual([90 - 3 * amount, 90 + amount, 90 + amount, 90 + amount]);
      expect(g.ruleState!.nextReasons).toEqual(["四家跟牌"]);
    },
  );
  it.each(paymentCases)(
    "四连风：倍率$multiplier、即时跟倍$doubleSidePayments、花砸2$flowerDouble，其余三家各付$amount分",
    ({ multiplier, doubleSidePayments, flowerDouble, amount }) => {
      const kinds = [27, 28, 29, 30];
      const source = windGame([kinds, [0, 1, 2], [0, 1, 2], [0, 1, 2]]);
      source.ruleState!.multiplier = multiplier;
      source.rules.doubleSidePayments = doubleSidePayments;
      source.rules.flowerDouble = flowerDouble;
      if (multiplier > 2) source.rules.biXiaHu = "cumulative";
      const g = discardWindSequence(source, kinds);
      expect(g.roundTransfers).toEqual([1, 2, 3].map(from => ({ from, to: 0, amount, reason: "四连风" })));
      expect(g.players.map(p => p!.score)).toEqual([90 + 3 * amount, 90 - amount, 90 - amount, 90 - amount]);
      expect(g.ruleState!.nextReasons).toEqual(["四连风"]);
    },
  );
  it("第二轮四家跟同风不罚", () => {
    let g = windGame(seats.map(s => [s, 27]));
    for (const s of seats) g = discardKind(g, s, s);
    for (const s of seats) g = discardKind(g, s, 27);
    expect(g.roundTransfers).toEqual([]);
  });
  it("非庄家开始的连续四张同风不罚", () => {
    let g = windGame([[0, 27], [27], [27], [27]]);
    g = discardKind(g, 0, 0);
    for (const s of [1, 2, 3, 0] as Seat[]) g = discardKind(g, s, 27);
    expect(g.roundTransfers).toEqual([]);
  });
  it("首轮数字牌四家跟牌不罚", () => {
    let g = windGame(seats.map(() => [8]));
    for (const s of seats) g = discardKind(g, s, 8);
    expect(g.roundTransfers).toEqual([]);
  });
  it("首轮同风之间暗杠会中断跟牌链", () => {
    let g = windGame([[27], [27, 0, 0, 0, 0], [27], [27]]);
    g = discardKind(g, 0, 27);
    g = act(g, 1, { type: "selfKong", tile: 0 }, 1002);
    expect(g.ruleState!.discards).toEqual([]);
    for (const s of [1, 2, 3] as Seat[]) g = discardKind(g, s, 27);
    expect(g.roundTransfers!.some(t => t.reason === "四家跟牌")).toBe(false);
  });
  it("碰牌清空跟牌链，之后同风不能接上此前出牌", () => {
    let g = windGame([[27, 28], [27, 27, 28], [28], [28]]);
    g = act(g, 0, { type: "discard", tile: 108 }, 1000);
    expect(g.pending!.offers[1]).toContain("pung");
    g = act(g, 1, { type: "pung" }, 1001);
    expect(g.ruleState!.discards).toEqual([]);
    for (const s of [1, 2, 3, 0] as Seat[]) g = discardKind(g, s, 28);
    expect(g.roundTransfers!.some(t => t.reason === "四家跟牌")).toBe(false);
  });
  it("先出数字牌再连续出四种风，不算前四张四风", () => {
    const kinds = [8, 27, 28, 29, 30];
    const g = discardWindSequence(windGame([kinds, [0, 1, 2, 3], [0, 1, 2, 3], [0, 1, 2, 3]]), kinds);
    expect(g.roundTransfers).toEqual([]);
  });
  it("东南后夹一张万牌再打西北，四风不连续不收分", () => {
    const kinds = [27, 28, 8, 29, 30];
    const g = discardWindSequence(windGame([kinds, [0, 1, 2, 3], [0, 1, 2, 3], [0, 1, 2, 3]]), kinds);
    expect(g.roundTransfers).toEqual([]);
  });
  it("弃牌罚分关闭后首轮四家跟风不付分", () => {
    let g = windGame(seats.map(() => [27]));
    g.rules.discardPenalties = false;
    for (const s of seats) g = discardKind(g, s, 27);
    expect(g.roundTransfers).toEqual([]);
  });
  it("四风开关关闭后前四张四风不收分", () => {
    const kinds = [27, 28, 29, 30];
    const g = windGame([kinds, [0, 1, 2], [0, 1, 2], [0, 1, 2]]);
    g.rules.fourWinds = false;
    expect(discardWindSequence(g, kinds).roundTransfers).toEqual([]);
  });
  it("四连风比下胡每家10分，使两家桌内归零，立即终桌", () => {
    const kinds = [27, 28, 29, 30];
    const g = discardWindSequence(windGame([kinds, [0, 1, 2], [0, 1, 2], [0, 1, 2]], 0, [330, 10, 10, 10]), kinds);
    expect(g.phase).toBe("finished");
    expect(g.result!.reason).toBe("bankrupt");
    expect(g.result!.transfers).toEqual([1, 2, 3].map(from => ({ from, to: 0, amount: 10, reason: "四连风" })));
    expect(g.players.map(p => p!.score)).toEqual([360, 0, 0, 0]);
    expect(g.result!.externalDeltas).toEqual([0, 0, 0, 0]);
  });
  it.each([
    { mode: "next" as const, multiplier: 2, nextMultiplier: 2 },
    { mode: "cumulative" as const, multiplier: 4, nextMultiplier: 8 },
  ])("四连风小余额封顶、立即终桌且不保米，$mode模式下一把倍率为$nextMultiplier", ({ mode, multiplier, nextMultiplier }) => {
    const kinds = [27, 28, 29, 30];
    const source = windGame([kinds, [0, 1, 2], [0, 1, 2], [0, 1, 2]], 0, [20, 3, 7, 330]);
    source.rules.biXiaHu = mode;
    source.ruleState!.multiplier = multiplier;
    const g = discardWindSequence(source, kinds);
    expect(g.phase).toBe("finished");
    expect(g.result!.reason).toBe("bankrupt");
    expect(g.result!.transfers).toEqual([
      { from: 1, to: 0, amount: 3, reason: "四连风" },
      { from: 2, to: 0, amount: 7, reason: "四连风" },
      { from: 3, to: 0, amount: 5 * multiplier, reason: "四连风" },
    ]);
    expect(g.players.map(p => p!.score)).toEqual([30 + 5 * multiplier, 0, 0, 330 - 5 * multiplier]);
    expect(g.players.reduce((sum, p) => sum + p!.score, 0)).toBe(360);
    expect(g.result!.externalDeltas).toEqual([0, 0, 0, 0]);
    expect(g.ruleState!.nextReasons).toEqual(["四连风"]);
    expect(g.ruleState!.nextMultiplier).toBe(nextMultiplier);
  });
  it("比下胡首轮跟风庄家仅剩8分，按三笔10分债务比例分摊，不扣成负数", () => {
    let g = windGame(seats.map(() => [27]), 0, [8, 100, 100, 152]);
    for (const s of seats) g = discardKind(g, s, 27);
    expect(g.roundTransfers).toEqual([
      { from: 0, to: 1, amount: 3, reason: "四家跟牌" },
      { from: 0, to: 2, amount: 3, reason: "四家跟牌" },
      { from: 0, to: 3, amount: 2, reason: "四家跟牌" },
    ]);
    expect(g.players.map(p => p!.score)).toEqual([0, 103, 103, 154]);
    expect(g.phase).toBe("playing");
    expect(g.players.reduce((sum, p) => sum + p!.score, 0)).toBe(360);
  });
  it.each([
    { mode: "next" as const, multiplier: 2, nextMultiplier: 2 },
    { mode: "cumulative" as const, multiplier: 4, nextMultiplier: 8 },
  ])("首轮跟风小余额分摊后两家归零立即终桌且不保米，$mode模式下一把倍率为$nextMultiplier", ({ mode, multiplier, nextMultiplier }) => {
    let g = windGame(seats.map(() => [27]), 0, [1, 10, 0, 349]);
    g.rules.biXiaHu = mode;
    g.ruleState!.multiplier = multiplier;
    for (const s of seats) g = discardKind(g, s, 27);
    expect(g.phase).toBe("finished");
    expect(g.result!.reason).toBe("bankrupt");
    expect(g.result!.transfers).toEqual([{ from: 0, to: 1, amount: 1, reason: "四家跟牌" }]);
    expect(g.players.map(p => p!.score)).toEqual([0, 11, 0, 349]);
    expect(g.players.reduce((sum, p) => sum + p!.score, 0)).toBe(360);
    expect(g.result!.externalDeltas).toEqual([0, 0, 0, 0]);
    expect(g.ruleState!.nextReasons).toEqual(["四家跟牌"]);
    expect(g.ruleState!.nextMultiplier).toBe(nextMultiplier);
  });
  it("单人四次打同种牌，比下胡向其他三家各付10分", () => {
    const kinds = [8, 8, 8, 8];
    const g = discardWindSequence(windGame([kinds, [0, 1, 2], [0, 1, 2], [0, 1, 2]]), kinds);
    expect(g.roundTransfers).toEqual([1, 2, 3].map(to => ({ from: 0, to, amount: 10, reason: "四张同牌" })));
  });
  it("单人四张同牌普通局每家5分，不乘花砸2",()=>{
    const kinds=[8,8,8,8];
    const source=windGame([kinds,[0,1,2],[0,1,2],[0,1,2]]);
    source.ruleState!.multiplier=1;
    const g=discardWindSequence(source,kinds);
    expect(g.roundTransfers).toEqual([1,2,3].map(to=>({from:0,to,amount:5,reason:"四张同牌"})));
  });
});
