import type { Result, Seat } from "../shared/types";

/** Compensation recipients are not additional winners. Old ledgers still use
 * the winner-only payment reason; new results also carry explicit event data. */
export function isRobbedKongWinner(result: Result, seat: Seat): boolean {
  return result.winners.includes(seat) && (
    result.robbedKong === true ||
    result.transfers?.some((entry) => entry.reason === "抢杠赔三家" ||
      entry.to === seat && entry.reason === "抢杠包三家") === true
  );
}

// Snapshot scoring can contain a projected fourth meld. Its title must not
// present that scoring projection as an actual global-single-wait hand.
export function winDisplayLabel(result: Result, seat: Seat): string {
  if (!result.winners.includes(seat)) return "";
  if (result.details[seat]?.snapshot === true) return "胡";
  const labels = result.details[seat]?.items.map((item) => item.label) ?? [];
  const has = (name: string) => labels.some((label) => label.startsWith(name));
  if (has("大杠开花") || has("小杠开花")) return "杠上开花";
  if (isRobbedKongWinner(result, seat))
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
