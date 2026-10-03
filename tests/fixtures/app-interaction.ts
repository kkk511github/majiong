import { createGame, newPlayer, viewFor } from '../../shared/engine';
import { newGameRules } from '../../shared/nanjing-rules';
import { busyTableFixture, fullMeldFixture } from '../previews/table-full-meld-fixture';
import { referenceSnapshot } from '../previews/table-reference-layout';
import type { TableSceneState } from '../../shared/table-scene';

export function hintInteractionView() {
  const game = createGame('123456', 'app-interaction', newGameRules());
  game.players = [0, 1, 2, 3].map(seat => newPlayer(String(seat), `牌友${seat}`));
  game.players[0]!.hand = [0, 4, 8, 36, 40, 44, 72, 76, 80, 108, 109, 110, 112, 32];
  const view = viewFor(game, 0);
  Object.assign(view, { phase: 'playing', canDiscard: true, turn: 0 });
  return view;
}

/** Include empty, ordinary and deliberately dense visual fixtures, every
 * action count, draw/selection footprints, letterboxing and safe-area edges. */
export function actionRailScenarios() {
  const choices: TableSceneState['actions'][] = [[], [{ id: 'pass', label: '过' }],
    [{ id: 'hu', label: '胡' }, { id: 'pass', label: '过' }],
    [{ id: 'pung', label: '碰' }, { id: 'kong', label: '杠' }, { id: 'pass', label: '过' }],
    [{ id: 'hu', label: '胡' }, ...[0, 36, 72].map(tile => ({ id: 'selfKong', label: '杠', tile }))],
    [{ id: 'hu', label: '胡' }, { id: 'pung', label: '碰' }, { id: 'kong', label: '杠' }, { id: 'pass', label: '过' }]];
  const scenarios: { state: TableSceneState; host: { left: number; top: number; width: number; height: number }; frame: { left: number; top: number; width: number; height: number } }[] = [];
  for (const source of [referenceSnapshot(), busyTableFixture(), fullMeldFixture('kong')])
    for (const tableStyle of [undefined, 'reference-3d'] as const)
      for (const [width, height] of [[568, 320], [844, 390], [1280, 590], [1360, 880]])
        for (const safeArea of [{ left: 0, right: 0, top: 0, bottom: 0 }, { left: 80, right: 0, top: 18, bottom: 36 }, { left: 0, right: 80, top: 18, bottom: 36 }])
          for (const selected of [null, source.players[0].hand[0]])
            for (const actions of choices) scenarios.push({
              state: { ...source, tableStyle, safeArea, selected, actions },
              host: { left: 7, top: 11, width, height },
              frame: { left: 7, top: 11, width, height },
            });
  return scenarios;
}
