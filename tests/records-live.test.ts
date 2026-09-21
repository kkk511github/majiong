import { describe, expect, it, vi } from "vitest";
import { CompletedTableArrivals } from "../src/records-live";
import { GameAudio } from "../src/audio";
import type { StoredRound } from "../shared/types";

function table(game: string, at: number): StoredRound {
  return {
    game,
    code: "123456",
    me: 0,
    practice: false,
    record: {
      id: `${game}-final`,
      at,
      round: 4,
      totalRounds: 4,
      matchFinished: true,
      names: ["甲", "乙", "丙", "丁"],
      scores: [0, 0, 0, 0],
      result: {
        reason: "draw",
        winners: [],
        details: {},
        deltas: [0, 0, 0, 0],
      },
    },
  };
}

describe("new completed-table detection", () => {
  it("treats the first response as a silent baseline and repeated snapshots as unchanged", () => {
    const detector = new CompletedTableArrivals();
    expect(detector.observe([table("old", 10)])).toEqual([]);
    expect(detector.observe([table("new", 20), table("old", 10)])).toEqual([
      "new",
    ]);
    expect(detector.observe([table("new", 20), table("old", 10)])).toEqual([]);
  });
  it("deduplicates reused room numbers, simultaneous completions and repeated final rows by game id", () => {
    const detector = new CompletedTableArrivals();
    detector.observe([table("first-game", 10)]);
    expect(
      detector.observe([
        table("second-game", 10),
        table("third-game", 10),
        table("second-game", 10),
      ]),
    ).toEqual(["second-game", "third-game"]);
    expect(
      detector.observe([table("third-game", 10), table("first-game", 10)]),
    ).toEqual([]);
  });
  it("does not notify for older backfills, changed read receipts or deleted rows returning", () => {
    const detector = new CompletedTableArrivals();
    detector.observe([table("latest", 100)]);
    expect(
      detector.observe([
        { ...table("latest", 100), adminReadAt: 200 },
        table("older", 50),
      ]),
    ).toEqual([]);
    expect(detector.observe([])).toEqual([]);
    expect(detector.observe([table("latest", 100)])).toEqual([]);
    expect(detector.observe([table("next", 110)])).toEqual(["next"]);
  });
  it("notifies once when an empty initial list receives its first completed table", () => {
    const detector = new CompletedTableArrivals();
    expect(detector.observe([])).toEqual([]);
    expect(detector.observe([table("first", 1)])).toEqual(["first"]);
    expect(detector.observe([table("first", 1)])).toEqual([]);
  });
});

it("plays one gentle two-note cue and respects global audio mute/visibility/unlock rules", () => {
  const audio = new GameAudio();
  const internals = audio as unknown as {
    context?: { state: string; currentTime: number };
    effectsGain?: unknown;
    preferences: { sound: boolean; soundVolume: number };
    visible: boolean;
    tone: (...args: unknown[]) => void;
  };
  const tone = vi.spyOn(internals, "tone").mockImplementation(() => {});
  audio.play("records");
  expect(tone).not.toHaveBeenCalled();
  internals.context = { state: "running", currentTime: 1 };
  internals.effectsGain = {};
  audio.play("records");
  expect(tone).toHaveBeenCalledTimes(2);
  expect(
    tone.mock.calls.every(
      (call) => Number(call[3]) <= 0.06 && Number(call[2]) <= 0.5,
    ),
  ).toBe(true);
  tone.mockClear();
  internals.preferences.sound = false;
  audio.play("records");
  internals.preferences.sound = true;
  internals.visible = false;
  audio.play("records");
  internals.visible = true;
  internals.preferences.soundVolume = 0;
  audio.play("records");
  internals.preferences.soundVolume = 0.7;
  internals.context.state = "suspended";
  audio.play("records");
  expect(tone).not.toHaveBeenCalled();
});
