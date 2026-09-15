import { afterEach, describe, expect, it, vi } from "vitest";
import { GameClient } from "../src/game-client";
import { completedRound } from "./fixtures/completed-round";
let client: GameClient;
afterEach(() => {
  client?.disconnect();
  vi.useRealTimers();
});
describe("练习桌倒计时", () => {
  it("旧练习存档亮牌十秒再续局，保存真实结算时间且只前进一把", () => {
    vi.useFakeTimers();
    const saved = completedRound();
    const at = saved.history.at(-1)!.at;
    vi.setSystemTime(at + 60_000);
    vi.stubGlobal("localStorage", {
      getItem: (key: string) =>
        key === "jinling:practice" ? JSON.stringify(saved) : null,
      setItem: vi.fn(),
    });
    client = new GameClient();
    client.practice("测试", {}, true);
    expect(client.state.view!.history.at(-1)!.at).toBe(at);
    expect(client.state.view!.players.every((p) => p!.hand.length > 0)).toBe(
      true,
    );
    vi.advanceTimersByTime(9999);
    expect(client.state.view!.phase).toBe("ended");
    vi.advanceTimersByTime(501);
    expect(client.state.view!.phase).toBe("playing");
    expect(client.state.view!.round).toBe(saved.round + 1);
    client.ready();
    expect(client.state.view!.round).toBe(saved.round + 1);
  });
  it("亮牌时可提前继续，最终结束不会被计时器再开一把", () => {
    vi.useFakeTimers();
    let saved = completedRound();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) =>
        key === "jinling:practice" ? JSON.stringify(saved) : null,
      setItem: vi.fn(),
    });
    client = new GameClient();
    client.practice("测试", {}, true);
    client.ready();
    expect(client.state.view!.round).toBe(saved.round + 1);
    saved = { ...saved, phase: "finished" };
    client.practice("测试", {}, true);
    vi.advanceTimersByTime(30_000);
    client.ready();
    expect(client.state.view!.phase).toBe("finished");
    expect(client.state.view!.round).toBe(saved.round);
  });
  it("打开设置暂停计时，返回后继续剩余时间，超时才托管", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-13T10:00:00Z"));
    client = new GameClient();
    client.practice("测试", { turnSeconds: 15 });
    const before = client.state.view!;
    vi.advanceTimersByTime(4000);
    client.pauseLocal(true);
    vi.advanceTimersByTime(60000);
    expect(client.state.view!.players[0]!.discards).toHaveLength(0);
    client.pauseLocal(false);
    expect(client.state.view!.deadline).toBe(before.deadline + 60000);
    vi.advanceTimersByTime(9000);
    expect(client.state.view!.players[0]!.trustee).toBe(false);
    vi.advanceTimersByTime(3000);
    expect(client.state.view!.players[0]!.trustee).toBe(true);
    expect(client.state.view!.revision).toBeGreaterThan(before.revision);
  });
});

