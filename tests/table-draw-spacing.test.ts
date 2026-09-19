import { describe, expect, it } from 'vitest';
import { layoutTable, tileFootprint, type SceneTile, type TableSceneState } from '../shared/table-scene';
import { beginTileDrag, shouldDiscardDraggedTile } from '../shared/tile-drag';

function fixture(me: number, melds: number, revealed: boolean): TableSceneState {
  const handCount = 13 - melds * 3;
  return {
    key: 'side-draw-spacing', revision: 1, me, turn: me, dealer: me, phase: 'playing',
    code: '123456', round: 1, remaining: 40, countdown: '10', connected: true,
    disabled: false, practice: false, canDiscard: true, selected: null,
    inspectedKind: null, hintKinds: [], hintLabel: '', actions: [], effects: [], trusteeDisabled: false,
    ...(revealed ? { presentation: 'replay' as const } : {}),
    players: [0, 1, 2, 3].map(seat => ({
      seat, name: String(seat), score: 150, bot: false, trustee: false,
      hand: revealed || seat === me ? Array.from({ length: handCount }, (_, i) => seat * 32 + i) : [],
      handCount, flowers: [136 + seat], discards: [seat * 32 + 14, seat * 32 + 15],
      melds: Array.from({ length: melds }, (_, group) => ({
        type: group % 2 ? 'kong' as const : 'pung' as const,
        tiles: Array.from({ length: group % 2 ? 4 : 3 }, (_, copy) => seat * 32 + 16 + group * 4 + copy),
        from: (seat + 3) % 4, concealed: group === 1,
      })),
    })),
  };
}

function overlaps(a: SceneTile, b: SceneTile) {
  return Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs(a.y - b.y) < (a.h + b.h) / 2;
}

const cases = [0, 1, 2, 3].flatMap(me => [0, 1, 2, 3, 4].flatMap(melds =>
  [false, true].flatMap(revealed => [1, 3].map(side => ({ me, melds, revealed, side })))));

describe('shortened side hands keep the drawn tile beside the current row', () => {
  it.each(cases)('view $me / $melds melds / revealed $revealed / offset $side', ({ me, melds, revealed, side }) => {
    const state = fixture(me, melds, revealed), before = layoutTable(state);
    const player = state.players[(me + side) % 4];
    const originalCount = player.handCount;
    player.handCount++;
    if (revealed) player.hand.push(player.seat * 32 + 13);
    const after = layoutTable(state), regular = before.filter(t => t.seat === player.seat && t.area === 'hand');
    const added = after.filter(t => !before.some(old => old.id === t.id));
    const draw = added[0];

    expect(after).toHaveLength(before.length + 1);
    expect(new Set(after.map(t => t.id)).size).toBe(after.length);
    expect(added).toHaveLength(1);
    expect(draw).toMatchObject({ area: 'hand', seat: player.seat });
    expect(after.filter(t => t.area === 'hand' && t.seat === player.seat)).toHaveLength(originalCount + 1);
    expect(draw.tile).toBe(revealed ? player.seat * 32 + 13 : undefined);
    // Adding a draw must not slide the hand, move a meld or disturb an old discard.
    for (const tile of before) expect(after.find(t => t.id === tile.id)).toEqual(tile);

    const neighbour = side === 1 ? Math.min(...regular.map(t => t.y)) : Math.max(...regular.map(t => t.y));
    expect(Math.abs(draw.y - neighbour)).toBe(39);
    expect(side === 1 ? draw.y < neighbour : draw.y > neighbour).toBe(true);
    for (const tile of [...regular, draw]) {
      expect(tile.y - tile.h / 2).toBeGreaterThanOrEqual(25);
      expect(tile.y + tile.h / 2).toBeLessThanOrEqual(478);
      for (const other of after.filter(t => t.area !== 'hand'))
        expect(overlaps(tile, other), `${tile.id} overlaps ${other.id}`).toBe(false);
    }
    const publicTiles = state.players.flatMap(p => [...p.hand, ...p.flowers, ...p.discards, ...p.melds.flatMap(m => m.tiles)]);
    expect(new Set(publicTiles).size).toBe(publicTiles.length);
  });
});

describe('own hand remains selectable after the meld spacing changes', () => {
  it.each([0, 1, 2, 3, 4])('%i melds retain distinct touch targets and direct drag', melds => {
    const state = fixture(0, melds, false), before = layoutTable(state);
    const hands = before.filter(t => t.clickable);
    expect(hands.map(t => t.tile)).toEqual(state.players[0].hand);
    const meldTiles = before.filter(t => t.area === 'meld' && t.seat === 0);
    for (const hand of hands) {
      for (const meld of meldTiles) expect(overlaps(hand, meld)).toBe(false);
      const targets = hands.filter(t => {
        const footprint = tileFootprint(t);
        return hand.x > Math.min(...footprint.map(p => p[0])) && hand.x < Math.max(...footprint.map(p => p[0])) &&
          hand.y > Math.min(...footprint.map(p => p[1])) && hand.y < Math.max(...footprint.map(p => p[1]));
      });
      expect(targets.map(t => t.tile)).toEqual([hand.tile]);
      state.selected = hand.tile!;
      const selected = layoutTable(state);
      for (const tile of before.filter(t => t.area === 'hand' && t.seat === 0)) {
        const next = selected.find(t => t.id === tile.id)!;
        expect([next.x, next.w, next.h]).toEqual([tile.x, tile.w, tile.h]);
        expect(next.y).toBe(tile.y - (tile.id === hand.id ? 15 : 0));
      }
      const drag = beginTileDrag(state, hand.tile!)!;
      expect(shouldDiscardDraggedTile(state, drag, 0, 70, { x: hand.x, y: 440 })).toBe(true);
    }
  });
});
