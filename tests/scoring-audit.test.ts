import {describe, expect, it} from "vitest";
import {newPlayer} from "../shared/engine";
import {scoreHand} from "../shared/scoring";
import {DEFAULT_RULES} from "../shared/types";

describe("计分审查：大胡资格与花数门槛", () => {
  it.each([0, 1, 2, 3])("开门 %i 硬花的压绝仍可胡，普通压档不可胡", flowers => {
    const p = newPlayer("audit", "核分");
    // 1、3 万压 2 万；123 筒、123 条、南风将，已碰东风。
    p.hand = [0, 8, 36, 40, 44, 72, 76, 80, 112, 113];
    p.melds = [{type: "pung", tiles: [108, 109, 110], from: 1, concealed: false}];
    p.flowers = [124, 125, 126].slice(0, flowers);
    expect(scoreHand(p, DEFAULT_RULES, {tile: 4})).toBeNull();
    const score = scoreHand(p, DEFAULT_RULES, {tile: 4, visiblePungs: [1]});
    // 成牌 20 + 压绝 40 + 风刻/风对 4 + 硬花 * 2。
    expect(score?.total).toBe(64 + flowers * 2);
    expect(score?.items).toContainEqual({label: "压绝", value: 40});
    expect(score?.items.some(item => item.label === "压档")).toBe(false);
    expect(score?.items.some(item => item.label === "门清")).toBe(false);
  });
});
