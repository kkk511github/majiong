import { expect, it } from 'vitest';
import { layoutTable, layoutMeldSources, meldSourceTileIndex, sceneOffset, slotEdgeMetrics, tileFootprint, type TableSceneState } from '../shared/table-scene';
import { TILE_POSE_METRICS } from '../shared/tile-pose-metrics';

export function markerFixture(me=0):TableSceneState {
 return {key:'meld-marker-check',revision:1,me,turn:0,dealer:0,phase:'playing',code:'123456',round:1,rounds:4,remaining:46,countdown:'10',connected:true,disabled:false,practice:true,canDiscard:false,selected:null,inspectedKind:null,hintKinds:[],hintLabel:'',actions:[],effects:[],trusteeDisabled:false,
  players:Array.from({length:4},(_,seat)=>({name:`牌友${seat}`,score:90,seat,bot:false,trustee:false,hand:seat===me?[108]:[],handCount:1,flowers:[],discards:[],
   melds:Array.from({length:3},(_,i)=>({type:'pung' as const,tiles:[i*4,i*4+1,i*4+2],from:(seat+i+1)%4,concealed:false}))}))};
}
it('all twelve pung suppliers point toward their visible seat from each of the four viewpoints',()=>{
 for(let me=0;me<4;me++){
  const s=markerFixture(me),tiles=layoutTable(s),markers=layoutMeldSources(tiles,me);
  expect(markers).toHaveLength(12);
  for(const marker of markers){
   const face=tiles.find(t=>t.id===marker.tileId)!;
   expect(face.id.endsWith('-1')).toBe(true);
   expect(marker.x).toBe(face.x);
   expect(Math.abs(marker.y-face.y)+marker.size/2).toBeLessThan(face.h/2);
   expect(marker.size).toBeLessThan(face.w);
   const a=marker.rotation*Math.PI/180;
   const tip=[-Math.sin(a),-Math.cos(a)]; // screen coordinates, default triangle points up
   const supplier=[[0,1],[1,0],[0,-1],[-1,0]][sceneOffset(marker.source,me)];
   expect(tip[0]*supplier[0]+tip[1]*supplier[1]).toBeCloseTo(1,8);
  }
 }
});
it('upgrading a pung preserves its source on the upper middle tile; concealed kongs have none',()=>{
 const s=markerFixture(),p=s.players[1];
 p.melds[0]={type:'kong',tiles:[0,1,2,3],from:2,concealed:false,added:true};
 p.melds[1]={type:'kong',tiles:[],from:1,concealed:true};
 const tiles=layoutTable(s),markers=layoutMeldSources(tiles,0);
 const marker=markers.find(m=>m.id==='source-meld-1-0-1')!;
 expect(marker.source).toBe(2);expect(marker.tileId).toBe('meld-1-0-3');
 const upper=tiles.find(t=>t.id===marker.tileId)!;
 expect(marker.x).toBe(upper.x);expect(Math.abs(marker.y-upper.y)+marker.size/2).toBeLessThan(upper.h/2);
 expect(markers.some(m=>m.id.startsWith('source-meld-1-1-'))).toBe(false);
 // Old local/replay data can have owner==from without a concealed flag.
 p.melds[2].from=p.seat;
 expect(layoutMeldSources(layoutTable(s),0).some(m=>m.id.startsWith('source-meld-1-2-'))).toBe(false);
});
it.each([0,1,2,3])('direct/open kong at seat %i has four forward bases and no direction source',seat=>{
 const s=markerFixture();
 s.players[seat].melds=[{type:'kong',tiles:[0,1,2,3],from:(seat+1)%4,concealed:false}];
 const tiles=layoutTable(s),group=tiles.filter(t=>t.area==='meld'&&t.seat===seat);
 expect(group).toHaveLength(4);
 expect(group.every(t=>!t.stack&&!t.pose.includes('cross')&&t.source===undefined)).toBe(true);
 expect(layoutMeldSources(tiles,0).some(marker=>marker.id.startsWith(`source-meld-${seat}-0-`))).toBe(false);
});
it('keeps every source attached to its own group on a crowded table',()=>{
 for(let me=0;me<4;me++){
  const s=markerFixture(me);
  for(const p of s.players){
   p.melds=Array.from({length:4},(_,i)=>({type:'kong',tiles:Array.from({length:4},(_,j)=>p.seat*16+i*4+j),from:(p.seat+1)%4,concealed:false,added:true}));
   p.discards=Array.from({length:12},(_,i)=>64+p.seat*12+i);
   p.flowers=[124+p.seat*2,125+p.seat*2];
  }
  const tiles=layoutTable(s),markers=layoutMeldSources(tiles,me);
  expect(markers).toHaveLength(16);
  for(const m of markers){
   const t=tiles.find(t=>t.id===m.tileId)!;
   expect(m.x).toBe(t.x);expect(Math.abs(m.y-t.y)+m.size/2).toBeLessThan(t.h/2);
  }
 }
});
it('own exposed sets use one shallow tabletop camera and contact edge, with a centred upper kong tile',()=>{
 const s=markerFixture();s.players[0].melds[0]={type:'kong',tiles:[0,1,2,3],from:1,concealed:false,added:true};
 const tiles=layoutTable(s),own=tiles.filter(t=>t.id.startsWith('meld-0-0-'));
 const base=own.filter(t=>!t.stack);
 expect(base.map(t=>t.pose)).toEqual(['meld-bottom','meld-bottom','meld-bottom-cross']);
 expect(base.every(t=>t.rotation===0&&(t.shear??0)===0)).toBe(true);
 const scales=base.map(t=>t.w/TILE_POSE_METRICS[t.pose].w);
 expect(scales.every(scale=>Math.abs(scale-scales[0])<1e-8)).toBe(true);
 expect(scales[0]).toBeCloseTo(65/TILE_POSE_METRICS.own.w,8);
 for(const t of base){
  expect(t.h).toBeCloseTo(TILE_POSE_METRICS[t.pose].h*scales[0],8);
  expect(Math.max(...tileFootprint(t).map(([,y])=>y))).toBeCloseTo(589,8);
 }
 const middle=own.find(t=>t.id==='meld-0-0-1')!,upper=own.find(t=>t.id==='meld-0-0-3')!;
 expect(upper.pose).toBe('meld-bottom');expect(upper.rotation).toBe(0);
 expect(upper.x).toBe(middle.x);expect(upper.y).toBeLessThan(middle.y);expect(upper.z).toBeGreaterThan(middle.z);
});
it('turns only the supplier-facing pung tile sideways in the owner perspective',()=>{
 for(let owner=0;owner<4;owner++){
  expect(meldSourceTileIndex(owner,(owner+1)%4)).toBe(2);
  expect(meldSourceTileIndex(owner,(owner+2)%4)).toBeUndefined();
  expect(meldSourceTileIndex(owner,(owner+3)%4)).toBe(0);
  expect(meldSourceTileIndex(owner,owner)).toBeUndefined();
  expect(meldSourceTileIndex(owner,(owner+1)%4,true)).toBeUndefined();
 }
 const s=markerFixture(0),owner=s.players[0];
 owner.melds=[
  {type:'pung',tiles:[0,1,2],from:1,concealed:false},
  {type:'pung',tiles:[4,5,6],from:3,concealed:false},
  {type:'pung',tiles:[8,9,10],from:2,concealed:false},
 ];
 const group=layoutTable(s).filter(t=>t.area==='meld'&&t.seat===0);
 expect(group.filter(t=>t.id.startsWith('meld-0-0-')).map(t=>t.pose)).toEqual(['meld-bottom','meld-bottom','meld-bottom-cross']);
 expect(group.filter(t=>t.id.startsWith('meld-0-1-')).map(t=>t.pose)).toEqual(['meld-bottom-cross','meld-bottom','meld-bottom']);
 expect(group.filter(t=>t.id.startsWith('meld-0-2-')).map(t=>t.pose)).toEqual(['meld-bottom','meld-bottom','meld-bottom']);
 expect(group.every(t=>t.rotation===0)).toBe(true);
 owner.melds=[{type:'kong',tiles:[12,13,14,15],from:1,concealed:true}];
 expect(layoutTable(s).filter(t=>t.area==='meld'&&t.seat===0).every(t=>t.rotation===0)).toBe(true);
});
it('keeps the supplier pose, physical order and arrow across every owner and viewer',()=>{
 const normalPose=['meld-bottom','right','meld-bottom','left'];
 const crossPose=['meld-bottom-cross','meld-cross-right','meld-bottom-cross','meld-cross-left'];
 const arrowRotation=[180,-90,0,90];
 const screenOrder=[[0,1,2],[2,1,0],[2,1,0],[0,1,2]];
 for(let owner=0;owner<4;owner++)for(let viewer=0;viewer<4;viewer++)for(const relative of [1,2,3]){
  const source=(owner+relative)%4,offset=(owner-viewer+4)%4;
  const expectedSourceIndex=relative===1?2:relative===3?0:undefined;
  const s=markerFixture(viewer);
  for(const player of s.players)player.melds=[];
  s.players[owner].melds=[{type:'pung',tiles:[0,1,2],from:source,concealed:false}];
  const tiles=layoutTable(s),group=tiles.filter(t=>t.area==='meld'&&t.seat===owner);
  const logical=[...group].sort((a,b)=>Number(a.id.split('-').at(-1))-Number(b.id.split('-').at(-1)));

  expect(logical).toHaveLength(3);
  expect(logical.map(tile=>tile.pose)).toEqual(logical.map((_,index)=>
   index===expectedSourceIndex?crossPose[offset]:normalPose[offset]));
  expect(logical.every(tile=>tile.rotation===0)).toBe(true);
  const physical=[...group].sort((a,b)=>offset%2?a.y-b.y:a.x-b.x)
   .map(tile=>Number(tile.id.split('-').at(-1)));
  expect(physical).toEqual(screenOrder[offset]);

  const markers=layoutMeldSources(tiles,viewer);
  expect(markers).toHaveLength(1);
  expect(markers[0]).toMatchObject({
   source,
   tileId:`meld-${owner}-0-1`,
   rotation:arrowRotation[(source-viewer+4)%4],
  });
  expect(markers[0].x).toBe(logical[1].x);
 }
});
it('keeps side meld faces upright and turns only the supplied face across the rail',()=>{
 const s=markerFixture(0);
 s.players[3].melds=[{type:'pung',tiles:[0,1,2],from:2,concealed:false}];
 s.players[1].melds=[{type:'pung',tiles:[4,5,6],from:2,concealed:false}];
 const upstream=layoutTable(s).filter(t=>t.area==='meld'&&t.seat===3);
 const downstream=layoutTable(s).filter(t=>t.area==='meld'&&t.seat===1);
 expect(upstream.map(t=>t.rotation)).toEqual([0,0,0]);
 expect(downstream.sort((a,b)=>Number(a.id.split('-').at(-1))-Number(b.id.split('-').at(-1))).map(t=>t.rotation)).toEqual([0,0,0]);
 expect(upstream.map(t=>t.pose)).toEqual(['meld-cross-left','left','left']);
 expect(downstream.map(t=>t.pose)).toEqual(['right','right','meld-cross-right']);
 for(const [seat,row] of [[3,upstream],[1,downstream]] as const){
  expect(row.every(t=>t.shear===0)).toBe(true);
  const nearEdge=(t:(typeof row)[number])=>{
   const xs=tileFootprint(t).map(([x])=>x);
   return seat===3?Math.min(...xs):Math.max(...xs);
  };
  expect(Math.max(...row.map(nearEdge))-Math.min(...row.map(nearEdge))).toBeLessThan(1e-8);
  const hand=layoutTable(s).find(t=>t.seat===row[0].seat&&t.area==='hand')!;
  const offset=sceneOffset(seat,s.me),direction=seat===3?-1:1;
  expect(hand.x).toBeCloseTo(slotEdgeMetrics(offset,hand.y,'outer').x+direction*122,8);
  for(const tile of row.filter(t=>!t.pose.startsWith('meld-cross-'))){
   const handRailX=slotEdgeMetrics(offset,tile.y,'outer').x+direction*122;
   expect(tile.x-handRailX).toBeCloseTo(-direction*48,8);
  }
  const ordered=[...row].sort((a,b)=>a.y-b.y);
  const gaps=ordered.slice(1).map((t,i)=>t.y-t.h/2-(ordered[i].y+ordered[i].h/2));
  // Adjacent full-size faces meet; their projected 6.5px sidewalls are
  // occluded rather than painted as individual green strips.
  for(const gap of gaps)expect(gap).toBeCloseTo(-6.5,8);
 }
 s.players[3].melds[0].from=1;
 s.players[1].melds[0].from=3;
 const oppositeSources=layoutTable(s).filter(t=>t.area==='meld'&&(t.seat===1||t.seat===3));
 for(const seat of [1,3]){
  const row=oppositeSources.filter(t=>t.seat===seat).sort((a,b)=>Number(a.id.split('-').at(-1))-Number(b.id.split('-').at(-1)));
  expect(row.every(t=>!t.pose.includes('cross'))).toBe(true);
 }
});
it('uses the native shallow atlas for top melds and keeps the bottom meld feet on the hand baseline',()=>{
 const s=markerFixture(0);
 s.players[2].melds=[{type:'pung',tiles:[0,1,2],from:0,concealed:false}];
 const top=layoutTable(s).filter(t=>t.area==='meld'&&t.seat===2);
 expect(top.every(t=>!t.pose.includes('cross'))).toBe(true);
 expect(top.filter(t=>!t.pose.includes('cross')).every(t=>t.pose==='meld-bottom'&&t.w<t.h)).toBe(true);
 expect(top.every(t=>t.rotation===0)).toBe(true);
 s.players[2].melds[0].from=2;
 expect(layoutTable(s).filter(t=>t.area==='meld'&&t.seat===2).every(t=>!t.pose.includes('cross'))).toBe(true);
 s.players[0].melds=[{type:'pung',tiles:[8,9,10],from:3,concealed:false}];
 const bottom=layoutTable(s).filter(t=>t.area==='meld'&&t.seat===0);
 expect(bottom.map(t=>t.pose)).toEqual(['meld-bottom-cross','meld-bottom','meld-bottom']);
 expect(bottom.every(t=>t.rotation===0)).toBe(true);
 const handBottom=589;
 for(const t of bottom){
  const ys=tileFootprint(t).map(point=>point[1]);
  expect(Math.max(...ys)).toBeCloseTo(handBottom,5);
 }
});
it('turns an adjacent supplier on the opposite rail while keeping three separate solids',()=>{
 const s=markerFixture(0);
 s.players[2].melds=[{type:'pung',tiles:[0,1,2],from:3,concealed:false}];
 const group=layoutTable(s).filter(t=>t.area==='meld'&&t.seat===2);
 expect(group.map(t=>t.rotation)).toEqual([0,0,0]);
 const supplier=group.filter(t=>t.pose.includes('cross'));
 expect(supplier).toHaveLength(1);
 expect(supplier[0].id).toBe('meld-2-0-2');
 expect(supplier[0].w).toBeGreaterThan(supplier[0].h);
 expect(group.filter(t=>!t.pose.includes('cross')).every(t=>t.pose==='meld-bottom'&&t.w<t.h)).toBe(true);
 const nearEdges=group.map(t=>Math.max(...tileFootprint(t).map(([,y])=>y)));
 expect(Math.max(...nearEdges)-Math.min(...nearEdges)).toBeLessThan(0.01);
 const ordered=[...group].sort((a,b)=>a.x-b.x);
 const gaps=ordered.slice(1).map((t,i)=>t.x-t.w/2-(ordered[i].x+ordered[i].w/2));
 for(const gap of gaps){expect(gap).toBeLessThanOrEqual(.01);expect(gap).toBeGreaterThanOrEqual(-.8);}
 s.players[2].melds[0].from=0;
 const opposite=layoutTable(s).filter(t=>t.area==='meld'&&t.seat===2);
 expect(opposite.every(t=>!t.pose.includes('cross'))).toBe(true);
 expect(opposite.every(t=>t.rotation===0)).toBe(true);
});
it('keeps side melds on the inner parallel rail without covering the flower groove',()=>{
 const s=markerFixture(0);
 for(const seat of [1,3]){
  s.players[seat].flowers=Array.from({length:20},(_,i)=>124+i);
  s.players[seat].melds=[{type:'pung',tiles:[0,1,2],from:(seat+1)%4,concealed:false}];
 }
 const tiles=layoutTable(s);
 for(const seat of [1,3]){
  const meld=tiles.filter(t=>t.seat===seat&&t.area==='meld').flatMap(t=>tileFootprint(t));
  const flowers=tiles.filter(t=>t.seat===seat&&t.area==='flower').flatMap(t=>tileFootprint(t));
  const meldLeft=Math.min(...meld.map(([x])=>x)),meldRight=Math.max(...meld.map(([x])=>x));
  const flowerLeft=Math.min(...flowers.map(([x])=>x)),flowerRight=Math.max(...flowers.map(([x])=>x));
  if(seat===3)expect(meldRight).toBeLessThan(flowerLeft);
  else expect(meldLeft).toBeGreaterThan(flowerRight);
 }
});
it('side flowers touch in straight columns without losing the visible body depth',()=>{
 const s=markerFixture();
 for(const count of [2,6,12,20]){
  for(const seat of [1,3])s.players[seat].flowers=Array.from({length:count},(_,i)=>124+i);
  const ts=layoutTable(s);
  for(const seat of [1,3])for(const lane of [0,1,2]){
   const row=ts.filter(t=>t.area==='flower'&&t.seat===seat&&t.rack===lane).sort((a,b)=>a.y-b.y);
   for(let i=1;i<row.length;i++){
    const pitch=row[i].y-row[i-1].y;
    expect(row[i].x).toBe(row[i-1].x);expect(pitch).toBeLessThan(row[i].h-1.5);expect(pitch/row[i].h).toBeGreaterThan(.82);
   }
  }
 }
});
