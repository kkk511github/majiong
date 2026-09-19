import type { ReplayFrame, Seat } from "../shared/types";
import { tileName } from "../shared/tiles";
import { isRobbedKongWinner, winDisplayLabel } from "./win-label";
const labels: Record<ReplayFrame["type"], string> = {
  start: "开局发牌",
  draw: "摸牌",
  flower: "补花",
  discard: "打出",
  pung: "碰牌",
  kong: "明杠",
  concealedKong: "暗杠",
  addedKong: "补杠",
  zhaozhi: "报照直",
  claim: "响应出牌",
  pass: "过",
  finish: "本局结算",
};
export function replayEventLabel(
  frame: ReplayFrame,
  names: string[],
  perspective: Seat,
  reveal: boolean,
) {
  if (frame.type === "finish" && frame.result) {
    const r = frame.result;
    return (
      "本局结算 · " +
      (r.winners.length
        ? `${r.winners.map((s) => `${names[s]}${winDisplayLabel(r, s)}`).join("、")}${r.from === undefined ? "" : ` · ${names[r.from]}${r.winners.some((seat) => isRobbedKongWinner(r, seat)) ? "补杠被抢" : "放铳"}`}`
        : "流局")
    );
  }
  const hidden =
    !reveal &&
    frame.seat !== perspective &&
    ["draw", "concealedKong"].includes(frame.type);
  return `${frame.seat === undefined ? "" : names[frame.seat] + " · "}${labels[frame.type]}${frame.tile !== undefined && !hidden ? " " + tileName(frame.tile) : ""}`;
}
export const isReplayKeyEvent = (frame: ReplayFrame) =>
  ["pung", "kong", "concealedKong", "addedKong", "zhaozhi", "finish"].includes(
    frame.type,
  );
