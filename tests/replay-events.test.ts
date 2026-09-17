import { expect, it } from "vitest";
import { replayedRound } from "./fixtures/replayed-round";
import { isReplayKeyEvent, replayEventLabel } from "../src/replay-events";
it("current-perspective labels hide opponents private draw and concealed kong faces", () => {
  const r = replayedRound().replay!,
    f = { ...r.frames[0], seat: 1 as const, tile: 0 };
  for (const type of ["draw", "concealedKong"] as const) {
    expect(replayEventLabel({ ...f, type }, r.names, 0, false)).not.toContain(
      "一万",
    );
    expect(replayEventLabel({ ...f, type }, r.names, 1, false)).toContain(
      "一万",
    );
    expect(replayEventLabel({ ...f, type }, r.names, 0, true)).toContain(
      "一万",
    );
  }
  expect(
    replayEventLabel({ ...f, type: "discard" }, r.names, 0, false),
  ).toContain("一万");
});
it("key events include all kong variants and settlement, without ordinary draws", () => {
  const f = replayedRound().replay!.frames[0];
  for (const type of [
    "pung",
    "kong",
    "concealedKong",
    "addedKong",
    "zhaozhi",
    "finish",
  ] as const)
    expect(isReplayKeyEvent({ ...f, type })).toBe(true);
  expect(isReplayKeyEvent({ ...f, type: "draw" })).toBe(false);
});
