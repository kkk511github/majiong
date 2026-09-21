import { describe, expect, it } from "vitest";
import fixture from "./fixtures/listening-164068.json";
import { newPlayer } from "../shared/engine";
import { ruleDefaults } from "../shared/nanjing-rules";
import { structuralWaits } from "../shared/scoring-nanjing";
import { scoreHand } from "../shared/scoring";
import type { PublicPlayer, Seat, View } from "../shared/types";
import { listeningHints, readyDiscardTiles } from "../src/listening-hints";
import { listeningHints as oldHints, readyDiscardTiles as oldArrows } from "./previews/listening-164068-before";

const cases = fixture.views as unknown as { name: string; frameIndex: number; discardToCompare: number | null; view: View }[];
const context = (v: View) => ({ seat: v.me, earthlyWaits: v.earthlyWaits });

describe("164068第二把真实牌：三硬花、两面不能借公开碰二筒提示听牌", () => {
  it.each(cases)("真实第$frameIndex帧：旧算法误报二筒，当前规则没有合法听口", ({ view: v, discardToCompare }) => {
    const p = v.players[v.me]!;
    const discard = discardToCompare ?? undefined;
    const hand = discard === undefined ? p.hand : p.hand.filter(t => t !== discard);
    expect(p.flowers).toEqual([137, 143, 135]);
    expect(p.melds.map(m => m.tiles)).toEqual([[69, 71, 68], [108, 109, 110]]);
    expect(structuralWaits({ ...p, hand })).toEqual([10, 13]);
    expect(oldHints(p, v.rules, discard, v.players, context(v))).toEqual([10]);
    expect(listeningHints(p, v.rules, discard, v.players, context(v))).toEqual([]);
    for (const tile of [42, 52]) {
      expect(scoreHand({ ...p, hand, passedHu: false, passedPung: [] }, v.rules, {
        seat: v.me, tile, visiblePungs: [17, 27, 10],
      })).toBeNull();
    }
  });

  it.each(cases.filter(c => c.discardToCompare !== null))("第$frameIndex帧不画打出可听的箭头，且不改手牌", ({ view, discardToCompare }) => {
    const v = structuredClone(view), before = structuredClone(v);
    expect(oldArrows(v)).toContain(discardToCompare);
    expect(readyDiscardTiles(v)).toEqual([]);
    expect(v).toEqual(before);
  });

  it("同一结构若真的补足第四硬花，二筒与五筒才是普通合法听口", () => {
    const v = structuredClone(cases.find(c => c.name === "afterDiscard5Wan")!.view);
    const p = v.players[v.me]!;
    const visibleFlowers = v.players.flatMap(p => p?.flowers ?? []);
    const fourth = Array.from({ length: 20 }, (_, i) => 124 + i).find(t => !visibleFlowers.includes(t))!;
    p.flowers.push(fourth); // Explicit counterfactual; not a modification of the saved round.
    expect(listeningHints(p, v.rules, undefined, v.players, context(v))).toEqual([10, 13]);
  });

  it("回归素材仅保留本人暗手，碰牌信息不需要读取对手暗手", () => {
    for (const { view: v } of cases) {
      v.players.forEach((p, seat) => {
        if (seat !== v.me) expect(p?.hand).toEqual([]);
      });
    }
  });
});

function waitingPlayer(handKinds: number[], pungKinds: number[], flowerCount: number): PublicPlayer {
  const used = new Map<number, number>();
  const tile = (k: number) => {
    const n = used.get(k) ?? 0;
    if (n >= 4) throw Error("Fixture would use a fifth copy");
    used.set(k, n + 1);
    return k * 4 + n;
  };
  const p = newPlayer("local-only", "牌型回归");
  p.hand = handKinds.map(tile);
  p.melds = pungKinds.map((k, i) => ({ type: "pung", tiles: [tile(k), tile(k), tile(k)], from: (i % 3 + 1) as Seat, concealed: false }));
  p.flowers = Array.from({ length: flowerCount }, (_, i) => 124 + i);
  return { ...p, handCount: p.hand.length };
}

describe("听牌的花数门槛保留当前规则豁免，不能统一强制四花", () => {
  const rules = ruleDefaults("nj-garden-b-v3");
  const plain = [0, 1, 2, 9, 10, 11, 18, 19, 20, 28];
  it.each([1, 2, 3])("普通开门%d硬花没有听口，软花不能凑门槛", flowers => {
    const p = waitingPlayer(plain, [27], flowers);
    expect(structuralWaits(p)).toEqual([28]);
    expect(listeningHints(p, rules)).toEqual([]);
  });
  it.each([
    { name: "普通四硬花", hand: plain, pungs: [27], flowers: 4, wait: 28 },
    { name: "门清", hand: [0,1,2,9,10,11,18,19,20,27,27,27,28], pungs: [], flowers: 1, wait: 28 },
    { name: "混一色", hand: [0,1,2,3,4,5,6,7,8,4], pungs: [27], flowers: 1, wait: 4 },
    { name: "清一色", hand: [1,2,3,2,3,4,5,6,7,8], pungs: [0], flowers: 1, wait: 8 },
    { name: "对对胡", hand: [9,9,9,18,18,18,20,20,20,5], pungs: [0], flowers: 1, wait: 5 },
    { name: "全球独钓", hand: [5], pungs: [0,9,18,20], flowers: 1, wait: 5 },
    { name: "七对", hand: [0,0,1,1,9,9,10,10,18,18,19,19,20], pungs: [], flowers: 1, wait: 20 },
    { name: "双七对", hand: [0,0,0,0,9,9,10,10,18,18,19,19,20], pungs: [], flowers: 1, wait: 20 },
    { name: "豪华双七对", hand: [0,0,0,0,9,9,9,9,18,18,19,19,20], pungs: [], flowers: 1, wait: 20 },
    { name: "超豪华双七对", hand: [0,0,0,0,9,9,9,9,18,18,18,18,20], pungs: [], flowers: 1, wait: 20 },
    { name: "风一色", hand: [27,27,27,27,28,28,28,28,29,29,29,29,30], pungs: [], flowers: 1, wait: 30 },
    { name: "无花果", hand: plain, pungs: [27], flowers: 0, wait: 28 },
  ])("$name仍按合法条件显示", ({ hand, pungs, flowers, wait }) => {
    expect(listeningHints(waitingPlayer(hand, pungs, flowers), rules)).toContain(wait);
  });
});
