import type { MatchDetails, StoredRound } from "../shared/types";
import { settlementRows, signedScore, roundNet } from "../shared/settlement";
import { recordDate, recordClock } from "./record-dates";
export function matchSummary(data: MatchDetails) {
  const { code, record: r } = data.match;
  return [
    "金陵麻将 · 整桌战绩",
    `房间 ${code} · ${r.round}/${r.totalRounds ?? r.round} 把`,
    `${recordDate(r.at)} ${recordClock(r.at)}`,
    r.endReason ?? "本桌完成",
    ...settlementRows(r).map((p) => `${p.name}：${signedScore(p.recorded)}`),
  ].join("\n");
}
export function ruleFeedback(
  data: MatchDetails,
  round: StoredRound | undefined,
  problem: string,
) {
  const r = round?.record;
  return [
    "金陵麻将 · 规则问题反馈",
    `房间 ${data.match.code}`,
    r ? `第 ${r.round} 把 · 回放 ID：${r.id}` : "整桌结果",
    r ? `${recordDate(r.at)} ${recordClock(r.at)}` : "",
    r
      ? `本把变化：${r.names.map((n, i) => `${n} ${signedScore(roundNet(r.result, i))}`).join("，")}`
      : "",
    `问题描述：${problem.trim() || "请补充具体操作、实际结果和预期结果"}`,
  ]
    .filter(Boolean)
    .join("\n");
}
