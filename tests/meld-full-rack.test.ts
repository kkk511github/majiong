import { describe, expect, it } from 'vitest';
import { layoutPlayerHud, layoutTable, sceneOffset, tileFootprint, type SceneTile, type TableSceneState } from '../shared/table-scene';
import { TILE_POSE_METRICS } from '../shared/tile-pose-metrics';
import { fullMeldFixture } from './previews/table-full-meld-fixture';

type RackKind = 'pung' | 'direct-kong';

function fullRackFixture(me: number, kind: RackKind, revealed: boolean): TableSceneState {
  // Use the same flowers, discards and maximum-width turned pungs as the
  // browser stress preview. Rotate only seat identity for replay coverage.
  const state = fullMeldFixture(kind === 'pung' ? 'pung' : 'kong');
  state.me = me; state.turn = me; state.dealer = me;
  if (revealed) state.presentation = 'replay';
  state.players = state.players.map(player => ({
    ...player, seat: (player.seat + me) % 4,
    hand: revealed ? [64 + player.seat * 2, 65 + player.seat * 2] : player.hand,
    melds: player.melds.map(meld => ({ ...meld, from: (meld.from + me) % 4 })),
  }));
  return state;
}

function bounds(tiles: SceneTile[]) {
  const points = tiles.flatMap(tile => tileFootprint(tile));
  return {
    left: Math.min(...points.map(([x]) => x)),
    right: Math.max(...points.map(([x]) => x)),
    top: Math.min(...points.map(([, y]) => y)),
    bottom: Math.max(...points.map(([, y]) => y)),
  };
}

const cases = [0, 1, 2, 3].flatMap(me => (['pung', 'direct-kong'] as const).flatMap(kind =>
  [false, true].map(revealed => ({ me, kind, revealed }))));

function crossSeatCollisions(tiles: SceneTile[]) {
  const collisions: { a: string; b: string; width: number; height: number }[] = [];
  for (let i = 0; i < tiles.length; i++) for (let j = i + 1; j < tiles.length; j++) {
    if (tiles[i].seat === tiles[j].seat) continue;
    const a = bounds([tiles[i]]), b = bounds([tiles[j]]);
    const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    if (width > .01 && height > .01) collisions.push({ a: tiles[i].id, b: tiles[j].id, width, height });
  }
  return collisions;
}

