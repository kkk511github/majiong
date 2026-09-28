import {it,expect} from 'vitest';
import {crowdedClaimFixture} from '../src/dev/action-studio-fixtures';
import {viewFor,act} from '../shared/engine';
it('crowded preview uses one physical set and real engine offers',()=>{
 const g=crowdedClaimFixture();
 const tiles=[...g.wall,...g.players.flatMap(p=>p?[...p.hand,...p.flowers,...p.discards,...p.melds.flatMap(m=>m.tiles)]:[])];
 expect(new Set(tiles).size).toBe(tiles.length);expect(tiles.length).toBe(144);
 expect(g.players[0]!.hand).toHaveLength(13);
 expect(g.players.reduce((n,p)=>n+p!.discards.length,0)).toBe(65);
 expect(g.pending?.offers[0]).toEqual(['hu','kong','pung','pass']);
});
it.each([0,4,8])('each self-kong option selects exactly its own physical set %i',tile=>{
 const g=crowdedClaimFixture('multi-kong'),next=act(g,0,{type:'selfKong',tile});
 expect(next.players[0]!.melds).toHaveLength(1);
 expect(next.players[0]!.melds[0]).toMatchObject({type:'kong',concealed:true,tiles:[tile,tile+1,tile+2,tile+3]});
});
it.each(['hu-pung','kong-pung','multi-kong'] as const)('combined %s actions are real legal options with no duplicate tiles',a=>{
 const g=crowdedClaimFixture(a),v=viewFor(g,0),tiles=[...g.wall,...g.players.flatMap(p=>p?[...p.hand,...p.flowers,...p.discards,...p.melds.flatMap(m=>m.tiles)]:[])];
 expect(tiles).toHaveLength(144);expect(new Set(tiles).size).toBe(144);
 expect(v.actions).toEqual(a==='hu-pung'?['hu','pung','pass']:a==='kong-pung'?['kong','pung','pass']:['hu']);
 expect(v.selfKongs.length).toBe(a==='multi-kong'?3:0);
});
it.each(['hu','hu-claim','pung','kong'] as const)('crowded %s controls come from legal engine state and keep 144 unique tiles',a=>{
 const g=crowdedClaimFixture(a),v=viewFor(g,0),tiles=[...g.wall,...g.players.flatMap(p=>p?[...p.hand,...p.flowers,...p.discards,...p.melds.flatMap(m=>m.tiles)]:[])];
 expect(tiles).toHaveLength(144);expect(new Set(tiles).size).toBe(144);
 expect(v.actions).toEqual(a==='hu'?['hu']:a==='hu-claim'?['hu','pass']:a==='pung'?['pung','pass']:[]);
 expect(v.selfKongs.length).toBe(a==='kong'?1:0);
});
