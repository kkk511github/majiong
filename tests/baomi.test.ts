import { expect, it } from "vitest";
import {
  act,
  createGame,
  newPlayer,
  seats,
  startRound,
} from "../shared/engine";
import { normalizeTableSettings } from "../shared/table-settings";
import { settlementRows } from "../shared/settlement";
import type { Game } from "../shared/types";
import { ruleDefaults } from "../shared/nanjing-rules";
function ending(protectWinner = true): Game {
  const g = createGame("123456", "baomi", {
    rounds: 8,
    twoBankrupt: true,
    protectWinner,
  });
  g.settlementBase = 100;
  g.table = {
    creatorId: "admin",
    groupId: "group",
    number: 1,
    createdAt: 0,
    settings: normalizeTableSettings(),
  };
  g.players = seats.map((i) =>
    newPlayer(String(i), ["甲", "乙", "丙", "丁"][i]),
  );
  const scores = [16, 0, 8, 336];
  g.players.forEach((p, i) => (p!.score = scores[i]));
  g.roundStartScores = scores;
  g.round = 3;
  g.phase = "claiming";
  g.turn = 0;
  g.players[2]!.hand = [0, 4, 8, 36, 40, 44, 72, 76, 80, 108, 109, 110, 112];
  g.pending = {
    openedAtRevision: 0,
    tile: 113,
    from: 0,
    kind: "discard",
    offers: { 2: ["hu", "pass"] },
    replies: {},
  };
  return g;
}
it("用户牌例：16+8=24，丁补76，丙到100；两家干即时整桌结束", () => {
  const g = act(ending(), 2, { type: "hu" }, 1000);
  expect(g.players.map((p) => p!.score)).toEqual([0, 0, 100, 260]);
  expect(g.phase).toBe("finished");
  expect(g.round).toBe(3);
  expect(g.table!.endReason).toBe("两家归零，本桌结束");
  expect(g.history).toHaveLength(1);
  expect(g.result!.transfers).toEqual([
    { from: 0, to: 2, amount: 16, reason: "点炮" },
    { from: 3, to: 2, amount: 76, reason: "保米" },
  ]);
  expect(g.result!.deltas).toEqual([-16, 0, 92, -76]);
  expect(g.players.reduce((n, p) => n + p!.score, 0)).toBe(360);
  expect(settlementRows(g.history[0]).map((r) => r.recorded)).toEqual([
    80, 0, -50, -50,
  ]);
  expect(() => startRound(g)).toThrow();
});
it("关闭保米仍两家干结束，但不从大赢家补分", () => {
  const g = act(ending(false), 2, { type: "hu" }, 1000);
  expect(g.players.map((p) => p!.score)).toEqual([0, 0, 24, 336]);
  expect(g.phase).toBe("finished");
  expect(g.result!.transfers!.some((t) => t.reason === "保米")).toBe(false);
});
it("胡牌后已有100分，不再补；不能给赢家重复发100分", () => {
  const g = ending();
  g.players[2]!.score = 110;
  g.players[3]!.score = 234;
  const ended = act(g, 2, { type: "hu" }, 1000);
  expect(ended.players.map((p) => p!.score)).toEqual([0, 0, 126, 234]);
  expect(ended.result!.transfers!.some((t) => t.reason === "保米")).toBe(false);
});
it("只有一家归零，普通胡牌不触发保米，也不提前结束桌子", () => {
  const g = ending();
  g.players[0]!.score = 200;
  g.players[3]!.score = 152;
  const ended = act(g, 2, { type: "hu" }, 1000);
  expect(ended.players.filter((p) => p!.score === 0)).toHaveLength(1);
  expect(ended.phase).toBe("ended");
  expect(ended.result!.transfers!.some((t) => t.reason === "保米")).toBe(false);
});
it("旧桌未开启两家干时保留负分结算，不在升级中途改算法", () => {
  const g = ending();
  g.rules.twoBankrupt = false;
  const ended = act(g, 2, { type: "hu" }, 1000);
  expect(ended.players[0]!.score).toBeLessThan(0);
  expect(ended.phase).toBe("ended");
  expect(ended.result!.transfers!.some((t) => t.reason === "保米")).toBe(false);
});
it("多人同炮余额不足按应收比例分配，总扣款不超过放炮者余额", () => {
  const g = ending(false);
  g.players[1]!.score = 50;
  g.players[3]!.score = 286;
  g.players[1]!.hand = [1, 5, 9, 37, 41, 45, 73, 77, 81, 116, 117, 118, 112];
  g.pending!.offers[1] = ["hu", "pass"];
  const a = act(g, 2, { type: "hu" }, 1000),
    b = act(a, 1, { type: "hu" }, 1001);
  expect(b.players.every((p) => p!.score >= 0)).toBe(true);
  expect(b.result!.transfers!.reduce((n, t) => n + t.amount, 0)).toBe(16);
  expect(b.result!.transfers!.filter((t) => t.reason === "点炮")).toHaveLength(
    2,
  );
  expect(b.players.reduce((n, p) => n + p!.score, 0)).toBe(360);
});
it("杠分使第二家归零时立即结束，杠牌者已有100分无需保米", () => {
  const g = ending();
  g.phase = "playing";
  g.pending = undefined;
  g.turn = 3;
  g.wall = Array.from({ length: 25 }, (_, i) => i);
  g.players[0]!.score = 16;
  g.players[2]!.score = 5;
  g.players[3]!.score = 339;
  g.players[3]!.hand = [0, 1, 2, 3, 4, 8, 12, 16, 20, 24, 28, 32, 36, 40];
  const ended = act(g, 3, { type: "selfKong", tile: 0 }, 1000);
  expect(ended.phase).toBe("finished");
  expect(ended.result!.reason).toBe("bankrupt");
  expect(ended.wall).toHaveLength(25);
  expect(ended.result!.transfers!.some((t) => t.reason === "保米")).toBe(false);
  expect(ended.players.reduce((n, p) => n + p!.score, 0)).toBe(360);
});
it.each([1, 2])("直杠终局保米：倍率%s，按实收后余额补至100且不再补摸", multiplier => {
  const g=ending();
  g.rules=ruleDefaults("nj-garden-b-v3");
  g.ruleState={multiplier,nextMultiplier:1,nextReasons:[],keepDealer:false,heavenlyEligible:false,heavenlyWaits:{},discards:[],ownDiscards:[[],[],[],[]],kongOccurred:false};
  const payer=multiplier===1?10:16;
  g.players[0]!.score=payer;g.players[3]!.score=352-payer;
  g.roundStartScores=g.players.map(p=>p!.score);
  g.players[2]!.hand=[0,1,2,8,12,16,20,24,28,32,36,40,44];
  g.wall=Array.from({length:30},(_,i)=>80+i);
  g.pending={openedAtRevision:0,tile:3,from:0,kind:"discard",offers:{2:["kong","pass"]},replies:{}};
  const ended=act(g,2,{type:"kong"},1000);
  expect(ended.phase).toBe("finished");
  expect(ended.players.map(p=>p!.score)).toEqual([0,0,100,260]);
  expect(ended.wall).toEqual(g.wall);
  expect(ended.result!.winners).toEqual([]);
  expect(ended.result!.transfers).toEqual([{from:0,to:2,amount:payer,reason:"直杠"},{from:3,to:2,amount:92-payer,reason:"保米"}]);
  expect(ended.history[0].scores).toEqual([0,0,100,260]);
});
it("补杠终局保米遵循开关且不会凭空补分",()=>{
  for(const enabled of [true,false]) {
    const g=ending(enabled);g.rules=ruleDefaults("nj-garden-b-v3");g.rules.protectWinner=enabled;
    g.players[0]!.score=5;g.players[3]!.score=20;g.roundStartScores=[5,0,8,20];
    g.phase="playing";g.pending=undefined;g.turn=2;g.wall=Array.from({length:30},(_,i)=>80+i);
    g.players[2]!.hand=[3,8,12,16,20,24,28,32,36,40,44];
    g.players[2]!.melds=[{type:"pung",tiles:[0,1,2],from:0,concealed:false}];
    g.players[0]!.hand=[];g.players[1]!.hand=[];g.players[3]!.hand=[];
    const ended=act(g,2,{type:"selfKong",tile:3},1000);
    expect(ended.phase).toBe("finished");
    expect(ended.players.map(p=>p!.score)).toEqual(enabled?[0,0,33,0]:[0,0,13,20]);
    expect(ended.wall).toEqual(g.wall);
    expect(ended.players.reduce((n,p)=>n+p!.score,0)).toBe(33);
  }
});
it.each([0.2, 0.5, 1])(
  "桌费与记分倍率 %s：每人本金100入桌90，记录桌费差额",
  (multiplier) => {
    const source = ending();
    source.scoreDivisor = 1 / multiplier;
    const g = act(source, 2, { type: "hu" }, 1000),
      record = g.history[0],
      rows = settlementRows(record);
    expect(record.initialScore).toBe(90);
    expect(record.settlementBase).toBe(100);
    expect(rows.map((r) => r.recorded)).toEqual(
      [160, 0, -100, -100].map((n) => n * multiplier),
    );
    expect(rows.reduce((n, r) => n + r.recorded, 0)).toBe(-40 * multiplier);
  },
);
