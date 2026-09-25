import {it,expect} from 'vitest';
import {createGame,newPlayer} from '../shared/engine';
import {normalizeTableSettings} from '../shared/table-settings';
import {mayFinishBlockedTable,mayPlayAtTable} from '../server/play-admission';
import type {Account} from '../shared/types';
const blocked:Account={id:'member',username:'member',name:'会员',role:'member',mustChangePassword:false,canPlay:false,playBlocked:true,teamId:'team-1',teamName:'战队'};
function game(){const g=createGame('123456','existing',{rounds:8});g.players[0]=newPlayer(blocked.id,blocked.name);g.table={creatorId:'host',groupId:'group',number:1,createdAt:1,settings:normalizeTableSettings({})};return g;}
it('protects the same seat through all eight hands and reconnect snapshots, never a new waiting or closed table',()=>{
 const g=game();expect(mayFinishBlockedTable(blocked,g)).toBe(false);
 for(let round=1;round<=8;round++)for(const phase of ['playing','claiming','ended'] as const){
  g.round=round;g.phase=phase;g.players[0]!.online=false;g.players[0]!.ready=false;
  expect(mayPlayAtTable(blocked,JSON.parse(JSON.stringify(g)))).toBe(true);
 }
 g.phase='finished';expect(mayPlayAtTable(blocked,g)).toBe(false);
 g.phase='playing';g.table!.closed=true;expect(mayPlayAtTable(blocked,g)).toBe(false);
 expect(mayPlayAtTable(blocked,game())).toBe(false);
});
it('does not exempt account suspension, password reset, absent seats or removal from a team',()=>{
 const g=game();g.phase='playing';g.round=1;
 for(const account of [undefined,{...blocked,id:'other'},{...blocked,suspended:true},{...blocked,mustChangePassword:true},{...blocked,teamId:null,teamName:null},{...blocked,playBlocked:false}])expect(mayPlayAtTable(account,g)).toBe(false);
 expect(mayPlayAtTable({...blocked,playBlocked:false,canPlay:true},game())).toBe(true);
});
