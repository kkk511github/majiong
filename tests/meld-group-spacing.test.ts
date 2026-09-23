import { expect, it } from 'vitest';
import {
  layoutMeldSources,
  layoutTable,
  tileFootprint,
  type SceneTile,
  type TableSceneState,
} from '../shared/table-scene';

function twoGroupFixture(): TableSceneState {
  return {
    key: 'meld-group-spacing', revision: 1, me: 0, turn: 0, dealer: 0,
    phase: 'playing', code: '123456', round: 1, rounds: 4, remaining: 46,
    countdown: '10', connected: true, disabled: false, practice: true,
    canDiscard: false, selected: null, inspectedKind: null, hintKinds: [],
    hintLabel: '', actions: [], effects: [], trusteeDisabled: false,
    players: Array.from({ length: 4 }, (_, seat) => ({
      name: `牌友${seat}`, score: 90, seat, bot: seat !== 0, trustee: false,
      hand: seat === 0 ? [108, 109, 110, 111, 112, 113, 114] : [],
      handCount: 7, flowers: [], discards: [],
      // The two boundaries deliberately exercise both supplier ends.  The
      // first set turns its last logical card; the second turns its first.
      melds: seat === 2 ? [] : [
        { type: 'pung' as const, tiles: [seat * 24, seat * 24 + 1, seat * 24 + 2], from: (seat + 1) % 4, concealed: false },
        { type: 'pung' as const, tiles: [seat * 24 + 4, seat * 24 + 5, seat * 24 + 6], from: (seat + 3) % 4, concealed: false },
      ],
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

function groupTiles(tiles: SceneTile[], seat: number, group: number) {
  return tiles.filter(t => t.area === 'meld' && t.seat === seat && !t.stack &&
    t.id.startsWith(`meld-${seat}-${group}-`));
}

function logicalIndex(tile: SceneTile) {
  return Number(tile.id.split('-').at(-1));
}

it.each([
  { seat: 0, axis: 'x' as const },
  { seat: 1, axis: 'y' as const },
  { seat: 3, axis: 'y' as const },
])('keeps two exposed pung groups visibly separate for seat $seat', ({ seat, axis }) => {
  const state = twoGroupFixture();
  const tiles = layoutTable(state);
  const groups = [groupTiles(tiles, seat, 0), groupTiles(tiles, seat, 1)];
  expect(groups.map(group => group.length)).toEqual([3, 3]);

  const groupBounds = groups.map(bounds).sort((a, b) =>
    axis === 'x' ? a.left - b.left : a.top - b.top);
  const groupGap = axis === 'x'
    ? groupBounds[1].left - groupBounds[0].right
    : groupBounds[1].top - groupBounds[0].bottom;
  // A real felt seam distinguishes groups. This must never collapse to the
  // one-pixel/overlapped contact used inside a single pung.
  expect(groupGap).toBeGreaterThanOrEqual(6);

  const intraGroupGaps = groups.flatMap(group => {
    const ordered = [...group].sort((a, b) => axis === 'x' ? a.x - b.x : a.y - b.y);
    return ordered.slice(1).map((tile, i) => {
      const before = bounds([ordered[i]]), after = bounds([tile]);
      return axis === 'x' ? after.left - before.right : after.top - before.bottom;
    });
  });
  // Side neighbours meet at their tabletop face edge, hiding the rear tile's
  // projected 6.5px sidewall rather than leaving a green strip per card.
  for (const gap of intraGroupGaps) {
    if (axis === 'y') expect(gap).toBeCloseTo(-6.5, 8);
    else { expect(gap).toBeLessThanOrEqual(.01); expect(gap).toBeGreaterThanOrEqual(-.8); }
  }
  expect(groupGap - Math.max(...intraGroupGaps)).toBeGreaterThanOrEqual(4);
});

it('uses the same visible side-group seam for regular and cross-tile boundaries', () => {
  const state = twoGroupFixture();
  const tiles = layoutTable(state);
  const gaps = [1, 3].map(seat => {
    const pair = [bounds(groupTiles(tiles, seat, 0)), bounds(groupTiles(tiles, seat, 1))]
      .sort((a, b) => a.top - b.top);
    return pair[1].top - pair[0].bottom;
  });
  // Downstream meets regular-to-regular here; upstream meets cross-to-cross.
  // Packing by actual bounds must make both seams visually identical.
  expect(gaps[0]).toBeCloseTo(gaps[1], 8);
});

it('turns adjacent suppliers in opposite/top pungs and keeps the across-table source upright', () => {
  const state = twoGroupFixture();
  const top = state.players[2];
  top.handCount = 4;
  const topSources = [3, 0, 1]; // relative +1 / opposite / relative +3
  top.melds = Array.from({ length: 3 }, (_, group) => ({
    type: 'pung' as const,
    tiles: [48 + group * 4, 49 + group * 4, 50 + group * 4],
    from: topSources[group],
    concealed: false,
  }));
  const tiles = layoutTable(state);
  const markers = layoutMeldSources(tiles, 0);
  const groups = [0, 1, 2].map(group => groupTiles(tiles, 2, group));
  expect(groups.map(group => group.length)).toEqual([3, 3, 3]);
  expect(groups.flat().every(tile => tile.rotation === 0 && tile.shear === 0)).toBe(true);

  const ordered = groups.map(bounds).sort((a, b) => a.left - b.left);
  const gaps = ordered.slice(1).map((group, i) => group.left - ordered[i].right);
  expect(gaps.every(gap => gap >= 6)).toBe(true);
  expect(gaps[0]).toBeCloseTo(gaps[1], 8);

  const allInside:number[] = [];
  groups.forEach((group, groupIndex) => {
    const expectedSource = topSources[groupIndex];
    const expectedSupplierIndex = [2, undefined, 0][groupIndex];
    const supplier = group.filter(tile => tile.pose.includes('cross'));
    expect(supplier).toHaveLength(expectedSupplierIndex === undefined ? 0 : 1);
    if (expectedSupplierIndex !== undefined) {
      expect(logicalIndex(supplier[0])).toBe(expectedSupplierIndex);
      expect(supplier[0].w).toBeGreaterThan(supplier[0].h);
    }
    const ordinary = group.filter(tile => !tile.pose.includes('cross'));
    expect(ordinary).toHaveLength(expectedSupplierIndex === undefined ? 3 : 2);
    expect(ordinary.every(tile => tile.pose === 'meld-bottom' && tile.w < tile.h)).toBe(true);

    const cards = [...group].sort((a, b) => a.x - b.x);
    const inside = cards.slice(1).map((card, i) => bounds([card]).left - bounds([cards[i]]).right);
    allInside.push(...inside);
    for (const gap of inside) {
      expect(gap).toBeLessThanOrEqual(.01);
      expect(gap).toBeGreaterThanOrEqual(-.8);
    }

    // Both top atlas poses expose the green felt-contact edge at screen-bottom.
    // Turning a source card must not lift or drop that physical edge off the row.
    const nearEdges = group.map(tile => bounds([tile]).bottom);
    expect(Math.max(...nearEdges) - Math.min(...nearEdges)).toBeLessThan(1e-8);

    const middle = group.find(tile => logicalIndex(tile) === 1)!;
    const marker = markers.find(item => item.id.startsWith(`source-meld-2-${groupIndex}-`))!;
    expect(marker).toMatchObject({ source: expectedSource, tileId: middle.id, x: middle.x });
    expect(marker.rotation).toBe([180, -90, 0, 90][expectedSource]);
  });
  expect(Math.min(...gaps) - Math.max(...allInside)).toBeGreaterThanOrEqual(4);
});

it('keeps all three supplier directions physically separate on every player rail', () => {
  const state = twoGroupFixture();
  for (const player of state.players) {
    player.handCount = 4;
    player.hand = player.seat === 0 ? [108, 109, 110, 111] : [];
    player.melds = [1, 2, 3].map((relative, group) => ({
      type: 'pung' as const,
      tiles: [player.seat * 24 + group * 4, player.seat * 24 + group * 4 + 1, player.seat * 24 + group * 4 + 2],
      from: (player.seat + relative) % 4,
      concealed: false,
    }));
  }
  const tiles = layoutTable(state);

  for (const seat of [0, 1, 2, 3]) {
    const axis = seat % 2 ? 'y' : 'x';
    const groups = [0, 1, 2].map(group => groupTiles(tiles, seat, group));
    groups.forEach((group, groupIndex) => {
      const expectedSupplierIndex = [2, undefined, 0][groupIndex];
      const supplier = group.filter(tile => tile.pose.includes('cross'));
      expect(supplier).toHaveLength(expectedSupplierIndex === undefined ? 0 : 1);
      if (expectedSupplierIndex !== undefined) {
        expect(logicalIndex(supplier[0])).toBe(expectedSupplierIndex);
        expect(axis === 'x' ? supplier[0].w > supplier[0].h : supplier[0].h > supplier[0].w).toBe(true);
      }

      const ordered = [...group].sort((a, b) => axis === 'x' ? a.x - b.x : a.y - b.y);
      const inside = ordered.slice(1).map((tile, i) => {
        const before = bounds([ordered[i]]), after = bounds([tile]);
        return axis === 'x' ? after.left - before.right : after.top - before.bottom;
      });
      for (const gap of inside) {
        if (axis === 'y') expect(gap).toBeCloseTo(-6.5, 8);
        else { expect(gap).toBeLessThanOrEqual(.01); expect(gap).toBeGreaterThanOrEqual(-.8); }
      }

      const nearEdges = group.map(tile => {
        const edge = bounds([tile]);
        return seat === 0 ? edge.bottom : seat === 1 ? edge.right : seat === 2 ? edge.bottom : edge.left;
      });
      expect(Math.max(...nearEdges) - Math.min(...nearEdges)).toBeLessThan(1e-8);
    });

    const orderedGroups = groups.map(bounds).sort((a, b) =>
      axis === 'x' ? a.left - b.left : a.top - b.top);
    const seams = orderedGroups.slice(1).map((group, i) =>
      axis === 'x' ? group.left - orderedGroups[i].right : group.top - orderedGroups[i].bottom);
    expect(seams.every(gap => gap >= 6)).toBe(true);
    expect(seams[0]).toBeCloseTo(seams[1], 8);
  }
});

it.each([0, 1, 3])('keeps each supplier tile in its directional end slot and tied to its own middle for seat %i', seat => {
  const state = twoGroupFixture();
  const tiles = layoutTable(state);
  const markers = layoutMeldSources(tiles, 0);

  for (const groupIndex of [0, 1]) {
    const group = groupTiles(tiles, seat, groupIndex);
    const middle = group.find(tile => logicalIndex(tile) === 1)!;
    const supplier = group.find(tile => tile.pose.includes('cross'))!;
    expect(logicalIndex(supplier)).toBe(groupIndex === 0 ? 2 : 0);

    // The horizontal tile stays in the first/third logical slot. Its visual
    // correspondence to the group is the shared player-side contact line,
    // not moving the supplier over the middle card.
    const supplierBounds = bounds([supplier]), middleBounds = bounds([middle]);
    const contactDelta = seat === 0
      ? supplierBounds.bottom - middleBounds.bottom
      : seat === 1
        ? supplierBounds.right - middleBounds.right
        : supplierBounds.left - middleBounds.left;
    expect(contactDelta).toBeCloseTo(0, 8);
    if (seat === 0) {
      const first = group.find(tile => logicalIndex(tile) === 0)!;
      const last = group.find(tile => logicalIndex(tile) === 2)!;
      // A wider physical cross changes centre-to-centre distances, but it must
      // remain in its logical end position without crossing the middle card.
      expect(first.x).toBeLessThan(middle.x);
      expect(middle.x).toBeLessThan(last.x);
    }

    // Direction arrows remain anchored to this group's logical middle, so a
    // wide supplier at the group edge can never appear to belong next door.
    const marker = markers.find(item => item.id.startsWith(`source-meld-${seat}-${groupIndex}-`))!;
    expect(marker.tileId).toBe(middle.id);
    expect(marker.x).toBe(middle.x);
    const ownBounds = bounds(group);
    expect(marker.x).toBeGreaterThan(ownBounds.left);
    expect(marker.x).toBeLessThan(ownBounds.right);
    expect(marker.y).toBeGreaterThan(ownBounds.top);
    expect(marker.y).toBeLessThan(ownBounds.bottom);
  }
});
