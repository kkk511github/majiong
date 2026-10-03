import { expect, it, vi } from 'vitest';
import { ListeningHintCache } from '../src/listening-hint-cache';
import { listeningHints, readyDiscardTiles, unseenHintCounts } from '../src/listening-hints';
import { hintInteractionView } from './fixtures/app-interaction';
import { act, botAction, createGame, newPlayer, seats, startRound, viewFor } from '../shared/engine';
import { ruleDefaults } from '../shared/nanjing-rules';
import { seededRandom } from '../shared/tiles';
import type { Rules, View } from '../shared/types';

const original = (v: View, tile?: number) => listeningHints(v.players[v.me]!, v.rules, tile, v.players, { seat: v.me, earthlyWaits: v.earthlyWaits });

it('同手牌的网络/分数/弃牌更新复用听口；箭头与选牌共享计算，未见数仍即时变化', () => {
  const compute = vi.fn(listeningHints), cache = new ListeningHintCache(compute), view = hintInteractionView();
  expect(cache.readyDiscards(view)).toEqual(readyDiscardTiles(view));
  const calls = compute.mock.calls.length;
  expect(cache.hints(view, 32)).toEqual(original(view, 32));
  expect(compute).toHaveBeenCalledTimes(calls);
  const changed = structuredClone(view);
  changed.revision++; changed.players[1]!.online = false; changed.players[2]!.score += 5;
  Object.assign(changed.players[0]!, { passedHu: true, passedPung: [1] });
  changed.players[3]!.discards.push(60);
  // Even a hostile public input must not cause an opponent's hidden hand to
  // influence hints (the real bridge already strips it).
  changed.players[1]!.hand = [112, 113, 114, 115];
  expect(cache.readyDiscards(changed)).toEqual(readyDiscardTiles(changed));
  expect(cache.hints(changed, 32)).toEqual(original(changed, 32));
  expect(compute).toHaveBeenCalledTimes(calls);
  expect(unseenHintCounts(view, [15])[15]).toBe(4);
  expect(unseenHintCounts(changed, [15])[15]).toBe(3);
});

const changes: [string, (v: View) => void][] = [
  ['手牌实体', v => { v.players[0]!.hand[0] = 1; }],
  ['硬花', v => { v.players[0]!.flowers.push(124); }],
  ['副露牌', v => { v.players[0]!.melds[0].tiles = [4, 5, 6]; }],
  ['副露来源', v => { v.players[0]!.melds[0].from = 2; }],
  ['暗杠标志', v => { v.players[0]!.melds[0].concealed = true; }],
  ['补杠标志', v => { v.players[0]!.melds[0].added = true; }],
  ['碰杠类型', v => { v.players[0]!.melds[0].type = 'kong'; }],
  ['规则档', v => { v.rules.id = 'nj-casual-v1'; }],
  ['花数门槛', v => { v.rules.minimumFlowers++; }],
  ['花倍率', v => { v.rules.flowerDouble = false; }],
  ['天听/地胡上下文', v => { v.earthlyWaits = [28]; }],
  ['公开碰牌', v => { v.players[1]!.melds.push({ type: 'pung', tiles: [4, 5, 6], from: 2, concealed: false }); }],
  ['房间身份', v => { v.id += '-new'; }],
  ['房间号', v => { v.code = '654321'; }],
  ['局数', v => { v.round++; }],
  ['本人座位', v => { v.players[1] = structuredClone(v.players[0]); v.me = 1; }],
];
it.each(changes)('%s改变时立即失效，并与原算法一致', (_label, change) => {
  const compute = vi.fn(listeningHints), cache = new ListeningHintCache(compute), view = hintInteractionView();
  view.players[0]!.melds = [{ type: 'pung', tiles: [108, 109, 110], from: 1, concealed: false }];
  cache.hints(view, 32); const changed = structuredClone(view); change(changed);
  expect(cache.hints(changed, 32)).toEqual(original(changed, 32));
  expect(compute).toHaveBeenCalledTimes(2);
});

