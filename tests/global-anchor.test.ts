import {describe,it,expect} from "vitest";
import {act,seats,startRound,viewFor} from "../shared/engine";
import {globalLiability,inGlobalAnchorRange,recordGlobalAnchor} from "../shared/reference-rules";
import {cocosState} from "../src/cocos-state";
import {layoutTable} from "../shared/table-scene";
import {seededRandom} from "../shared/tiles";
import {anchorGame,claimFourth,discardAnchor,advanceToAnchorDraw,opponentDiscard,finishAnchorClaims,canAnchorWin,ANCHOR_TILE,CHANGE_DRAW,WAIT_WAN} from "./fixtures/global-anchor-game";
const ui={connected:true,disabled:false,practice:false,countdown:"10",selected:null,inspectedKind:null,hintKinds:[],hintLabel:"",effects:[]};
const established=(scenario:"original"|"win"|"change"|"concealed"|"open"="original",multiple=1,k?:number)=>discardAnchor(claimFourth(anchorGame(scenario,multiple,k),scenario));

describe("第四碰架牌与统一有效状态",()=>{
 it("只在第四碰之后首次出牌建立，公开物理牌不泄漏单钓手牌",()=>{
  const start=anchorGame(),claimed=claimFourth(start,"original");
  expect(viewFor(claimed,1).globalAnchorDiscards).toEqual([]);
  expect(claimed.players[0]!.hand).toEqual([WAIT_WAN,ANCHOR_TILE]);
  const g=discardAnchor(claimed);
  for(const seat of seats){
   const v=viewFor(g,seat);expect(v.globalAnchorDiscards).toEqual([{seat:0,tile:ANCHOR_TILE}]);
   expect(v).not.toHaveProperty("ruleState");expect(v).not.toHaveProperty("globalAnchors");
   if(seat!==0)expect(v.players[0]!.hand).toEqual([]);
   const yellow=layoutTable(cocosState(v,ui)).filter(t=>t.globalAnchor);
   expect(yellow.map(t=>({seat:t.seat,tile:t.tile,area:t.area}))).toEqual([{seat:0,tile:ANCHOR_TILE,area:"river"}]);
  }
  expect(g.replay!.frames.find(f=>f.type==="discard"&&f.tile===ANCHOR_TILE)?.globalAnchorDiscards).toEqual([{seat:0,tile:ANCHOR_TILE}]);
  const restored=JSON.parse(JSON.stringify(g));expect(viewFor(restored,1).globalAnchorDiscards).toEqual([{seat:0,tile:ANCHOR_TILE}]);
 });
 it("六条范围包含四到八条，不跨花色、不能把范围内所有牌当可胡",()=>{
  expect(Array.from({length:31},(_,k)=>k).filter(k=>inGlobalAnchorRange(23,k))).toEqual([21,22,23,24,25]);
  const g=opponentDiscard(established(),22);
  expect(canAnchorWin(g)).toBe(false);expect(g.roundTransfers).toEqual([]);
  expect(()=>act(g,0,{type:"hu"})).toThrow();
 });
 it.each([1,2])("合法点炮并选择胡才外包，倍率%s",multiple=>{
  const offered=opponentDiscard(established("win",multiple),22);
  expect(canAnchorWin(offered)).toBe(true);expect(offered.roundTransfers).toEqual([]);
  const passed=finishAnchorClaims(offered);expect(passed.result).toBeUndefined();expect(passed.roundTransfers).toEqual([]);
  const won=finishAnchorClaims(offered,{0:"hu"});
  expect(won.result!.transfers).toEqual([{scope:"external",from:1,to:0,reason:"全球独钓承包",amount:50*multiple}]);
  expect(won.players.map(p=>p!.score)).toEqual([90,90,90,90]);
  expect(won.result!.externalDeltas).toEqual([50*multiple,-50*multiple,0,0]);
 });
 it.each([20,21,22,23,24,25,26])("实际胡%s条种类按±2边界结算",k=>{
  const g=finishAnchorClaims(opponentDiscard(established("win",1,k),k),{0:"hu"});
  expect(g.result!.transfers!.some(t=>t.reason==="全球独钓承包")).toBe(k>=21&&k<=25);
 });
 it("摸切保持，主动换听立即清空；换回也不能重建",()=>{
  const g=advanceToAnchorDraw(established("change"));
  expect(g.lastDraw).toBe(CHANGE_DRAW);
  expect(g.players[0]!.hand).toEqual([WAIT_WAN,CHANGE_DRAW]);
  const same=act(g,0,{type:"discard",tile:CHANGE_DRAW});
  expect(viewFor(same,1).globalAnchorDiscards).toHaveLength(1);
  const changed=act(g,0,{type:"discard",tile:WAIT_WAN});
  expect(viewFor(changed,1).globalAnchorDiscards).toEqual([]);
  expect(changed.ruleState!.globalAnchors?.[0]).toBeUndefined();
  expect(globalLiability(changed,0,88)).toBe(false);
  const round=changed.replay!.frames.find(f=>f.type==="discard"&&f.tile===WAIT_WAN)!;
  expect(round.globalAnchorDiscards).toEqual([]);
  changed.players[0]!.hand=[WAIT_WAN];recordGlobalAnchor(changed,0,CHANGE_DRAW);
  expect(changed.ruleState!.globalAnchors?.[0]).toBeUndefined();
 });
 it.each(["concealed","open"] as const)("%s杠补牌后出牌不架牌，胡风险范围内牌仍无此外包",route=>{
  const g=established(route,1,22);
  expect(g.players[0]!.hand).toEqual([88]);
  expect(viewFor(g,1).globalAnchorDiscards).toEqual([]);
  expect(globalLiability(g,0,89)).toBe(false);
  const won=finishAnchorClaims(opponentDiscard(g,22),{0:"hu"});
  expect(won.result!.transfers!.some(t=>t.reason==="全球独钓承包")).toBe(false);
 });
 it("不能凭四组牌或旧版无操作来源状态建立/保留架牌",()=>{
  const g=established("concealed");
  g.ruleState!.globalAnchors={0:{discardKind:23,waitKind:4,changed:false}};
  expect(viewFor(g,1).globalAnchorDiscards).toEqual([]);expect(globalLiability(g,0,88)).toBe(false);
  recordGlobalAnchor(g,0,92);expect(g.ruleState!.globalAnchors).toEqual({});
 });
 it("换把清空架牌和待出牌标记",()=>{
  const won=finishAnchorClaims(opponentDiscard(established("win"),22),{0:"hu"});
  won.players.forEach(p=>p!.ready=true);
  const next=startRound(won,9000,seededRandom(4));
  expect(viewFor(next,1).globalAnchorDiscards).toEqual([]);expect(next.ruleState!.pendingGlobalPung).toBeUndefined();
 });
 it.each(["original","win","change","concealed","open"] as const)("演示%s恰好144张物理牌，无重复或缺牌",scenario=>{
  for(const g of [anchorGame(scenario),established(scenario)]){
   const tiles=[...g.wall,...g.players.flatMap(p=>[...p!.hand,...p!.discards,...p!.flowers,...p!.melds.flatMap(m=>m.tiles)])];
   expect(tiles).toHaveLength(144);expect(new Set(tiles).size).toBe(144);
  }
 });
});

