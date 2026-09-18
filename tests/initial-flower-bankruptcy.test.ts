import { expect, it } from "vitest";
import { createGame, newPlayer, seats, startRound } from "../shared/engine";
import { newGameRules } from "../shared/nanjing-rules";
import { isFlower, type ShuffleRandom } from "../shared/tiles";
import type { Game, Seat } from "../shared/types";

/** Deal a complete, unique 144-tile wall through the real shuffle/deal path. */
function initialFlowerWall(recipient: Seat, extraFlower = false): { wall: number[]; random: ShuffleRandom } {
  const hands: number[][] = [[], [], [], []];
  hands[recipient] = [124, 125, 126, 127, ...(extraFlower ? [128] : [])];
  const used = new Set(hands[recipient]);
  for (const seat of seats)
    for (let tile = 0; hands[seat].length < (seat === 0 ? 14 : 13); tile++)
      if (!used.has(tile) && !isFlower(tile)) {
        hands[seat].push(tile);
        used.add(tile);
      }
  const prefix: number[] = [];
  for (let n = 0; n < 13; n++) for (const seat of seats) prefix.push(hands[seat][n]);
  prefix.push(hands[0][13]);
  const remainder = Array.from({ length: 144 }, (_, tile) => tile).filter(tile => !used.has(tile));
  // Ordinary tiles at the back isolate the initial flower kong from later ones.
  const wall = [...prefix, ...remainder.filter(isFlower), ...remainder.filter(tile => !isFlower(tile))];
  const working = Array.from({ length: 144 }, (_, tile) => tile), choices: number[] = [];
  for (let i = 143; i > 0; i--) {
    const j = working.indexOf(wall[i]);
    choices.push(j);
    [working[i], working[j]] = [working[j], working[i]];
  }
  return { wall, random: { index: () => choices.shift()! } };
}

function readyGame(scores: number[], multiplier: number): Game {
  const g = createGame("123456", "initial-flower-bankruptcy", newGameRules());
  g.players = seats.map(seat => ({ ...newPlayer(String(seat), `牌友${seat}`), ready: true, score: scores[seat] }));
  g.ruleState = {
    multiplier: 1, nextMultiplier: multiplier, nextReasons: [], keepDealer: false,
    heavenlyEligible: false, heavenlyWaits: {}, discards: [], ownDiscards: [[], [], [], []], kongOccurred: false,
  };
  return g;
}

for (const recipient of [0, 2] as Seat[])
  it.each([1, 2])(`起手花杠由座位${recipient}收分，倍率%s：两家归零当场保米且不再补摸`, multiplier => {
    const scores = [0, 0, 0, 0];
    [8, 0, 6, 346].forEach((score, offset) => scores[(recipient + offset) % 4] = score);
    const { wall, random } = initialFlowerWall(recipient, true);
    const ended = startRound(readyGame(scores, multiplier), 1000, random);
    const expected = [0, 0, 0, 0];
    expected[recipient] = 100;
    expected[(recipient + 3) % 4] = 260;
    expect(ended.players.map(p => p!.score)).toEqual(expected);
    expect(ended.phase).toBe("finished");
    expect(ended.result!.reason).toBe("bankrupt");
    expect(ended.result!.transfers).toContainEqual({
      from: (recipient + 3) % 4, to: recipient, amount: 86 - 10 * multiplier, reason: "保米",
    });
    expect(ended.wall).toEqual(wall.slice(53));
    expect(ended.players[recipient]!.flowers).toEqual([124, 125, 126, 127]);
    expect(ended.players[recipient]!.hand).toContain(128);
    const allTiles = [...ended.wall, ...ended.players.flatMap(p => [...p!.hand, ...p!.flowers])];
    expect(allTiles.sort((a, b) => a - b)).toEqual(Array.from({ length: 144 }, (_, tile) => tile));
    expect(ended.history).toHaveLength(1);
    expect(ended.history[0].scores).toEqual(expected);
    expect(ended.replay!.frames.map(f => f.type)).toEqual(["finish"]);
    const finalFrame = ended.replay!.frames[0];
    expect(finalFrame.players.map(p => p.score)).toEqual(expected);
    expect(finalFrame.result).toEqual(ended.result);
    expect(finalFrame.remaining).toBe(91);
  });

it.each([1, 2])("余额足够时起手花杠正常收分并补齐手牌，倍率%s", multiplier => {
  const { wall, random } = initialFlowerWall(0);
  const playing = startRound(readyGame([90, 90, 90, 90], multiplier), 1000, random);
  expect(playing.phase).toBe("playing");
  expect(playing.result).toBeUndefined();
  expect(playing.players.map(p => p!.score)).toEqual([90 + 30 * multiplier, ...Array(3).fill(90 - 10 * multiplier)]);
  expect(playing.players.map(p => p!.hand.length)).toEqual([14, 13, 13, 13]);
  expect(playing.wall).toEqual(wall.slice(53, -4));
  expect(playing.roundTransfers).toEqual([1, 2, 3].map(from => ({ from, to: 0, amount: 10 * multiplier, reason: "花杠" })));
  expect(playing.replay!.frames.map(f => f.type)).toEqual(["start"]);
  expect(playing.ruleState!.nextReasons).toEqual(["花杠"]);
});
