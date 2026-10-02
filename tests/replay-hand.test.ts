import { expect, it } from 'vitest';
import { replayHand } from '../src/replay-hand';
import { replayedRound } from './fixtures/replayed-round';
import { layoutTable } from '../shared/table-scene';
import { drawnTileInsertion } from '../shared/table-hand-motion';
import { referenceSnapshot } from './previews/table-reference-layout';
import type { Seat } from '../shared/types';

it('all authorized replay hands preserve every physical tile and use the recorded draw', () => {
  const { frames } = replayedRound().replay!;
  for (let step = 0; step < frames.length; step++) for (const seat of [0, 1, 2, 3] as Seat[]) {
    const shown = replayHand(frames, step, seat, true);
    expect([...shown.hand].sort((a, b) => a - b)).toEqual([...frames[step].players[seat].hand].sort((a, b) => a - b));
    if (shown.drawn !== undefined) expect(shown.hand.at(-1)).toBe(shown.drawn);
    expect(replayHand(frames, step, seat, false)).toEqual({ hand: [], drawn: undefined });
  }
});

it('every replay seat inserts its retained physical draw after discarding a different tile', () => {
  for (const seat of [0, 1, 2, 3]) {
    const state = referenceSnapshot(); state.tableStyle = 'reference-3d'; state.presentation = 'replay';
    const player = state.players[seat];
    player.melds = []; player.discards = [];
    player.hand = [0, 4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 44, 52, 9];
    player.handCount = 14; player.drawn = 9;
    if (seat === state.me) state.drawn = 9;
    const before = layoutTable(state);
    player.hand = player.hand.filter(tile => tile !== 0).sort((a, b) => a - b);
    player.handCount--; player.discards.push(0); player.drawn = undefined; state.drawn = undefined;
    expect(drawnTileInsertion(state, before, seat), `seat ${seat}`).toBe(9);
    player.hand = player.hand.filter(tile => tile !== 9); player.discards.push(9);
    expect(drawnTileInsertion(state, before, seat)).toBeUndefined();
  }
});

it('does not invent an opponent draw from the fourteenth tile of the opening deal', () => {
  const state = referenceSnapshot(); state.tableStyle = 'reference-3d'; state.presentation = 'replay';
  const player = state.players[1]; player.melds = []; player.discards = [];
  player.hand = Array.from({ length: 14 }, (_, i) => i * 4); player.handCount = 14;
  const previous = layoutTable(state);
  player.hand.shift(); player.handCount--; player.discards.push(0);
  expect(drawnTileInsertion(state, previous, 1)).toBeUndefined();
});
