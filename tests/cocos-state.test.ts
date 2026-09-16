import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { createGame, newPlayer, seats, startRound, viewFor } from '../shared/engine';
import { seededRandom } from '../shared/tiles';
import { cocosState } from '../src/cocos-state';
import { layoutTable, layoutActions, layoutFlowerRacks, claimPrompt, tileFootprint, tileKind, sceneTileName, slotMetrics, slotEdgeMetrics } from '../shared/table-scene';

const ui = { connected:true, disabled:false, practice:false, countdown:'30', selected:null, inspectedKind:null, hintKinds:[], hintLabel:'可胡', effects:[] };
function fixture() {
  const g=createGame('123456','test');
  g.players=seats.map(s=>({...newPlayer(`p${s}`,`牌友${s}`),ready:true}));
  return startRound(g,1000,seededRandom(8));
}
it('the Cocos bridge never carries live opponents hands or concealed kong faces, even if its caller supplies them',()=>{
  const g=fixture(),v=viewFor(g,0);
  v.players[1]!.hand=[80,81,82,83];
  v.players[1]!.melds=[{type:'kong',tiles:[100,101,102,103],from:1,concealed:true}];
  const result=cocosState(v,ui);
  expect(result.players[1].hand).toEqual([]);
  expect(result.players[1].melds[0].tiles).toEqual([]);
  expect(result.players[0].hand).toEqual(v.players[0]!.hand);
  expect(result).not.toHaveProperty('wall');
  expect(result).not.toHaveProperty('replay');
});
it('reveals the confirmed end-of-round hands for results, using the same scene renderer',()=>{
  const g=fixture();g.phase='ended';
  const v=viewFor(g,0),result=cocosState(v,ui);
  expect(result.players[1].hand).toEqual(g.players[1]!.hand);
});
it('keeps the eight distinct seasons/flowers and eight-bamboo mapping',()=>{
  expect(Array.from({length:8},(_,i)=>sceneTileName(i+136))).toEqual(['春','夏','秋','冬','梅','兰','竹','菊']);
  expect(tileKind(100)).toBe(25);expect(sceneTileName(100)).toBe('八条');
  expect(tileKind(56)).toBe(14);expect(sceneTileName(56)).toBe('六筒');
});
it('selection raises one physical card without resizing or moving the rest of the rack',()=>{
  const s=cocosState(viewFor(fixture(),0),ui);s.drawn=s.players[0].hand.at(-1);
  const before=layoutTable(s),selected=s.players[0].hand[0];s.selected=selected;
  const after=layoutTable(s);
  for(const a of before.filter(t=>t.area==='hand'&&t.seat===0)){
    const b=after.find(t=>t.id===a.id)!;
    expect([b.x,b.w,b.h]).toEqual([a.x,a.w,a.h]);
    expect(b.y).toBe(a.y-(a.tile===selected?15:0));
  }
  expect(layoutTable({...s,canDiscard:false}).filter(t=>t.clickable)).toEqual([]);
});

