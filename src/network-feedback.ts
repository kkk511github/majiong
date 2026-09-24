import type { NetworkHealth } from "./network-health";

export const NETWORK_HINT_DELAY_MS = 800;
export const NETWORK_RETRY_HINT_MS = 12_000;
export const NETWORK_RECOVERED_MS = 1800;
export type NetworkFeedbackModel = {
  tone: "progress" | "warning" | "error" | "success";
  title: string;
  detail: string;
  action?: "retry" | "resume";
} | null;

/** Presentation only: READY still belongs to the authenticated snapshot protocol. */
export function networkFeedback(input: {
  online: boolean;
  connected: boolean;
  health: NetworkHealth;
  room: boolean;
  elapsed: number;
  recovered: boolean;
  notice?: string;
  now: number;
}): NetworkFeedbackModel {
  const { online, connected, health, room, elapsed, recovered, now } = input;
  if (!online) return null;
  if (health.phase === "blocked") return {
    tone: "error", title: "连接已停止",
    detail: "账号已在另一处打开；在此恢复会断开另一处连接。", action: "resume",
  };
  if (connected && health.phase === "ready") {
    if (recovered) return {
      tone: "success", title: "已恢复连接",
      detail: room ? "牌局已同步" : "可以继续操作",
    };
    if ((health.smoothedRttMs ?? health.rttMs ?? 0) >= 600 ||
        health.consecutiveTimeouts > 0 ||
        (health.lastResponseAt !== null && now - health.lastResponseAt > 45_000))
      return { tone: "warning", title: "网络波动", detail: "请留意操作确认" };
    return null;
  }
  // Do not flash a banner for a normal short handshake or foreground check.
  if (elapsed < NETWORK_HINT_DELAY_MS) return null;
  const long = elapsed >= NETWORK_RETRY_HINT_MS;
  if (health.phase === "offline") return {
    tone: "warning", title: "网络连接中断",
    detail: room ? "牌桌已保留，联网后自动恢复" : "请检查网络，联网后自动重连",
    ...(long ? { action: "retry" as const } : {}),
  };
  if (health.phase === "syncing") return {
    tone: "progress", title: room ? "正在恢复牌局…" : "正在同步…",
    detail: "等待服务器确认，暂不可操作",
    ...(long ? { action: "retry" as const } : {}),
  };
  return {
    tone: "progress",
    title: health.phase === "authenticating" ? "正在验证登录…" : "正在重新连接…",
    detail: long ? "连接耗时较长，可以重试；不会重复发送操作" : room ? "牌桌已保留，请稍候" : "正在连接牌桌服务",
    ...(long ? { action: "retry" as const } : {}),
  };
}
