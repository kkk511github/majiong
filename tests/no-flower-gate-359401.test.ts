import { describe, expect, it } from 'vitest';
import { act, createGame, newPlayer, seats, viewFor } from '../shared/engine';
import { ruleDefaults } from '../shared/nanjing-rules';
import { scoreHand, winningKinds, type WinContext } from '../shared/scoring';
import { structuralWaits } from '../shared/scoring-nanjing';
import type { Player, Seat } from '../shared/types';
import { listeningHints, readyDiscardTiles } from '../src/listening-hints';
import { ruleSections } from '../src/rule-copy';

const rules = ruleDefaults('nj-garden-b-v3');
/** Anonymous physical tiles from 359401 / round 7. Winning tile: five bamboo. */
function actual(flowers = 0): Player {
  return { ...newPlayer('flower-gate-regression', '回归牌友'),
    hand: [17,19,76,81,84,94,97], flowers: [124,128,132,136].slice(0, flowers),
    melds: [
      { type: 'pung', tiles: [108,110,111], from: 3, concealed: false },
      { type: 'pung', tiles: [113,114,115], from: 3, concealed: false },
    ],
  };
}
function table(self: boolean, flowers = 0) {
  const g = createGame('359401', 'anonymous-no-flower-regression', rules);
  g.players = seats.map(s => s === 0 ? actual(flowers) : newPlayer(`test-${s}`, `牌友${s}`));
  g.players.forEach(p => { p!.score = 1000; });
  g.turn = self ? 0 : 1; g.players[g.turn]!.hand.push(90);
  const held = new Set(g.players.flatMap(p => [...p!.hand, ...p!.flowers, ...p!.melds.flatMap(m => m.tiles)]));
  const remaining = Array.from({length:124}, (_,i) => i).filter(t => !held.has(t))
    .sort((a,b) => (a*37%127)-(b*37%127));
  for (const s of [1,2,3] as Seat[]) {
    while (g.players[s]!.hand.length < 13 + Number(s === g.turn)) g.players[s]!.hand.push(remaining.shift()!);
  }
  const owned = new Set(g.players.flatMap(p => [...p!.hand, ...p!.flowers, ...p!.melds.flatMap(m => m.tiles)]));
  g.wall = Array.from({length:144}, (_,i) => i).filter(t => !owned.has(t));
  g.phase = 'playing'; g.round = 7; g.lastDraw = 90; g.canSelfWin = true;
  g.ruleState = { multiplier:2, nextMultiplier:1, nextReasons:[], keepDealer:false,
    heavenlyEligible:false, heavenlyWaits:{}, discards:[], ownDiscards:[[],[],[],[]], kongOccurred:false };
  const tiles = [...g.wall, ...g.players.flatMap(p => [...p!.hand, ...p!.flowers, ...p!.melds.flatMap(m => m.tiles)])];
  expect(tiles.length).toBe(144); expect(new Set(tiles).size).toBe(144);
  return g;
}
function shaped(hand: number[], pungs: number[] = []): Player {
  const used = new Map<number,number>();
  const tile = (k:number) => { const n=used.get(k)??0; if(n>=4)throw Error('fifth tile'); used.set(k,n+1); return k*4+n; };
  return {...newPlayer('shape-regression','牌型回归'), hand:hand.map(tile), flowers:[],
    melds:pungs.map((k,i)=>({type:'pung',tiles:[tile(k),tile(k),tile(k)],from:(i%3+1) as Seat,concealed:false}))};
}

