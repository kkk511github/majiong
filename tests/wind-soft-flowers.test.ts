import { describe, expect, it } from 'vitest';
import { act, createGame, newPlayer, seats } from '../shared/engine';
import { ruleDefaults } from '../shared/nanjing-rules';
import { scoreHand } from '../shared/scoring';
import { createWall, seededRandom } from '../shared/tiles';
import type { Player, WinScore } from '../shared/types';
import { listeningHints } from '../src/listening-hints';
import { ruleSections } from '../src/rule-copy';

const rules = ruleDefaults('nj-garden-b-v3');
function player(kinds: number[], flowers = 4): Player {
  const used = new Map<number, number>();
  return { ...newPlayer('soft-flower-test', '回归牌友'),
    hand: kinds.map(k => { const n = used.get(k) ?? 0; used.set(k, n + 1); return k * 4 + n; }),
    flowers: [124,128,132,136].slice(0, flowers), melds: [],
  };
}
function soft(score: WinScore | null) {
  expect(score).not.toBeNull();
  return score!.items.filter(i => i.label.startsWith('软花 ')).reduce((sum, i) => sum + i.value, 0);
}
function meldPlayer(k: number, type: 'pung' | 'kong', concealed = false, added = false) {
  const p = player([0,1,2,9,10,11,18,19,20,5,5]);
  p.melds = [{ type, tiles: Array.from({length: type === 'kong' ? 4 : 3}, (_, i) => k * 4 + i),
    concealed, from: concealed ? 0 : 1, ...(added ? {added: true} : {}),
  }];
  return p;
}

describe('2026-09-30 B档软花：对子不算，风暗杠合计两花', () => {
  it.each([27,28,29,30])('风牌种类%i：对子0、手内刻子1、碰1、各种杠2', k => {
    expect(soft(scoreHand(player([0,1,2,3,4,5,9,10,11,18,19,20,k,k]), rules))).toBe(0);
    expect(soft(scoreHand(player([0,1,2,9,10,11,18,19,20,k,k,k,5,5]), rules))).toBe(2);
    expect(soft(scoreHand(meldPlayer(k, 'pung'), rules))).toBe(2);
    for (const [concealed, added] of [[true,false],[false,false],[false,true]]) {
      const p = meldPlayer(k, 'kong', concealed, added);
      expect(soft(scoreHand(p, rules))).toBe(4);
      const doubled = scoreHand(p, rules, {multiplier: 2})!;
      expect(doubled.total).toBe(scoreHand(p, rules)!.total * 2);
    }
  });

  it('普通数牌对子、刻子、碰均不算，数字明/补杠1花，暗杠2花不变', () => {
    expect(soft(scoreHand(player([0,1,2,3,4,5,9,10,11,18,19,20,6,6]), rules))).toBe(0);
    expect(soft(scoreHand(player([0,1,2,9,10,11,18,19,20,6,6,6,5,5]), rules))).toBe(0);
    expect(soft(scoreHand(meldPlayer(6,'pung'), rules))).toBe(0);
    expect(soft(scoreHand(meldPlayer(6,'kong'), rules))).toBe(2);
    expect(soft(scoreHand(meldPlayer(6,'kong',false,true), rules))).toBe(2);
    expect(soft(scoreHand(meldPlayer(6,'kong',true), rules))).toBe(4);
  });

  it('176729第一把：东对不算，缺万1花；26原始分，听三六筒不变', () => {
    const p = player([12,13,18,19,19,20,20,21,22,23,24,27,27], 2);
    const score = scoreHand(p, rules, {tile:57})!;
    expect(score.total).toBe(26);
    expect(soft(score)).toBe(2);
    expect(score.items.some(i => i.label === '压档')).toBe(false);
    expect(listeningHints({...p, handCount:p.hand.length}, rules)).toEqual([11,14]);
  });

  it('176729第六把：北对不算，压档只加一次；52×2=104', () => {
    const p = player([4,5,5,6,6,7,16,16,16,22,23,24,30,30], 0);
    const score = scoreHand(p, rules, {winTile:94, multiplier:2})!;
    expect(score.total).toBe(104);
    expect(soft(score)).toBe(0);
    expect(score.items.filter(i => i.label === '压档')).toEqual([{label:'压档',value:2}]);
    expect(score.items).toContainEqual({label:'比下胡 × 2',value:52});
  });

  it('风牌单钓仍可按唯一听口计独占，不把对子另算软花', () => {
    const p = player([0,1,2,3,4,5,9,10,11,18,19,20,27], 0);
    const score = scoreHand(p,rules,{tile:109})!;
    expect(soft(score)).toBe(0);
    expect(score.items).toContainEqual({label:'独占',value:2});
  });

  it('七对风对子仍不加花；软花不能替代开门的四硬花资格', () => {
    expect(soft(scoreHand(player([0,0,9,9,18,18,19,19,27,27,28,28,29,29],0),rules))).toBe(0);
    const p=meldPlayer(27,'pung');p.flowers=[124,128,132];
    expect(scoreHand(p,rules)).toBeNull();
  });

  it('实际胡牌结算与新结算快照都使用修正后的风暗杠花数，不重复收即时杠费', () => {
    const p=meldPlayer(27,'kong',true);
    const g=createGame('000000','local-wind-soft-test',rules);
    g.players=seats.map(s=>s===0?p:newPlayer(String(s),'回归牌友'));
    g.players.forEach(p=>{p!.score=1000;});
    g.phase='playing';g.round=1;g.turn=0;g.dealer=1;g.canSelfWin=true;g.lastDraw=p.hand[0];
    g.roundStartScores=[1000,1000,1000,1000];g.roundStartExternalScores=[0,0,0,0];
    g.ruleState={multiplier:1,nextMultiplier:1,nextReasons:[],keepDealer:false,heavenlyEligible:false,heavenlyWaits:{},discards:[],ownDiscards:[[],[],[],[]],kongOccurred:true};
    const used=new Set([...p.hand,...p.flowers,...p.melds.flatMap(m=>m.tiles)]);
    g.wall=createWall(seededRandom(23)).filter(t=>!used.has(t));
    const expected=scoreHand(p,rules,{winTile:g.lastDraw})!;
    const ended=act(g,0,{type:'hu'},1000);
    expect(soft(ended.result!.details[0]!)).toBe(4);
    expect(ended.result!.details[0]!.total).toBe(expected.total);
    expect(ended.result!.deltas).toEqual([expected.total*3,-expected.total,-expected.total,-expected.total]);
    expect(ended.history[0].result.details[0]).toEqual(ended.result!.details[0]);
    expect(ended.result!.transfers?.every(t=>t.reason==='自摸')).toBe(true);
  });

  it('旧v2规则独立保留，当前帮助文本不再说风对加花或风暗杠3花', () => {
    const old=ruleDefaults('nj-garden-v2');
    expect(soft(scoreHand(player([0,1,2,3,4,5,9,10,11,18,19,20,27,27]),old))).toBe(2);
    expect(soft(scoreHand(meldPlayer(27,'kong',true),old))).toBe(6);
    const text=ruleSections(rules).flat().join('\n');
    expect(text).toContain('所有对子均不算软花');
    expect(text).toContain('风牌明杠、补杠、暗杠均合计 2 个软花');
    expect(text).not.toContain('风牌再加 1');
  });
});
