import { describe, it, expect } from "vitest";
import { gameFeedback } from "../src/game-feedback";
import { gameCues } from "../src/audio";
import {
  createGame,
  newPlayer,
  startRound,
  viewFor,
  act,
  seats,
} from "../shared/engine";
import { seededRandom } from "../shared/tiles";
import { ruleSections } from "../src/rule-copy";
import { DEFAULT_RULES } from "../shared/types";
import { DEFAULT_TABLE_SETTINGS } from "../shared/table-settings";
function playing() {
  const game = createGame("123456", "feedback");
  game.players = seats.map((s) => ({
    ...newPlayer("p" + s, "牌友" + s),
    ready: true,
  }));
  return startRound(game, 1000, seededRandom(22));
}
describe("确认后的声音与视觉反馈", () => {
  it("首次进入、换桌、重复或过期快照不播放历史事件", () => {
    const before = viewFor(playing(), 0),
      after = structuredClone(before);
    after.revision++;
    after.players[1]!.melds.push({
      type: "pung",
      tiles: [0, 1, 2],
      from: 2,
      concealed: false,
    });
    expect(gameFeedback(null, after)).toEqual([]);
    expect(gameCues(null, after)).toEqual([]);
    expect(gameFeedback({ ...before, id: "other" }, after)).toEqual([]);
    expect(
      gameFeedback(before, { ...after, revision: before.revision }),
    ).toEqual([]);
    expect(gameFeedback(after, before)).toEqual([]);
  });
  it("暗杠只反馈动作，既不附带暗牌也不因补花重复播放杠声", () => {
    const before = viewFor(playing(), 0),
      after = structuredClone(before);
    after.revision++;
    after.players[1]!.melds.push({
      type: "kong",
      tiles: [],
      from: 1,
      concealed: true,
    });
    after.players[1]!.flowers.push(140);
    const calls = gameFeedback(before, after);
    expect(calls.map((x) => x.type)).toEqual(["kong", "flower"]);
    expect(calls[0].tile).toBeUndefined();
    expect(gameCues(before, after)).toEqual(["kong"]);
  });
  it("补杠能识别，补花数量正确；出牌与摸牌反馈来自实际状态", () => {
    const before = viewFor(playing(), 0),
      after = structuredClone(before);
    before.players[2]!.melds = [
      { type: "pung", tiles: [8, 9, 10], from: 1, concealed: false },
    ];
    after.players[2]!.melds = [
      { type: "kong", tiles: [8, 9, 10, 11], from: 1, concealed: false },
    ];
    after.revision++;
    expect(gameFeedback(before, after).map((x) => x.type)).toEqual(["kong"]);
    const game = playing(),
      next = act(
        game,
        0,
        { type: "discard", tile: game.players[0]!.hand[0] },
        2000,
      );
    expect(
      gameFeedback(viewFor(game, 0), viewFor(next, 0)).some(
        (x) => x.type === "discard" && x.seat === 0,
      ),
    ).toBe(true);
    const flowers = structuredClone(before);
    flowers.revision++;
    flowers.players[0]!.flowers.push(140, 141);
    expect(
      gameFeedback(before, flowers).find((x) => x.type === "flower")?.count,
    ).toBe(2);
  });
});
describe("玩法文案遵守当前牌桌设置", () => {
  it("海底开关、花砸2和胡牌硬花门槛随实际规则变化", () => {
    const on = ruleSections({
      ...DEFAULT_RULES,
      seaBottom: true,
      minimumFlowers: 3,
    })
      .flat()
      .join(" ");
    expect(on).toContain("摸完才流局");
    expect(on).toContain("至少需要 3 个硬花");
    const off = ruleSections({
      ...DEFAULT_RULES,
      seaBottom: false,
      flowerDouble: false,
    })
      .flat()
      .join(" ");
    expect(off).toContain("剩余 16 张时流局");
    expect(off).toContain("硬花每张 1");
    expect(off).toContain("每个 1 分");
  });
  it("手动准备、踢人、整桌累计超时和可取消托管文案", () => {
    const text = ruleSections(
      { ...DEFAULT_RULES, turnSeconds: 10 },
      {
        ...DEFAULT_TABLE_SETTINGS,
        readyMode: "manual",
        kickUnready: true,
        kickAfterSeconds: 10,
        offlineStart: false,
        trusteeMode: "match",
        overtimeSeconds: 90,
      },
    )
      .flat()
      .join(" ");
    expect(text).toContain("四位真人");
    expect(text).toContain("每人手动准备");
    expect(text).toContain("满四人后 10 秒");
    expect(text).toContain("整桌共用的 90 秒超时额度");
    expect(text).toContain("换新桌才恢复");
    expect(text).toContain("可随时取消");
    expect(text).not.toContain("添加电脑");
  });
});
