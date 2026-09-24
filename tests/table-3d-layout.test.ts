import { expect, it } from 'vitest';
import { busyTableFixture, fullMeldFixture } from './previews/table-full-meld-fixture';
import { studyTiles } from './previews/table-3d-layout';
it('each discard face points away from its owner in every observer seat', () => {
  for (let me=0;me<4;me++) {
    const state=busyTableFixture(); state.me=me;
    for (const tile of studyTiles(state).filter(t=>t.area==='river'))
      expect(tile.yaw).toBe(((tile.seat-me+4)%4)*90);
  }
});

it('27 discards per seat preserve wrap directions and leave the compass and counters clear', () => {
  const state=busyTableFixture(), tiles=studyTiles(state).filter(t=>t.area==='river');
  const protectedAreas=[{x:640,y:257,w:124,h:96},{x:531,y:250,w:72,h:66},{x:772,y:250,w:72,h:66}];
  for(const tile of tiles)for(const box of protectedAreas)
    expect(Math.abs(tile.x-box.x)<(tile.w+box.w)/2 && Math.abs(tile.y-box.y)<(tile.h+box.h)/2,tile.id).toBe(false);
  for(const player of state.players) {
    const first=tiles.find(t=>t.tile===player.discards[0])!, next=tiles.find(t=>t.tile===player.discards[10])!;
    if(player.seat===0){expect(next.x).toBe(first.x);expect(next.y).toBeLessThan(first.y);}
    if(player.seat===1){expect(next.y).toBe(first.y);expect(next.x).toBeLessThan(first.x);}
    if(player.seat===2){expect(next.x).toBe(first.x);expect(next.y).toBeGreaterThan(first.y);}
    if(player.seat===3){expect(next.y).toBe(first.y);expect(next.x).toBeGreaterThan(first.x);}
  }
});

it('all flowers share one physical size regardless of seat or viewer', () => {
  for(let me=0;me<4;me++) {
    const state=busyTableFixture();state.me=me;
    state.players.forEach(p=>{p.flowers=Array.from({length:5},(_,i)=>124+p.seat*5+i);});
    const flowers=studyTiles(state).filter(t=>t.area==='flower');
    expect(flowers).toHaveLength(20);
    for(const tile of flowers) {
      expect(tile.modelWidth).toBe(.3);expect(tile.modelLength).toBe(.42);expect(tile.modelThickness).toBeCloseTo(.054);
      expect(tile.modelThickness).toBe(flowers[0].modelThickness);
    }
  }
});

it.each(['pung','kong'] as const)('full %s racks stay inside the redesigned table and the upstream rack has top clearance', kind => {
  for(let me=0;me<4;me++) {
    const state=fullMeldFixture(kind);state.me=me;
    state.players.forEach(p=>{p.hand=p.seat===me?[64,65]:[];});
    const tiles=studyTiles(state);
    for(const tile of tiles) {
      expect(tile.x-tile.w/2,tile.id).toBeGreaterThanOrEqual(16);
      expect(tile.x+tile.w/2,tile.id).toBeLessThanOrEqual(1264);
      expect(tile.y-tile.h/2-tile.modelThickness*100,tile.id).toBeGreaterThanOrEqual(-29);
      expect(tile.y+tile.h/2,tile.id).toBeLessThanOrEqual(619);
      if(tile.area==='meld'&&tile.seat===(me+3)%4)expect(tile.y-tile.h/2).toBeGreaterThanOrEqual(40);
    }
    for(const tile of tiles.filter(t=>t.area==='meld'&&t.seat===me&&!t.stack)) {
      expect(tile.modelWidth).toBe(.5);
      expect(tile.y+tile.h/2).toBeCloseTo(618);
      expect(tile.h).toBeLessThan(65);
    }
  }
});