import { createGame, newPlayer, startRound, viewFor } from "../shared/engine";
import type { ClientMessage, ServerMessage } from "../shared/types";
class TestSocket {
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: TestSocket[] = [];
  readyState = 1;
  sent: ClientMessage[] = [];
  onopen?: () => void;
  onmessage?: (event: { data: string }) => void;
  onclose?: (event: { code: number }) => void;
  onerror?: () => void;
  constructor() {
    TestSocket.instances.push(this);
  }
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  close() {
    this.readyState = 3;
    this.onclose?.({ code: 1000 });
  }
  receive(message: ServerMessage) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
}
function online(ack = true) {
  TestSocket.instances = [];
  vi.stubGlobal("WebSocket", TestSocket);
  vi.stubGlobal("location", { protocol: "http:", host: "localhost:5173" });
  client = new GameClient();
  client.connect("测试");
  const ws = TestSocket.instances[0];
  ws.onopen?.();
  ws.receive({
    type: "session",
    id: "me",
    token: "test-token",
    name: "测试",
    roomCode: "123456",
    ...(ack ? { commandAck: true } : {}),
  });
  const g = createGame("123456", "network-audit");
  g.players[0] = newPlayer("me", "测试");
  ws.receive({ type: "state", state: viewFor(g, 0) });
  return { ws, g };
}
afterEach(() => vi.unstubAllGlobals());
describe("联机校时与操作隔离", () => {
  it("返回前台立即重发校时，丢弃睡眠前尚未返回的旧pong", () => {
    const { ws, g } = online();
    let mono = 100;
    vi.spyOn(performance, "now").mockImplementation(() => mono);
    ws.receive({
      type: "session",
      id: "me",
      token: "test-token",
      name: "测试",
      roomCode: g.code,
      timeSync: true,
      serverNow: 1_000_000,
    });
    mono = 101; // Some platforms suspend performance.now while asleep.
    client.syncTime(true);
    expect(ws.sent.filter((m) => m.type === "ping")).toHaveLength(2);
    ws.receive({ type: "pong", sentAt: 100, serverNow: 1_000_001 });
    expect(client.now()).toBe(1_000_001);
    mono = 121;
    ws.receive({ type: "pong", sentAt: 101, serverNow: 1_060_010 });
    expect(client.now()).toBe(1_060_020);
    expect(client.state.view!.deadline).toBe(g.deadline);
  });
  it("手机日期不影响服务器时间，只有对应的pong可以校准且不能确认游戏操作", () => {
    const { ws, g } = online();
    let mono = 100;
    vi.spyOn(performance, "now").mockImplementation(() => mono);
    vi.spyOn(Date, "now").mockReturnValue(99_000_000);
    ws.receive({
      type: "session",
      id: "me",
      token: "test-token",
      name: "测试",
      roomCode: g.code,
      commandAck: true,
      timeSync: true,
      serverNow: 1_000_000,
    });
    const ping = ws.sent.find((m) => m.type === "ping")!;
    expect(ping).toMatchObject({ type: "ping", sentAt: 100 });
    client.ready();
    mono += 40;
    ws.receive({ type: "pong", sentAt: 99, serverNow: 9_000_000 });
    expect(client.now()).toBe(1_000_040);
    ws.receive({ type: "pong", sentAt: 100, serverNow: 1_000_020 });
    expect(client.now()).toBe(1_000_040);
    expect(client.state.submitting).toBe("ready");
    expect(client.state.view!.deadline).toBe(g.deadline);
    mono += 1000;
    expect(client.now()).toBe(1_001_040);
  });
  it("断线后停止旧校时，重连换用新时间，进入练习后旧pong无效", () => {
    vi.useFakeTimers();
    const { ws, g } = online();
    ws.receive({
      type: "session",
      id: "me",
      token: "test-token",
      name: "测试",
      roomCode: g.code,
      timeSync: true,
      serverNow: 1_000_000,
    });
    ws.close();
    const before = ws.sent.length;
    vi.advanceTimersByTime(1000);
    const next = TestSocket.instances.at(-1)!;
    next.onopen?.();
    next.receive({
      type: "session",
      id: "me",
      token: "test-token",
      name: "测试",
      roomCode: g.code,
      timeSync: true,
      serverNow: 1_030_000,
    });
    expect(client.now()).toBe(1_030_000);
    ws.receive({ type: "pong", sentAt: 0, serverNow: 5_000_000 });
    expect(client.now()).toBe(1_030_000);
    client.practice("练习", { turnSeconds: 0 });
    vi.advanceTimersByTime(31_000);
    expect(ws.sent).toHaveLength(before);
    expect(next.sent.filter((m) => m.type === "ping")).toHaveLength(1);
    next.receive({ type: "pong", sentAt: 0, serverNow: 7_000_000 });
    expect(client.now()).toBe(Date.now());
    expect(client.state.mode).toBe("local");
  });
});
afterEach(() => vi.restoreAllMocks());
describe("慢网操作确认", () => {
  it("准备和碰杠胡连续点击只发一次，其他人的状态更新不能提前解锁", () => {
    const { ws, g } = online();
    client.ready();
    client.ready();
    expect(ws.sent.filter((m) => m.type === "ready")).toHaveLength(1);
    expect(client.state.submitting).toBe("ready");
    g.revision++;
    g.players[1] = newPlayer("friend", "牌友");
    ws.receive({ type: "state", state: viewFor(g, 0) });
    ws.receive({ type: "ack", requestId: "unrelated" });
    expect(client.state.submitting).toBe("ready");
    ws.receive({ type: "ack", requestId: ws.sent.at(-1)!.requestId! });
    expect(client.state.submitting).toBeNull();
    client.action({ type: "pung" });
    client.action({ type: "hu" });
    client.action({ type: "pass" });
    expect(ws.sent.filter((m) => m.type === "action")).toHaveLength(1);
    expect(client.state.submitting).toBe("action");
  });
  it("服务明确拒绝后解锁，允许重新操作", () => {
    const { ws } = online();
    client.ready();
    ws.receive({
      type: "error",
      requestId: ws.sent.at(-1)!.requestId,
      message: "牌局已更新，请再操作一次",
    });
    expect(client.state.submitting).toBeNull();
    expect(client.state.error).toContain("牌局已更新");
    client.ready();
    expect(ws.sent.filter((m) => m.type === "ready")).toHaveLength(2);
    expect(client.state.error).toBe("");
  });
  it("响应超时重新同步，不重放不确定是否生效的操作", () => {
    vi.useFakeTimers();
    const { ws, g } = online();
    client.ready();
    vi.advanceTimersByTime(8000);
    expect(client.state.connecting).toBe(true);
    expect(client.state.submitting).toBeNull();
    vi.advanceTimersByTime(1000);
    const next = TestSocket.instances[1];
    next.onopen?.();
    next.receive({
      type: "session",
      id: "me",
      token: "test-token",
      name: "测试",
      roomCode: g.code,
      commandAck: true,
    });
    g.players[0]!.ready = true;
    g.revision++;
    next.receive({ type: "state", state: viewFor(g, 0) });
    expect(client.state.view!.players[0]!.ready).toBe(true);
    expect(next.sent.map((m) => m.type)).toEqual(["hello"]);
    expect(ws.sent.filter((m) => m.type === "ready")).toHaveLength(1);
  });
  it("离开网络桌后旧连接消息不会覆盖新的练习", () => {
    const { ws, g } = online();
    client.practice("新的名字", {});
    const id = client.state.view!.id;
    ws.receive({ type: "state", state: viewFor(g, 0) });
    ws.receive({ type: "left" });
    expect(client.state.mode).toBe("local");
    expect(client.state.view!.id).toBe(id);
    expect(client.state.view!.players[0]!.name).toBe("新的名字");
  });
  it("连接旧版服务器时仍可在状态返回后继续操作", () => {
    const { ws, g } = online(false);
    client.ready();
    g.players[0]!.ready = true;
    g.revision++;
    ws.receive({ type: "state", state: viewFor(g, 0) });
    expect(client.state.submitting).toBeNull();
    client.send({ type: "addBot" });
    expect(ws.sent.at(-1)!.type).toBe("addBot");
  });
});

