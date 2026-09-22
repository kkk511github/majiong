import { playerPreparation } from "../shared/table-settings";
import type { View } from "../shared/types";

export function roundReadiness(
  view: View,
  connected: boolean,
  seconds: number,
) {
  const seats = view.players.map((p) => {
    const readiness = playerPreparation(p, view.table?.settings, {
      continuing: view.phase === "ended" && !!view.table,
    });
    if (!connected) return { ...readiness, label: "待同步", state: "syncing" };
    if (!p) return { ...readiness, label: "空位", state: "waiting" };
    if (!p.bot && !p.online)
      return {
        ...readiness,
        label: readiness.canStart
          ? p.trustee ? "离线·托管" : view.phase === "ended" ? "离线·计时继续" : "离线可开局"
          : "已离线",
        state: "offline",
      };
    if (p.awaitingReady && !p.ready)
      return { ...readiness, label: "待确认继续", state: "waiting" };
    if (p.ready || p.bot)
      return { ...readiness, label: "已准备", state: "ready" };
    if (p.trustee) return { ...readiness, label: "托管就绪", state: "ready" };
    if (readiness.prepared)
      return { ...readiness, label: "自动准备", state: "ready" };
    return { ...readiness, label: "未准备", state: "waiting" };
  });
  const nameList = (indices: number[]) =>
    indices.map((i) =>
      i === view.me ? "你" : (view.players[i]?.name ?? "牌友"),
    );
  const concise = (names: string[]) =>
    names.length > 2
      ? `${names[0]}等 ${names.length} 位牌友`
      : names.join("、");
  const offline = seats.flatMap((s, i) => (!s.available ? [i] : []));
  const unready = seats.flatMap((s, i) => (!s.prepared ? [i] : []));
  const allReady = seats.every((s) => s.canStart);
  const message = !connected
    ? "连接中断，重连后同步准备状态"
    : seconds > 0
      ? allReady
        ? `全员就绪，${seconds} 秒后发牌`
        : "结算展示中，可以先准备下一局"
      : offline.length
        ? `等待${concise(nameList(offline))}回桌后开局`
        : unready.length
          ? `等待${concise(nameList(unready))}准备下一局`
          : "全员就绪，正在发牌…";
  return { seats, message };
}
