import type { ReplayFrame, Seat } from '../shared/types';
import { kind } from '../shared/tiles';

/** Use the recorded physical draw, not the highest sorted tile. Hidden replay
 * perspectives carry neither faces nor the private drawn-tile identity. */
export function replayHand(frames: readonly ReplayFrame[], step: number, seat: Seat, visible: boolean) {
  if (!visible) return { hand: [] as number[], drawn: undefined };
  const hand = [...frames[step].players[seat].hand].sort((a, b) => kind(a) - kind(b) || a - b);
  let drawn: number | undefined;
  for (let i = step; i >= 0; i--) {
    const event = frames[i];
    if (event.seat !== seat || !['draw', 'discard', 'pung', 'kong', 'concealedKong', 'addedKong'].includes(event.type)) continue;
    if (event.type === 'draw' && event.tile !== undefined && hand.includes(event.tile)) drawn = event.tile;
    break;
  }
  return { hand: drawn === undefined ? hand : [...hand.filter(tile => tile !== drawn), drawn], drawn };
}
