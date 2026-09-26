import { describe, expect, it } from 'vitest';
import { layoutTable, slotEdgeMetrics, slotMetrics, tileFootprint, type SceneTile, type TableSceneState } from '../shared/table-scene';
import { beginTileDrag, shouldDiscardDraggedTile } from '../shared/tile-drag';
import { TILE_POSE_METRICS } from '../shared/tile-pose-metrics';
import { layout3DTable, standingHandLayout } from '../shared/table-3d-layout';

describe('production 3D opponents retain a separate public draw slot', () => {
  it.each([0,1,2,3].flatMap(me=>[0,1,2,3,4].flatMap(melds=>[1,2,3].map(side=>({me,melds,side})))))(
    'view $me / $melds melds / offset $side', ({me,melds,side}) => {
      for(const revealed of [false,true]) {
        const state=fixture(me,melds,revealed);
        state.tableStyle='reference-3d';
        const player=state.players[(me+side)%4],before=layout3DTable(state);
        player.handCount++;
        if(revealed)player.hand.push(player.seat*32+13);
        const after=layout3DTable(state),draw=after.find(t=>t.drawSlot)!;
        expect(draw).toBeDefined();
        expect(draw.tile).toBe(revealed?player.seat*32+13:undefined);
        expect(after.filter(t=>t.drawSlot)).toHaveLength(1);
        // No sliding regular cards, repacking a meld, or changing another seat.
        for(const tile of before)expect(after.find(t=>t.id===tile.id)).toEqual(tile);
        const regular=after.filter(t=>t.area==='hand'&&t.seat===player.seat&&!t.drawSlot);
        if(side===2){
          expect(Math.min(...regular.map(t=>t.x-t.w/2))-(draw.x+draw.w/2)).toBeGreaterThan(3);
        }else if(!revealed){
          const row=standingHandLayout([...regular,draw],side),added=row.find(t=>t.id===draw.id)!;
          for(const old of standingHandLayout(regular,side))expect(row.find(t=>t.id===old.id)).toEqual(old);
          const neighbours=row.filter(t=>t.id!==draw.id);
          expect(neighbours.every(t=>t.x===added.x&&t.width===added.width)).toBe(true);
          expect(Math.min(...neighbours.map(t=>Math.abs(t.z-added.z)-(t.width+added.width)/2))).toBeCloseTo(.206,6);
        }
      }
    },
  );
});

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
    // A separate draw slot changes only the position along the side rail.
    // Both its centre and physical left/right edges must stay on the same
    // lines as the existing hand, including the downstream concealed back.
    const drawXs = tileFootprint(draw).map(([x]) => x);
    for (const tile of regular) {
      const handXs = tileFootprint(tile).map(([x]) => x);
      expect(draw.x).toBe(tile.x);
      expect(Math.min(...drawXs)).toBeCloseTo(Math.min(...handXs), 8);
      expect(Math.max(...drawXs)).toBeCloseTo(Math.max(...handXs), 8);
    }
    for (const tile of [...regular, draw]) {
      expect(tile.y - tile.h / 2).toBeGreaterThanOrEqual(25);
      expect(tile.y + tile.h / 2).toBeLessThanOrEqual(478);
      // The unchanged hand remains on its outer track. The parallel meld rail
      // may share its longitudinal range, but both stay clear of public lanes.
      for (const other of after.filter(t => t.area !== 'hand' && !(t.area === 'meld' && t.seat === player.seat)))
        expect(overlaps(tile, other), `${tile.id} overlaps ${other.id}`).toBe(false);
    }
    const meld = after.filter(t => t.seat === player.seat && t.area === 'meld' && !t.stack);
    if (meld.length) {
      const direction=side===1?1:-1;
      const handRailX=(tile:SceneTile)=>(revealed
        ?slotMetrics(side,tile.y).x+direction*140
        :slotEdgeMetrics(side,tile.y,'outer').x+direction*122);
      const crossPose=side===1?'meld-cross-right':'meld-cross-left';
      const regularPose=side===1?'right':'left';
      expect(meld.every(t => t.shear === 0 && t.rotation === 0)).toBe(true);
      expect(meld.filter(t => t.pose === crossPose)).toHaveLength(player.melds.filter(m =>
        !m.concealed && m.from !== player.seat && (m.type === 'pung' || m.added === true)).length);
      expect(meld.filter(t => t.pose === crossPose).every(t => t.h > t.w)).toBe(true);
      for(const tile of regular)expect(tile.x).toBeCloseTo(handRailX(tile),8);
      for(const tile of meld.filter(t => t.pose !== crossPose)){
        expect([regularPose,`cover-${regularPose}`]).toContain(tile.pose);
        const normalWidth=TILE_POSE_METRICS[regularPose].w/TILE_POSE_METRICS[regularPose].h*36;
        const edgeAlignedOffset=-direction*48+direction*(normalWidth-tile.w)/2;
        expect(tile.x-handRailX(tile)).toBeCloseTo(edgeAlignedOffset,8);
      }
      for(let group=0;group<player.melds.length;group++){
        const cards=meld.filter(t=>t.id.startsWith(`meld-${player.seat}-${group}-`));
        if(!player.melds[group].concealed){
          const nearEdge=(t:SceneTile)=>{
            const xs=tileFootprint(t).map(([x])=>x);
            return side===1?Math.max(...xs):Math.min(...xs);
          };
          expect(Math.max(...cards.map(nearEdge))-Math.min(...cards.map(nearEdge))).toBeLessThan(1e-8);
        }
        const ordered=[...cards].sort((a,b)=>a.y-b.y);
        const gaps=ordered.slice(1).map((t,i)=>t.y-t.h/2-(ordered[i].y+ordered[i].h/2));
        for(const gap of gaps)expect(gap).toBeCloseTo(-6.5,8);
      }
      const bounds=(tiles:SceneTile[])=>{
        const points=tiles.flatMap(t=>tileFootprint(t));
        return {top:Math.min(...points.map(p=>p[1])),bottom:Math.max(...points.map(p=>p[1]))};
      };
      const meldBounds=bounds(meld);
      expect(meldBounds.top).toBeGreaterThanOrEqual(0);
      expect(meldBounds.bottom).toBeLessThanOrEqual(490);
      const groups=player.melds.map((_,group)=>bounds(meld.filter(t=>t.id.startsWith(`meld-${player.seat}-${group}-`))));
      const orderedGroups=[...groups].sort((a,b)=>a.top-b.top);
      for(let group=1;group<orderedGroups.length;group++)
        expect(orderedGroups[group].top-orderedGroups[group-1].bottom).toBeGreaterThanOrEqual(6);
    }
    const publicTiles = state.players.flatMap(p => [...p.hand, ...p.flowers, ...p.discards, ...p.melds.flatMap(m => m.tiles)]);
    expect(new Set(publicTiles).size).toBe(publicTiles.length);
  });
});

