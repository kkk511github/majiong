import {it,expect} from 'vitest';
import {act,createGame,newPlayer,seats,viewFor} from '../shared/engine';
import {ruleDefaults} from '../shared/nanjing-rules';
import {scoreHand} from '../shared/scoring';
import {structuralWaits} from '../shared/scoring-nanjing';
import {listeningHints,readyDiscardTiles} from '../src/listening-hints';
import type {Player} from '../shared/types';
const rules={...ruleDefaults('nj-garden-b-v3'),turnSeconds:0};
// Sanitized physical tile snapshot: table 200954, hand 8, six-dot drawn.
function player():Player{return {...newPlayer('fixture','牌型核查'),hand:[57,62,66,67,77,79,120,121],flowers:[141,139],melds:[
 {type:'kong',tiles:[105,106,104,107],from:0,concealed:false,added:true},
 {type:'kong',tiles:[4,5,6,7],from:3,concealed:false},
]};}
it('six-dot draw then eight-dot discard listens for two-bamboo and north despite only two hard flowers',()=>{
 const p=player(),before=structuredClone(p),after={...p,hand:p.hand.filter(t=>t!==66)};
 expect(structuralWaits(after)).toEqual([19,30]);
 for(const discard of [66,67])expect(listeningHints({...p,handCount:8},rules,discard,[],{seat:1})).toEqual([19,30]);
 expect(listeningHints({...after,handCount:7},rules,undefined,[],{seat:1})).toEqual([19,30]);
 for(const tile of [76,122])for(const multiplier of [1,2]){
  const score=scoreHand(after,rules,{tile,seat:1,multiplier})!;
  expect(score.total).toBe(30*multiplier);expect(score.items).toContainEqual({label:'门清',value:10});
  expect(score.items).toContainEqual({label:'硬花 2 × 2',value:4});expect(score.items).toContainEqual({label:'软花 3 × 2',value:6});
 }
 expect(p).toEqual(before);
});
function table(winning=76,self=false){
 const g=createGame('000000','added-kong-closed-fixture',rules),p=player();p.hand=p.hand.filter(t=>t!==66);
 g.players=seats.map(s=>s===1?p:newPlayer('fixture-'+s,'测试'+s));g.phase='playing';g.round=8;g.turn=self?1:0;g.canSelfWin=true;
 g.players.forEach(p=>p!.score=1000);g.initialScore=1000;g.settlementBase=1000;g.roundStartScores=[1000,1000,1000,1000];g.roundStartExternalScores=[0,0,0,0];
 const used=new Set([...p.hand,...p.flowers,...p.melds.flatMap(m=>m.tiles),winning]);
 const pool=Array.from({length:144},(_,i)=>i).filter(t=>!used.has(t));
 for(const s of [0,2,3])g.players[s]!.hand=pool.splice(0,13);
 g.players[g.turn]!.hand.push(winning);g.lastDraw=winning;g.wall=pool;
 g.ruleState={multiplier:1,nextMultiplier:1,nextReasons:[],keepDealer:false,heavenlyEligible:false,heavenlyWaits:{},discards:[],ownDiscards:[[],[],[],[]],kongOccurred:true};
 return g;
}
it.each([76,122])('server offers and settles actual discard win %i with closed-hand points',tile=>{
 const before=table(tile),original=structuredClone(before);let g=act(before,0,{type:'discard',tile},1000);
 expect(viewFor(g,1).actions).toContain('hu');g=act(g,1,{type:'hu'},1001);
 for(const s of seats)if(g.phase==='claiming'&&g.pending?.offers[s]&&g.pending.replies[s]===undefined)g=act(g,s,{type:'pass'},1002+s);
 expect(g.result!.winners).toEqual([1]);expect(g.result!.details[1]!.total).toBe(30);expect(g.result!.deltas).toEqual([-30,30,0,0]);
 expect(before).toEqual(original);
});
it('self draw and ready-discard arrows share the same corrected eligibility',()=>{
 const g=table(76,true);expect(viewFor(g,1).actions).toContain('hu');expect(act(g,1,{type:'hu'},1000).result!.details[1]!.items).toContainEqual({label:'门清',value:10});
 const selecting=table(66,true),v=viewFor(selecting,1);expect(readyDiscardTiles(v)).toEqual(expect.arrayContaining([66,67]));
});
it('a remaining pung or an unfinished/robbed upgrade must still require hard flowers for this ordinary hand',()=>{
 const p=player();p.melds[0]={...p.melds[0],type:'pung',tiles:p.melds[0].tiles.slice(0,3),added:undefined};
 expect(listeningHints({...p,handCount:8},rules,66,[],{seat:1})).toEqual([]);
 p.flowers=[141,139,138,137];const after={...p,hand:p.hand.filter(t=>t!==66)},score=scoreHand(after,rules,{tile:76,seat:1})!;
 expect(score).not.toBeNull();expect(score.items.some(i=>i.label==='门清')).toBe(false);
});
it('last pung upgraded to a kong restores the wait immediately; retained old profile is unchanged',()=>{
 const p=player();p.melds[1].added=true;
 expect(listeningHints({...p,handCount:8},rules,66,[],{seat:1})).toEqual([19,30]);
 expect(listeningHints({...p,handCount:8},ruleDefaults('nj-garden-v2'),66,[],{seat:1})).toEqual([]);
});
it('real last-pung upgrade restores listening after the kong completes and preserves its original fee',()=>{
 const g=table(107,true),p=g.players[1]!;
 p.melds[0]={...p.melds[0],type:'pung',tiles:p.melds[0].tiles.slice(0,3),added:undefined};
 expect(listeningHints({...p,handCount:8},rules,107,[],{seat:1})).toEqual([]);
 expect(g.wall).toContain(66);g.wall=[...g.wall.filter(t=>t!==66),66];
 let next=act(g,1,{type:'selfKong',tile:107},1000);
 for(const s of seats)if(next.phase==='claiming'&&next.pending?.offers[s]&&next.pending.replies[s]===undefined)next=act(next,s,{type:'pass'},1001+s);
 expect(next.players[1]!.melds[0]).toMatchObject({type:'kong',added:true,tiles:[105,106,104,107]});
 expect(next.roundTransfers).toEqual([{from:0,to:1,amount:10,reason:'补杠'}]);
 const v=viewFor(next,1);expect(v.lastDraw).toBe(66);
 expect(listeningHints(v.players[1]!,v.rules,66,v.players,{seat:1})).toEqual([19,30]);
 const tiles=[...next.wall,...next.players.flatMap(p=>p?[...p.hand,...p.flowers,...p.discards,...p.melds.flatMap(m=>m.tiles)]:[])];
 expect(tiles).toHaveLength(144);expect(new Set(tiles).size).toBe(144);
});