it('stacks every exposed kong on its middle tile and paints the upper tile last',()=>{
 const s=cocosState(viewFor(fixture(),0),ui);
 for(const p of s.players)p.melds=[{type:'kong',tiles:[120,121,122,123],from:(p.seat+1)%4,concealed:false}];
 const ts=layoutTable(s);
 for(const p of s.players){
  const group=ts.filter(t=>t.area==='meld'&&t.seat===p.seat),middle=group.find(t=>t.id.endsWith('-1'))!,upper=group.find(t=>t.stack)!;
  expect(upper.x).toBe(middle.x);expect(upper.y).toBeLessThan(middle.y);
  expect(upper.z).toBeGreaterThan(Math.max(...group.filter(t=>!t.stack).map(t=>t.z)));
 }
});
it('renders concealed kongs with backs at all four seats, regardless of known tile identities',()=>{
 const s=cocosState(viewFor(fixture(),0),ui);
 for(const p of s.players)p.melds=[{type:'kong',tiles:[120,121,122,123],from:p.seat,concealed:true}];
 const melds=layoutTable(s).filter(t=>t.area==='meld');
 expect(melds).toHaveLength(16);
 for(const t of melds){expect(t.tile).toBeUndefined();expect(t.pose.startsWith('cover-')).toBe(true);expect(t.source).toBeUndefined();}
});
it('places flowers inside the four fixed table grooves, including overflow lanes',()=>{
 const s=cocosState(viewFor(fixture(),0),ui);
 for(const count of [1,6,12,20]){
  for(const p of s.players)p.flowers=Array.from({length:count},(_,i)=>124+i);
  const tiles=layoutTable(s),racks=layoutFlowerRacks(tiles,s.me);
  for(let i=0;i<racks.length;i++)for(let j=i+1;j<racks.length;j++){
   const bounds=(r:typeof racks[number])=>({left:Math.min(...r.points.map(p=>p[0])),right:Math.max(...r.points.map(p=>p[0])),top:Math.min(...r.points.map(p=>p[1])),bottom:Math.max(...r.points.map(p=>p[1]))});
   const a=bounds(racks[i]),b=bounds(racks[j]);
   // Includes the reserve wells, with room for the bevel/shadow strokes.
   expect(Math.max(b.left-a.right,a.left-b.right,b.top-a.bottom,a.top-b.bottom),`racks ${i}/${j} cross`).toBeGreaterThanOrEqual(8);
  }
  for(const t of tiles.filter(t=>t.area==='flower')){
   const rack=racks.find(r=>r.seat===t.seat&&r.lane===(t.rack||0))!;
   if(t.seat%2){
    expect(t.shear).toBe(0);
    expect(rack.points[0][0]).toBe(rack.points[3][0]);
    expect(rack.points[1][0]).toBe(rack.points[2][0]);
    expect(t.x-t.w/2-rack.points[0][0]).toBeCloseTo(rack.points[1][0]-t.x-t.w/2,8);
    const row=tiles.filter(v=>v.area==='flower'&&v.seat===t.seat&&v.rack===t.rack);
    expect(new Set(row.map(v=>v.x)).size).toBe(1);
    expect(new Set(row.map(v=>v.w)).size).toBe(1);
   }
   for(const [x,y] of tileFootprint(t))for(let i=0;i<4;i++){
    const a=rack.points[i],b=rack.points[(i+1)%4];
    const signed=((b[0]-a[0])*(y-a[1])-(b[1]-a[1])*(x-a[0]))/Math.hypot(b[0]-a[0],b[1]-a[1]);
    expect(signed,`seat ${t.seat} flower ${t.id} edge ${i}`).toBeGreaterThanOrEqual(-.1);
   }
  }
 }
});
it('keeps side rivers as straight joined vertical strips, including overflow columns',()=>{
 const s=cocosState(viewFor(fixture(),0),ui);
 for(const p of s.players)p.discards=Array.from({length:27},(_,i)=>i);
 const ts=layoutTable(s);
 for(const seat of [1,3]){
  const row=ts.filter(t=>t.seat===seat&&t.area==='river'&&t.tile!<9).sort((a,b)=>a.y-b.y);
  expect(row[0].x).toBe(seat===1?807:473);
  expect(new Set(row.map(t=>t.x)).size).toBe(1);
  for(const t of row){expect(t.rotation).toBe(0);expect(t.shear).toBe(0);expect(t.pose).toBe(seat===1?'right':'left');}
  for(let i=1;i<row.length;i++){
   const a=row[i-1],b=row[i],corners=tileFootprint(a);
   const ex=corners[3][0]-corners[0][0],ey=corners[3][1]-corners[0][1];
   // The row advance and the solid's long edges share one line: no steps.
   expect(ex*(b.y-a.y)-ey*(b.x-a.x)).toBeCloseTo(0,7);
   expect(Math.hypot(b.x-a.x,b.y-a.y)).toBeLessThanOrEqual((a.h+b.h)/2);
  }
 }
 for(const seat of seats){
  const capacity=9;
  for(const first of [0,capacity]){
   const row=ts.filter(t=>t.seat===seat&&t.area==='river'&&t.tile!>=first&&t.tile!<first+capacity);
   if(seat%2){
    expect(new Set(row.map(t=>t.x)).size).toBe(1);
   }else expect(new Set(row.map(t=>t.y)).size).toBe(1);
  }
 }
 const rivers=ts.filter(t=>t.area==='river');
 for(const a of rivers)for(const b of rivers)if(a.seat!==b.seat){
  const dx=(a.w+b.w)/2-Math.abs(a.x-b.x),dy=(a.h+b.h)/2-Math.abs(a.y-b.y);
  expect(dx<=0||dy<=0,`${a.id}/${a.seat} overlaps ${b.id}/${b.seat}`).toBe(true);
 }
});