describe("大厅连接与开桌确认", () => {
  it("自动续桌完成后，旧离桌请求的迟到拒绝不会覆盖大厅通知", () => {
    const { ws } = online();
    ws.receive({
      type: "session",
      id: "me",
      token: "test-token",
      name: "测试",
      roomCode: "123456",
      tableLobby: true,
      commandAck: true,
    });
    client.send({ type: "leave" });
    const requestId = ws.sent.at(-1)!.requestId;
    ws.receive({ type: "left", lobby: true, message: "本桌结束，已续开空桌" });
    ws.receive({ type: "error", requestId, message: "请先创建或加入牌桌" });
    expect(client.state.view).toBeNull();
    expect(client.state.error).toBe("");
    expect(client.state.lobbyNotice).toBe("本桌结束，已续开空桌");
  });
  function lobby() {
    const { ws } = online();
    ws.receive({
      type: "session",
      id: "me",
      token: "test-token",
      name: "测试",
      commandAck: true,
      tableLobby: true,
    });
    client.browseTables("测试");
    ws.receive({ type: "tables", tables: [] });
    return ws;
  }
  it("大厅断线恢复后重新订阅，已经加载过也不会停留在旧空位", () => {
    vi.useFakeTimers();
    const ws = lobby();
    expect(client.state.tablesLoading).toBe(false);
    ws.receive({ type: "error", message: "暂时连接不上牌桌服务" });
    ws.close();
    vi.advanceTimersByTime(1000);
    const next = TestSocket.instances.at(-1)!;
    next.onopen?.();
    next.receive({
      type: "session",
      id: "me",
      token: "test-token",
      name: "测试",
      commandAck: true,
      tableLobby: true,
    });
    expect(client.state.error).toBe("");
    expect(next.sent.map((m) => m.type)).toEqual(["hello", "tables"]);
  });
  it("开桌请求只发一次，确认超时重连查询大厅而不重复开桌", () => {
    vi.useFakeTimers();
    const ws = lobby();
    client.createTables("测试", DEFAULT_TABLE_SETTINGS, { rounds: 8 }, 2);
    client.createTables("测试", DEFAULT_TABLE_SETTINGS, { rounds: 8 }, 2);
    expect(ws.sent.filter((m) => m.type === "createTables")).toHaveLength(1);
    vi.advanceTimersByTime(9000);
    const next = TestSocket.instances.at(-1)!;
    next.onopen?.();
    next.receive({
      type: "session",
      id: "me",
      token: "test-token",
      name: "测试",
      commandAck: true,
      tableLobby: true,
    });
    expect(next.sent.map((m) => m.type)).toEqual(["hello", "tables"]);
  });
  it("续桌通知释放未确认操作并保留大厅连接，重新获取空桌", () => {
    const ws = lobby();
    const g = createGame("123456", "managed");
    g.players[0] = newPlayer("me", "测试");
    ws.receive({ type: "state", state: viewFor(g, 0) });
    client.send({ type: "leave" });
    expect(client.state.submitting).toBe("leave");
    ws.receive({ type: "left", lobby: true, message: "已续桌" });
    expect(client.state.submitting).toBeNull();
    expect(client.state.view).toBeNull();
    expect(client.state.connected).toBe(true);
    expect(ws.sent.at(-1)!.type).toBe("tables");
  });
});
import { DEFAULT_TABLE_SETTINGS } from "../shared/table-settings";

