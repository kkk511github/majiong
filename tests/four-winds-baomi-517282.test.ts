import { describe, expect, it } from 'vitest';
import { act, createGame, newPlayer, seats, viewFor } from '../shared/engine';
import { ruleDefaults } from '../shared/nanjing-rules';
import { settlementRows } from '../shared/settlement';

/** Anonymous final pre-discard frame of 517282/8. Wall order is irrelevant:
 * a bankrupt finish must not draw another tile. All 144 physical tiles remain unique. */
function fixture(balances = [4, 5, 69, 282]) {
  const g = createGame('517282', 'four-winds-baomi-regression', ruleDefaults('nj-garden-b-v3'));
  const hands = [
    [3,8,16,23,39,41,48,64,66,72,82,102,105],
    [17,18,53,57,63,68,71,74,78,83,92,101,103],
    [20,24,25,33,40,42,50,54,55,58,67,95,98,114],
    [1,2,4,22,27,28,52,62,70,88,94,106,107],
  ];
  const flowers = [[125,136,126,141],[139,134,127],[142,130,124],[143,128,133]];
  const discards = [[120,111,118],[73,6,81],[117,122,108],[115,109,12]];
  g.players = seats.map(s => ({ ...newPlayer(String(s), `测试牌友${s}`), score: balances[s],
    hand: hands[s], flowers: flowers[s], discards: discards[s] }));
  const used = new Set([...hands.flat(), ...flowers.flat(), ...discards.flat()]);
  g.wall = Array.from({ length: 144 }, (_, i) => i).filter(i => !used.has(i));
  g.phase = 'playing'; g.turn = 2; g.dealer = 2; g.round = 8;
  g.roundStartScores = [...balances]; g.roundStartExternalScores = [0,0,0,0]; g.roundTransfers = [];
  g.initialScore = 90; g.settlementBase = 100; g.scoreDivisor = 2;
  g.ruleState = { multiplier: 2, nextMultiplier: 1, nextReasons: [], keepDealer: false,
    heavenlyEligible: false, heavenlyWaits: {}, kongOccurred: false,
    discards: [{ seat: 3, tile: 12 }, { seat: 0, tile: 118 }, { seat: 1, tile: 81 }],
    ownDiscards: discards.map(row => row.map(tile => Math.floor(tile / 4))) };
  g.replay = { version: 1, id: `${g.id}-8`, code: g.code, round: 8, startedAt: 1,
    names: g.players.map(p => p!.name), rules: g.rules, multiplier: 2, frames: [] };
  return g;
}

describe('517282第8把：四连风收分终桌保米', () => {
  it('先实收4+5+10，再由最高余额者补12，账本/回放/结算一致，不额外摸牌', () => {
    const before = fixture(), wall = [...before.wall];
    const ended = act(before, 2, { type: 'discard', tile: 114 }, 1000);
    expect(ended.phase).toBe('finished');
    expect(ended.result!.reason).toBe('bankrupt');
    expect(ended.result!.winners).toEqual([]);
    expect(ended.result!.transfers).toEqual([
      { from: 0, to: 2, amount: 4, reason: '四连风' },
      { from: 1, to: 2, amount: 5, reason: '四连风' },
      { from: 3, to: 2, amount: 10, reason: '四连风' },
      { from: 3, to: 2, amount: 12, reason: '保米' },
    ]);
    expect(ended.players.map(p => p!.score)).toEqual([0,0,100,260]);
    expect(ended.result!.deltas).toEqual([-4,-5,31,-22]);
    expect(ended.result!.externalDeltas).toEqual([0,0,0,0]);
    expect(ended.wall).toEqual(wall);
    expect(ended.history).toHaveLength(1);
    expect(ended.history[0].scores).toEqual([0,0,100,260]);
    expect(ended.replay!.frames.map(f => f.type)).toEqual(['discard','finish']);
    expect(ended.replay!.frames.at(-1)!.players.map(p => p.score)).toEqual([0,0,100,260]);
    expect(ended.replay!.frames.at(-1)!.result).toEqual(ended.result);
    expect(settlementRows(ended.history[0]).find(r => r.seat === 2)!.recorded).toBe(0);
    expect(settlementRows(ended.history[0]).find(r => r.seat === 3)!.recorded).toBe(80);
    const all = [...ended.wall, ...ended.players.flatMap(p => [...p!.hand, ...p!.flowers, ...p!.discards])];
    expect(all.sort((a,b) => a-b)).toEqual(Array.from({ length: 144 }, (_, i) => i));
    expect(viewFor(ended, 2).result?.transfers).toEqual(ended.result!.transfers);
    expect(() => act(ended, 2, { type: 'discard', tile: 114 }, 1001)).toThrow();
  });
  it('遵循关闭保米开关', () => {
    const g = fixture(); g.rules.protectWinner = false;
    const ended = act(g, 2, { type: 'discard', tile: 114 }, 1000);
    expect(ended.players.map(p => p!.score)).toEqual([0,0,88,272]);
    expect(ended.result!.transfers).toHaveLength(3);
  });
  it('收款后超过100不补', () => {
    const ended = act(fixture([4,5,110,241]), 2, { type: 'discard', tile: 114 }, 1000);
    expect(ended.players.map(p => p!.score)).toEqual([0,0,129,231]);
    expect(ended.result!.transfers).toHaveLength(3);
  });
  it('普通倍率仅实际收款不足部分补到100，保米不乘倍率', () => {
    const g = fixture(); g.ruleState!.multiplier = 1;
    const ended = act(g, 2, { type: 'discard', tile: 114 }, 1000);
    expect(ended.players.map(p => p!.score)).toEqual([0,0,100,260]);
    expect(ended.result!.transfers!.at(-1)).toEqual({ from: 3, to: 2, amount: 17, reason: '保米' });
  });
  it('只有一家归零时不提前保米，不提前结束', () => {
    const g = fixture([4,20,69,267]);
    const next = act(g, 2, { type: 'discard', tile: 114 }, 1000);
    expect(next.players.map(p => p!.score)).toEqual([0,10,93,257]);
    expect(next.phase).not.toBe('finished');
    expect(next.roundTransfers!.some(t => t.reason === '保米')).toBe(false);
  });
  it('关闭四连风奖励不触发保米', () => {
    const g = fixture(); g.rules.fourWinds = false;
    const next = act(g, 2, { type: 'discard', tile: 114 }, 1000);
    expect(next.players.map(p => p!.score)).toEqual([4,5,69,282]);
    expect(next.roundTransfers).toEqual([]);
    expect(next.phase).not.toBe('finished');
  });
});
