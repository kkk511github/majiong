import { describe, expect, it } from "vitest";
import { actionVoices, winPhrases } from "../src/voice-events";
import { createGame, newPlayer, startRound, viewFor } from "../shared/engine";
import { seededRandom } from "../shared/tiles";
import type { Result } from "../shared/types";
function fixture() {
  const g = createGame("v", "voices");
  g.players = [0, 1, 2, 3].map((i) => {
    const p = newPlayer(String(i), "牌友" + i);
    p.ready = true;
    return p;
  });
  return viewFor(startRound(g, 1000, seededRandom(54)), 0);
}
const result = (labels: string[], from: 0 | undefined = undefined): Result => ({
  reason: "hu",
  from,
  winners: [1],
  deltas: [0, 0, 0, 0],
  details: {
    1: {
      total: 20,
      kinds: [],
      items: labels.map((label) => ({ label, value: 20 })),
    },
  },
});
describe("动作与胡牌语音", () => {
  it("只用服务端计分项选牌型，杠开不误报普通自摸，最多三句", () => {
    expect(
      winPhrases(result(["小杠开花", "清一色", "七对", "门清"]), 1),
    ).toEqual(["杠上开花", "七对", "清一色"]);
    expect(winPhrases(result(["大杠开花"]), 1)).toEqual(["杠上开花"]);
    expect(winPhrases(result(["海底捞月"]), 1)).toEqual(["海底捞月"]);
    expect(winPhrases(result(["补花胡"]), 1)).toEqual(["补花胡"]);
    expect(winPhrases(result([], 0), 1)).toEqual(["胡了"]);
    expect(winPhrases(result([]), 1)).toEqual(["自摸"]);
  });
  it("抢杠、明杠、暗杠、补杠与补花区分；暗杠不读牌名", () => {
    const r = result([], 0);
    r.transfers = [{ from: 0, to: 1, amount: 30, reason: "抢杠包三家" }];
    expect(winPhrases(r, 1)).toEqual(["抢杠胡"]);
    const a = fixture(),
      b = structuredClone(a);
    b.revision++;
    b.players[1]!.melds = [
      { type: "kong", concealed: true, tiles: [], from: 1 },
    ];
    b.players[1]!.flowers.push(140);
    expect(actionVoices(a, b).map((p) => p.phrase)).toEqual(["暗杠", "补花"]);
    b.players[1]!.melds[0].concealed = false;
    expect(actionVoices(a, b)[0].phrase).toBe("杠");
    a.players[1]!.melds = [
      { type: "pung", concealed: false, tiles: [0, 1, 2], from: 0 },
    ];
    expect(actionVoices(a, b)[0].phrase).toBe("补杠");
  });
  it("恢复或重复结果不报牌；多家同时胡不叠放相同语音", () => {
    const a = fixture(),
      b = structuredClone(a);
    b.revision++;
    b.result = result(["清一色"], 0);
    b.result.winners = [1, 2];
    b.result.details[2] = b.result.details[1];
    expect(actionVoices(a, b).map((p) => p.phrase)).toEqual(["胡了"]);
    expect(actionVoices(null, b)).toEqual([]);
    expect(actionVoices(b, b)).toEqual([]);
    const c = structuredClone(b);
    c.revision++;
    expect(actionVoices(b, c)).toEqual([]);
  });
  it("开局补花一次报补花，四家花牌都可展示；流局只报一次", () => {
    const a = fixture(),
      b = structuredClone(a);
    a.round = 0;
    b.revision++;
    b.players[0]!.flowers = [136];
    b.players[1]!.flowers = [140];
    expect(actionVoices(a, b).filter((p) => p.phrase === "补花")).toHaveLength(
      1,
    );
    a.round = b.round;
    b.result = {
      reason: "draw",
      winners: [],
      details: {},
      deltas: [0, 0, 0, 0],
    };
    expect(actionVoices(a, b).map((p) => p.phrase)).toEqual(["流局"]);
  });
});