describe("牌桌刷新与连接恢复", () => {
  function lobby() {
    const { ws } = online();
    ws.receive({
      type: "session",
      id: "me",
      token: "test-token",
      name: "测试",
      commandAck: true,
      tableLobby: true,
    });
    client.browseTables("测试");
    ws.receive({ type: "tables", tables: [] });
    return ws;
  }
  it("上一条准备未确认时仍能刷新列表，列表不能确认出牌操作", () => {
    const ws = lobby();
    client.ready();
    const requestId = ws.sent.at(-1)!.requestId!;
    const before = ws.sent.filter((m) => m.type === "tables").length;
    client.browseTables("测试");
    expect(ws.sent.filter((m) => m.type === "tables")).toHaveLength(before + 1);
    ws.receive({ type: "tables", tables: [] });
    expect(client.state.tablesLoading).toBe(false);
    expect(client.state.submitting).toBe("ready");
    ws.receive({ type: "ack", requestId });
    expect(client.state.submitting).toBeNull();
  });
  it("同一次未完成刷新合并重复点击，返回结果后可以再次刷新", () => {
    const ws = lobby();
    const before = ws.sent.filter((m) => m.type === "tables").length;
    client.browseTables("测试");
    client.browseTables("测试");
    client.browseTables("测试");
    expect(ws.sent.filter((m) => m.type === "tables")).toHaveLength(before + 1);
    ws.receive({ type: "tables", tables: [] });
    client.browseTables("测试");
    expect(ws.sent.filter((m) => m.type === "tables")).toHaveLength(before + 2);
  });
  it("列表不回复且旧 socket 关闭事件不来，仍会重新连接并等待新列表", () => {
    vi.useFakeTimers();
    const ws = lobby();
    ws.close = () => {
      ws.readyState = 2;
    };
    client.browseTables("测试");
    vi.advanceTimersByTime(9000);
    expect(TestSocket.instances).toHaveLength(2);
    const next = TestSocket.instances[1];
    next.onopen?.();
    next.receive({
      type: "session",
      id: "me",
      token: "test-token",
      name: "测试",
      commandAck: true,
      tableLobby: true,
    });
    expect(next.sent.map((m) => m.type)).toEqual(["hello", "tables"]);
    expect(client.state.tablesLoading).toBe(true);
    ws.receive({ type: "tables", tables: [] });
    expect(client.state.tablesLoading).toBe(true);
    next.receive({ type: "tables", tables: [] });
    expect(client.state.tablesLoading).toBe(false);
  });
  it("离开网络后旧 socket 的迟到打开和报错不影响练习", () => {
    const ws = lobby();
    client.practice("练习", {});
    const count = ws.sent.length;
    ws.onopen?.();
    ws.onerror?.();
    expect(ws.sent).toHaveLength(count);
    expect(client.state.error).toBe("");
    expect(client.state.mode).toBe("local");
  });
});

