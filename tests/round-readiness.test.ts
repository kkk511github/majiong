import { describe, expect, it } from "vitest";
import { createGame, newPlayer, viewFor } from "../shared/engine";
import {
  normalizeTableSettings,
  playerPreparation,
} from "../shared/table-settings";
import { roundReadiness } from "../src/round-readiness";

function table() {
  const g = createGame("123456", "ready-again");
  g.table = {
    creatorId: "admin",
    groupId: "ready",
    number: 1,
    createdAt: 1,
    settings: normalizeTableSettings(),
  };
  g.players = ["金陵", "秦淮", "钟山", "莫愁"].map((n, i) =>
    newPlayer(String(i), n),
  );
  g.phase = "ended";
  return g;
}
describe("结算后准备状态", () => {
  it("手动准备与托管、自动准备、暂停托管使用同一开局条件", () => {
    const g = table(),
      p = g.players[0]!,
      s = g.table!.settings;
    expect(playerPreparation(p, s).canStart).toBe(false);
    p.trustee = true;
    expect(playerPreparation(p, s).canStart).toBe(true);
    expect(roundReadiness(viewFor(g, 0), true, 0).seats[0].label).toBe(
      "托管就绪",
    );
    p.awaitingReady = true;
    s.readyMode = "auto";
    expect(playerPreparation(p, s).canStart).toBe(false);
    expect(roundReadiness(viewFor(g, 0), true, 0).seats[0].label).toBe(
      "待确认继续",
    );
    p.ready = true;
    expect(playerPreparation(p, s).canStart).toBe(true);
  });
  it("全员准备但有人离线，不会谎称正在发牌；允许离线的桌按其配置执行", () => {
    const g = table();
    g.players.forEach((p) => (p!.ready = true));
    g.players[2]!.online = false;
    const blocked = roundReadiness(viewFor(g, 0), true, 0);
    expect(blocked.message).toBe("等待钟山回桌后开局");
    expect(blocked.seats[2]).toMatchObject({
      label: "已离线",
      canStart: false,
    });
    g.table!.settings.offlineStart = true;
    const allowed = roundReadiness(viewFor(g, 0), true, 0);
    expect(allowed.message).toBe("全员就绪，正在发牌…");
    expect(allowed.seats[2].label).toBe("离线可开局");
  });
  it("结算展示、待准备和失去连接各自有真实提示", () => {
    const g = table();
    expect(roundReadiness(viewFor(g, 0), true, 5).message).toContain(
      "可以先准备",
    );
    g.players.forEach((p) => (p!.ready = true));
    expect(roundReadiness(viewFor(g, 0), true, 5).message).toBe(
      "全员就绪，5 秒后发牌",
    );
    g.players[1]!.ready = false;
    expect(roundReadiness(viewFor(g, 0), true, 0).message).toBe(
      "等待秦淮准备下一局",
    );
    const offline = roundReadiness(viewFor(g, 0), false, 0);
    expect(offline.message).toContain("连接中断");
    expect(offline.seats.every((s) => s.label === "待同步")).toBe(true);
  });
});