it('leaves a visible gap between opposite flowers and the standing hand/meld rack',()=>{
 const s=cocosState(viewFor(fixture(),0),ui);
 s.players[2].handCount=7;s.players[2].melds=[{type:'kong',tiles:[120,121,122,123],from:1,concealed:false}];
 s.players[2].flowers=[124,128,132,136,137,138];
 const ts=layoutTable(s),flowers=ts.filter(t=>t.seat===2&&t.area==='flower'),standing=ts.filter(t=>t.seat===2&&['hand','meld'].includes(t.area));
 expect(Math.min(...flowers.map(t=>t.y-t.h/2))-Math.max(...standing.map(t=>t.y+t.h/2))).toBeGreaterThanOrEqual(7);
 const own=ts.filter(t=>t.seat===0&&t.area==='flower');
 for(const t of own){expect(t.w).toBe(34);expect(t.h).toBe(42);}
});

it('aligns horizontal river columns while the opposite rows fill towards its own hand',()=>{
 const s=cocosState(viewFor(fixture(),0),ui);
 for(const p of s.players)p.discards=Array.from({length:18},(_,i)=>i);
 const tiles=layoutTable(s).filter(t=>t.area==='river');
 for(const [a,b] of [[0,2]])for(let i=0;i<18;i++){
  const x=tiles.find(t=>t.seat===a&&t.tile===i)!,y=tiles.find(t=>t.seat===b&&t.tile===i)!;
  expect(x.x).toBe(y.x);
  if(i>=9){
   const previous=tiles.find(t=>t.seat===b&&t.tile===i-9)!;
   expect(y.y).toBeLessThan(previous.y);
   expect(previous.y-y.y).toBe(x.y-tiles.find(t=>t.seat===a&&t.tile===i-9)!.y);
  }
 }
 for(const range of [[0,9],[9,18]]){
  const left=tiles.filter(t=>t.seat===3&&t.tile!>=range[0]&&t.tile!<range[1]).sort((a,b)=>a.y-b.y);
  const right=tiles.filter(t=>t.seat===1&&t.tile!>=range[0]&&t.tile!<range[1]).sort((a,b)=>a.y-b.y);
  left.forEach((t,i)=>{expect(t.x+right[i].x).toBeCloseTo(1280,8);expect(t.y).toBe(right[i].y);});
 }
});

it('appends from fixed origins with the previous player downward and next player upward in every viewing seat',()=>{
 for(const me of seats){
  const s=cocosState(viewFor(fixture(),me),ui);
  for(const p of s.players)p.discards=[];
  let previous=layoutTable(s).filter(t=>t.area==='river');
  for(let count=1;count<=24;count++){
   for(const p of s.players)p.discards.push(p.seat*30+count-1);
   const next=layoutTable(s).filter(t=>t.area==='river');
   for(const a of previous){
    const b=next.find(t=>t.id===a.id)!;
    expect([b.x,b.y,b.w,b.h]).toEqual([a.x,a.y,a.w,a.h]);
   }
   for(const p of s.players){
    const o=(p.seat-me+4)%4,capacity=9;
    const current=next.find(t=>t.tile===p.discards.at(-1))!;
    const first=next.find(t=>t.tile===p.discards[0])!;
    if((count-1)%capacity===0){
     expect(current[o%2?'y':'x']).toBe(first[o%2?'y':'x']);
     if(count>1){
      const before=next.find(t=>t.tile===p.discards.at(-2))!;
      if(o===1)expect(current.x).toBeGreaterThan(before.x);
      else if(o===3)expect(current.x).toBeLessThan(before.x);
      else if(o===2)expect(current.y).toBeLessThan(before.y);
      else expect(current.y).toBeGreaterThan(before.y);
     }
    }
    else{
     const before=next.find(t=>t.tile===p.discards.at(-2))!;
     if(o===1)expect(current.y).toBeLessThan(before.y);
     else expect(current[o%2?'y':'x']).toBeGreaterThan(before[o%2?'y':'x']);
     expect(current[o%2?'x':'y']).toBe(before[o%2?'x':'y']);
    }
   }
   previous=next;
  }
 }
});

it('spotlights the exact actionable public claim tile, including tile zero and rob-kong',()=>{
 const s=cocosState(viewFor(fixture(),0),ui);
 s.phase='claiming';s.actions=[{id:'pass',label:'过'},{id:'pung',label:'碰'},{id:'hu',label:'胡'}];
 s.pending={tile:0,from:1,answered:false,kind:'discard'};
 s.lastDiscard={tile:0,seat:1};s.players[1].discards=[8,0];s.players[2].discards=[1];
 expect(claimPrompt(s)).toMatchObject({tile:0,name:'一万',from:1,labels:['碰','胡']});
 expect(layoutTable(s).filter(t=>t.claimTarget).map(t=>t.tile)).toEqual([0]);
 s.pending.kind='robKong';s.pending.tile=4;
 expect(claimPrompt(s)).toMatchObject({tile:4,name:'二万',kind:'robKong'});
 expect(layoutTable(s).some(t=>t.claimTarget)).toBe(false);
 for(const changed of [{pending:{...s.pending,answered:true}},{actions:[{id:'pass',label:'过'}]},
  {presentation:'replay' as const},{phase:'playing'},{pending:undefined}])expect(claimPrompt({...s,...changed})).toBeUndefined();
});

