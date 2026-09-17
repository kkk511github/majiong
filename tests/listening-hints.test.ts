import { expect, it } from "vitest";
import { createGame, newPlayer, viewFor } from "../shared/engine";
import { listeningHints, unseenHintCounts, readyDiscardTiles } from "../src/listening-hints";

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

it("可听箭头只用本人合法弃牌；同种实体牌均标记、托管和响应期隐藏",()=>{
  const g=createGame("ready","ready");g.players[0]=newPlayer("me","自己");
  g.players[0].hand=[0,4,8,36,40,44,72,76,80,108,109,110,112,32];
  const v=viewFor(g,0);v.phase="playing";v.canDiscard=true;
  expect(readyDiscardTiles(v)).toContain(32);
  for(const t of readyDiscardTiles(v))expect(listeningHints(v.players[0]!,v.rules,t,v.players,{seat:0})).not.toEqual([]);
  const before=[...v.players[0]!.hand];readyDiscardTiles(v);expect(v.players[0]!.hand).toEqual(before);
  v.players[0]!.trustee=true;expect(readyDiscardTiles(v)).toEqual([]);
  v.players[0]!.trustee=false;v.phase="claiming";expect(readyDiscardTiles(v)).toEqual([]);
});

it("余牌逐项扣除本人手牌、公开弃牌、明杠和本人暗杠；不重扣打出的牌",()=>{
  const g=createGame('counts','counts');g.players=[0,1,2,3].map(i=>newPlayer(String(i),String(i)));
  const me=g.players[0]!;me.hand=[0,1,4];
  me.melds=[{type:'kong',tiles:[8,9,10,11],from:0,concealed:true}];
  g.players[1]!.discards=[2];g.players[2]!.melds=[{type:'kong',tiles:[12,13,14,15],from:3,concealed:false}];
  g.players[3]!.flowers=[124];
  const v=viewFor(g,0);
  expect(unseenHintCounts(v,[0,1,2,3,31])).toEqual({0:1,1:3,2:0,3:0,31:3});
  v.players[0]!.hand=v.players[0]!.hand.filter(t=>t!==0);v.players[0]!.discards.push(0);
  expect(unseenHintCounts(v,[0])).toEqual({0:1});
});
