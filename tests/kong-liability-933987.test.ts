import {describe,it,expect} from 'vitest';
import {act,botAction,createGame,newPlayer,seats,viewFor} from '../shared/engine';
import {ruleDefaults} from '../shared/nanjing-rules';
import {scoreHand} from '../shared/scoring';
import type {Game} from '../shared/types';

function base(): Game {
 const g=createGame('000000','kong-liability-regression',ruleDefaults('nj-garden-b-v3'));
 g.players=seats.map(s=>({...newPlayer(String(s),'测试牌友'),score:1000}));
 g.phase='playing';g.round=7;g.turn=3;g.dealer=0;g.canSelfWin=true;
 g.deadline=Number.MAX_SAFE_INTEGER;g.roundTransfers=[];
 g.ruleState={multiplier:1,nextMultiplier:1,nextReasons:[],keepDealer:false,heavenlyEligible:false,heavenlyWaits:{},discards:[],ownDiscards:[[],[],[],[]],kongOccurred:false};
 g.wall=[0,1,2,3];
 return g;
}
/** Anonymous exact hand from 933987 round 7, before the north added kong. */
function actual(balance=2,multiplier=2){
 const g=base(),p=g.players[3]!;
 p.hand=[21,25,42,46,49,81,82,97,101,106,120];
 p.flowers=[135,141,143,138,136];
 p.melds=[{type:'pung',tiles:[122,123,121],from:0,concealed:false}];
 g.players.forEach((p,s)=>p!.score=[balance,192,76,90][s]);
 g.roundStartScores=g.players.map(p=>p!.score);g.ruleState!.multiplier=multiplier;
 g.lastDraw=120;g.wall=[0,1,2,28];
 return g;
}
function chain(balance=1000){
 const g=base(),p=g.players[3]!;
 // 七条来自A、八条来自B、九条来自C，依次补杠，最后补二筒成牌。
 p.melds=[24,25,26].map((k,s)=>({type:'pung' as const,tiles:[k*4,k*4+1,k*4+2],from:s as 0|1|2,concealed:false}));
 p.hand=[0,4,8,40,99];p.flowers=[124,128,132,136];
 g.players[0]!.score=balance;g.lastDraw=99;g.wall=[60,64,41,107,103];
 g.roundStartScores=g.players.map(p=>p!.score);
 return g;
}
function finishChain(g:Game){
 for(const tile of [99,103,107])g=act(g,3,{type:'selfKong',tile},1000);
 return g;
}
describe('杠到底：最初责任人归零不能杠开成牌',()=>{
 it('直杠扣至归零，也不能杠开结束本把',()=>{
  const g=actual();g.turn=0;g.players[0]!.hand=[123];
  g.players[3]!.melds=[];g.players[3]!.hand.push(121,122);
  const pending=act(g,0,{type:'discard',tile:123},1000);
  expect(viewFor(pending,3).actions).toContain('kong');
  const after=act(pending,3,{type:'kong'},1001);
  expect(after.players[0]!.score).toBe(0);expect(after.replacement?.from).toBe(0);
  expect(viewFor(after,3).actions).not.toContain('hu');
  expect(()=>act(after,3,{type:'hu'},1002)).toThrow('最初供杠者');
 });
 it('933987第7把：补杠扣尽2分，牌型虽成立但不展示胡，也拒绝直接提交',()=>{
  const g=act(actual(),3,{type:'selfKong',tile:120},1000),before=structuredClone(g);
  expect(g.players[0]!.score).toBe(0);expect(g.replacement?.from).toBe(0);
  expect(scoreHand(g.players[3]!,g.rules,{replacement:'kong',winTile:28,multiplier:2})!.total).toBe(108);
  expect(viewFor(g,3).actions).not.toContain('hu');expect(botAction(g,3)?.type).not.toBe('hu');
  expect(()=>act(g,3,{type:'hu'},1001)).toThrow('最初供杠者桌内余额已归零');
  expect(g).toEqual(before);expect(g.result).toBeUndefined();expect(g.phase).toBe('playing');
  expect(g.roundTransfers).toEqual([{from:0,to:3,amount:2,reason:'补杠'}]);
  expect(g.history).toHaveLength(0);
 });
 it.each([1,2])('本把倍率%i：大杠只加20，下一把比下胡，不额外翻本把',multiplier=>{
  let g=act(actual(1000,multiplier),3,{type:'selfKong',tile:120},1000);
  expect(viewFor(g,3).actions).toContain('hu');g=act(g,3,{type:'hu'},1001);
  const score=g.result!.details[3]!;
  expect(score.total).toBe(54*multiplier);expect(score.items).toContainEqual({label:'大杠开花',value:20});
  expect(score.items.some(i=>i.label==='大杠开花 × 2')).toBe(false);
  expect(g.ruleState!.nextMultiplier).toBe(2);
 });
 it('七条A→八条B→九条C连续补杠，胡牌仍只由A付三份',()=>{
  let g=finishChain(chain());expect(g.replacement).toEqual({type:'kong',from:0,direct:true});
  expect(viewFor(g,3).actions).toContain('hu');g=act(g,3,{type:'hu'},1001);
  expect(g.result!.transfers!.filter(t=>t.reason==='杠开包三家')).toEqual([
   {from:0,to:3,amount:g.result!.details[3]!.total*3,reason:'杠开包三家'},
  ]);
 });
 it('连续补杠即使B、C有钱，A已干也不能转移付款或空结算',()=>{
  const g=finishChain(chain(10));expect(g.players[0]!.score).toBe(0);
  expect(g.players[1]!.score).toBe(990);expect(g.players[2]!.score).toBe(990);
  expect(g.replacement?.from).toBe(0);expect(viewFor(g,3).actions).not.toContain('hu');
  expect(()=>act(g,3,{type:'hu'},1001)).toThrow('最初供杠者');
 });
 it('余额还有1分时仍能胡，只收其剩余1分，不要求够付三份',()=>{
  let g=act(actual(21),3,{type:'selfKong',tile:120},1000);
  expect(g.players[0]!.score).toBe(1);expect(viewFor(g,3).actions).toContain('hu');
  g=act(g,3,{type:'hu'},1001);
  expect(g.result!.transfers!.filter(t=>t.reason==='杠开包三家')).toEqual([{from:0,to:3,amount:1,reason:'杠开包三家'}]);
 });
 it('连续杠夹补花仍保留A；A归零仍不能借小杠开绕过',()=>{
  const source=actual();source.wall=[0,1,28,140];
  const g=act(source,3,{type:'selfKong',tile:120},1000);
  expect(g.replacement).toEqual({type:'flower',from:0,direct:true});
  expect(viewFor(g,3).actions).not.toContain('hu');expect(()=>act(g,3,{type:'hu'},1001)).toThrow('最初供杠者');
 });
 it('普通自摸/无供牌者的暗杠不受某一家归零的限制',()=>{
  const g=act(actual(),3,{type:'selfKong',tile:120},1000);
  for(const replacement of [undefined,{type:'kong' as const,direct:false}]){
   const ordinary={...g,replacement};expect(viewFor(ordinary,3).actions).toContain('hu');
   expect(act(ordinary,3,{type:'hu'},1001).result!.winners).toEqual([3]);
  }
 });
 it('首次出牌结束杠开链，下次普通摸牌不残留最初责任人',()=>{
  const g=act(actual(),3,{type:'selfKong',tile:120},1000);
  const after=act(g,3,{type:'discard',tile:28},1001);
  expect(after.turn).toBe(0);expect(after.replacement).toBeUndefined();
 });
 it.each([
  ['梅兰竹菊',[140,141,142,143]],['春夏秋冬',[136,137,138,139]],
  ['四中',[124,125,126,127]],['四发',[128,129,130,131]],['四白',[132,133,134,135]],
 ] as const)('%s已支持花杠，三家付即时分，补牌仍是小杠开',(_name,flowers)=>{
  for(const multiplier of [1,2]){
   const source=actual(1000,multiplier);source.turn=2;source.players[2]!.hand=[60];
   source.players[3]!.hand=source.players[3]!.hand.filter(t=>t!==120);
   source.players[3]!.flowers=[...flowers.slice(0,3)];source.wall=[flowers[3],0,1,28];
   let g=act(source,2,{type:'discard',tile:60},1000);
   expect(g.replacement).toEqual({type:'flower'});
   expect(g.roundTransfers!.filter(t=>t.reason==='花杠')).toEqual([0,1,2].map(from=>({from,to:3,amount:10*multiplier,reason:'花杠'})));
   expect(g.ruleState!.nextReasons).toContain('花杠');
   g=act(g,3,{type:'hu'},1001);
   expect(g.result!.details[3]!.items).toContainEqual({label:'小杠开花',value:10});
   expect(g.result!.transfers!.filter(t=>t.reason==='自摸')).toHaveLength(3);
   expect(g.ruleState!.nextMultiplier).toBe(2);
  }
 });
 it('已有外包优先级和旧规则档案保持原样',()=>{
  const g=finishChain(chain(10));g.players[3]!.melds.forEach(m=>m.from=0);
  g.players[3]!.hand=[0,1,2,40,41];
  expect(viewFor(g,3).actions).toContain('hu');
  expect(act(g,3,{type:'hu'},1001).result!.transfers).toContainEqual({from:0,to:3,amount:50,reason:'三口承包',scope:'external'});
  const legacy=act(actual(),3,{type:'selfKong',tile:120},1000);legacy.rules=ruleDefaults('nj-garden-v2');
  expect(viewFor(legacy,3).actions).toContain('hu');
 });
});