it('uses exactly the same horizontal end wall for the flower tile and groove',()=>{
 const s=cocosState(viewFor(fixture(),0),ui);
 s.players[0].flowers=[132,140];s.players[2].flowers=[124,125,136,137];
 const ts=layoutTable(s),racks=layoutFlowerRacks(ts,s.me);
 const own=ts.find(t=>t.area==='flower'&&t.seat===0)!;
 const top=ts.filter(t=>t.area==='flower'&&t.seat===2).sort((a,b)=>b.x-a.x)[0];
 expect(own.x-own.w/2-racks.find(r=>r.seat===0)!.points[0][0]).toBe(0);
 expect(racks.find(r=>r.seat===2)!.points[1][0]-(top.x+top.w/2)).toBe(0);
});

it('keeps a full side river clear of the opposite flower trough',()=>{
 const s=cocosState(viewFor(fixture(),0),ui);
 s.players[2].flowers=[124,125,136,137];s.players[1].discards=Array.from({length:10},(_,i)=>i);
 const ts=layoutTable(s),flowerBottom=Math.max(...ts.filter(t=>t.area==='flower'&&t.seat===2).map(t=>t.y+t.h/2));
 const riverTop=Math.min(...ts.filter(t=>t.area==='river'&&t.seat===1).map(t=>t.y-t.h/2));
 expect(riverTop-flowerBottom).toBeGreaterThanOrEqual(5);
});


it('keeps the entire side hand on its standing-player lane',()=>{
 const s=cocosState(viewFor(fixture(),0),ui);
 const ts=layoutTable(s);
 for(const seat of [1,3]){
  const row=ts.filter(t=>t.seat===seat&&t.area==='hand').sort((a,b)=>a.y-b.y);
  const a=row[0],b=row[row.length-1];
  expect((b.x-a.x)/(b.y-a.y)).toBeCloseTo(slotEdgeMetrics(seat,a.y,'outer').shear,8);
  expect(row.every(t=>t.h===70)).toBe(true);
 }
});

it('keeps four side meld groups inside the table with a separate parallel lane and centred kong stacks',()=>{
 const s=cocosState(viewFor(fixture(),0),ui);
 for(const seat of [1,3]){
  s.players[seat].hand=[];s.players[seat].handCount=1;
  s.players[seat].flowers=[124,128,132,136,137,138];
  s.players[seat].melds=Array.from({length:4},(_,i)=>({type:i===0?'pung':'kong',tiles:Array.from({length:i===0?3:4},(_,j)=>i*4+j),from:(seat+1)%4,concealed:i===2}));
 }
 const ts=layoutTable(s);
 for(const t of ts.filter(t=>t.area==='meld'&&t.seat%2)){
  for(const [x,y] of tileFootprint(t)){
   expect(y).toBeGreaterThan(70);expect(y).toBeLessThan(480);
   expect(x).toBeGreaterThan(240-.326*y+20);
   expect(x).toBeLessThan(1040+.326*y-20);
  }
  expect(t.shear).toBeCloseTo(slotMetrics(t.seat,t.y).shear,8);
  if(t.pose.startsWith('cover-'))expect(t.tile).toBeUndefined();
  for(const other of ts.filter(v=>['flower','hand','river'].includes(v.area)&&v.seat===t.seat)){
   const dx=(t.w+other.w)/2-Math.abs(t.x-other.x),dy=(t.h+other.h)/2-Math.abs(t.y-other.y);
   expect(dx<=0||dy<=0,`${t.id} touches ${other.id}`).toBe(true);
  }
 }
});


