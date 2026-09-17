import type { Result, Seat } from "../shared/types";

// Titles describe the scored hand; `from` still determines who pays.
export function winDisplayLabel(result: Result, seat: Seat): string {
  const labels = result.details[seat]?.items.map((item) => item.label) ?? [];
  const has = (name: string) => labels.some((label) => label.startsWith(name));
  if (has("大杠开花") || has("小杠开花")) return "杠上开花";
  if (result.transfers?.some((t) => t.to === seat && t.reason === "抢杠包三家"))
    return "抢杠胡";
  const patterns = [
    "天胡", "地胡", "海底捞月", "全球独钓",
    "超豪华双七对", "豪华双七对", "双七对",
    "三豪华七对", "双豪华七对", "豪华七对", "七对",
    "风一色", "字一色", "清一色", "混一色", "对对胡",
    "无花果", "压绝", "补花胡", "门清",
  ];
  return patterns.find(has) ?? (result.from === undefined ? "自摸" : "胡");
}

export function resultDisplayLabel(result: Result): string {
  return [...new Set(result.winners.map((seat) => winDisplayLabel(result, seat)))].join("、");
}
