import type {Account,Game} from '../shared/types';

/** A play-only block takes effect at the next table, not between its hands.
 * Existing seat + server-owned started-round state survives reconnect/restart.
 * Initial admission still uses requirePlay; clients cannot create this state. */
export function mayFinishBlockedTable(account:Account|undefined,game?:Game):boolean {
  return !!account?.playBlocked && !account.suspended && !account.mustChangePassword &&
    !!account.teamId && !!account.teamName && !!game && game.round>0 &&
    !game.table?.closed && ['playing','claiming','ended'].includes(game.phase) &&
    game.players.some(player=>player?.id===account.id&&!player.bot);
}
export function mayPlayAtTable(account:Account|undefined,game?:Game):boolean {
  return !!account?.canPlay || mayFinishBlockedTable(account,game);
}
