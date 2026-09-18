import { expect, it } from "vitest";
import { canShowOpening, openingMatchesState } from "../src/TableOpening";
import { cocosState } from "../src/cocos-state";
import { createGame, newPlayer, startRound, viewFor, seats } from "../shared/engine";
import { seededRandom } from "../shared/tiles";

it("开局动画仅用于刚开局的本桌，恢复、回放、过期及已出牌状态不遮挡操作", () => {
  const game = createGame("123456", "me", {});
  game.players = seats.map(seat => ({ ...newPlayer(String(seat), `牌友${seat}`), ready: true }));
  const view = viewFor(startRound(game, 1000, seededRandom(42)), 0);
  const state = cocosState(view, { connected: true, disabled: false, practice: false, countdown: "30", selected: null, inspectedKind: null, hintKinds: [], hintLabel: "", effects: [] });
  const cue = { key: "deal", game: state.key, round: state.round, at: 1000 };
  expect(canShowOpening(cue, state, 1100)).toBe(true);
  expect(canShowOpening({ ...cue, round: 2 }, { ...state, round: 2 }, 1100)).toBe(false);
  expect(canShowOpening({ ...cue, round: 8 }, { ...state, round: 8 }, 1100)).toBe(false);
  expect(canShowOpening({ ...cue, game: "renewed-table" }, { ...state, key: "renewed-table" }, 1100)).toBe(true);
  expect(canShowOpening(undefined, state, 1100)).toBe(false);
  expect(canShowOpening(cue, state, 8000)).toBe(false);
  // Freshness is checked when entry is accepted, not while the board loads.
  expect(openingMatchesState(cue, state)).toBe(true);
  expect(canShowOpening({ ...cue, game: "another-table" }, state, 1100)).toBe(false);
  expect(canShowOpening(cue, { ...state, connected: false }, 1100)).toBe(false);
  expect(canShowOpening(cue, { ...state, presentation: "replay" }, 1100)).toBe(false);
  expect(canShowOpening(cue, { ...state, phase: "claiming" }, 1100)).toBe(false);
  expect(canShowOpening(cue, { ...state, lastDiscard: { tile: 4, seat: 0 } }, 1100)).toBe(false);
  expect(openingMatchesState(cue, { ...state, round: 2 })).toBe(false);
  expect(openingMatchesState(cue, { ...state, connected: false })).toBe(false);
});