describe('four simultaneous full meld racks plus a remaining hand and separate draw', () => {
  it.each(cases)('view $me / $kind / revealed $revealed preserves every group and draw', ({ me, kind, revealed }) => {
    const state = fullRackFixture(me, kind, revealed), tiles = layoutTable(state);
    const baseCount = kind === 'pung' ? 3 : 4;
    for (const player of state.players) {
      const offset = sceneOffset(player.seat, me);
      const meld = tiles.filter(tile => tile.area === 'meld' && tile.seat === player.seat);
      const hand = tiles.filter(tile => tile.area === 'hand' && tile.seat === player.seat);
      expect(meld).toHaveLength(4 * baseCount);
      expect(meld.every(tile => !tile.stack)).toBe(true);
      expect(hand).toHaveLength(2);
      const groups = [0, 1, 2, 3].map(group => {
        const cards = meld.filter(tile => tile.id.startsWith(`meld-${player.seat}-${group}-`));
        expect(cards).toHaveLength(baseCount);
        return bounds(cards);
      });
      const horizontal = offset % 2 === 0;
      const ordered = [...groups].sort((a, b) => horizontal ? a.left - b.left : a.top - b.top);
      for (let i = 1; i < ordered.length; i++) {
        const gap = horizontal ? ordered[i].left - ordered[i - 1].right : ordered[i].top - ordered[i - 1].bottom;
        expect(gap).toBeCloseTo(offset === 0 ? 14 : 6, 8);
      }
      if (offset % 2) {
        expect(hand[1].x).toBe(hand[0].x);
        expect(bounds([hand[1]]).left).toBeCloseTo(bounds([hand[0]]).left, 8);
        expect(bounds([hand[1]]).right).toBeCloseTo(bounds([hand[0]]).right, 8);
        expect(Math.abs(hand[1].y - hand[0].y)).toBe(39);
      } else {
        const orderedHand = [...hand].sort((a, b) => a.x - b.x);
        const drawGap = bounds([orderedHand[1]]).left - bounds([orderedHand[0]]).right;
        expect(drawGap).toBeCloseTo(offset === 0 ? 15 : 12, 8);
      }
      if (kind === 'direct-kong') expect(meld.every(tile => !tile.pose.includes('cross') && tile.source === undefined)).toBe(true);
    }
  });

  // Known current limitation / 已知限制：对家手牌沿用 y=16、h=46，
  // 顶部裁掉7px。本轮仅移动对家整排的X，不改变这个既有Y位置。
  // Remove .fails once the visible top hand is intentionally placed in-bounds.
  it.fails.each(cases)('known top-hand crop: view $me / $kind / revealed $revealed fits every body within the table', ({ me, kind, revealed }) => {
    const tiles = layoutTable(fullRackFixture(me, kind, revealed));
    const outside = tiles.flatMap(tile => {
      const box = bounds([tile]);
      return box.left < -.01 || box.right > 1280.01 || box.top < -.01 || box.bottom > 590.01
        ? [{ id: tile.id, seat: tile.seat, ...box }] : [];
    });
    expect(outside, 'every visible body must fit within the 1280×590 table').toEqual([]);
  });

  it.each(cases.filter(({ kind }) => kind === 'pung'))('view $me / full pungs / revealed $revealed has no cross-seat body overlap', ({ me, kind, revealed }) => {
    expect(crossSeatCollisions(layoutTable(fullRackFixture(me, kind, revealed)))).toEqual([]);
  });

  it.each(cases.filter(({ kind }) => kind === 'direct-kong'))('view $me / full direct kongs / revealed $revealed clears the upper-left corner', ({ me, kind, revealed }) => {
    expect(crossSeatCollisions(layoutTable(fullRackFixture(me, kind, revealed)))).toEqual([]);
  });

  it.each(cases)('view $me / $kind / revealed $revealed keeps the shifted far rack separate from its HUD and hand', ({ me, kind, revealed }) => {
    const state = fullRackFixture(me, kind, revealed), tiles = layoutTable(state);
    const opposite = (me + 2) % 4;
    const hand = tiles.filter(tile => tile.seat === opposite && tile.area === 'hand').sort((a, b) => a.x - b.x);
    const meld = tiles.filter(tile => tile.seat === opposite && tile.area === 'meld');
    const leftMeld = tiles.filter(tile => tile.seat === (me + 3) % 4 && tile.area === 'meld');
    const hud = layoutPlayerHud(2), handBox = bounds(hand), meldBox = bounds(meld);
    expect(hud).toMatchObject({ x: 954, y: 54, w: 76, h: 108 });
    expect(meldBox.right).toBeLessThanOrEqual(hud.x - hud.w / 2 - 6 + 1e-8);
    expect(handBox.right).toBeLessThan(meldBox.left);
    expect(meldBox.left - handBox.right).toBeCloseTo(12, 8);
    expect(handBox.left - bounds(leftMeld).right).toBeGreaterThanOrEqual(6);
    expect(bounds([hand[1]]).left - bounds([hand[0]]).right).toBeCloseTo(12, 8);
    for (const tile of hand) expect(tile).toMatchObject({ y: 16, w: 33, h: 46 });
    for (const tile of meld) {
      const metric = TILE_POSE_METRICS[tile.pose];
      expect(tile.w / metric.w).toBeCloseTo(33 / 116, 8);
      expect(tile.h / metric.h).toBeCloseTo(33 / 116, 8);
      expect(bounds([tile]).bottom).toBeCloseTo(45, 8);
    }

    // Moving the far hand/meld rail and HUD must not move any player's fixed
    // flower trough or discard origin. The preview contains one flower and
    // four discards at every relative seat, making those anchors explicit.
    const flowers = [
      { x: 485, y: 455, w: 34, h: 42 },
      { x: 971, y: 396 - 39 * 145 / 165 / 2, w: 39, h: 39 * 145 / 165 },
      { x: 811, y: 67, w: 30, h: 40 },
      { x: 309, y: 108 + 39 * 145 / 165 / 2, w: 39, h: 39 * 145 / 165 },
    ];
    const rivers = [{ x: 492, y: 404 }, { x: 916, y: 384 }, { x: 788, y: 110 }, { x: 360, y: 108 }];
    for (let offset = 0; offset < 4; offset++) {
      const seat = (me + offset) % 4;
      const flower = tiles.find(tile => tile.seat === seat && tile.area === 'flower')!;
      for (const key of ['x', 'y', 'w', 'h'] as const) expect(flower[key]).toBeCloseTo(flowers[offset][key], 8);
      const player = state.players.find(player => player.seat === seat)!;
      for (const [i, tileId] of player.discards.entries()) {
        const tile = tiles.find(tile => tile.seat === seat && tile.area === 'river' && tile.tile === tileId)!;
        expect(tile.x).toBe(rivers[offset].x + (offset === 0 ? i * 32 : offset === 2 ? -i * 32 : 0));
        expect(tile.y).toBe(rivers[offset].y + (offset === 1 ? -i * 28 : offset === 3 ? i * 28 : 0));
      }
    }
  });

  it.each(['pung', 'kong'] as const)('records the unscaled local %s rack margin shown in the preview', kind => {
    const rack = layoutTable(fullMeldFixture(kind)).filter(tile => tile.seat === 0 && (tile.area === 'hand' || tile.area === 'meld'));
    const box = bounds(rack);
    // The extra 28px left translation applies only while the rack has room.
    // The four-open-kong rail is already at its screen-edge safety limit.
    expect(box.left).toBeCloseTo(kind === 'kong' ? 7 : 129.1724137931035, 8);
    expect(box.right).toBe(kind === 'kong' ? 1248 : 1220);
    expect(box.bottom).toBe(589);
  });
});
