import { act, createGame, newPlayer, seats } from "../../shared/engine";
import { newGameRules } from "../../shared/nanjing-rules";
import { kind, sortTiles } from "../../shared/tiles";
import type { Action, Game, Meld, Rules, Seat, Tile } from "../../shared/types";

export const LAST_WIN_TILE = 113; // 南：与手内112成将。
export const LAST_DRAW_TRIGGER = 116; // 上家打西，进入下家的正常摸牌。
export const LAST_WAIT_HAND = [0, 4, 8, 12, 16, 20, 36, 40, 44, 72, 76, 80, 112];
export const LAST_KONG_WAIT = [4, 8, 12, 36, 40, 44, 72, 76, 80, 112];

/** Late-hand state only. All 144 physical tiles remain in hands, flowers,
 * completed melds, rivers or the supplied wall; no seaBottom context is injected. */
export function lastWallGame(options: {
  wall: Tile[];
  hand?: Tile[];
  melds?: Meld[];
  turn?: Seat;
  trigger?: Tile;
  multiplier?: number;
  rules?: Partial<Rules>;
  otherHands?: Partial<Record<Seat, Tile[]>>;
}): Game {
  const g = createGame("746901", "offline-last-wall", newGameRules({ seaBottom: true, ...options.rules }));
  g.players = seats.map(seat => newPlayer(`last-wall-${seat}`, ["甲", "乙", "丙", "丁"][seat]));
  g.phase = "playing"; g.round = 1; g.dealer = 2; g.turn = options.turn ?? 3;
  g.canSelfWin = true; g.lastDraw = g.turn === 3 ? options.trigger ?? LAST_DRAW_TRIGGER : options.hand?.at(-1);
  g.wall = [...options.wall];
  g.players.forEach((player, seat) => { player!.score = seat === 0 ? 30 : 110; });
  Object.assign(g.players[0]!, {
    hand: [...(options.hand ?? LAST_WAIT_HAND)],
    melds: structuredClone(options.melds ?? []), flowers: [124, 128, 132, 136],
  });
  for (const seat of seats) if (seat !== 0 && options.otherHands?.[seat]) g.players[seat]!.hand = [...options.otherHands[seat]!];
  if (g.turn === 3) g.players[3]!.hand.push(options.trigger ?? LAST_DRAW_TRIGGER);
  const held = new Set([...g.wall, ...g.players.flatMap(player => [...player!.hand, ...player!.flowers, ...player!.melds.flatMap(meld => meld.tiles)])]);
  const available = Array.from({ length: 124 }, (_, tile) => tile).filter(tile => !held.has(tile));
  for (const seat of seats) {
    if (seat === 0) continue;
    const player = g.players[seat]!, size = 13 - player.melds.length * 3 + (seat === g.turn ? 1 : 0);
    while (player.hand.length < size) { const tile = available.shift()!; player.hand.push(tile); held.add(tile); }
    sortTiles(player.hand);
  }
  // The other hard flowers were exposed earlier; distribute them without
  // making a fresh four-flower group during the tested action.
  let flowerSeat = 1;
  for (let tile = 124; tile < 144; tile++) if (!held.has(tile)) {
    g.players[flowerSeat]!.flowers.push(tile); held.add(tile); flowerSeat = flowerSeat % 3 + 1;
  }
  let discardSeat = 0;
  for (const tile of available) {
    g.players[discardSeat]!.discards.push(tile); discardSeat = (discardSeat + 1) % 4;
  }
  g.roundStartScores = g.players.map(player => player!.score);
  g.roundStartExternalScores = [0, 0, 0, 0]; g.roundTransfers = [];
  g.ruleState = {
    multiplier: options.multiplier ?? 1, nextMultiplier: 1, nextReasons: [], keepDealer: false,
    heavenlyEligible: false, heavenlyWaits: {}, discards: [],
    ownDiscards: g.players.map(player => player!.discards.map(kind)),
    kongOccurred: !!options.melds?.some(meld => meld.type === "kong"),
  };
  assertLastWallInventory(g);
  return g;
}

export function assertLastWallInventory(g: Game) {
  const tiles = [...g.wall, ...g.players.flatMap(player => [...player!.hand, ...player!.flowers, ...player!.discards, ...player!.melds.flatMap(meld => meld.tiles)])];
  if (tiles.length !== 144 || new Set(tiles).size !== 144 || tiles.some(tile => tile < 0 || tile > 143 || !Number.isInteger(tile)))
    throw Error(`Invalid last-wall inventory: ${tiles.length} physical positions / ${new Set(tiles).size} unique IDs`);
}

export function lastWallAction(g: Game, seat: Seat, action: Action, now = 1000) {
  const next = act(g, seat, action, now); assertLastWallInventory(next); return next;
}
export function resolveLastWallClaims(g: Game, claims: Partial<Record<Seat, "hu" | "kong" | "pass">> = {}) {
  let next = g;
  for (const seat of seats) if (next.phase === "claiming" && next.pending?.offers[seat] && next.pending.replies[seat] === undefined)
    next = lastWallAction(next, seat, { type: claims[seat] ?? "pass" }, 1100);
  return next;
}
export function takeLastWallDraw(g: Game, trigger = LAST_DRAW_TRIGGER) {
  return resolveLastWallClaims(lastWallAction(g, 3, { type: "discard", tile: trigger }));
}
