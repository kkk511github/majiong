import type { TableSceneState } from '../../shared/table-scene';

/** Isolated visual stress fixture, not a playable deal: reserve every seat's
 * draw slot at once so the maximum rack width is visible on one screen. */
export function fullMeldFixture(kind: 'pung' | 'kong'): TableSceneState {
  const players = [0, 1, 2, 3].map(seat => ({
    seat, name: ['本人', '下家', '对家', '上家'][seat], score: 150,
    bot: seat !== 0, trustee: false, online: true,
    hand: seat === 0 ? [64, 65] : [], handCount: 2,
    flowers: [136 + seat], discards: Array.from({ length: 4 }, (_, copy) => 80 + seat * 4 + copy),
    // Adjacent suppliers on every pung deliberately exercise its widest
    // turned-tile footprint. Separate physical IDs for all sixteen groups.
    melds: Array.from({ length: 4 }, (_, group) => ({
      type: kind, tiles: Array.from({ length: kind === 'kong' ? 4 : 3 }, (_, copy) => (seat * 4 + group) * 4 + copy),
      from: (seat + (group % 2 ? 1 : 3)) % 4, concealed: false,
    })),
  }));
  return {
    key: `full-${kind}-visual`, revision: 0, me: 0, turn: 0, dealer: 0,
    phase: 'playing', code: kind === 'kong' ? '满明杠展示' : '满碰展示',
    round: 3, rounds: 8, remaining: kind === 'kong' ? 52 : 68,
    rulesName: '极限布局预览', roundMultiplier: 1, countdown: '—',
    connected: true, disabled: false, practice: false, canDiscard: false,
    selected: null, drawn: 65, inspectedKind: null, hintKinds: [], hintLabel: '',
    players, actions: [], effects: [], trusteeDisabled: true,
  };
}

/** Deliberately over-capacity visual fixture: 27 discards per seat exercises
 * all three ten-tile rows/columns. It is not a legal 144-tile game snapshot. */
export function busyTableFixture(): TableSceneState {
  const state = fullMeldFixture('pung');
  state.key = 'busy-rivers-visual'; state.code = '每家27张弃牌';
  state.drawn = 121; state.remaining = 0;
  state.players = state.players.map(player => ({
    ...player, melds: [],
    hand: player.seat === 0 ? Array.from({ length: 14 }, (_, i) => 108 + i) : [],
    handCount: player.seat === 0 ? 14 : 13,
    discards: Array.from({ length: 27 }, (_, i) => player.seat * 27 + i),
  }));
  return state;
}