describe('无花果必须先有门清或其他独立免花资格', () => {
  const contexts: [string,WinContext][] = [
    ['普通',{}], ['大杠开花',{replacement:'kong'}], ['小杠开花',{replacement:'flower'}],
    ['海底',{seaBottom:true}], ['抢杠',{robbed:true}], ['比下胡',{multiplier:2}],
  ];
  for (const [label,context] of contexts) it.each([0,1,2,3])(`${label}: 开门%i硬花不能单独胡`, flowers => {
    const p=actual(flowers), before=structuredClone(p);
    expect(scoreHand({...p,hand:[...p.hand,90]},rules,{...context,winTile:90})).toBeNull();
    expect(p).toEqual(before);
  });
  it('359401第7把：结构成牌，但零花两碰不具备胡牌或听牌资格',()=>{
    const p=actual();
    expect(structuralWaits(p)).toContain(22);
    expect(scoreHand(p,rules,{tile:90,seat:0,multiplier:2})).toBeNull();
    expect(winningKinds(p,rules,{seat:0})).toEqual([]);
    expect(listeningHints({...p,handCount:7},rules,undefined,[],{seat:0})).toEqual([]);
    const v=viewFor(table(true),0);
    expect(v.actions).not.toContain('hu');
    expect(readyDiscardTiles(v)).toEqual([]);
  });
  it.each([false,true])('实际服务端自摸=%s：不提供胡，强行提交拒绝且不结算',self=>{
    const start=table(self), original=structuredClone(start);
    const g=self?start:act(start,1,{type:'discard',tile:90},1000);
    expect(start).toEqual(original);
    expect(viewFor(g,0).actions).not.toContain('hu');
    const before=structuredClone(g);
    expect(()=>act(g,0,{type:'hu'},1001)).toThrow();
    expect(g).toEqual(before); expect(g.result).toBeUndefined();
    expect(g.players.map(p=>p!.score)).toEqual([1000,1000,1000,1000]);
  });
  it('同牌补足四硬花仍合法，不加无花果',()=>{
    const g=table(true,4), score=scoreHand(g.players[0]!,rules,{winTile:90,multiplier:2})!;
    expect(score.total).toBe(48);
    expect(score.items.some(i=>i.label==='无花果')).toBe(false);
    expect(viewFor(g,0).actions).toContain('hu');
    expect(act(g,0,{type:'hu'},1000).result!.details[0]).toEqual(score);
  });
  const exempt: [string,number[],number[]][] = [
    ['门清',[0,1,2,9,10,11,18,19,20,27,27,27,28,28],[]],
    ['清一色',[1,2,3,2,3,4,5,6,7,8,8],[0]],
    ['混一色',[0,1,2,3,4,5,6,7,8,4,4],[27]],
    ['对对胡',[9,9,9,18,18,18,20,20,20,5,5],[0]],
    ['全球独钓',[5,5],[0,9,18,20]],
    ['七对',[0,0,1,1,9,9,10,10,18,18,19,19,20,20],[]],
    ['双七对',[0,0,0,0,9,9,10,10,18,18,19,19,20,20],[]],
    ['豪华双七对',[0,0,0,0,9,9,9,9,18,18,19,19,20,20],[]],
    ['超豪华双七对',[0,0,0,0,9,9,9,9,18,18,18,18,20,20],[]],
    ['风一色',[27,27,27,27,28,28,28,28,29,29,29,29,30,30],[]],
  ];
  for(const [label,hand,pungs] of exempt) it.each([{}, {replacement:'kong'}, {seaBottom:true}] as WinContext[])(`${label}零花仍合法，也可叠加开花/海底 %j`,context=>{
    const p=shaped(hand,pungs), score=scoreHand(p,rules,context)!;
    expect(score).not.toBeNull();
    expect(score.items.some(i=>i.label===label)).toBe(true);
    expect(score.items).toContainEqual({label:'无花果',value:30});
    expect(score.major).toBe(true);
  });
  it.each(['直杠','暗杠','补杠'])('%s且无剩余碰牌：零花门清仍合法',mode=>{
    const p=actual(); p.hand.push(90);
    p.melds=p.melds.map(m=>({...m,type:'kong',tiles:[Math.floor(m.tiles[0]/4)*4,...[1,2,3].map(i=>Math.floor(m.tiles[0]/4)*4+i)],concealed:mode==='暗杠',added:mode==='补杠'}));
    const score=scoreHand(p,rules,{winTile:90})!;
    expect(score.items).toEqual(expect.arrayContaining([{label:'门清',value:10},{label:'无花果',value:30}]));
  });
  it('App文案不再宣传零花独立豁免',()=>{
    const copy=ruleSections(rules).flat().join('');
    expect(copy).toContain('无花果不独立免花');
    expect(copy).not.toContain('零硬花无花果的独立免花资格');
  });
});
