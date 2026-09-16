import { describe, expect, it } from "vitest";
import { startRound } from "../shared/engine";
import { seededRandom } from "../shared/tiles";
import { roundNet, settlementRows } from "../shared/settlement";
import { externalRound } from "./fixtures/external-round";

describe("用户确认的进园子外包固定记分", () => {
  it.each(["three", "pure", "global"] as const)(
    "%s 外包50/100独立于桌内余额",
    (kind) => {
      for (const multiplier of [1, 2])
        for (const payerBalance of [0, 8]) {
          const g = externalRound({ kind, multiplier, payerBalance });
          const payer = kind === "three" ? 0 : 3,
            amount = multiplier === 1 ? 50 : 100;
          expect(g.phase).toBe("ended");
          expect(g.result!.bankrupt).toBe(false);
          expect(g.result!.deltas).toEqual([0, 0, 0, 0]);
          expect(g.players.map((p) => p!.score)).toEqual(g.roundStartScores);
          expect(g.players[payer]!.score).toBe(payerBalance);
          expect(g.players[payer]!.externalScore).toBe(-amount);
          expect(g.players[2]!.externalScore).toBe(amount);
          expect(g.roundTransfers).toEqual([
            {
              from: payer,
              to: 2,
              amount,
              scope: "external",
              reason:
                kind === "three"
                  ? "三口承包"
                  : kind === "pure"
                    ? "清一色承包"
                    : "全球独钓承包",
            },
          ]);
          expect(g.result!.externalDeltas?.reduce((a, b) => a + b, 0)).toBe(0);
          expect(g.ruleState!.nextMultiplier).toBe(2);
          expect(g.history[0].externalScores).toEqual(
            g.players.map((p) => p!.externalScore),
          );
          expect(
            g.replay!.frames.at(-1)!.players.map((p) => p.externalScore),
          ).toEqual(g.history[0].externalScores);
          expect(roundNet(g.result!, 2)).toBe(amount);
        }
    },
  );
  it("图示顺子单钓不收三嘴外包，丁被抢补杠不收杠分", () => {
    const g = externalRound({ robbed: true, payerBalance: 8 });
    expect(g.result!.from).toBe(3);
    expect(g.roundTransfers).toEqual([
      { from: 3, to: 2, amount: 90, reason: "抢杠包三家" },
    ]);
    expect(g.players[0]!.score).toBe(8);
    expect(g.players[0]!.externalScore).toBe(0);
    expect(g.players[3]!.score).toBe(0);
    expect(g.players[3]!.melds[0].type).toBe("pung");
    expect(g.result!.transfers?.some((t) => t.reason === "保米")).toBe(false);
  });
  it("敞开头仍按胡牌分包三家，不套用进园子固定外包", () => {
    const g = externalRound({ payerBalance: 8, rules: { id: "nj-open-v2" } });
    const amount = g.result!.details[2]!.total * 3;
    expect(g.roundTransfers).toEqual([
      { from: 0, to: 2, amount, reason: "三口承包" },
    ]);
    expect(g.players[0]!.score).toBe(8 - amount);
    expect(g.players.every((p) => p!.externalScore === 0)).toBe(true);
  });
  it("一炮双响可同时有桌内胡分和桌外外包，两个账本不串账", () => {
    const g = externalRound({ alsoWin: true, payerBalance: 8 });
    expect(g.result!.winners).toEqual([1, 2]);
    const ordinary = g.result!.details[1]!.total;
    expect(g.result!.deltas).toEqual([0, ordinary, 0, -ordinary]);
    expect(g.result!.externalDeltas).toEqual([-50, 0, 50, 0]);
    expect(g.players[0]!.score).toBe(8);
    expect(g.roundTransfers).toEqual([
      { from: 3, to: 1, amount: ordinary, reason: "点炮" },
      { from: 0, to: 2, amount: 50, reason: "三口承包", scope: "external" },
    ]);
    expect(g.result!.deltas.reduce((n, v) => n + v, 0)).toBe(0);
    expect(g.result!.externalDeltas!.reduce((n, v) => n + v, 0)).toBe(0);
  });
  it("换把保存桌外累计，只将新增外包计入本把；最终战绩和倍率含桌外", () => {
    const first = externalRound();
    const before = structuredClone(first.history[0]);
    first.players.forEach((p) => {
      p!.ready = true;
    });
    const next = startRound(first, 9000, seededRandom(81));
    expect(next.roundStartExternalScores).toEqual([-50, 0, 50, 0]);
    expect(next.players.map((p) => p!.externalScore)).toEqual([-50, 0, 50, 0]);
    const second = externalRound({ previous: first, multiplier: 2 });
    expect(second.phase).toBe("ended");
    expect(second.history[0]).toEqual(before);
    expect(second.result!.externalDeltas).toEqual([-100, 0, 100, 0]);
    expect(second.history[1].externalScores).toEqual([-150, 0, 150, 0]);
    const third = externalRound({ previous: second });
    const fourth = externalRound({ previous: third, multiplier: 2 });
    expect(fourth.phase).toBe("finished");
    const record = {
      ...fourth.history[3],
      settlementBase: 100,
      scoreDivisor: 2,
    };
    const rows = settlementRows(record);
    expect(rows.find((r) => r.seat === 0)!.recorded).toBe(-155);
    expect(rows.find((r) => r.seat === 2)!.recorded).toBe(145);
    expect(rows.reduce((n, r) => n + r.recorded, 0)).toBe(-20);
    const legacy = { ...record, externalScores: undefined };
    expect(settlementRows(legacy).every((r) => r.recorded === -5)).toBe(true);
  });
});
