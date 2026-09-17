import { expect, it } from "vitest";
import type { Result } from "../shared/types";
import { resultDisplayLabel, winDisplayLabel } from "../src/win-label";
import { replayEventLabel } from "../src/replay-events";
import { replayedRound } from "./fixtures/replayed-round";

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

it("keeps each simultaneous winner's pattern and the discard payer in replay",()=>{
  const r=result(["全球独钓"],1);
  r.winners=[0,2];r.details[2]={total:40,kinds:[],items:[{label:"清一色",value:40}]};
  expect(resultDisplayLabel(r)).toBe("全球独钓、清一色");
  const f=replayedRound().replay!.frames.at(-1)!;
  expect(replayEventLabel({...f,result:r},["甲","乙","丙","丁"],0,true))
    .toBe("本局结算 · 甲全球独钓、丙清一色 · 乙放铳");
});
