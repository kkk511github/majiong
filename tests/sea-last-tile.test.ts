import { describe, expect, it } from "vitest";
import { viewFor } from "../shared/engine";
import type { Game, Seat } from "../shared/types";
import { assertLastWallInventory, lastWallAction, lastWallGame, LAST_KONG_WAIT, LAST_WIN_TILE, resolveLastWallClaims, takeLastWallDraw } from "./fixtures/last-wall";

const hasSea = (g: Game, seat: Seat = 0) => g.result?.details[seat]?.items.some(item => item.label === "海底捞月") === true;
function selfWin(g: Game) {
  expect(g.phase).toBe("playing"); expect(g.turn).toBe(0);
  expect(g.players[0]!.hand).toContain(LAST_WIN_TILE);
  expect(viewFor(g, 0).actions).toContain("hu");
  return lastWallAction(g, 0, { type: "hu" }, 2000);
}
function normalWin(count: number, multiplier = 1) {
  const wall = [LAST_WIN_TILE, 117, 118, 119, 123].slice(0, count);
  const before = lastWallGame({ wall, multiplier });
  expect(before.players[0]!.hand).not.toContain(LAST_WIN_TILE);
  const drawn = takeLastWallDraw(before);
  expect(drawn.wall).toHaveLength(count - 1); expect(drawn.lastDraw).toBe(LAST_WIN_TILE);
  return selfWin(drawn);
}

