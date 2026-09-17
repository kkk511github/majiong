import { expect, it } from "vitest";
import { matchSummary, ruleFeedback } from "../src/record-export";
import { replayedRound } from "./fixtures/replayed-round";
import type { MatchDetails, StoredRound } from "../shared/types";
it("exports displayed totals and selected round without private account or hand fields", () => {
  const g = replayedRound(),
    r = g.history[0];
  const stored: StoredRound = {
    game: g.id,
    code: g.code,
    me: 0,
    practice: false,
    record: {
      ...r,
      teamNames: ["secret-team"],
      playerIds: ["secret-account"],
      memberIds: ["secret-member"],
    },
  };
  const data: MatchDetails = { match: stored, rounds: [stored] };
  const text = matchSummary(data);
  expect(text).toContain(g.code);
  expect(text).toContain(r.names[0]);
  for (const secret of [
    "secret-team",
    "secret-account",
    "secret-member",
    "hand",
    "token",
  ])
    expect(text).not.toContain(secret);
  const feedback = ruleFeedback(data, stored, "外包结算与预期不同");
  expect(feedback).toContain(r.id);
  expect(feedback).toContain("外包结算与预期不同");
  expect(feedback).not.toContain("secret-account");
  expect(ruleFeedback(data, undefined, "")).toContain("请补充具体操作");
});
