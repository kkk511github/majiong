import { expect, it } from "vitest";
import { createGame, newPlayer, viewFor } from "../shared/engine";
import { listeningHints } from "../src/listening-hints";

it("自己的13张听牌自动给出南；选中新牌后可以预览打出后的听口", () => {
  const g = createGame("123456", "hints");
  g.players[0] = newPlayer("me", "自己");
  g.players[0].hand = [0, 4, 8, 36, 40, 44, 72, 76, 80, 108, 109, 110, 112];
  const p = viewFor(g, 0).players[0]!;
  expect(listeningHints(p, g.rules)).toEqual([28]);
  p.hand.push(32);
  expect(listeningHints(p, g.rules)).toEqual([]);
  expect(listeningHints(p, g.rules, 32)).toEqual([28]);
  expect(listeningHints(p, g.rules, -1)).toEqual([]);
  expect(p.hand).toHaveLength(14);
});
it("开门小胡必须满足本桌硬花数量，不能提示当前规则不允许的胡牌", () => {
  const g = createGame("123456", "flowers");
  const p = {
    ...newPlayer("me", "自己"),
    handCount: 10,
    hand: [0, 4, 8, 36, 40, 44, 72, 76, 80, 112],
    melds: [
      {
        type: "pung" as const,
        tiles: [108, 109, 110],
        from: 1 as const,
        concealed: false,
      },
    ],
  };
  expect(listeningHints(p, g.rules)).toEqual([]);
  p.flowers = [124, 128, 132, 136];
  expect(listeningHints(p, g.rules)).toEqual([28]);
});