describe("用户确认：仅牌墙最后一张自摸为海底捞月", () => {
  it.each([1, 2, 4, 5])("抽牌前剩%i张，真实摸牌后只有剩0张才加海底20", count => {
    const ended = normalWin(count);
    expect(hasSea(ended)).toBe(count === 1);
    if (count === 1) {
      expect(ended.result!.details[0]!.items).toContainEqual({ label: "海底捞月", value: 20 });
      expect(ended.result!.details[0]!.major).toBe(false);
      expect(ended.ruleState!.nextReasons).toEqual(["海底捞月"]);
    }
  });

  it.each([1, 2])("海底最后20并入总分后按当前倍率%i计算", multiplier => {
    const ordinary = normalWin(2, multiplier), sea = normalWin(1, multiplier);
    expect(sea.result!.details[0]!.total - ordinary.result!.details[0]!.total).toBe(20 * multiplier);
    expect(sea.result!.details[0]!.items).toContainEqual({ label: "海底捞月", value: 20 });
    expect(sea.result!.transfers?.filter(entry => entry.reason === "自摸")).toHaveLength(3);
    expect(sea.roundTransfers?.some(entry => ["暗杠", "直杠", "补杠", "花杠"].includes(entry.reason))).toBe(false);
  });

  it("摸到最后一张再打出去，别人点胡不计海底", () => {
    const otherHand = [1, 5, 9, 13, 17, 21, 37, 41, 45, 73, 77, 81, 114];
    let g = takeLastWallDraw(lastWallGame({ wall: [LAST_WIN_TILE], otherHands: { 1: otherHand } }));
    expect(g.wall).toHaveLength(0);
    g = lastWallAction(g, 0, { type: "discard", tile: LAST_WIN_TILE }, 2000);
    expect(g.pending?.offers[1]).toContain("hu");
    g = resolveLastWallClaims(g, { 1: "hu" });
    expect(g.result!.winners).toEqual([1]); expect(g.result!.from).toBe(0);
    expect(hasSea(g, 1)).toBe(false);
    expect(g.ruleState!.nextReasons).not.toContain("海底捞月");
  });

  it("最后一张是花且已经没有补牌，流局且没有海底赢家", () => {
    const before = lastWallGame({ wall: [143] });
    const ended = takeLastWallDraw(before);
    expect(ended.wall).toHaveLength(0); expect(ended.players[0]!.flowers).toContain(143);
    expect(ended.players[0]!.hand).toEqual(before.players[0]!.hand);
    expect(ended.result).toMatchObject({ reason: "draw", winners: [], details: {} });
    expect(viewFor(ended, 0).actions).not.toContain("hu");
    expect(ended.ruleState!.nextReasons).not.toContain("海底捞月");
    expect(ended.roundTransfers).toEqual([]);
  });

  it.each([1, 2])("补花补到最后普通牌，小杠开花与海底继续叠加，倍率%i", multiplier => {
    const withSea = selfWin(takeLastWallDraw(lastWallGame({ wall: [143, LAST_WIN_TILE], multiplier })));
    const withoutSea = selfWin(takeLastWallDraw(lastWallGame({ wall: [143, 117, LAST_WIN_TILE], multiplier })));
    const score = withSea.result!.details[0]!;
    expect(withSea.wall).toHaveLength(0); expect(withSea.players[0]!.flowers).toContain(143);
    expect(score.items).toContainEqual({ label: "小杠开花", value: 10 });
    expect(score.items).toContainEqual({ label: "海底捞月", value: 20 });
    expect(score.total - withoutSea.result!.details[0]!.total).toBe(20 * multiplier);
    expect(hasSea(withoutSea)).toBe(false);
    expect(withSea.roundTransfers?.some(entry => ["暗杠", "直杠", "补杠", "花杠"].includes(entry.reason))).toBe(false);
  });

  it.each(["concealed", "direct", "added"] as const)("%s杠补最后一张，大杠开花/海底叠加且杠费只收一次", mode => {
    for (const multiplier of [1, 2]) {
      const wall = [LAST_WIN_TILE];
      let g: Game;
      if (mode === "concealed") {
        g = lastWallGame({ wall, hand: [0, 1, 2, 3, ...LAST_KONG_WAIT], turn: 0, multiplier });
        g = lastWallAction(g, 0, { type: "selfKong", tile: 0 });
      } else if (mode === "direct") {
        g = lastWallGame({ wall, hand: [0, 1, 2, ...LAST_KONG_WAIT], trigger: 3, multiplier });
        g = resolveLastWallClaims(lastWallAction(g, 3, { type: "discard", tile: 3 }), { 0: "kong" });
      } else {
        g = lastWallGame({ wall, hand: [3, ...LAST_KONG_WAIT], melds: [{ type: "pung", tiles: [0, 1, 2], from: 2, concealed: false }], turn: 0, multiplier });
        g = resolveLastWallClaims(lastWallAction(g, 0, { type: "selfKong", tile: 3 }));
      }
      expect(g.wall).toHaveLength(0); expect(g.lastDraw).toBe(LAST_WIN_TILE);
      expect(g.replacement?.type).toBe("kong");
      const fees = structuredClone(g.roundTransfers!.filter(entry => ["暗杠", "直杠", "补杠"].includes(entry.reason)));
      if (mode === "concealed") expect(fees).toEqual([1, 2, 3].map(from => ({ from, to: 0, amount: 5 * multiplier, reason: "暗杠" })));
      else expect(fees).toEqual([{ from: mode === "direct" ? 3 : 2, to: 0, amount: 10 * multiplier, reason: mode === "direct" ? "直杠" : "补杠" }]);
      const ended = selfWin(g);
      expect(ended.result!.details[0]!.items).toContainEqual({ label: "大杠开花", value: 20 });
      expect(ended.result!.details[0]!.items).toContainEqual({ label: "海底捞月", value: 20 });
      expect(ended.roundTransfers!.filter(entry => ["暗杠", "直杠", "补杠"].includes(entry.reason))).toEqual(fees);
    }
  });

  it("暗杠补牌先遇花再补到绝张，只叠小杠与海底，不重收暗杠费", () => {
    let g = lastWallGame({ wall: [LAST_WIN_TILE, 143], hand: [0, 1, 2, 3, ...LAST_KONG_WAIT], turn: 0 });
    g = lastWallAction(g, 0, { type: "selfKong", tile: 0 });
    expect(g.replacement?.type).toBe("flower");
    const ended = selfWin(g), items = ended.result!.details[0]!.items;
    expect(items).toContainEqual({ label: "小杠开花", value: 10 });
    expect(items).toContainEqual({ label: "海底捞月", value: 20 });
    expect(items.some(item => item.label.startsWith("大杠开花"))).toBe(false);
    expect(ended.roundTransfers!.filter(entry => entry.reason === "暗杠")).toEqual([1, 2, 3].map(from => ({ from, to: 0, amount: 5, reason: "暗杠" })));
  });

  it("关闭海底时剩16张直接流局，剩17张仍可摸一张但不加海底", () => {
    const reserve = [113, 114, 115, 117, 118, 119, 120, 121, 122, 123, 104, 105, 106, 107, 108, 109, 110];
    const stopped = takeLastWallDraw(lastWallGame({ wall: reserve.slice(0, 16), rules: { seaBottom: false } }));
    expect(stopped.result?.reason).toBe("draw"); expect(stopped.wall).toHaveLength(16);
    expect(stopped.players[0]!.hand).not.toContain(LAST_WIN_TILE);
    const drawn = takeLastWallDraw(lastWallGame({ wall: reserve, rules: { seaBottom: false } }));
    expect(drawn.wall).toHaveLength(16);
    expect(hasSea(selfWin(drawn))).toBe(false);
    assertLastWallInventory(stopped); assertLastWallInventory(drawn);
  });
});