it('压绝公开碰牌、花数和地胡资格变化能改变听口，不能命中过期结果', () => {
  const cache = new ListeningHintCache(), view = hintInteractionView(), player = view.players[0]!;
  view.rules.id = 'nj-garden-v2';
  player.hand = [0, 8, 36, 40, 44, 72, 76, 80, 112, 113];
  player.melds = [{ type: 'pung', tiles: [108, 109, 110], from: 1, concealed: false }];
  expect(cache.hints(view)).not.toContain(1);
  view.players[1]!.melds = [{ type: 'pung', tiles: [5, 6, 7], from: 2, concealed: false }];
  expect(cache.hints(view)).toContain(1);
  view.players[1]!.melds[0].concealed = true;
  expect(cache.hints(view)).not.toContain(1);
  view.earthlyWaits = [1]; expect(cache.hints(view)).toContain(1);
  view.earthlyWaits = []; expect(cache.hints(view)).not.toContain(1);
  player.flowers = [124, 128, 132, 136]; expect(cache.hints(view)).toContain(1);
  player.flowers = []; expect(cache.hints(view)).not.toContain(1);
});

it('非法牌不扩张缓存；返回值不可污染后续提示；离桌清理；托管与响应期仍隐藏箭头', () => {
  const compute = vi.fn(listeningHints), cache = new ListeningHintCache(compute), view = hintInteractionView();
  const expected = original(view, 32); cache.hints(view, 32).push(999);
  expect(cache.hints(view, 32)).toEqual(expected);
  for (let i = 144; i < 1000; i++) expect(cache.hints(view, i)).toEqual([]);
  expect(compute).toHaveBeenCalledTimes(1);
  view.players[0]!.trustee = true; expect(cache.readyDiscards(view)).toEqual([]);
  view.players[0]!.trustee = false; view.phase = 'claiming'; expect(cache.readyDiscards(view)).toEqual([]);
  view.phase = 'playing'; view.canDiscard = false; expect(cache.readyDiscards(view)).toEqual([]);
  cache.clear(); cache.hints(view, 32); expect(compute).toHaveBeenCalledTimes(2);
  view.players[0] = null; expect(cache.hints(view, 32)).toEqual([]);
});

it.each(['nj-casual-v1', 'nj-garden-v2', 'nj-open-v2', 'nj-garden-b-v3'] as Rules['id'][])('%s完整真实发牌/机器人动作：每座听口和可听弃牌与原算法逐状态相同', profile => {
  let game = createGame('234567', 'hint-trace', ruleDefaults(profile));
  game.players = seats.map(seat => ({ ...newPlayer(String(seat), `牌友${seat}`, true), ready: true }));
  game = startRound(game, 1000, seededRandom(31));
  const caches = seats.map(() => new ListeningHintCache());
  let steps = 0;
  while (['playing', 'claiming'].includes(game.phase) && steps < 600) {
    for (const seat of seats) {
      const view = viewFor(game, seat), cache = caches[seat];
      const before = JSON.stringify(view), tile = view.players[seat]!.hand[steps % view.players[seat]!.hand.length];
      expect(cache.readyDiscards(view)).toEqual(readyDiscardTiles(view));
      expect(cache.hints(view, tile)).toEqual(original(view, tile));
      expect(cache.hints(structuredClone(view), tile)).toEqual(original(view, tile));
      expect(cache.hints(view)).toEqual(original(view));
      expect(JSON.stringify(view)).toBe(before);
    }
    const seat = game.phase === 'playing' ? game.turn : seats.find(s => game.pending?.offers[s] && game.pending.replies[s] === undefined)!;
    const action = botAction(game, seat); expect(action).not.toBeNull();
    game = act(game, seat, action!, 2000 + steps++ * 1000);
  }
  expect(steps).toBeGreaterThan(20);
  expect(['ended', 'finished']).toContain(game.phase);
});
