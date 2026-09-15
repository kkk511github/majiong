import { describe, expect, it } from "vitest";
import {
  act,
  trusteeAction,
  createGame,
  newPlayer,
  startRound,
  viewFor,
} from "../shared/engine";
import { normalizeTableSettings } from "../shared/table-settings";
import {
  chargeOvertime,
  decisionCountdown,
  overtimeExpired,
  overtimeRemaining,
  setTrustee,
} from "../shared/timing";
import { settlementRows } from "../shared/settlement";
import { scoreHand } from "../shared/scoring";
import type { Game, RoundRecord, Seat } from "../shared/types";
function table(overtimePerTurn = true): Game {
  const g = createGame("123456", "timing", { turnSeconds: 10 });
  g.table = {
    creatorId: "admin",
    groupId: "batch",
    number: 1,
    createdAt: 0,
    settings: normalizeTableSettings({ overtimePerTurn }),
  };
  g.players = [0, 1, 2, 3].map((i) => ({
    ...newPlayer(String(i), String(i)),
    ready: true,
  }));
  return startRound(g, 1000, () => 0.51);
}
describe("建桌指定参数", () => {
  it("默认90分、手动准备、离线不开局、10秒踢人、每次出牌90秒超时", () => {
    const g = table(),
      s = g.table!.settings;
    expect(g.initialScore).toBe(90);
    expect(s).toMatchObject({
      readyMode: "manual",
      offlineStart: false,
      resultSeconds: 10,
      kickUnready: true,
      kickAfterSeconds: 10,
      overtimeSeconds: 90,
      overtimePerTurn: true,
      continuousRounds: true,
      scoreMultiplier: 0.5,
    });
    expect(g.deadline).toBe(11000);
  });
  it.each([0.2, 0.5, 1] as const)(
    "记分倍率 %s 只乘累计输赢，负分不截断",
    (multiplier) => {
      expect(
        normalizeTableSettings({ scoreMultiplier: multiplier }).scoreMultiplier,
      ).toBe(multiplier);
      const record = {
        names: ["a", "b", "c", "d"],
        scores: [210, 130, -10, 30],
        initialScore: 90,
        scoreDivisor: 1 / multiplier,
      } as RoundRecord;
      const rows = settlementRows(record);
      expect(rows.map((r) => r.recorded)).toEqual(
        [120, 40, -60, -100].map((x) => x * multiplier),
      );
      expect(rows.reduce((n, r) => n + r.recorded, 0)).toBe(0);
    },
  );
  it("拒绝任意倍率与超时篡改", () => {
    expect(() =>
      normalizeTableSettings({ scoreMultiplier: 0.7 as never }),
    ).toThrow();
    expect(() => normalizeTableSettings({ overtimeSeconds: NaN })).toThrow();
    expect(() => normalizeTableSettings({ overtimeSeconds: -1 })).toThrow();
  });
});
describe("每次10+90秒和返回接手", () => {
  it("本次100秒边界触发，前一手已用的时间不影响下一手", () => {
    const g = table(),
      seat = g.turn;
    g.players[seat]!.overtimeUsedMs = 80000;
    expect(decisionCountdown(viewFor(g, seat), 10000)).toEqual({
      seconds: 1,
      overtime: false,
    });
    expect(decisionCountdown(viewFor(g, seat), 11000)).toEqual({
      seconds: 90,
      overtime: true,
    });
    expect(overtimeExpired(g, seat, 100999)).toBe(false);
    expect(overtimeExpired(g, seat, 101000)).toBe(true);
    const next = act(
      g,
      seat,
      { type: "discard", tile: g.players[seat]!.hand[0] },
      20000,
    );
    next.phase = "playing";
    next.turn = seat;
    next.deadline = 50000;
    next.overtimeCharged = [];
    expect(overtimeRemaining(next, seat, 50000)).toBe(90000);
  });
  it.each([true,false])("取消每步/全局超时托管 %s，恢复自己的10秒且重复取消不加时", (perTurn) => {
    const g = table(perTurn);
    g.phase = "claiming";
    g.deadline = 10000;
    g.pending = {
      openedAtRevision: g.revision,
      from: 0,
      tile: 0,
      kind: "discard",
      offers: { 1: ["pung", "pass"], 2: ["hu", "pass"] },
      replies: {},
    };
    g.players[1]!.trustee = true;
    g.players[1]!.trusteeLocked = true;
    setTrustee(g, 1, false, 25000);
    expect(g.players[1]!.trustee).toBe(false);
    expect(decisionCountdown(viewFor(g, 1), 25000)).toEqual({
      seconds: 10,
      overtime: false,
    });
    expect(overtimeRemaining(g, 2, 25000)).toBe(75000);
    setTrustee(g, 1, false, 29000);
    expect(g.players[1]!.resumedDeadline).toBe(35000);
    expect(
      decisionCountdown(viewFor(JSON.parse(JSON.stringify(g)), 1), 35000),
    ).toEqual({ seconds: 90, overtime: true });
  });
});
describe("旧桌个人累计超时兼容", () => {
  it("前10秒免费，额外6秒被记录，下次继续消耗剩余84秒", () => {
    const g = table(false),
      seat = g.turn;
    expect(overtimeRemaining(g, seat, 11000)).toBe(90000);
    const next = act(
      g,
      seat,
      { type: "discard", tile: g.players[seat]!.hand[0] },
      17000,
    );
    expect(g.players[seat]!.overtimeUsedMs).toBeUndefined();
    expect(next.players[seat]!.overtimeUsedMs).toBe(6000);
    // Replay a persisted next decision: clock fields and spent time survive JSON storage.
    const resumed = JSON.parse(JSON.stringify(next)) as Game;
    resumed.phase = "playing";
    resumed.turn = seat;
    resumed.deadline = 40000;
    resumed.overtimeCharged = [];
    expect(overtimeExpired(resumed, seat, 123999)).toBe(false);
    expect(overtimeExpired(resumed, seat, 124000)).toBe(true);
    chargeOvertime(resumed, seat, 124000);
    chargeOvertime(resumed, seat, 130000);
    expect(resumed.players[seat]!.overtimeUsedMs).toBe(90000);
  });
  it("无效操作不改变累计时间，旁观玩家不消耗额度", () => {
    const g = table(false),
      seat = g.turn,
      other = ((seat + 1) % 4) as Seat;
    expect(() => act(g, seat, { type: "discard", tile: -1 }, 17000)).toThrow();
    expect(g.players[seat]!.overtimeUsedMs).toBeUndefined();
    chargeOvertime(g, other, 17000);
    expect(g.players[other]!.overtimeUsedMs).toBeUndefined();
  });
  it("碰胡同时响应分别计时，已经选择过的玩家不重复扣时", () => {
    const g = table(false);
    g.phase = "claiming";
    g.deadline = 10000;
    g.overtimeCharged = [];
    g.pending = {
      openedAtRevision: g.revision,
      tile: 0,
      from: 0,
      kind: "discard",
      offers: { 1: ["pass"], 2: ["pass"] },
      replies: {},
    };
    const a = act(g, 1, { type: "pass" }, 16000);
    expect(a.players[1]!.overtimeUsedMs).toBe(6000);
    expect(a.players[2]!.overtimeUsedMs).toBeUndefined();
    const b = act(a, 2, { type: "pass" }, 23000);
    expect(b.players[1]!.overtimeUsedMs).toBe(6000);
    expect(b.players[2]!.overtimeUsedMs).toBe(13000);
  });
  it("界面从10秒切换为累计余时，重连不会补回时间", () => {
    const g = table(false),
      v = viewFor(g, g.turn);
    g.players[g.turn]!.overtimeUsedMs = 6000;
    expect(decisionCountdown(v, 1000)).toEqual({
      seconds: 10,
      overtime: false,
    });
    expect(decisionCountdown(viewFor(g, g.turn), 12000)).toEqual({
      seconds: 83,
      overtime: true,
    });
    const clone = JSON.parse(JSON.stringify(g));
    expect(overtimeRemaining(clone, g.turn, 12000)).toBe(83000);
  });
  it("下一把仍保留已耗时间", () => {
    const g = table(false);
    g.phase = "ended";
    g.players.forEach((p) => {
      p!.ready = true;
      p!.overtimeUsedMs = 44000;
    });
    const next = startRound(g, 50000, () => 0.31);
    expect(next.players.every((p) => p!.overtimeUsedMs === 44000)).toBe(true);
  });
});
describe("已核实玩法开关", () => {
  it("花砸2只翻硬软花，不翻基础胡牌分", () => {
    const p = newPlayer("a", "a");
    p.hand = [0, 4, 8, 36, 40, 44, 72, 76, 80, 108, 109, 110, 112, 113];
    p.flowers = [124, 128];
    const g = table();
    const one = scoreHand(p, { ...g.rules, flowerDouble: false })!,
      two = scoreHand(p, { ...g.rules, flowerDouble: true })!;
    expect(two.total - one.total).toBe(4); // 2 hard + wind triplet + wind pair.
    expect(one.items.find((i) => i.label === "成牌")).toEqual(
      two.items.find((i) => i.label === "成牌"),
    );
  });
  it("海底只对最后四张内的自摸加20，点炮和关闭开关不加", () => {
    const p = newPlayer("a", "a");
    p.hand = [0, 4, 8, 36, 40, 44, 72, 76, 80, 108, 109, 110, 112, 113];
    const rules = { ...table().rules, seaBottom: true };
    expect(
      scoreHand(p, rules, { seaBottom: true })!.total -
        scoreHand(p, rules)!.total,
    ).toBe(20);
    expect(
      scoreHand(
        p,
        { ...rules, seaBottom: false },
        { seaBottom: true },
      )!.items.some((i) => i.label === "海底捞月"),
    ).toBe(false);
    p.hand.pop();
    expect(
      scoreHand(p, rules, { tile: 113, seaBottom: true })!.items.some(
        (i) => i.label === "海底捞月",
      ),
    ).toBe(false);
  });
});


