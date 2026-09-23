import { expect, it } from 'vitest';
import { layoutPlayerHud, layoutTable, tileFootprint, type SceneTile, type TableSceneState } from '../shared/table-scene';
import { TILE_POSE_METRICS } from '../shared/tile-pose-metrics';

type KongKind = 'direct' | 'added' | 'concealed';

function kongFixture(groups: number, kind: KongKind = 'added'): TableSceneState {
  return {
    key: `kong-stack-${groups}`, revision: 1, me: 0, turn: 0, dealer: 0,
    phase: 'playing', presentation: 'replay', code: '123456', round: 1, rounds: 4,
    remaining: 40, countdown: '10', connected: true, disabled: false, practice: true,
    canDiscard: false, selected: null, inspectedKind: null, hintKinds: [], hintLabel: '',
    actions: [], effects: [], trusteeDisabled: false,
    players: Array.from({ length: 4 }, (_, seat) => ({
      name: `牌友${seat}`, score: 90, seat, bot: seat !== 0, trustee: false,
      hand: Array.from({ length: 13 - groups * 3 }, (_, i) => seat * 32 + 16 + i),
      handCount: 13 - groups * 3, flowers: [], discards: [],
      melds: Array.from({ length: groups }, (_, group) => ({
        type: 'kong' as const,
        tiles: [seat * 32 + group * 4, seat * 32 + group * 4 + 1, seat * 32 + group * 4 + 2, seat * 32 + group * 4 + 3],
        from: (seat + 1) % 4,
        concealed: kind === 'concealed',
        added: kind === 'added',
      })),
    })),
  };
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

function groupTiles(state: TableSceneState, seat: number, group = 0) {
  return layoutTable(state).filter(tile => tile.area === 'meld' && tile.seat === seat &&
    tile.id.startsWith(`meld-${seat}-${group}-`));
}

function axisGap(a: SceneTile, b: SceneTile, horizontal: boolean) {
  const aa = bounds([a]), bb = bounds([b]);
  return horizontal ? bb.left - aa.right : bb.top - aa.bottom;
}

function contactEdge(tile: SceneTile, seat: number) {
  const box = bounds([tile]);
  return seat === 0 || seat === 2 ? box.bottom : seat === 1 ? box.right : box.left;
}

it.each([0, 1, 2, 3])('lays seat %i direct/open kong as four complete forward bases with no stack or supplier turn', seat => {
  const group = groupTiles(kongFixture(1, 'direct'), seat);
  expect(group).toHaveLength(4);
  expect(group.filter(tile => tile.stack)).toHaveLength(0);
  expect(group.every(tile => tile.tile !== undefined && !tile.pose.startsWith('cover-'))).toBe(true);
  expect(group.every(tile => !tile.pose.includes('cross'))).toBe(true);
  expect(group.every(tile => tile.source === undefined)).toBe(true);

  const horizontal = seat % 2 === 0;
  const ordered = [...group].sort((a, b) => horizontal ? a.x - b.x : a.y - b.y);
  for (let i = 1; i < ordered.length; i++) {
    const gap = axisGap(ordered[i - 1], ordered[i], horizontal);
    expect(gap).toBeLessThanOrEqual(.01);
    expect(gap).toBeGreaterThanOrEqual(horizontal ? -.8 : -6.6);
    if (!horizontal) expect(gap).toBeCloseTo(-6.5, 8);
  }
  const baselines = group.map(tile => contactEdge(tile, seat));
  expect(Math.max(...baselines) - Math.min(...baselines)).toBeLessThan(.01);
});

const stackedCases = (['added', 'concealed'] as const).flatMap(kind =>
  [0, 1, 2, 3].map(seat => [kind, seat] as const));

it.each(stackedCases)('aligns %s kong at seat %i to the visual centre of its middle target', (kind, seat) => {
  const tiles = layoutTable(kongFixture(3, kind));
  const horizontal = seat % 2 === 0;
  const offsets: number[] = [];
  for (let groupIndex = 0; groupIndex < 3; groupIndex++) {
    const group = tiles.filter(tile => tile.area === 'meld' && tile.seat === seat &&
      tile.id.startsWith(`meld-${seat}-${groupIndex}-`));
    const base = group.filter(tile => !tile.stack);
    const target = group.find(tile => tile.id.endsWith('-1'))!;
    const upper = group.find(tile => tile.stack)!;

    expect(group).toHaveLength(4);
    expect(base).toHaveLength(3);
    expect(upper.id).toBe(`meld-${seat}-${groupIndex}-3`);
    const depthOffset = upper.y - target.y;
    if (!horizontal) {
      // Height in the baked side camera projects upward on screen, not toward
      // the centre of the table. Keep the middle tile's player-side edge fixed
      // while revealing the covered/exposed body beneath the upper tile.
      expect(contactEdge(upper, seat)).toBeCloseTo(contactEdge(target, seat), 8);
      expect(Math.abs(upper.x - target.x)).toBeLessThan(.1);
      expect(-depthOffset).toBeGreaterThanOrEqual(7.5);
      expect(-depthOffset).toBeLessThanOrEqual(8.5);
      expect(depthOffset).toBeCloseTo(-8, 8);
    } else {
      expect(upper.x).toBe(target.x);
      expect(depthOffset).toBeLessThan(0);
      if (seat === 2) {
        expect(depthOffset).toBeCloseTo(-4, 8);
        expect(bounds([upper]).top).toBeGreaterThanOrEqual(0);
        const visibleBand = bounds([target]).bottom - bounds([upper]).bottom;
        expect(visibleBand).toBeGreaterThanOrEqual(3.5);
        expect(visibleBand).toBeLessThanOrEqual(4.5);
      }
    }
    offsets.push(Math.abs(depthOffset));
    if (kind === 'added') {
      expect(upper.pose).toBe(target.pose);
      expect([upper.w, upper.h]).toEqual([target.w, target.h]);
    }
    expect(upper.z).toBeGreaterThan(Math.max(...base.map(tile => tile.z)));
  }
  expect(Math.max(...offsets) - Math.min(...offsets)).toBeLessThan(1e-8);
});

it.each(['added', 'concealed'] as const)('keeps the opposite %s-kong upper layer visible and clear of its flower/river fixtures', kind => {
  const state = kongFixture(2, kind);
  state.players[2].flowers = [136];
  state.players[2].discards = [80];
  const tiles = layoutTable(state);
  const top = tiles.filter(tile => tile.seat === 2);
  const upper = top.find(tile => tile.id === 'meld-2-1-3')!;
  const target = top.find(tile => tile.id === 'meld-2-1-1')!;
  const flower = top.find(tile => tile.area === 'flower')!;
  const river = top.find(tile => tile.area === 'river')!;

  expect(upper.x).toBe(target.x);
  expect(upper.y - target.y).toBeCloseTo(-4, 8);
  expect(bounds([upper]).top).toBeGreaterThanOrEqual(0);
  expect(bounds([target]).bottom).toBeCloseTo(45, 8);
  const visibleBand = bounds([target]).bottom - bounds([upper]).bottom;
  expect(visibleBand).toBeGreaterThanOrEqual(3.5);
  expect(visibleBand).toBeLessThanOrEqual(4.5);
  expect(upper.z).toBeGreaterThan(target.z);
  const separate = (a: SceneTile, b: SceneTile) => {
    const aa = bounds([a]), bb = bounds([b]);
    return Math.max(bb.left - aa.right, aa.left - bb.right, bb.top - aa.bottom, aa.top - bb.bottom);
  };
  expect(separate(upper, flower)).toBeGreaterThanOrEqual(1);
  expect(separate(upper, river)).toBeGreaterThanOrEqual(1);
});

it.each([0, 1, 2, 3])('keeps seat %i added-kong three-tile pung base fixed and stacks only tile four', seat => {
  const addedState = kongFixture(1, 'added');
  const added = groupTiles(addedState, seat);
  const pungState = structuredClone(addedState);
  pungState.players[seat].melds[0] = {
    type: 'pung',
    tiles: pungState.players[seat].melds[0].tiles.slice(0, 3),
    from: pungState.players[seat].melds[0].from,
    concealed: false,
  };
  const pung = groupTiles(pungState, seat);
  const base = added.filter(tile => !tile.stack);
  expect(base).toHaveLength(3);
  expect(added.filter(tile => tile.stack)).toHaveLength(1);
  expect(base.map(tile => [tile.x, tile.y, tile.w, tile.h, tile.pose])).toEqual(
    pung.map(tile => [tile.x, tile.y, tile.w, tile.h, tile.pose]));
  expect(base.filter(tile => tile.pose.includes('cross')).map(tile => tile.id)).toEqual([`meld-${seat}-0-2`]);
});

it.each([0, 1, 2, 3])('keeps seat %i concealed-kong bases covered and only its centred upper tile face-up', seat => {
  const group = groupTiles(kongFixture(1, 'concealed'), seat);
  const base = group.filter(tile => !tile.stack);
  const middle = group.find(tile => tile.id.endsWith('-1'))!;
  const upper = group.find(tile => tile.stack)!;
  expect(base).toHaveLength(3);
  expect(base.every(tile => tile.tile === undefined && tile.pose.startsWith('cover-'))).toBe(true);
  expect(group.filter(tile => tile.stack).map(tile => tile.tile)).toEqual([seat * 32]);
  if (seat % 2 === 0) expect(upper.x).toBe(middle.x);
  else {
    expect(contactEdge(upper, seat)).toBeCloseTo(contactEdge(middle, seat), 8);
    expect(Math.abs(upper.x - middle.x)).toBeLessThan(.1);
    expect(upper.y - middle.y).toBeCloseTo(-8, 8);
  }
});

it.each([1, 3])('keeps side seat %i middle-target alignment and all pung bases fixed when any source is added', seat => {
  for (const relativeSource of [1, 2, 3]) {
    const pungState = kongFixture(3, 'added');
    pungState.players[seat].melds = pungState.players[seat].melds.map(meld => ({
      ...meld, type: 'pung', tiles: meld.tiles.slice(0, 3),
      from: (seat + relativeSource) % 4, added: undefined,
    }));
    const original = layoutTable(pungState).filter(tile => tile.area === 'meld' && tile.seat === seat);
    for (let addedGroup = 0; addedGroup < 3; addedGroup++) {
      const addedState = structuredClone(pungState);
      const pung = addedState.players[seat].melds[addedGroup];
      addedState.players[seat].melds[addedGroup] = {
        ...pung, type: 'kong', tiles: [...pung.tiles, pung.tiles[0] + 3], added: true,
      };
      const changed = layoutTable(addedState).filter(tile => tile.area === 'meld' && tile.seat === seat);
      expect(changed.filter(tile => !tile.stack).map(tile => [tile.id, tile.x, tile.y, tile.w, tile.h, tile.pose])).toEqual(
        original.map(tile => [tile.id, tile.x, tile.y, tile.w, tile.h, tile.pose]));
      const target = original.find(tile => tile.id === `meld-${seat}-${addedGroup}-1`)!;
      const upper = changed.find(tile => tile.stack)!;
      expect(upper.x).toBe(target.x);
      expect(upper.y - target.y).toBeCloseTo(-8, 8);
      expect(upper.pose).toBe(target.pose);
    }
  }
});

it.each((['direct', 'added'] as const).flatMap(kind => [0, 1, 2, 3].map(seat => [kind, seat] as const)))
('%s kong uses the same seat %i physical scale for every exposed base and visible hand', (kind, seat) => {
  const tiles = layoutTable(kongFixture(1, kind));
  const horizontal = seat % 2 === 0;
  const hand = tiles.find(tile => tile.area === 'hand' && tile.seat === seat)!;
  const handMetric = TILE_POSE_METRICS[hand.pose];
  const handScale = horizontal ? hand.w / handMetric.w : hand.h / handMetric.h;
  const base = tiles.filter(tile => tile.area === 'meld' && tile.seat === seat && !tile.stack);
  expect(base).toHaveLength(kind === 'direct' ? 4 : 3);
  for (const tile of base) {
    const metric = TILE_POSE_METRICS[tile.pose];
    const meldScale = horizontal ? tile.w / metric.w : tile.h / metric.h;
    expect(meldScale, `${tile.id}/${tile.pose} differs from ${hand.id}/${hand.pose}`).toBeCloseTo(handScale, 8);
  }
});

it.each([1, 2, 3, 4])('keeps %i side meld groups at visible-hand scale instead of shrinking the tiles', groups => {
  const tiles = layoutTable(kongFixture(groups));
  for (const seat of [1, 3]) {
    const hand = tiles.find(tile => tile.area === 'hand' && tile.seat === seat)!;
    const handScale = hand.h / TILE_POSE_METRICS[hand.pose]!.h;
    const bases = tiles.filter(tile => tile.area === 'meld' && tile.seat === seat && !tile.stack);
    expect(bases).toHaveLength(groups * 3);
    for (const tile of bases) {
      const metric = TILE_POSE_METRICS[tile.pose]!;
      expect(tile.h / metric.h, `${tile.id} shrank with ${groups} groups`).toBeCloseTo(handScale, 8);
    }
  }
});

it.each([1, 2, 3, 4])('keeps the local replacement draw on-table with %i maximum-width meld groups', groups => {
  const state = kongFixture(groups, 'direct');
  const player = state.players[0];
  const drawn = 120 + groups;
  player.hand.push(drawn);
  player.handCount++;
  state.drawn = drawn;
  const rack = layoutTable(state).filter(tile => tile.seat === 0 && (tile.area === 'hand' || tile.area === 'meld'));
  const rackBounds = bounds(rack);
  const draw = rack.find(tile => tile.id === `draw-${drawn}`)!;
  const drawBounds = bounds([draw]);

  expect(rackBounds.left).toBeGreaterThanOrEqual(0);
  expect(rackBounds.right).toBeLessThanOrEqual(1280);
  expect(drawBounds.right).toBeLessThanOrEqual(1248);
});

it('keeps four full-size opposite melds clear of the compact player HUD', () => {
  const state = kongFixture(4);
  state.players[2].melds.forEach(meld => { meld.from = 3; });
  const tiles = layoutTable(state);
  const hud = layoutPlayerHud(2);
  const melds = tiles.filter(tile => tile.area === 'meld' && tile.seat === 2);
  const right = Math.max(...melds.flatMap(tile => tileFootprint(tile).map(([x]) => x)));
  expect(right).toBeLessThanOrEqual(hud.x - hud.w / 2 - 6);

  const hand = tiles.find(tile => tile.area === 'hand' && tile.seat === 2)!;
  const handRight = Math.max(...tileFootprint(hand).map(([x]) => x));
  const meldLeft = Math.min(...melds.flatMap(tile => tileFootprint(tile).map(([x]) => x)));
  expect(meldLeft - handRight).toBeGreaterThanOrEqual(6);
});