it("换同点数另一张不改支，原物理架牌不被后续同点数出牌替换",()=>{
 const g=established("win");g.players[0]!.hand=[89];
 recordGlobalAnchor(g,0,88);
 expect(viewFor(g,1).globalAnchorDiscards).toEqual([{seat:0,tile:92}]);
 expect(globalLiability(g,0,90)).toBe(true);
});
it("碰后尚未出牌时重启恢复，仍能在随后首次出牌建立架牌",()=>{
 const claimed=claimFourth(anchorGame(),"original");
 const restored=JSON.parse(JSON.stringify(claimed));
 expect(viewFor(discardAnchor(restored),1).globalAnchorDiscards).toEqual([{seat:0,tile:92}]);
});
it("架牌被碰走仍只标记那张物理牌，换听后副露里的黄色也同步取消",()=>{
 const g=established(),v=viewFor(g,2),state=cocosState(v,ui);
 state.players[0].discards=[];
 state.players[1].melds=[{type:"pung",tiles:[93,94,92],from:0,concealed:false}];
 expect(layoutTable(state).filter(t=>t.globalAnchor).map(t=>({tile:t.tile,area:t.area}))).toEqual([{tile:92,area:"meld"}]);
 state.globalAnchorDiscards=[];expect(layoutTable(state).filter(t=>t.globalAnchor)).toEqual([]);
});
it("仅有三碰四组且没有第四碰操作凭据，不能从一张手牌重新架牌",()=>{
 const g=established();delete g.ruleState!.globalAnchors;
 recordGlobalAnchor(g,0,92);expect(viewFor(g,1).globalAnchorDiscards).toEqual([]);
});
it("自摸不按架牌向某一家另收外包",()=>{
 const g=advanceToAnchorDraw(established("win"));
 g.players[0]!.hand=[88,90];g.lastDraw=90;g.canSelfWin=true;
 const won=act(g,0,{type:"hu"});
 expect(won.result!.transfers!.some(t=>t.reason==="全球独钓承包")).toBe(false);
});
