import { expect, it } from "vitest";
import { viewFor, startRound, seats } from "../shared/engine";
import { ruleDisplayName } from "../shared/nanjing-rules";
import { seededRandom } from "../shared/tiles";
import { cocosState } from "../src/cocos-state";
import { externalRound } from "./fixtures/external-round";

const ui = {
  connected: true, disabled: false, practice: false, countdown: "10",
  selected: null, inspectedKind: null, hintKinds: [], hintLabel: "", effects: [],
};

it("真实结算向四个视角传递本把和下把倍率，续把后不把预告当成本把", () => {
  const ended = externalRound({ multiplier: 1 });
  for (const seat of seats) {
    const state = cocosState(viewFor(ended, seat), ui);
    expect(state).toMatchObject({ rulesName: "进园子", roundMultiplier: 1, nextRoundMultiplier: 2 });
    expect(state).not.toHaveProperty("ruleState");
  }
  ended.players.forEach(p => p!.ready = true);
  const next = startRound(ended, 10000, seededRandom(33));
  expect(cocosState(viewFor(next, 0), ui)).toMatchObject({ roundMultiplier: 2, nextRoundMultiplier: undefined });
  expect(next.history[0].multiplier).toBe(1);
  expect(next.replay?.multiplier).toBe(2);
  next.phase = "finished";
  expect(cocosState(viewFor(next, 0), ui).nextRoundMultiplier).toBeUndefined();
});

it("敞开头按自己的档案显示，未知旧回放不套用当前进园子默认", () => {
  const ended = externalRound({ rules: { id: "nj-open-v2" }, multiplier: 2 });
  expect(cocosState(viewFor(ended, 0), ui)).toMatchObject({ rulesName: "敞开头", roundMultiplier: 2 });
  expect(ruleDisplayName(undefined)).toBeUndefined();
  expect(ruleDisplayName({ id: "nj-casual-v1" })).toBe("原休闲规则");
});
