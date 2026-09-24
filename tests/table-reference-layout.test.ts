import { describe,it,expect } from 'vitest';
import { referenceTiles,referenceSnapshot,footprint,groundAt,screenAt,standingHandLayout } from './previews/table-reference-layout';
import { fullMeldFixture,busyTableFixture } from './previews/table-full-meld-fixture';

const projectedBounds=(t:ReturnType<typeof referenceTiles>[number])=>{
  const angle=t.yaw*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle),points=[];
  for(const dx of [-t.modelWidth/2,t.modelWidth/2])for(const dz of [-t.modelLength/2,t.modelLength/2])for(const h of [0,t.modelThickness])points.push(screenAt(t.groundX+c*dx+s*dz,t.groundZ-s*dx+c*dz,h));
  return {left:Math.min(...points.map(p=>p.x)),right:Math.max(...points.map(p=>p.x)),top:Math.min(...points.map(p=>p.y)),bottom:Math.max(...points.map(p=>p.y))};
};
const local=(t:ReturnType<typeof referenceTiles>[number])=>{
  const c=Math.cos(t.alignmentAngle),s=Math.sin(t.alignmentAngle),dx=t.groundX-t.alignmentPivotX,dz=t.groundZ-t.alignmentPivotZ;
  return {...t,yaw:t.layoutYaw,groundX:t.alignmentPivotX+c*dx-s*dz,groundZ:t.alignmentPivotZ+s*dx+c*dz};
};

