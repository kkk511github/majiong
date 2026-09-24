import { describe, expect, it } from "vitest";
import { initialNetworkHealth } from "../src/network-health";
import { networkFeedback } from "../src/network-feedback";

const input = () => ({
  online: true, connected: false, health: initialNetworkHealth(), room: true,
  elapsed: 1000, recovered: false, now: 100_000,
});
describe("统一网络提示，不接管连接状态", () => {
  it("短握手不闪提示，非联机界面不误报断网", () => {
    expect(networkFeedback({ ...input(), elapsed: 799 })).toBeNull();
    expect(networkFeedback({ ...input(), online: false })).toBeNull();
  });
  it("离线保留牌桌，不要求退出或反复确认", () => {
    expect(networkFeedback({ ...input(), health: { ...initialNetworkHealth(), phase: "offline" } }))
      .toEqual({ tone: "warning", title: "网络连接中断", detail: "牌桌已保留，联网后自动恢复" });
  });
  it("Socket或登录恢复不等于牌局已恢复", () => {
    expect(networkFeedback({ ...input(), connected: true, recovered: true,
      health: { ...initialNetworkHealth(), phase: "syncing" } }))
      .toMatchObject({ tone: "progress", title: "正在恢复牌局…" });
  });
  it("仅READY且connected时显示恢复成功", () => {
    expect(networkFeedback({ ...input(), connected: true, recovered: true,
      health: { ...initialNetworkHealth(), phase: "ready" } }))
      .toMatchObject({ tone: "success", title: "已恢复连接" });
  });
  it("慢网为非阻断提示，恢复后无持续横幅", () => {
    const ready = { ...initialNetworkHealth(), phase: "ready" as const, smoothedRttMs: 650 };
    expect(networkFeedback({ ...input(), connected: true, health: ready }))
      .toMatchObject({ tone: "warning", title: "网络波动" });
    expect(networkFeedback({ ...input(), connected: true, health: { ...ready, smoothedRttMs: 80 } })).toBeNull();
  });
  it("长时间无响应保留自动恢复并提供重试，不自动返回大厅", () => {
    expect(networkFeedback({ ...input(), elapsed: 12_000,
      health: { ...initialNetworkHealth(), phase: "retrying" } }))
      .toMatchObject({ action: "retry", tone: "progress" });
  });
  it("账号异地登录不伪装成一般弱网", () => {
    expect(networkFeedback({ ...input(), elapsed: 0, notice: "账号已在另一处打开",
      health: { ...initialNetworkHealth(), phase: "blocked" } }))
      .toMatchObject({ tone: "error", action: "resume" });
  });
});
