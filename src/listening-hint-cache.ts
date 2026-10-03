import type { View, Tile } from '../shared/types';
import { kind } from '../shared/tiles';
import { listeningHints, readyDiscardTiles } from './listening-hints';

/** A single current-hand cache owned by one App, not a history/global cache.
 * Scoring still runs through the original helper. Public unseen counts are
 * deliberately NOT cached: an opponent's discard must update them at once. */
export class ListeningHintCache {
  private context = '';
  private results = new Map<Tile | undefined, number[]>();

  constructor(private readonly calculate: typeof listeningHints = listeningHints) {}

  clear() {
    this.context = '';
    this.results.clear();
  }

  private prepare(view: View) {
    const player = view.players[view.me];
    if (!player) { this.clear(); return false; }
    // These are all the inputs read by listeningHints -> winningKinds ->
    // scoreHand, including quick-shot suppliers, kong flags and earthly waits.
    // Opponent concealed hands, scores, online status and revision aren't inputs.
    const context = JSON.stringify([
      view.id, view.code, view.round, view.me, player.hand, player.melds,
      player.flowers, view.rules, view.earthlyWaits,
      view.players.flatMap(p => p?.melds
        .filter(m => m.type === 'pung' && !m.concealed && m.tiles.length === 3)
        .map(m => kind(m.tiles[0])) ?? []),
    ]);
    if (context !== this.context) { this.results.clear(); this.context = context; }
    return true;
  }

  private read(view: View, discard?: Tile): number[] {
    const player = view.players[view.me]!;
    // Physical IDs stay distinct; never substitute a different copy or retain
    // arbitrary invalid requests in the cache. At most hand.length + 1 entries.
    if (discard !== undefined && !player.hand.includes(discard)) return [];
    let result = this.results.get(discard);
    if (!result) {
      result = this.calculate(player, view.rules, discard, view.players,
        { seat: view.me, earthlyWaits: view.earthlyWaits });
      this.results.set(discard, [...result]);
    }
    // Callers cannot mutate the stored result and poison a later selection.
    return [...result];
  }

  hints(view: View, discard?: Tile) {
    return this.prepare(view) ? this.read(view, discard) : [];
  }

  readyDiscards(view: View) {
    if (!this.prepare(view)) return [];
    return readyDiscardTiles(view, (_player, _rules, discard) => this.read(view, discard));
  }
}
