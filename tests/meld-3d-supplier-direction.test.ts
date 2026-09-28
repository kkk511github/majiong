import {expect,it} from 'vitest';
import {layout3DTable} from '../shared/table-3d-layout';
import {fullMeldFixture} from './previews/table-full-meld-fixture';

const cases=([ 'pung','direct','added' ] as const).flatMap(kind=>
 [0,1,2,3].flatMap(me=>[0,1,2,3].flatMap(owner=>[1,2,3].map(relative=>({kind,me,owner,relative})))));

it.each(cases)('$kind supplier stays on its physical end: viewer $me owner $owner source offset $relative',({kind,me,owner,relative})=>{
 const state=fullMeldFixture(kind==='pung'?'pung':'kong');state.me=me;state.tableStyle='reference-3d';
 const player=state.players.find(p=>p.seat===owner)!;
 player.melds[0].from=(owner+relative)%4;
 if(kind==='added')player.melds[0].added=true;
 const before=structuredClone(state),group=layout3DTable(state).filter(t=>t.id.startsWith(`meld-${owner}-0-`));
 const base=group.filter(t=>!t.stack),offset=(owner-me+4)%4,axis=offset%2?'groundZ':'groundX';
 const index=(id:string)=>Number(id.split('-')[3]);
 // Check final physical coordinates, not only logical tile IDs or poses.
 const physical=[...base].sort((a,b)=>a[axis]-b[axis]).map(t=>index(t.id));
 const expected=Array.from({length:kind==='direct'?4:3},(_,i)=>i);
 if(offset===1||offset===2)expected.reverse();
 expect(physical).toEqual(expected);
 const turned=base.filter(t=>t.pose.includes('cross'));
 if(relative===2)expect(turned).toHaveLength(0);
 else{
  expect(turned).toHaveLength(1);
  const ownerRight=[1,-1,-1,1][offset],ordered=[...base].sort((a,b)=>ownerRight*(a[axis]-b[axis]));
  expect(turned[0].id).toBe(ordered[relative===1?ordered.length-1:0].id);
 }
 if(kind==='added'){
  const upper=group.find(t=>t.stack)!,middle=base.find(t=>index(t.id)===1)!;
  expect(upper.groundX).toBe(middle.groundX);expect(upper.groundZ).toBe(middle.groundZ);
 }
 expect([...group].sort((a,b)=>index(a.id)-index(b.id)).map(t=>t.tile)).toEqual(player.melds[0].tiles);
 expect(state).toEqual(before);
});
