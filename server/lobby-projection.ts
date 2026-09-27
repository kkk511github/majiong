import type {Game} from '../shared/types';

/** Only fields that can change a lobby summary, sorting or visibility.
 * Avatar/profile changes explicitly invalidate the broadcast separately. */
export function lobbyProjection(game:Game|undefined):string {
  if(!game?.table||game.table.closed)return '';
  return JSON.stringify({code:game.code,phase:game.phase,round:game.round,rules:game.rules,
    creatorId:game.table.creatorId,number:game.table.number,createdAt:game.table.createdAt,
    settings:game.table.settings,poolTarget:game.table.poolTarget,
    players:game.players.map(p=>p?{id:p.id,name:p.name,bot:p.bot,online:p.online,ready:p.ready}:null)});
}
