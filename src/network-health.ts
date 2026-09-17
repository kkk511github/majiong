export type ConnectionPhase =
  | "idle"
  | "connecting"
  | "authenticating"
  | "syncing"
  | "ready"
  | "offline"
  | "retrying"
  | "blocked";
export interface NetworkHealth {
  serverVersion: string | null;
  phase: ConnectionPhase;
  rttMs: number | null;
  reconnects: number;
  timeouts: number;
  commandTimeouts: number;
  lastRecoveryMs: number | null;
  lastSnapshotAt: number | null;
  samples: number;
  smoothedRttMs: number | null;
  lastResponseAt: number | null;
  consecutiveTimeouts: number;
  recoverySamples: number;
}
export const initialNetworkHealth = (): NetworkHealth => ({
  serverVersion: null,
  phase: "idle",
  rttMs: null,
  reconnects: 0,
  timeouts: 0,
  commandTimeouts: 0,
  lastRecoveryMs: null,
  lastSnapshotAt: null,
  samples: 0,
  smoothedRttMs: null,
  lastResponseAt: null,
  consecutiveTimeouts: 0,
  recoverySamples: 0,
});
/** Equal jitter avoids a reconnect stampede while retaining a finite cap. */
export function reconnectDelay(
  attempt: number,
  random = Math.random(),
): number {
  const cap = Math.min(15000, 1000 * 2 ** Math.min(14, Math.max(0, attempt)));
  return Math.round(cap * (0.5 + Math.max(0, Math.min(1, random)) * 0.5));
}
export function networkLabel(health: NetworkHealth, now = Date.now()): string {
  const labels: Record<ConnectionPhase, string> = {
    idle: "尚未连接",
    connecting: "正在连接",
    authenticating: "正在验证登录",
    syncing: "正在同步牌桌",
    ready: "连接正常",
    offline: "网络已断开",
    retrying: "正在重新连接",
    blocked: "连接已停止",
  };
  if (health.phase !== "ready") return labels[health.phase];
  if (health.lastResponseAt !== null && now - health.lastResponseAt > 45000)
    return "连接待确认";
  if (health.consecutiveTimeouts > 0) return "连接已恢复，观察中";
  const latency = health.smoothedRttMs ?? health.rttMs;
  if (latency === null) return "已连接，等待测速";
  return latency >= 600 ? "网络较慢" : "连接正常";
}
export function timedOut(health: NetworkHealth): Partial<NetworkHealth> {
  return {
    timeouts: health.timeouts + 1,
    consecutiveTimeouts: health.consecutiveTimeouts + 1,
    recoverySamples: 0,
  };
}
export function measuredResponse(
  health: NetworkHealth,
  rtt: number,
  now = Date.now(),
): Partial<NetworkHealth> {
  const latest = Math.max(0, Math.round(rtt));
  const recoverySamples = Math.min(3, health.recoverySamples + 1);
  return {
    rttMs: latest,
    smoothedRttMs: Math.round(
      health.smoothedRttMs === null
        ? latest
        : health.smoothedRttMs * 0.75 + latest * 0.25,
    ),
    lastResponseAt: now,
    samples: health.samples + 1,
    recoverySamples,
    consecutiveTimeouts: recoverySamples >= 3 ? 0 : health.consecutiveTimeouts,
  };
}
