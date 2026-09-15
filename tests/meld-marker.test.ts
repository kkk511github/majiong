import { expect, it } from 'vitest';
import { layoutTable, layoutMeldSources, sceneOffset, type TableSceneState } from '../shared/table-scene';

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
 p.melds[0]={type:'kong',tiles:[0,1,2,3],from:2,concealed:false};
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
it('keeps every source attached to its own group on a crowded table',()=>{
 for(let me=0;me<4;me++){
  const s=markerFixture(me);
  for(const p of s.players){
   p.melds=Array.from({length:4},(_,i)=>({type:'kong',tiles:Array.from({length:4},(_,j)=>p.seat*16+i*4+j),from:(p.seat+1)%4,concealed:false}));
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
it('own exposed sets use the same solid lying camera as the table, with a centred upper kong tile',()=>{
 const s=markerFixture();s.players[0].melds[0]={type:'kong',tiles:[0,1,2,3],from:1,concealed:false};
 const tiles=layoutTable(s),own=tiles.filter(t=>t.area==='meld'&&t.seat===0);
 for(const t of own){expect(t.pose).toBe('bottom');expect(t.w/t.h).toBeCloseTo(116/163,5);}
 const middle=own.find(t=>t.id==='meld-0-0-1')!,upper=own.find(t=>t.id==='meld-0-0-3')!;
 expect(upper.x).toBe(middle.x);expect(upper.y).toBeLessThan(middle.y);expect(upper.z).toBeGreaterThan(middle.z);
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