it('keeps side hands and melds in their projection, and flowers and rivers straight',()=>{
 const atlas=JSON.parse(readFileSync(new URL('../cocos-table/assets/resources/tile-atlas.json',import.meta.url),'utf8'));
 const s=cocosState(viewFor(fixture(),0),ui);
 for(const seat of [1,3])s.players[seat].melds=[{type:'kong',tiles:[0,1,2,3],from:0,concealed:false}];
 for(const t of layoutTable(s).filter(t=>t.seat%2)){
  const pose=atlas[t.pose];
  if(t.pose.startsWith('back-')){
   expect(pose.projection.shear,t.pose).toBe(0);
   expect(t.shear,t.pose).toBe(0);
   const [x,y,z]=pose.projection.eye;
   // Projection of a standing tile's tabletop row, with world-Z left upright.
   const rowSlope=-x*Math.hypot(x,y,z)/Math.abs(y*z);
   expect(rowSlope,t.pose).toBeCloseTo(slotEdgeMetrics(t.seat,t.y,'outer').shear,8);
  }else if(t.area==='river'||t.area==='flower'){
   expect(pose.projection.shear,t.pose).toBe(0);
   expect(t.shear,t.pose).toBe(0);
  }else{
   const edge=slotMetrics(t.seat,t.y);
   expect(pose.projection.shear+edge.shear,t.pose).toBeCloseTo(0,8);
   expect(t.shear).toBeCloseTo(edge.shear,8);
  }
  const frame=pose.rects[0];
  expect(t.w/t.h,t.pose).toBeCloseTo(frame.w/frame.h,2);
  expect(new Set(pose.rects.map((r:any)=>`${r.w}x${r.h}`)).size,t.pose).toBe(1);
 }
});

it('keeps claim buttons in the reserved upper-right hand strip even with many flowers and melds',()=>{
 const s=cocosState(viewFor(fixture(),0),ui);
 for(const count of [1,3,4,5]){
  s.actions=Array.from({length:count},()=>({id:'kong',label:'杠'}));
  for(const p of s.players){
   p.flowers=Array.from({length:20},(_,i)=>124+i);
   p.discards=Array.from({length:18},(_,i)=>i);
   if(p.seat%2){p.hand=[];p.handCount=1;p.melds=Array.from({length:4},()=>({type:'kong',tiles:[0,1,2,3],from:0,concealed:false}));}
  }
  const tiles=layoutTable(s),actions=layoutActions(s,tiles);
  expect(actions.at(-1)!.x+30).toBe(1140);
  expect(new Set(actions.map(a=>a.y))).toEqual(new Set([459]));
  for(const a of actions)for(const t of tiles){
   const dx=Math.max(0,Math.abs(a.x-t.x)-t.w/2),dy=Math.max(0,Math.abs(a.y-t.y)-t.h/2);
   expect(Math.hypot(dx,dy),`${count} actions cover ${t.id}`).toBeGreaterThanOrEqual(30);
  }
 }
});


it('leaves the fixed actions clear when a hand tile is selected or the right player draws',()=>{
 const s=cocosState(viewFor(fixture(),0),ui);
 s.actions=Array.from({length:5},()=>({id:'kong',label:'杠'}));
 s.players[1].hand=[];s.players[1].handCount=14;s.players[1].melds=[];
 for(const tile of s.players[0].hand){
  s.selected=tile;
  const tiles=layoutTable(s);
  for(const a of layoutActions(s,tiles))for(const t of tiles.filter(t=>t.area==='hand')){
   const dx=Math.max(0,Math.abs(a.x-t.x)-t.w/2),dy=Math.max(0,Math.abs(a.y-t.y)-t.h/2);
   expect(Math.hypot(dx,dy),`actions cover ${t.id}`).toBeGreaterThanOrEqual(30);
  }
  const drawn=tiles.find(t=>t.id==='hand-1-13')!;
  for(const [x,y] of tileFootprint(drawn))expect(x).toBeLessThan(1040+.326*y);
 }
});


it('keeps each side flower body visible instead of burying its thickness under its neighbour',()=>{
 const s=cocosState(viewFor(fixture(),0),ui);
 for(const count of [2,6,10,12,16,20]){
  for(const seat of [1,3])s.players[seat].flowers=Array.from({length:count},(_,i)=>124+i);
  const tiles=layoutTable(s).filter(t=>t.area==='flower'&&t.seat%2);
  for(const seat of [1,3])for(const lane of [0,1,2]){
   const row=tiles.filter(t=>t.seat===seat&&t.rack===lane).sort((a,b)=>a.y-b.y);
   for(let i=1;i<row.length;i++){
    const pitch=row[i].y-row[i-1].y;
    expect(pitch/row[i].h,`${count} flowers hide the solid body at seat ${seat}`).toBeGreaterThan(.82);
    expect(pitch).toBeLessThanOrEqual(row[i].h);
   }
  }
 }
});
