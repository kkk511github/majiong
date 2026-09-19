import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { ruleDefaults } from "../shared/nanjing-rules";
import type { RoundRecord, Seat, WinScore } from "../shared/types";
import { ScoreDetails } from "../src/Settlement";
import { ruleSections } from "../src/rule-copy";

function record(prices = [48]): RoundRecord {
  const winners: Seat[] = prices.length === 1 ? [0] : [0, 2];
  const details: Partial<Record<Seat, WinScore>> = {};
  winners.forEach((seat, i) => details[seat] = { total: prices[i], kinds: [], items: [{ label: "成牌", value: prices[i] }] });
  const receipts = prices.reduce((sum, price) => sum + price, 0);
  const deltas = [receipts, -receipts * 3, receipts, receipts];
  return {
    id: "rob-kong-display", at: 1, round: 1, names: ["甲", "乙", "丙", "丁"],
    scores: deltas.map(delta => 500 + delta), rules: ruleDefaults("nj-garden-b-v3"),
    result: {
      reason: "hu", winners, from: 1, robbedKong: true, details, deltas,
      transfers: prices.flatMap(amount => ([0, 2, 3] as Seat[]).map(to => ({ from: 1, to, amount, reason: "抢杠赔三家" }))),
    },
  };
}
const text = (html: string) => html.replace(/<[^>]*>/g, "");

it.each([false, true])("抢杠本把明细说明三家各一份，受赔者不增加胡牌标记（账单优先%s）", ledgerFirst => {
  const r = record(), before = structuredClone(r);
  const html = renderToStaticMarkup(createElement(ScoreDetails, { record: r, ledgerFirst }));
  expect(text(html)).toContain("按甲的胡牌分，每份48分：乙向甲、丙、丁各应付48分，合计应付144分。");
  expect(text(html)).toContain("收到赔分不代表胡牌");
  expect((html.match(/class="win-label"/g) ?? [])).toHaveLength(1);
  expect(text(html)).toContain("甲 · 抢杠胡");
  expect(text(html)).not.toContain("丙 · 抢杠胡");
  expect(text(html)).not.toContain("丁 · 抢杠胡");
  expect(r).toEqual(before);
});

it("多人抢杠逐赢家说明赔付，按每名赢家价格累计，不取最高分或平均数", () => {
  const html = renderToStaticMarkup(createElement(ScoreDetails, { record: record([48, 86]), ledgerFirst: true }));
  expect(text(html)).toContain("按甲的胡牌分，每份48分：乙向甲、丙、丁各应付48分，合计应付144分。");
  expect(text(html)).toContain("按丙的胡牌分，每份86分：乙向甲、丙、丁各应付86分，合计应付258分。");
  expect(text(html)).toContain("按每名胡牌者依次累计赔三家，补杠者合计应付402分");
  expect((html.match(/class="win-label"/g) ?? [])).toHaveLength(2);
});

it("新B抢杠元数据可解释无逐笔账的结果，但旧reason始终按旧账显示", () => {
  const r = record();
  r.result.transfers = undefined;
  expect(renderToStaticMarkup(createElement(ScoreDetails, { record: r }))).toContain("抢杠赔付说明");
  r.result.transfers = [{ from: 1, to: 0, amount: 144, reason: "抢杠包三家" }];
  r.result.deltas = [144, -144, 0, 0]; r.scores = [644, 356, 500, 500];
  const before = structuredClone(r);
  const html = renderToStaticMarkup(createElement(ScoreDetails, { record: r }));
  expect(text(html)).toContain("抢杠包三家");
  expect(html).not.toContain("抢杠赔付说明");
  expect(text(html)).not.toContain("各应付48分");
  expect(r).toEqual(before);
});

it("当前B文案明确赔给另外三家，v2文案保留原三份承包", () => {
  const current = ruleSections(ruleDefaults("nj-garden-b-v3")).flat().join("");
  expect(current).toContain("向其他三家各赔一份");
  expect(current).toContain("多人胡牌按每名胡牌者依次累计");
  const old = ruleSections(ruleDefaults("nj-garden-v2")).flat().join("");
  expect(old).toContain("抢杠胡由补杠者付三份");
  expect(old).not.toContain("抢杠时，补杠者按每名实际胡牌者");
});