describe("握手心跳与前后台恢复", () => {
  it("握手无回复10秒后重试，注销后所有超时停止", () => {
    vi.useFakeTimers();
    online();
    client.connect("测试");
    const hanging = TestSocket.instances.at(-1)!;
    hanging.close = () => {
      hanging.readyState = 2;
    };
    vi.advanceTimersByTime(11000);
    expect(TestSocket.instances).toHaveLength(3);
    client.disconnect();
    vi.advanceTimersByTime(60000);
    expect(TestSocket.instances).toHaveLength(3);
  });
  it("ping没回应会恢复连接，旧连接迟到pong不能确认新连接", () => {
    vi.useFakeTimers();
    const { ws } = online();
    ws.receive({
      type: "session",
      id: "me",
      token: "test-token",
      name: "测试",
      timeSync: true,
      tableLobby: true,
    });
    const ping = ws.sent.find((m) => m.type === "ping")!;
    vi.advanceTimersByTime(11000);
    expect(TestSocket.instances).toHaveLength(2);
    ws.receive({
      type: "pong",
      sentAt: ping.type === "ping" ? ping.sentAt : 0,
      serverNow: Date.now(),
    });
    expect(client.state.connected).toBe(false);
  });
  it("网络恢复跳过退避等待，只建立一条连接，后台不误判心跳超时", () => {
    vi.useFakeTimers();
    const { ws } = online();
    ws.receive({
      type: "session",
      id: "me",
      token: "test-token",
      name: "测试",
      timeSync: true,
      tableLobby: true,
    });
    client.setNetworkVisible(false);
    vi.advanceTimersByTime(60000);
    expect(TestSocket.instances).toHaveLength(1);
    client.setNetworkVisible(true);
    expect(ws.sent.filter((m) => m.type === "ping" && m.sync)).toHaveLength(1);
    client.networkOffline();
    client.resumeConnection();
    client.resumeConnection();
    vi.advanceTimersByTime(0);
    expect(TestSocket.instances).toHaveLength(2);
    vi.advanceTimersByTime(1000);
    expect(TestSocket.instances).toHaveLength(2);
  });
  it("前台恢复重新拉取大厅，已在别处登录则不会自动抢回会话", () => {
    vi.useFakeTimers();
    const { ws } = online();
    ws.receive({
      type: "session",
      id: "me",
      token: "test-token",
      name: "测试",
      tableLobby: true,
      timeSync: true,
    });
    client.browseTables("测试");
    ws.receive({ type: "tables", tables: [] });
    const before = ws.sent.filter((m) => m.type === "tables").length;
    client.setNetworkVisible(false);
    client.setNetworkVisible(true);
    const ping = ws.sent.at(-1) as Extract<ClientMessage, { type: "ping" }>;
    ws.receive({
      type: "pong",
      sentAt: ping.sentAt,
      serverNow: Date.now(),
      synced: true,
    });
    expect(ws.sent.filter((m) => m.type === "tables")).toHaveLength(before + 1);
    ws.onclose?.({ code: 4001 });
    client.resumeConnection();
    vi.advanceTimersByTime(30000);
    expect(TestSocket.instances).toHaveLength(1);
  });
});

