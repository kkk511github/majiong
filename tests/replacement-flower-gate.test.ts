import {describe,it,expect} from 'vitest';
import {act,createGame,newPlayer,seats,viewFor} from '../shared/engine';
import {ruleDefaults} from '../shared/nanjing-rules';
import {scoreHand} from '../shared/scoring';
import {ruleSections} from '../src/rule-copy';

const rules=ruleDefaults('nj-garden-b-v3');
/** Anonymous hand reconstructed from 175382 / round 8, no account identifiers. */
function actualHand(flowers=2){
  const p=newPlayer('replacement-regression','回归测试');
  p.hand=[7,11,15,24,27,93,94,95];
  p.melds=[
    {type:'pung',tiles:[68,70,71],from:1,concealed:false},
    {type:'kong',tiles:[100,101,102,103],from:0,concealed:true},
  ];
  p.flowers=[139,133,134,135,136].slice(0,flowers);
  return p;
}
describe('杠上开花本身不免硬花门槛',()=>{
  for(const replacement of ['kong','flower'] as const){
    it.each([1,2,3])(`${replacement}: 开门只有%i硬花，即使软花够也不能胡`,flowers=>{
      expect(scoreHand(actualHand(flowers),rules,{winTile:15,replacement,multiplier:2})).toBeNull();
    });
    it(`${replacement}: 补足4硬花才加开花分，仍保留比下胡资格`,()=>{
      const score=scoreHand(actualHand(4),rules,{winTile:15,replacement,multiplier:2})!;
      expect(score.total).toBe(replacement==='flower'?64:84);
      expect(score.major).toBe(true);
      expect(score.items).toContainEqual({label:replacement==='flower'?'小杠开花':'大杠开花',value:replacement==='flower'?10:20});
    });
    it(`${replacement}: 门清、无花果、其他大胡的独立免花资格不受影响`,()=>{
      const closed=actualHand(2);closed.melds[0].concealed=true;
      expect(scoreHand(closed,rules,{winTile:15,replacement})).not.toBeNull();
      const zero=scoreHand(actualHand(0),rules,{winTile:15,replacement})!;
      expect(zero.items.some(i=>i.label==='无花果')).toBe(true);
      const triplets=actualHand(2);triplets.hand=[4,5,6,24,27,93,94,95];
      const score=scoreHand(triplets,rules,{winTile:6,replacement})!;
      expect(score.items.some(i=>i.label==='对对胡')).toBe(true);
    });
    it(`${replacement}: 保留旧规则版本原有行为`,()=>{
      expect(scoreHand(actualHand(2),ruleDefaults('nj-garden-v2'),{winTile:15,replacement})).not.toBeNull();
    });
  }
  it('175382第8把：不提供胡操作，直接提交胡也被服务端拒绝且不扣款',()=>{
    const g=createGame('175382','replacement-regression',rules);
    g.players=seats.map(seat=>seat===0?actualHand():newPlayer(String(seat),'测试牌友'));
    g.phase='playing';g.round=8;g.turn=0;g.lastDraw=15;g.canSelfWin=true;
    g.replacement={type:'flower',direct:false};g.wall=[80,81,82];
    const before=structuredClone(g);
    expect(viewFor(g,0).actions).not.toContain('hu');
    expect(()=>act(g,0,{type:'hu'})).toThrow();
    expect(g).toEqual(before);
    expect(g.result).toBeUndefined();
  });
  it('实际暗杠→补花→摸四万链路：只收正常杠费，不能提前胡牌收分',()=>{
    const g=createGame('175382','replacement-chain-regression',rules),p=actualHand(1);
    p.hand=[7,11,24,27,93,94,95,100,101,102,103];p.melds.pop();
    g.players=seats.map(seat=>seat===0?p:newPlayer(String(seat),'测试牌友'));
    [93,63,39,165].forEach((score,seat)=>g.players[seat]!.score=score);
    g.phase='playing';g.round=8;g.turn=0;g.lastDraw=102;g.canSelfWin=true;
    g.ruleState={multiplier:2,nextMultiplier:1,nextReasons:[],keepDealer:false,heavenlyEligible:false,heavenlyWaits:{},discards:[],ownDiscards:[[],[],[],[]],kongOccurred:false};
    g.wall=[80,81,15,133];
    const after=act(g,0,{type:'selfKong',tile:100});
    expect(after.players[0]!.hand).toEqual(actualHand().hand);
    expect(after.players[0]!.flowers).toEqual([139,133]);
    expect(after.replacement?.type).toBe('flower');
    expect(after.lastDraw).toBe(15);
    expect(after.players.map(p=>p!.score)).toEqual([123,53,29,155]);
    expect(viewFor(after,0).actions).not.toContain('hu');
    expect(()=>act(after,0,{type:'hu'})).toThrow();
    expect(after.phase).toBe('playing');
    expect(after.result).toBeUndefined();
  });
  it('规则文案明确大小杠开花不是独立免花资格',()=>{
    expect(ruleSections(rules).flat().join('')).toContain('大小杠开花本身不免4硬花');
  });
});