describe("真人托管只摸切", () => {
  it.each([true, false])("有无额外超时配置 %s 都打新摸到的牌，不自动自摸或暗杠", (configured) => {
    const g = table();
    if (!configured) g.table = undefined;
    const p = g.players[g.turn]!;
    p.hand = [0, 4, 8, 36, 40, 44, 72, 76, 80, 108, 109, 110, 112, 113];
    g.lastDraw = 113; p.trustee = true;
    expect(viewFor(g,g.turn).actions).toContain("hu");
    expect(trusteeAction(g,g.turn)).toEqual({type:"discard",tile:113});
    p.hand=[0,1,2,3,4,8,36,40,44,72,76,80,112,113];g.lastDraw=3;
    expect(viewFor(g,g.turn).selfKongs).toHaveLength(1);
    expect(trusteeAction(g,g.turn)).toEqual({type:"discard",tile:3});
  });
  it("碰、杠、胡、抢杠的机会都过，不替会员选择", () => {
    const g=table();g.phase="claiming";
    for (const kind of ["discard","robKong"] as const){
      g.pending={openedAtRevision:g.revision,from:0,tile:0,kind,offers:{1:["pass","pung","kong","hu"]},replies:{}};
      expect(trusteeAction(g,1)).toEqual({type:"pass"});
      g.pending.replies[1]="pass";
      expect(trusteeAction(g,1)).toBeNull();
    }
  });
  it("刚碰完还没有摸牌的超时只打手中最右一张，非当前玩家不操作", () => {
    const g=table();g.lastDraw=undefined;
    expect(trusteeAction(g,g.turn)).toEqual({type:"discard",tile:g.players[g.turn]!.hand.at(-1)});
    expect(trusteeAction(g,((g.turn+1)%4) as Seat)).toBeNull();
  });
});
