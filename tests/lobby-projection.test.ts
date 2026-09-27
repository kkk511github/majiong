import {it,expect} from 'vitest';
import {lobbyProjection} from '../server/lobby-projection';
import {createGame,newPlayer} from '../shared/engine';
import {normalizeTableSettings} from '../shared/table-settings';
it('ordinary discards/scores/deadlines do not invalidate lobby data; public changes do',()=>{
 const g=createGame('123456','test');g.players[0]=newPlayer('a','甲');g.table={creatorId:'a',groupId:'g',number:1,createdAt:1,settings:normalizeTableSettings({})};
 const key=lobbyProjection(g);g.revision++;g.deadline=123;g.players[0]!.score++;g.players[0]!.discards.push(4);
 expect(lobbyProjection(g)).toBe(key);
 for(const change of [(x:typeof g)=>x.round++,(x:typeof g)=>x.players[0]!.ready=true,(x:typeof g)=>x.table!.settings.visibility='code',(x:typeof g)=>x.table!.closed=true]){
  const next=structuredClone(g);change(next);expect(lobbyProjection(next)).not.toBe(key);
 }
});
