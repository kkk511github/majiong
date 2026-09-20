import type { WinScore } from "../shared/types";

export function scoreItemCopy(item: WinScore["items"][number], snapshot = false) {
  if (snapshot && item.label === "全球独钓") return {
    label: "快照加分",
    calculation: "第四嘴由任意一家供牌，按快照规则计分",
  };
  const flowers = /^(硬花|软花) (\d+) × (\d+)$/.exec(item.label);
  if (flowers) {
    const [, label, count, points] = flowers;
    const unit = label === "硬花" ? "张" : "个";
    return { label, calculation: `${count}${unit} × ${points}分/${unit}` };
  }
  const multiplier = /^(比下胡|大杠开花) × (\d+)$/.exec(item.label);
  if (multiplier) return {
    label: multiplier[1],
    calculation: `此前小计 × ${multiplier[2]}，本行列增加分`,
  };
  if (item.label === "成牌") return { label: "成牌底分", calculation: "合法成牌" };
  if (item.label === "天胡" && item.value === 400) return { label: "天胡", calculation: "每家固定400分，余额不足付剩余全部" };
  return { label: item.label, calculation: "牌型加分" };
}
