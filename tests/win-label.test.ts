import { expect, it } from "vitest";
import type { Result } from "../shared/types";
import { isRobbedKongWinner, resultDisplayLabel, winDisplayLabel } from "../src/win-label";
import { replayEventLabel } from "../src/replay-events";
import { replayedRound } from "./fixtures/replayed-round";
import { snapshotDisplayFixture } from "./fixtures/snapshot-display";

function result(labels: string[], from?: 1): Result {
  return {reason:"hu",winners:[0],from,deltas:[0,0,0,0],details:{
    0:{total:36,kinds:[],items:labels.map(label=>({label,value:10}))},
  }};
}

it.each([
  [["成牌","门清","硬花 6 × 2","软花 2 × 2"],"门清"],
  [["大杠开花 × 2","全球独钓","对对胡"],"杠上开花"],
  [["小杠开花","门清"],"杠上开花"],
  [["对对胡","全球独钓"],"全球独钓"],
  [["超豪华双七对","清一色"],"超豪华双七对"],
  [["天胡（三家归零）"],"天胡"],
  [["海底捞月","门清"],"海底捞月"],
  [["风一色","对对胡"],"风一色"],
  [["清一色","门清"],"清一色"],
] as [string[],string][])("uses scored pattern %j as title %s without changing payments", (labels,expected)=>{
  for (const from of [undefined,1] as const) {
    const r=result(labels,from), before=structuredClone(r);
    expect(winDisplayLabel(r,0)).toBe(expected);
    expect(r).toEqual(before);
  }
});

it("falls back for ordinary wins and old records without scoring details",()=>{
  expect(winDisplayLabel(result(["成牌"]),0)).toBe("自摸");
  expect(winDisplayLabel(result(["成牌"],1),0)).toBe("胡");
  expect(winDisplayLabel({...result([]),details:{}},0)).toBe("自摸");
  const r=result([],1);
  r.transfers=[{from:1,to:0,amount:60,reason:"抢杠包三家"}];
  expect(winDisplayLabel(r,0)).toBe("抢杠胡");
});

it.each(["marker", "ledger"])("抢杠赔三家用%s识别胡者，不把其他受赔者称为胡牌", (source) => {
  const r = result(["压绝"], 1);
  if (source === "marker") r.robbedKong = true;
  else r.transfers = [0, 2, 3].map(to => ({ from: 1, to: to as 0 | 2 | 3, amount: 48, reason: "抢杠赔三家" }));
  expect(isRobbedKongWinner(r, 0)).toBe(true);
  expect(winDisplayLabel(r, 0)).toBe("抢杠胡");
  for (const seat of [1, 2, 3] as const) {
    expect(isRobbedKongWinner(r, seat)).toBe(false);
    expect(winDisplayLabel(r, seat)).toBe("");
  }
  expect(r.winners).toEqual([0]);
  const frame = replayedRound().replay!.frames.at(-1)!;
  expect(replayEventLabel({ ...frame, result: r }, ["甲", "乙", "丙", "丁"], 0, true))
    .toBe("本局结算 · 甲抢杠胡 · 乙补杠被抢");
});

it("keeps each simultaneous winner's pattern and the discard payer in replay",()=>{
  const r=result(["全球独钓"],1);
  r.winners=[0,2];r.details[2]={total:40,kinds:[],items:[{label:"清一色",value:40}]};
  expect(resultDisplayLabel(r)).toBe("全球独钓、清一色");
  const f=replayedRound().replay!.frames.at(-1)!;
  expect(replayEventLabel({...f,result:r},["甲","乙","丙","丁"],0,true))
    .toBe("本局结算 · 甲全球独钓、丙清一色 · 乙放铳");
});

it("旧快照记录即使含全球加分也直接显示胡，原204分与三口100账本不变", () => {
  const { record, replay } = snapshotDisplayFixture();
  const original = structuredClone(record);
  expect(record.result.details[1]).toMatchObject({ snapshot: true, total: 204 });
  expect(winDisplayLabel(record.result, 1)).toBe("胡");
  expect(resultDisplayLabel(record.result)).toBe("胡");
  expect(replayEventLabel(replay.frames.at(-1)!, record.names, 0, true)).toBe("本局结算 · 乙胡 · 丁放铳");
  expect(record).toEqual(original);
});

it("多赢家逐人识别快照，真实四组落地全球保留原名，非赢家不标胡", () => {
  const { record } = snapshotDisplayFixture();
  const r = record.result;
  r.winners = [1, 2];
  r.details[2] = { total: 90, kinds: [], items: [{ label: "对对胡", value: 30 }, { label: "全球独钓", value: 50 }, { label: "成牌", value: 10 }] };
  // An obsolete extra score entry must not turn a non-winner into a Hu label.
  r.details[0] = { ...r.details[1]! };
  expect(winDisplayLabel(r, 1)).toBe("胡");
  expect(winDisplayLabel(r, 2)).toBe("全球独钓");
  expect(winDisplayLabel(r, 0)).toBe("");
  expect(winDisplayLabel(r, 3)).toBe("");
  expect(resultDisplayLabel(r)).toBe("胡、全球独钓");
});

it("快照标记优先于历史牌型项，未标快照的旧全球记录保持原名", () => {
  const old = result(["全球独钓", "对对胡"], 1);
  old.details[0]!.snapshot = true;
  expect(winDisplayLabel(old, 0)).toBe("胡");
  old.details[0]!.snapshot = false;
  expect(winDisplayLabel(old, 0)).toBe("全球独钓");
  delete old.details[0]!.snapshot;
  expect(winDisplayLabel(old, 0)).toBe("全球独钓");
});
