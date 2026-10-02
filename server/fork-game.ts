import type {Game} from '../shared/types';
/** History records and already-captured frames are append-only snapshots.
 * Copy the live state deeply, but don't recopy every historical tile on each
 * 250ms timer tick. Any correction to a frame must replace that frame object. */
export function forkGame(source:Game):Game{
 const {history,replay,commandReceipts,...live}=source;
 const result={...structuredClone(live),history:[...history],...(commandReceipts?{commandReceipts}: {})} as Game;
 if(replay){const {frames,...metadata}=replay;result.replay={...structuredClone(metadata),frames:[...frames]};}
 return result;
}
