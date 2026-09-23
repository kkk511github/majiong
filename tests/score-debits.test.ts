import { describe, expect, it } from "vitest";
import { viewFor } from "../shared/engine";
import { scoreDebits } from "../src/score-debits";
import {
  DEBIT_HEIGHT,
  DEBIT_RISE,
  DEBIT_WIDTH,
  debitSeparated,
  scoreDebitPosition,
} from "../src/score-debit-layout";
import { cocosState } from "../src/cocos-state";
import { layoutTable } from "../shared/table-scene";
import {
  applyDebit,
  debitGame,
  type DebitExample,
} from "./fixtures/debit-game";

describe("服务器即时扣分提醒", () => {
  it.each([1, 2])(
    "暗杠倍率 %i 显示三家实际支付数，不给收分者显示扣分",
    (multiplier) => {
      const before = debitGame("concealed", multiplier),
        after = applyDebit(before, "concealed");
      expect(
        scoreDebits(viewFor(before, 0), viewFor(after, 0)).map((e) => [
          e.seat,
          e.amount,
          e.label,
        ]),
      ).toEqual([1, 2, 3].map((s) => [s, 5 * multiplier, "暗杠"]));
    },
  );
  it.each(["open", "added"] as DebitExample[])(
    "%s 只提醒供牌者，金额跟随比下胡",
    (example) => {
      const before = debitGame(example, 2),
        after = applyDebit(before, example);
      expect(
        scoreDebits(viewFor(before, 0), viewFor(after, 0)).map((e) => [
          e.seat,
          e.amount,
          e.label,
        ]),
      ).toEqual([[1, 20, example === "open" ? "明杠" : "补杠"]]);
    },
  );
  it("四连风三家各付；一人向三家付款按总扣分显示", () => {
    for (const example of ["winds", "fourSame"] as const) {
      const before = debitGame(example),
        after = applyDebit(before, example);
      expect(
        scoreDebits(viewFor(before, 0), viewFor(after, 0)).map((e) => [
          e.seat,
          e.amount,
          e.label,
        ]),
      ).toEqual(
        example === "winds"
          ? [1, 2, 3].map((s) => [s, 5, "四连风"])
          : [[0, 15, "四张同牌"]],
      );
    }
  });
  it("四家连续同牌把第一位的三笔付款合并显示为四家同牌", () => {
    const before = viewFor(debitGame(), 0),
      after = structuredClone(before);
    after.revision++;
    after.roundTransfers = [3, 0, 1].map((to) => ({
      from: 2 as const,
      to: to as 0 | 1 | 3,
      amount: 5,
      reason: "四家跟牌" as const,
    }));
    expect(
      scoreDebits(before, after).map((e) => [e.seat, e.amount, e.label]),
    ).toEqual([[2, 15, "四家同牌"]]);
  });
  it("余额封顶按实际流水，扣至两家归零仍能显示本次扣分", () => {
    const before = debitGame("concealed", 2);
    before.players[1]!.score = 3;
    before.players[2]!.score = 7;
    const after = applyDebit(before, "concealed");
    expect(after.phase).toBe("finished");
    expect(
      scoreDebits(viewFor(before, 0), viewFor(after, 0)).map((e) => e.amount),
    ).toEqual([3, 7, 10]);
  });
  it("初次进入、换桌换座、重复、乱序或不连续流水都不重播", () => {
    const before = viewFor(debitGame(), 0),
      after = viewFor(applyDebit(debitGame(), "concealed"), 0);
    for (const prior of [
      null,
      { ...before, id: "old" },
      { ...before, me: 1 as const },
      after,
      { ...after, revision: after.revision + 2 },
      { ...before, roundTransfers: undefined },
      {
        ...before,
        roundTransfers: [
          {
            from: 0 as const,
            to: 1 as const,
            amount: 9,
            reason: "暗杠" as const,
          },
        ],
      },
    ])
      expect(scoreDebits(prior, after)).toEqual([]);
  });
  it("补杠后立刻花杠分别显示原因，随后倒计时更新不重复提醒", () => {
    const before = viewFor(debitGame(), 0),
      after = structuredClone(before);
    after.revision++;
    after.roundTransfers = [
      { from: 1, to: 0, amount: 10, reason: "补杠" },
      { from: 1, to: 0, amount: 10, reason: "花杠" },
    ];
    expect(scoreDebits(before, after).map((e) => [e.amount, e.label])).toEqual([
      [10, "补杠"],
      [10, "花杠"],
    ]);
    expect(
      scoreDebits(after, { ...after, revision: after.revision + 1 }),
    ).toEqual([]);
  });
  it("新把开局花杠可提示，胡牌结算和桌外分不冒充局内扣分", () => {
    const before = viewFor(debitGame(), 0),
      after = structuredClone(before);
    before.phase = "ended";
    after.round++;
    after.revision++;
    after.roundTransfers = [
      { from: 1, to: 0, amount: 10, reason: "花杠" },
      { from: 2, to: 0, amount: 30, reason: "自摸" },
      { from: 3, to: 0, amount: 50, reason: "三口承包", scope: "external" },
    ];
    expect(
      scoreDebits(before, after).map((e) => [e.seat, e.amount, e.label]),
    ).toEqual([[1, 10, "花杠"]]);
  });
});

describe("扣分提示不挡牌", () => {
  it.each([0, 1, 2, 3, 4])(
    "%i组碰牌，四个视角和密集牌河均保留可见位置",
    (melds) => {
      for (const me of [0, 1, 2, 3] as const)
        for (const dense of [false, true]) {
          const view = viewFor(debitGame(), me);
          const state = cocosState(view, {
            connected: true,
            disabled: false,
            practice: false,
            countdown: "10",
            selected: null,
            inspectedKind: null,
            hintKinds: [],
            hintLabel: "",
            effects: [],
          });
          state.players.forEach((p) => {
            p.handCount = 13 - 3 * melds;
            p.hand =
              p.seat === me
                ? Array.from({ length: p.handCount }, (_, i) => i)
                : [];
            p.melds = Array.from({ length: melds }, (_, i) => ({
              type: "pung",
              tiles: [40 + i * 4, 41 + i * 4, 42 + i * 4],
              from: (p.seat + 1) % 4,
              concealed: false,
            }));
            p.discards = dense ? Array.from({ length: 27 }, (_, i) => i) : [];
            p.flowers = dense
              ? Array.from({ length: 5 }, (_, i) => 124 + i + p.seat * 5)
              : [];
          });
          for (const p of state.players) {
            const at = scoreDebitPosition(state, p.seat);
            expect(
              at,
              `seat=${p.seat}, me=${me}, dense=${dense}`,
            ).not.toBeNull();
            if (at)
              expect(
                layoutTable(state).every((t) =>
                  debitSeparated(
                    {
                      ...at,
                      y: at.y - DEBIT_RISE / 2,
                      w: DEBIT_WIDTH,
                      h: DEBIT_HEIGHT + DEBIT_RISE,
                    },
                    t,
                  ),
                ),
              ).toBe(true);
          }
        }
    },
  );
});
