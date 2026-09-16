import { expect, it } from "vitest";
import { createGame, newPlayer, viewFor } from "../shared/engine";
import { listeningHints, unseenHintCounts } from "../src/listening-hints";

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


it("未见张数去重公开牌，绝不读取对手暗手或暗杠", () => {
  const g=createGame('123456','unseen');
  g.players=[newPlayer('a','a'),newPlayer('b','b'),newPlayer('c','c'),newPlayer('d','d')];
  g.players[0]!.hand=[0];g.players[1]!.hand=[1,2,3];g.players[2]!.discards=[1];
  g.players[1]!.melds=[{type:'kong',tiles:[4,5,6,7],from:1,concealed:true}];
  const v=viewFor(g,0);v.players[1]!.hand=[1,2,3];v.players[1]!.melds[0].tiles=[4,5,6,7];
  expect(unseenHintCounts(v,[0,1])).toEqual({0:2,1:4});
  v.players[2]!.discards.push(1);expect(unseenHintCounts(v,[0])).toEqual({0:2});
});