describe('reference table physical alignment',()=>{
  it('reserves the same three-row and single-flower-row bands before the table fills',()=>{
    const state=busyTableFixture();state.players.forEach(p=>p.flowers=Array.from({length:8},(_,i)=>124+i));
    const full=referenceTiles(state);
    state.players.forEach(p=>p.discards=p.discards.slice(0,1));const sparse=referenceTiles(state);
    for(const seat of [0,2]){
      const a=full.filter(t=>t.seat===seat&&t.area==='flower'),b=sparse.filter(t=>t.seat===seat&&t.area==='flower');
      a.forEach((t,i)=>{expect(t.groundZ).toBe(a[0].groundZ);expect(t.groundZ).toBe(b[i].groundZ);expect(t.groundX).toBe(b[i].groundX);});
      const other=sparse.find(t=>t.seat===seat&&t.area==='river')!,first=full.find(t=>t.id===other.id)!;
      expect(first.groundX).toBe(other.groundX);expect(first.groundZ).toBe(other.groundZ);
    }
  });
  it('eight local and opposite flowers stay outside three discard rows and horizontal hands',()=>{
    const state=busyTableFixture();state.players.forEach(p=>p.flowers=Array.from({length:p.seat%2?2:8},(_,i)=>124+(p.seat===0?0:p.seat===2?8:p.seat===1?16:18)+i));
    const tiles=referenceTiles(state),flowers=tiles.filter(t=>t.area==='flower'),rivers=tiles.filter(t=>t.area==='river');
    const overlap=(a:ReturnType<typeof projectedBounds>,b:ReturnType<typeof projectedBounds>)=>Math.min(a.right,b.right)-Math.max(a.left,b.left)>.5&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>.5;
    for(const flower of flowers){
      const box=projectedBounds(flower);
      for(const river of rivers)expect(overlap(box,projectedBounds(river)),`${flower.id}/${river.id}`).toBe(false);
      for(const other of flowers.filter(t=>t.seat!==flower.seat))expect(overlap(box,projectedBounds(other)),`${flower.id}/${other.id}`).toBe(false);
      for(const hand of tiles.filter(t=>t.area==='hand'&&(t.seat===0||t.seat===2)))expect(overlap(box,{left:hand.x-hand.w/2,right:hand.x+hand.w/2,top:hand.y-hand.h/2,bottom:hand.y+hand.h/2}),flower.id+' hand').toBe(false);
    }
  });
  it('side discards and flowers are physically parallel to their own standing hands',()=>{
    for(const me of [0,1,2,3]){
      const state=referenceSnapshot();state.me=me;const tiles=referenceTiles(state);
      for(const offset of [1,3]){
        const seat=(me+offset)%4,hand=standingHandLayout(tiles.filter(t=>t.area==='hand'&&t.seat===seat),offset);
        for(const tile of tiles.filter(t=>t.seat===seat&&(t.area==='river'||t.area==='flower'))){
          expect(tile.yaw,tile.id).toBeCloseTo(hand[0].yaw,8);
        }
      }
    }
  });
  it('standing rectangular side tiles share one table axis, without compensating yaw',()=>{
    const tiles=referenceTiles(referenceSnapshot());
    for(const offset of [1,3]){
      const row=standingHandLayout(tiles.filter(t=>t.area==='hand'&&t.seat===offset),offset);
      for(const t of row.slice(1)){
        expect(t.x).toBe(row[0].x);expect(t.yaw).toBe(offset*90);
        expect(t.yaw).toBe(row[0].yaw);expect(t.width).toBe(row[0].width);expect(t.height).toBe(row[0].height);
      }
    }
  });
  it('side discard and flower face cross-edges are horizontal in the final camera projection',()=>{
    for(const me of [0,1,2,3]){
      const state=referenceSnapshot();state.me=me;
      for(const t of referenceTiles(state).filter(t=>t.seat!==undefined&&(t.seat-me+4)%2===1&&(t.area==='river'||t.area==='flower'))){
        const a=t.yaw*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
        for(const x of [-t.modelWidth/2,t.modelWidth/2]){
          const ends=[-t.modelLength/2,t.modelLength/2].map(z=>screenAt(t.groundX+c*x+s*z,t.groundZ-s*x+c*z,t.modelThickness));
          expect(ends[0].y,t.id).toBeCloseTo(ends[1].y,8);
        }
      }
    }
  });
  it('projects measured anchors without independent screen-space slope errors',()=>{
    for(const [x,y]of [[300,70],[478,177],[812,312],[516,333]]){
      const p=groundAt(x,y),s=screenAt(p.x,p.z);expect(s.x).toBeCloseTo(x);expect(s.y).toBeCloseTo(y);
    }
  });
  for(const me of [0,1,2,3])for(const type of ['pung','kong'] as const)it(`${type} groups touch and share the owner baseline, view ${me}`,()=>{
    const s=fullMeldFixture(type);s.me=me;
    const tiles=referenceTiles(s);
    for(const p of s.players){
      const o=(p.seat-me+4)%4,axis=o%2?'z':'x',edge=o%2?'x':'z',side=o===0||o===1?1:-1;
      for(let group=0;group<p.melds.length;group++){
        const cards=tiles.filter(t=>t.area==='meld'&&t.seat===p.seat&&!t.stack&&Number(t.id.split('-')[2])===group).sort((a,b)=>Number(a.id.split('-')[3])-Number(b.id.split('-')[3])).map(local);
        const position=(t:typeof cards[number],k:'x'|'z')=>k==='x'?t.groundX:t.groundZ;
        for(let i=1;i<cards.length;i++){
          const a=cards[i-1],b=cards[i];
          expect(Math.abs(position(b,axis)-position(a,axis))).toBeCloseTo((footprint(a)[axis]+footprint(b)[axis])/2);
          expect(position(a,edge)+side*footprint(a)[edge]/2).toBeCloseTo(position(b,edge)+side*footprint(b)[edge]/2);
        }
      }
    }
  });
  it('concealed and added kongs anchor exactly on their own middle tile at every seat',()=>{
    const s=fullMeldFixture('pung');
    s.players.forEach(p=>p.melds=p.melds.slice(0,2).map((m,i)=>({...m,type:'kong',tiles:[0,1,2,3],concealed:i===0,added:i===1})));
    const tiles=referenceTiles(s),stacks=tiles.filter(t=>t.stack);expect(stacks).toHaveLength(8);
    stacks.forEach(t=>{const middle=tiles.find(m=>m.id===t.id.replace(/-3$/,'-1'))!;expect(t.groundX).toBe(middle.groundX);expect(t.groundZ).toBe(middle.groundZ);expect(t.yaw).toBe(middle.yaw);});
  });
  it('reference rivers form straight continuous owner-facing rows and wrap outwards',()=>{
    const s=referenceSnapshot();s.players.forEach(p=>p.discards=Array.from({length:27},(_,i)=>i));
    const tiles=referenceTiles(s);
    for(const p of s.players){
      const cards=tiles.filter(t=>t.area==='river'&&t.seat===p.seat).sort((a,b)=>p.discards.indexOf(a.tile!)-p.discards.indexOf(b.tile!)).map(local),capacity=10;
      const axis=p.seat%2?'groundZ':'groundX',edge=p.seat%2?'groundX':'groundZ',out=p.seat===0||p.seat===1?1:-1;
      for(let i=1;i<capacity;i++)expect(cards[i][edge]).toBeCloseTo(cards[0][edge]);
      expect(cards[capacity][axis]).toBeCloseTo(cards[0][axis]);expect((cards[capacity][edge]-cards[0][edge])*out).toBeGreaterThan(0);
    }
  });
  it('27 discards per seat have visible corner gutters and never enter either horizontal hand or the compass',()=>{
    const s=referenceSnapshot();s.players.forEach(p=>p.discards=Array.from({length:27},(_,i)=>i+p.seat*27));
    const tiles=referenceTiles(s),rivers=tiles.filter(t=>t.area==='river');
    const overlap=(a:ReturnType<typeof projectedBounds>,b:ReturnType<typeof projectedBounds>)=>Math.min(a.right,b.right)>Math.max(a.left,b.left)&&Math.min(a.bottom,b.bottom)>Math.max(a.top,b.top);
    for(const a of rivers){
      const box=projectedBounds(a);
      expect(overlap(box,{left:578,right:702,top:197,bottom:297}),a.id+' compass').toBe(false);
      for(const b of rivers.filter(t=>t.seat!==a.seat))expect(overlap(box,projectedBounds(b)),`${a.id}/${b.id}`).toBe(false);
      for(const hand of tiles.filter(t=>t.area==='hand'&&(t.seat===0||t.seat===2)))expect(overlap(box,{left:hand.x-hand.w/2,right:hand.x+hand.w/2,top:hand.y-hand.h/2,bottom:hand.y+hand.h/2}),a.id+' hand').toBe(false);
    }
  });
  for(const type of ['pung','kong'] as const)it(`full ${type} stays in one side lane and separates the far hand`,()=>{
    const s=fullMeldFixture(type),tiles=referenceTiles(s);
    for(const seat of [1,3]){
      const bases=tiles.filter(t=>t.area==='meld'&&t.seat===seat&&!t.stack).map(local),side=seat===1?1:-1;
      const baseline=bases[0].groundX+side*footprint(bases[0]).x/2;
      bases.forEach(t=>expect(t.groundX+side*footprint(t).x/2).toBeCloseTo(baseline));
    }
    const top=tiles.filter(t=>t.seat===2&&t.area==='meld'),hands=tiles.filter(t=>t.seat===2&&t.area==='hand');
    expect(Math.min(...top.map(t=>projectedBounds(t).left))-Math.max(...hands.map(t=>t.x+t.w/2))).toBeGreaterThan(8);
    const leftMelds=tiles.filter(t=>t.seat===3&&t.area==='meld');
    for(const hand of hands)for(const tile of leftMelds){const b=projectedBounds(tile);expect(b.right<hand.x-hand.w/2||b.left>hand.x+hand.w/2||b.top>hand.y+hand.h/2||b.bottom<hand.y-hand.h/2,`corner ${tile.id}/${hand.id}`).toBe(true);}
    for(const seat of [1,3])for(const h of standingHandLayout(tiles.filter(t=>t.area==='hand'&&t.seat===seat),seat)){
      const angle=h.yaw*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle),points=[];
      for(const x of [-h.width/2,h.width/2])for(const z of [-h.depth/2,h.depth/2])for(const y of [0,h.height])points.push(screenAt(h.x+c*x+s*z,h.z-s*x+c*z,y));
      expect(Math.min(...points.map(p=>p.y)),h.id+' top').toBeGreaterThanOrEqual(0);
      expect(Math.max(...points.map(p=>p.y)),h.id+' bottom').toBeLessThanOrEqual(589);
    }
  });
});
