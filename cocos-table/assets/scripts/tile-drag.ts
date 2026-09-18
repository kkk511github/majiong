import type { TableSceneState } from './table-scene';

/** All distances use Cocos UI/design coordinates, independent of screen scale. */
export const TILE_DISCARD_DRAG_DISTANCE = 52;

export interface TileDragOrigin {
  key: string;
  round: number;
  me: number;
  turn: number;
  phase: string;
  tile: number;
  selected: number | null;
  canDiscard: boolean;
}

export function canSelectHandTile(state: TableSceneState, tile: number) {
  const player = state.players.find(player => player.seat === state.me);
  return state.presentation !== 'replay' && state.connected && !state.disabled &&
    ['playing', 'claiming'].includes(state.phase) && !!player && !player.trustee &&
    player.hand.includes(tile);
}

export function beginTileDrag(state: TableSceneState, tile: number): TileDragOrigin | undefined {
  if (!canSelectHandTile(state, tile)) return undefined;
  return {
    key: state.key, round: state.round, me: state.me, turn: state.turn,
    phase: state.phase, tile, selected: state.selected,
    canDiscard: state.canDiscard && state.phase === 'playing' && state.turn === state.me,
  };
}

/** Countdown/revision updates keep the gesture, but a new action context cancels it. */
export function canContinueTileDrag(state: TableSceneState, origin: TileDragOrigin) {
  return canSelectHandTile(state, origin.tile) && state.key === origin.key &&
    state.round === origin.round && state.me === origin.me &&
    state.turn === origin.turn && state.phase === origin.phase &&
    state.selected === origin.selected && (!origin.canDiscard || state.canDiscard);
}

export function shouldDiscardDraggedTile(
  state: TableSceneState,
  origin: TileDragOrigin,
  deltaX: number,
  deltaY: number,
  release: { x: number; y: number },
) {
  return canContinueTileDrag(state, origin) && origin.selected === origin.tile &&
    origin.canDiscard && state.canDiscard && state.phase === 'playing' &&
    state.turn === state.me && Number.isFinite(deltaX) && Number.isFinite(deltaY) &&
    // Release above the standing hand, inside the 1280 × 590 design surface.
    // Horizontal travel and speed do not matter: side tiles may go to the centre.
    Number.isFinite(release.x) && Number.isFinite(release.y) &&
    release.x >= 0 && release.x <= 1280 && release.y >= 110 && release.y <= 590 &&
    deltaY >= TILE_DISCARD_DRAG_DISTANCE;
}