describe('opposite drawn tile keeps its own slot', () => {
  it.each([0, 1, 2, 3].flatMap(me => [false, true].map(revealed => ({ me, revealed }))))
  ('view $me / revealed $revealed leaves a visible drawGap after the far hand', ({ me, revealed }) => {
    const state = fixture(me, 0, revealed);
    const player = state.players[(me + 2) % 4];
    const before = layoutTable(state).filter(tile => tile.area === 'hand' && tile.seat === player.seat);
    player.handCount++;
    if (revealed) player.hand.push(player.seat * 32 + 13);
    const after = layoutTable(state).filter(tile => tile.area === 'hand' && tile.seat === player.seat);
    const drawn = after.find(tile => !before.some(old => old.id === tile.id))!;
    const regular = after.filter(tile => tile.id !== drawn.id);

    expect(drawn).toBeDefined();
    expect(after).toHaveLength(before.length + 1);
    for (const tile of before) expect(after.find(next => next.id === tile.id)).toEqual(tile);

    const drawnBox = tileFootprint(drawn);
    const drawnLeft = Math.min(...drawnBox.map(([x]) => x));
    const drawnRight = Math.max(...drawnBox.map(([x]) => x));
    const nearest = regular.reduce((best, tile) => Math.min(best,
      Math.max(0,
        Math.min(...tileFootprint(tile).map(([x]) => x)) - drawnRight,
        drawnLeft - Math.max(...tileFootprint(tile).map(([x]) => x)))), Infinity);
    expect(nearest).toBeGreaterThanOrEqual(8);

    const ordered = [...regular].sort((a, b) => a.x - b.x);
    const handGaps = ordered.slice(1).map((tile, i) => {
      const left = Math.min(...tileFootprint(tile).map(([x]) => x));
      const right = Math.max(...tileFootprint(ordered[i]).map(([x]) => x));
      return left - right;
    });
    expect(nearest).toBeGreaterThan(Math.max(...handGaps));
  });
});

describe('own hand remains selectable after the meld spacing changes', () => {
  it.each([0, 1, 2, 3, 4])('%i melds retain distinct touch targets and direct drag', melds => {
    const state = fixture(0, melds, false), before = layoutTable(state);
    const hands = before.filter(t => t.clickable);
    expect(hands.map(t => t.tile)).toEqual(state.players[0].hand);
    const meldTiles = before.filter(t => t.area === 'meld' && t.seat === 0);
    for (const hand of hands) {
      for (const meld of meldTiles) expect(overlaps(hand, meld), `${hand.id} overlaps ${meld.id}`).toBe(false);
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