describe("后台保留连接、前台快速同步", () => {
  function syncedOnline() {
    const { ws, g } = online();
    ws.receive({
      type: "session",
      id: "me",
      token: "test-token",
      name: "测试",
      roomCode: g.code,
      timeSync: true,
      commandAck: true,
    });
    const ping = ws.sent.at(-1) as Extract<ClientMessage, { type: "ping" }>;
    ws.receive({ type: "pong", sentAt: ping.sentAt, serverNow: Date.now() });
    return { ws, g };
  }
  it("后台未确认操作不触发断网；回来获取最新手牌，绝不重发旧操作", () => {
    vi.useFakeTimers();
    const { ws, g } = syncedOnline();
    client.ready();
    client.setNetworkVisible(false);
    vi.advanceTimersByTime(120000);
    expect(TestSocket.instances).toHaveLength(1);
    expect(ws.readyState).toBe(TestSocket.OPEN);
    client.setNetworkVisible(true);
    client.resumeConnection();
    expect(ws.sent.filter((m) => m.type === "ping" && m.sync)).toHaveLength(1);
    expect(client.state.connected).toBe(false);
    g.revision += 5;
    g.players[0]!.ready = true;
    ws.receive({ type: "state", state: viewFor(g, 0) });
    const ping = ws.sent.at(-1) as Extract<ClientMessage, { type: "ping" }>;
    ws.receive({
      type: "pong",
      sentAt: ping.sentAt,
      serverNow: Date.now(),
      synced: true,
      roomCode: g.code,
    });
    expect(client.state.connected).toBe(true);
    expect(client.state.view!.revision).toBe(g.revision);
    expect(client.state.submitting).toBeNull();
    expect(ws.sent.filter((m) => m.type === "ready")).toHaveLength(1);
    expect(TestSocket.instances).toHaveLength(1);
  });
  it("后台被系统断开后不反复重试；回前台立即建立唯一的新连接", () => {
    vi.useFakeTimers();
    const { ws } = syncedOnline();
    client.setNetworkVisible(false);
    ws.close();
    vi.advanceTimersByTime(120000);
    expect(TestSocket.instances).toHaveLength(1);
    client.setNetworkVisible(true);
    client.resumeConnection();
    vi.advanceTimersByTime(0);
    expect(TestSocket.instances).toHaveLength(2);
  });
  it("假在线连接最多探测两秒，立即重连，不等十秒加退避", () => {
    vi.useFakeTimers();
    const { ws } = syncedOnline();
    client.setNetworkVisible(false);
    vi.advanceTimersByTime(30000);
    client.setNetworkVisible(true);
    vi.advanceTimersByTime(1999);
    expect(TestSocket.instances).toHaveLength(1);
    vi.advanceTimersByTime(2);
    expect(TestSocket.instances).toHaveLength(2);
    expect(ws.readyState).toBe(TestSocket.CLOSED);
  });
  it("从后台恢复时退休挂起的旧握手，旧回调不能覆盖新状态", () => {
    vi.useFakeTimers();
    syncedOnline();
    client.connect("测试");
    const old = TestSocket.instances.at(-1)!;
    old.readyState = 0;
    client.setNetworkVisible(false);
    vi.advanceTimersByTime(90000);
    client.setNetworkVisible(true);
    vi.advanceTimersByTime(0);
    const next = TestSocket.instances.at(-1)!;
    expect(next).not.toBe(old);
    old.receive({ type: "session", id: "old", token: "old", name: "旧连接" });
    expect(client.state.connected).toBe(false);
    expect(next.sent).toEqual([]);
  });
});


describe("练习真人托管", () => {
  it("超时之后只打刚摸的牌，一次取消就保留新一轮手动时间", () => {
    vi.useFakeTimers();vi.setSystemTime(10000);
    let g=createGame("123456","trustee",{turnSeconds:10});
    g.players=[0,1,2,3].map(i=>({...newPlayer(String(i),String(i),i!==0),ready:true}));
    g=startRound(g,10000,()=>.51);g.turn=0;
    g.players[0]!.hand=[0,4,8,36,40,44,72,76,80,108,109,110,112,113];g.lastDraw=113;
    vi.stubGlobal("localStorage",{getItem:(key:string)=>key==="jinling:practice"?JSON.stringify(g):null,setItem:vi.fn()});
    client=new GameClient();client.practice("测试",{},true);
    vi.advanceTimersByTime(10450);
    expect(client.state.view!.players[0]!.discards).toEqual([113]);
    expect(client.state.view!.players[0]!.trustee).toBe(true);
    client.trustee(false);
    expect(client.state.view!.players[0]!.trustee).toBe(false);
    expect(client.state.view!.players[0]!.hand).toHaveLength(13);
  });
});
