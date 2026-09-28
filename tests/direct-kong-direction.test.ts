import {it,expect} from 'vitest';
import {layout3DTable} from '../shared/table-3d-layout';
import {fullMeldFixture} from './previews/table-full-meld-fixture';
it.each([0,1,2,3])('direct kong supplier orientation survives viewing seat %i without changing tile identities',me=>{
 for(const owner of [0,1,2,3])for(const relative of [1,2,3]){
  const s=fullMeldFixture('kong');s.me=me;
  const p=s.players.find(p=>p.seat===owner)!;p.melds[0].from=(owner+relative)%4;
  const input=structuredClone(s),group=layout3DTable(s).filter(t=>t.id.startsWith(`meld-${owner}-0-`));
  expect(group).toHaveLength(4);expect(group.some(t=>t.stack)).toBe(false);
  expect([...group].sort((a,b)=>Number(a.id.split('-')[3])-Number(b.id.split('-')[3])).map(t=>t.tile)).toEqual(p.melds[0].tiles);
  expect(group.filter(t=>t.pose.includes('cross')).map(t=>Number(t.id.split('-')[3]))).toEqual(relative===1?[3]:relative===3?[0]:[]);
  for(const t of group)expect(t.yaw).toBe(((owner-me+4)%4)*90+(t.pose.includes('cross')?90:0));
  expect(s).toEqual(input);
 }
});
