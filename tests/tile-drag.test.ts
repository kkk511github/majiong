import { describe, expect, it } from 'vitest';
import type { TableSceneState } from '../shared/table-scene';
import { beginTileDrag, canContinueTileDrag, shouldDiscardDraggedTile } from '../shared/tile-drag';
const tabletop = { x: 640, y: 220 };

function table(overrides: Partial<TableSceneState> = {}): TableSceneState {
  return {
    key: 'room-1', revision: 1, me: 0, turn: 0, dealer: 0, phase: 'playing',
    code: '123456', round: 1, remaining: 80, countdown: '10', connected: true,
    disabled: false, practice: false, canDiscard: true, selected: 8,
    inspectedKind: null, hintKinds: [], hintLabel: '', actions: [], effects: [],
    trusteeDisabled: false,
    players: [0, 1, 2, 3].map(seat => ({
      seat, name: String(seat), score: 100, bot: false, trustee: false,
      hand: seat === 0 ? [4, 8, 12] : [], handCount: 3, flowers: [],
      discards: [], melds: [],
    })),
    ...overrides,
  };
}

describe('selected hand tile drag', () => {
  it('requires a selected tile and a deliberate upward release', () => {
    const state = table(), origin = beginTileDrag(state, 8)!;
    expect(shouldDiscardDraggedTile(state, origin, 8, 60, tabletop)).toBe(true);
    for (const [x, y] of [[0, 0], [0, 51], [0, -90], [Infinity, 70], [0, NaN]])
      expect(shouldDiscardDraggedTile(state, origin, x, y, tabletop)).toBe(false);
    const unselected = beginTileDrag(state, 4)!;
    expect(shouldDiscardDraggedTile(state, unselected, 0, 90, tabletop)).toBe(false);
  });

  it('allows diagonal movement to the table but not release outside it or in the hand row', () => {
    const state = table(), origin = beginTileDrag(state, 8)!;
    expect(shouldDiscardDraggedTile(state, origin, -350, 90, tabletop)).toBe(true);
    expect(shouldDiscardDraggedTile(state, origin, 350, 90, tabletop)).toBe(true);
    for (const release of [{x:-1,y:220},{x:1281,y:220},{x:640,y:80},{x:640,y:591},{x:NaN,y:220}])
      expect(shouldDiscardDraggedTile(state, origin, 0, 90, release)).toBe(false);
  });

  it('retains physical tile identity across countdown pushes and hand sorting', () => {
    const state = table(), origin = beginTileDrag(state, 8)!;
    const updated = table({revision: 9, countdown: '7'});
    updated.players[0].hand = [12, 4, 8];
    expect(canContinueTileDrag(updated, origin)).toBe(true);
    expect(shouldDiscardDraggedTile(updated, origin, 0, 70, tabletop)).toBe(true);
    updated.players[0].hand = [12, 4];
    expect(shouldDiscardDraggedTile(updated, origin, 0, 70, tabletop)).toBe(false);
  });

  it('allows selecting between turns without turning that touch into a discard', () => {
    const state = table({turn: 1, canDiscard: false});
    const origin = beginTileDrag(state, 8)!;
    expect(origin).toBeDefined();
    expect(shouldDiscardDraggedTile(state, origin, 0, 90, tabletop)).toBe(false);
    expect(shouldDiscardDraggedTile(table(), origin, 0, 90, tabletop)).toBe(false);
    expect(beginTileDrag(table({phase: 'claiming', canDiscard: false}), 8)).toBeDefined();
  });

  it('cancels across action, round, room, perspective or selection changes', () => {
    const state = table(), origin = beginTileDrag(state, 8)!;
    const changes: Partial<TableSceneState>[] = [
      {key: 'room-2'}, {round: 2}, {me: 1}, {turn: 1},
      {phase: 'claiming'}, {phase: 'ended'}, {selected: 12}, {canDiscard: false},
    ];
    for (const change of changes) {
      const updated = table(change);
      expect(canContinueTileDrag(updated, origin)).toBe(false);
      expect(shouldDiscardDraggedTile(updated, origin, 0, 90, tabletop)).toBe(false);
    }
  });

  it('blocks starting or finishing in replay, offline, pending or trustee states', () => {
    const origin = beginTileDrag(table(), 8)!;
    const blocked = [table({presentation: 'replay'}), table({connected: false}), table({disabled: true}), table()];
    blocked[3].players[0].trustee = true;
    for (const state of blocked) {
      expect(beginTileDrag(state, 8)).toBeUndefined();
      expect(shouldDiscardDraggedTile(state, origin, 0, 90, tabletop)).toBe(false);
    }
    expect(beginTileDrag(table(), 24)).toBeUndefined();
  });
});
