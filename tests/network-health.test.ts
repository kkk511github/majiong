import { describe, it, expect } from "vitest";
import {
  initialNetworkHealth,
  measuredResponse,
  resetNetworkMeasurements,
  timedOut,
  networkLabel,
  reconnectDelay,
} from "../src/network-health";
describe("network health", () => {
  it("uses capped jitter without synchronized fixed retry delays", () => {
    expect(reconnectDelay(0, 0)).toBe(500);
    expect(reconnectDelay(0, 1)).toBe(1000);
    expect(reconnectDelay(3, 0.5)).toBe(6000);
    expect(reconnectDelay(100, 1)).toBe(15000);
    expect(reconnectDelay(100, 0)).toBe(7500);
  });
  it("does not claim good latency before measurement and labels slow measured links", () => {
    const h = initialNetworkHealth();
    expect(h.rttMs).toBeNull();
    expect(networkLabel(h)).toBe("尚未连接");
    expect(networkLabel({ ...h, phase: "ready", rttMs: 700 })).toBe("网络较慢");
    expect(networkLabel({ ...h, phase: "syncing", rttMs: 20 })).toBe(
      "正在同步牌桌",
    );
  });
});
it('clears stale latency for a new connection without hiding actual timeouts',()=>{
 let h:ReturnType<typeof initialNetworkHealth>={...initialNetworkHealth(),phase:'ready',rttMs:2000,smoothedRttMs:2000,lastResponseAt:100,samples:20,timeouts:2,consecutiveTimeouts:2,recoverySamples:2,commandTimeouts:1};
 h={...h,...resetNetworkMeasurements()};
 expect(h).toMatchObject({rttMs:null,smoothedRttMs:null,lastResponseAt:null,samples:0,timeouts:2,consecutiveTimeouts:2,commandTimeouts:1,recoverySamples:0});
 for(let i=0;i<3;i++)h={...h,...measuredResponse(h,150,1000+i)};
 expect(h.smoothedRttMs).toBe(150);expect(networkLabel(h,1004)).toBe('连接正常');
});

it("requires three confirmed heartbeats after timeouts and separates stale communication", () => {
  let h: ReturnType<typeof initialNetworkHealth> = { ...initialNetworkHealth(), phase: "ready" };
  h = { ...h, ...timedOut(h) };
  h = { ...h, ...timedOut(h) };
  expect(h.consecutiveTimeouts).toBe(2);
  for (let i = 0; i < 2; i++) {
    h = { ...h, ...measuredResponse(h, 50, 1000 + i) };
    expect(networkLabel(h, 1002)).toBe("连接已恢复，观察中");
  }
  h = { ...h, ...measuredResponse(h, 50, 1003) };
  expect(h.consecutiveTimeouts).toBe(0);
  expect(networkLabel(h, 1004)).toBe("连接正常");
  expect(networkLabel(h, 50000)).toBe("连接待确认");
  expect(networkLabel({ ...h, phase: "syncing" }, 50000)).toBe("正在同步牌桌");
});
it("smooths isolated latency spikes instead of flickering quality on each sample", () => {
  let h = initialNetworkHealth();
  h = { ...h, ...measuredResponse(h, 100, 1) };
  h = { ...h, ...measuredResponse(h, 1500, 2) };
  expect(h.rttMs).toBe(1500);
  expect(h.smoothedRttMs).toBe(450);
  expect(networkLabel({ ...h, phase: "ready" }, 2)).toBe("连接正常");
  h = { ...h, ...measuredResponse(h, 1500, 3) };
  expect(networkLabel({ ...h, phase: "ready" }, 3)).toBe("网络较慢");
  expect(networkLabel({ ...initialNetworkHealth(), phase: "ready" })).toBe(
    "已连接，等待测速",
  );
});
