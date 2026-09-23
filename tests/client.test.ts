import { afterEach, describe, expect, it, vi } from "vitest";
import { GameClient } from "../src/game-client";
import { completedRound } from "./fixtures/completed-round";
let client: GameClient;
it("战绩列表合并相同的并发请求，完成后重新拉取", async () => {
  client = new GameClient();
  const result = { records: [], total: 0, page: 1, pageSize: 20 };
  let release!: (value: typeof result) => void;
  const api = vi.spyOn(client, "api").mockImplementation(() => new Promise(resolve => { release = resolve as typeof release; }));
  const first = client.loadRecords(true, new URLSearchParams({ page: "1", read: "all" }));
  const second = client.loadRecords(true, new URLSearchParams({ page: "1" }));
  expect(api).toHaveBeenCalledTimes(1);
  release(result);
  expect(await first).toEqual(result);
  expect(await second).toEqual(result);
  api.mockResolvedValue(result);
  await client.loadRecords(true, new URLSearchParams({ page: "1" }));
  expect(api).toHaveBeenCalledTimes(2);
});
afterEach(() => {
  client?.disconnect();
  vi.useRealTimers();
});
describe("练习入口已关闭",()=>{
  it.each([false,true])("旧入口不能启动或恢复练习，resume=%s",resume=>{
    vi.useFakeTimers();
    const saved=completedRound();
    vi.stubGlobal("localStorage",{getItem:(key:string)=>key==="jinling:practice"?JSON.stringify(saved):null,setItem:vi.fn()});
    client=new GameClient();
    client.practice("测试",{},resume);
    vi.advanceTimersByTime(60000);
    expect(client.state.view).toBeNull();
    expect(client.state.mode).not.toBe("local");
    expect(client.state.error).toContain("单人练习已关闭");
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
it('hello explicitly advertises opening completion support', () => {
  const { ws } = online();
  expect(ws.sent.find(m => m.type === 'hello')).toMatchObject({ capabilities: { openingComplete: true } });
  expect(ws.sent.find(m => m.type === 'hello')).toHaveProperty('clientVersion');
});
it('mandatory update blocks entry and automatic reconnection without clearing the account token', () => {
  vi.useFakeTimers();
  const saved = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => saved.get(key) ?? null, setItem: (key: string, value: string) => saved.set(key, value) });
  const { ws } = online();
  ws.receive({ type: 'error', code: 'UPDATE_REQUIRED', minimumVersion: '0.7.37', message: '请更新后继续' });
  expect(client.state.updateRequired).toEqual({ minimumVersion: '0.7.37', message: '请更新后继续' });
  expect(client.state.connected).toBe(false); expect(client.state.view).toBeNull();
  expect(client.state.network.phase).toBe('blocked');
  client.connect('测试'); client.retryNetwork();
  vi.advanceTimersByTime(120_000);
  expect(TestSocket.instances).toHaveLength(1);
  expect(saved.get('jinling:token')).toBe(JSON.stringify('test-token'));
});
it('manual update recheck retries the server once; a still-enabled gate blocks again', () => {
  const { ws } = online();
  ws.receive({ type: 'error', code: 'UPDATE_REQUIRED', message: '请更新' });
  client.retryUpdate();
  expect(client.state.updateRequired).toBeUndefined();
  expect(TestSocket.instances).toHaveLength(2);
  const retry = TestSocket.instances[1]; retry.onopen?.();
  retry.receive({ type: 'error', code: 'UPDATE_REQUIRED', message: '仍需更新' });
  expect(client.state.updateRequired?.message).toBe('仍需更新');
  expect(client.state.connected).toBe(false);
});
describe('online invitation request isolation', () => {
  it('matches request replies without unlocking an outstanding game action', async () => {
    const { ws, g } = online(); client.state.tableInvitesAvailable = true;
    client.send({ type: 'ready' });
    const request = client.onlineInvitePeers(g.id), message = ws.sent.at(-1)!;
    expect(message.type).toBe('invitePeers');
    ws.receive({ type: 'invitationResult', requestId: message.requestId!, peers: [] });
    expect(await request).toEqual([]); expect(client.state.submitting).toBe('ready');
  });
  it('propagates a scoped invitation error and rejects disconnected requests', async () => {
    const { ws, g } = online(); client.state.tableInvitesAvailable = true;
    const request = client.invitePlayer(g.id, '100002');
    const checked = expect(request).rejects.toThrow('该牌友已在牌桌中');
    ws.receive({ type: 'error', requestId: ws.sent.at(-1)!.requestId, message: '该牌友已在牌桌中' });
    await checked; expect(client.state.error).toBe('');
    client.disconnect(); await expect(client.onlineInvitePeers(g.id)).rejects.toThrow('重连');
    expect(client.state.tableInvitations).toEqual([]);
  });
});
describe("联机校时与操作隔离", () => {
  it("重连旧桌已归档时转战绩，仍在桌内时恢复牌桌，记录按账号隔离", () => {
    const data = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => data.set(key, value),
    });
    const { ws, g } = online();
    expect(data.get("jinling:activeRoom:me")).toBe(JSON.stringify(g.id));
    const session = { type: "session" as const, id: "me", token: "test-token", name: "测试" };
    ws.receive({ ...session, roomCode: g.code });
    ws.receive({ type: "state", state: viewFor(g, 0) });
    expect(client.state.recordsReturn).toBeUndefined();
    ws.receive({ ...session, id: "someone-else" });
    expect(client.state.recordsReturn).toBeUndefined();
    ws.receive(session);
    expect(client.state.view).toBeNull();
    expect(client.state.recordsReturn).toBe(1);
    ws.receive(session);
    expect(client.state.recordsReturn).toBe(1);
  });
  it("主动离桌清除返回标记，随后登录不强行跳战绩", () => {
    const data = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => data.set(key, value),
    });
    const { ws } = online();
    ws.receive({ type: "left", lobby: true });
    ws.receive({ type: "session", id: "me", token: "test-token", name: "测试" });
    expect(client.state.recordsReturn).toBeUndefined();
  });
  it("诊断保留服务端版本，旧服务未提供时清除上一连接版本", () => {
    const { ws } = online();
    const session = { type: "session" as const, id: "me", token: "test-token", name: "测试" };
    ws.receive({ ...session, serverVersion: "0.7.5" });
    expect(client.state.network.serverVersion).toBe("0.7.5");
    ws.receive(session);
    expect(client.state.network.serverVersion).toBeNull();
  });
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
    ws.receive({ type: "state", state: viewFor(g, 0) });
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
  it("断线后停止旧校时，重连换用新时间，主动断开后旧pong无效", () => {
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
    client.disconnect();
    vi.advanceTimersByTime(31_000);
    expect(ws.sent).toHaveLength(before);
    expect(next.sent.filter((m) => m.type === "ping")).toHaveLength(1);
    next.receive({ type: "pong", sentAt: 0, serverNow: 7_000_000 });
    expect(client.now()).toBe(Date.now());
    expect(client.state.connected).toBe(false);
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
  it("已在正式桌时旧练习入口不会断开连接或覆盖牌局", () => {
    const {ws,g}=online();
    client.practice("新的名字",{});
    expect(client.state.error).toContain("单人练习已关闭");
    expect(client.state.connected).toBe(true);
    expect(client.state.mode).toBe("online");
    expect(client.state.view!.id).toBe(g.id);
    expect(ws.readyState).toBe(TestSocket.OPEN);
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
    const { ws, g } = online();
    ws.receive({
      type: "session",
      id: "me",
      token: "test-token",
      name: "测试",
      roomCode: "123456",
      tableLobby: true,
      commandAck: true,
    });
    ws.receive({ type: "state", state: viewFor(g, 0) });
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
  it("主动断开后旧 socket 的迟到打开和报错无效", () => {
    const ws = lobby();
    client.disconnect();
    const count = ws.sent.length;
    ws.onopen?.();
    ws.onerror?.();
    expect(ws.sent).toHaveLength(count);
    expect(client.state.error).toBe("");
    expect(client.state.connected).toBe(false);
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
    ws.receive({ type: "state", state: viewFor(g, 0) });
    const ping = ws.sent.at(-1) as Extract<ClientMessage, { type: "ping" }>;
    ws.receive({ type: "pong", sentAt: ping.sentAt, serverNow: Date.now() });
    return { ws, g };
  }
  it("画布和工具栏间切换焦点不触发恢复同步或禁用操作", () => {
    const { ws } = syncedOnline();
    const before = ws.sent.length;
    client.setNetworkVisible(true);
    client.setNetworkVisible(true);
    expect(ws.sent).toHaveLength(before);
    expect(client.state.connected).toBe(true);
    client.ready();
    expect(ws.sent.at(-1)?.type).toBe("ready");
  });
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


describe("首把开局提示",()=>{
  function dealt(options: { gate?: boolean; animation?: boolean; waiting?: (0|1|2|3)[] } = {}){
    const g=createGame("123456","opening-web");
    g.players=[0,1,2,3].map(s=>({...newPlayer(s===0?"me":`seat-${s}`,`牌友${s}`),ready:true}));
    if(options.gate||options.animation!==undefined)g.table={creatorId:"me",groupId:"opening",number:1,createdAt:0,
      settings:{...DEFAULT_TABLE_SETTINGS,openingAnimation:options.animation??true}};
    const started=startRound(g);
    if(options.gate){started.openingGate={round:1,waiting:options.waiting??[0,1,2,3],expiresAt:Date.now()+30000};started.deadline=0;}
    return started;
  }
  it("新入座只收到开局状态也有提示，后续快照保留同一个提示",()=>{
    const {ws}=online();
    ws.receive({type:"session",id:"me",token:"test-token",name:"测试"});
    const g=dealt();ws.receive({type:"state",state:viewFor(g,0)});
    const cue=client.state.openingCue;
    expect(cue).toMatchObject({game:g.id,round:1});
    g.revision++;ws.receive({type:"state",state:viewFor(g,0)});
    expect(client.state.openingCue).toBe(cue);
  });
  it("等待和开局连续到达不依赖渲染间隔，下一把不产生提示",()=>{
    const {ws,g}=online();
    g.players=[0,1,2,3].map(s=>({...newPlayer(s===0?"me":`seat-${s}`,`牌友${s}`),ready:true}));
    ws.receive({type:"state",state:viewFor(g,0)});
    const started=startRound(g);ws.receive({type:"state",state:viewFor(started,0)});
    const cue=client.state.openingCue;expect(cue?.round).toBe(1);
    started.round=2;started.revision++;ws.receive({type:"state",state:viewFor(started,0)});
    expect(client.state.openingCue).toBe(cue);
  });
  it("刷新或断线恢复首把不重播，已经出牌的局不补播",()=>{
    const {ws}=online();const g=dealt();
    ws.receive({type:"session",id:"me",token:"test-token",name:"测试",roomCode:g.code});
    ws.receive({type:"state",state:viewFor(g,0)});
    expect(client.state.openingCue).toBeNull();
    ws.receive({type:"session",id:"me",token:"test-token",name:"测试"});
    g.players[0]!.discards.push(g.players[0]!.hand.pop()!);
    ws.receive({type:"state",state:viewFor(g,0)});
    expect(client.state.openingCue).toBeNull();
  });
  it("服务端同步门未确认时，刷新恢复也继续显示；已确认座位不重播",()=>{
    const {ws}=online();const pending=dealt({gate:true});
    ws.receive({type:"session",id:"me",token:"test-token",name:"测试",roomCode:pending.code});
    ws.receive({type:"state",state:viewFor(pending,0)});
    expect(client.state.openingCue).toMatchObject({game:pending.id,round:1});

    const confirmed=structuredClone(pending);
    confirmed.openingGate!.waiting=[1,2,3];
    client=new GameClient();
    TestSocket.instances=[];
    client.connect("测试");
    const restored=TestSocket.instances[0];restored.onopen?.();
    restored.receive({type:"session",id:"me",token:"test-token",name:"测试",roomCode:confirmed.code});
    restored.receive({type:"state",state:viewFor(confirmed,0)});
    expect(client.state.openingCue).toBeNull();
  });
  it("关闭动画时不生成提示；完成动画独立上报且不占用操作提交状态",()=>{
    const {ws}=online();
    const disabled=dealt({animation:false});
    ws.receive({type:"state",state:viewFor(disabled,0)});
    expect(client.state.openingCue).toBeNull();

    const gated=dealt({gate:true});
    ws.receive({type:"state",state:viewFor(gated,0)});
    client.openingComplete(gated.id,1);
    expect(ws.sent.at(-1)).toEqual({type:"openingComplete",game:gated.id,round:1});
    expect(client.state.submitting).toBeNull();
  });
  it("开局完成发送失败会立即重连，并在新状态同步后重发",()=>{
    vi.useFakeTimers();
    const {ws}=online();
    const gated=dealt({gate:true,waiting:[0]});
    ws.receive({type:"state",state:viewFor(gated,0)});
    const send=ws.send.bind(ws);
    let failed=false;
    ws.send=(data:string)=>{
      const message=JSON.parse(data) as ClientMessage;
      if(!failed&&message.type==="openingComplete"){
        failed=true;
        throw new Error("socket write failed");
      }
      send(data);
    };

    client.openingComplete(gated.id,1);
    expect(failed).toBe(true);
    expect(client.state.connected).toBe(false);
    vi.advanceTimersByTime(0);
    const next=TestSocket.instances.at(-1)!;
    expect(next).not.toBe(ws);
    next.onopen?.();
    next.receive({type:"session",id:"me",token:"test-token",name:"测试",roomCode:gated.code,commandAck:true});
    next.receive({type:"state",state:viewFor(gated,0)});
    expect(next.sent.filter(message=>message.type==="openingComplete")).toEqual([
      {type:"openingComplete",game:gated.id,round:1},
    ]);
  });
  it("恢复同步的状态先到时保留开局完成信号，并在pong恢复连接后重发",()=>{
    const {ws}=online();
    const gated=dealt({gate:true,waiting:[0]});
    ws.receive({type:"session",id:"me",token:"test-token",name:"测试",roomCode:gated.code,
      commandAck:true,timeSync:true,serverNow:Date.now()});
    ws.receive({type:"state",state:viewFor(gated,0)});
    const firstPing=ws.sent.filter((message):message is Extract<ClientMessage,{type:"ping"}>=>message.type==="ping").at(-1)!;
    ws.receive({type:"pong",sentAt:firstPing.sentAt,serverNow:Date.now()});
    client.openingComplete(gated.id,1);
    expect(ws.sent.filter(message=>message.type==="openingComplete")).toHaveLength(1);

    client.setNetworkVisible(false);
    client.setNetworkVisible(true);
    const resumePing=ws.sent.filter((message):message is Extract<ClientMessage,{type:"ping"}>=>message.type==="ping").at(-1)!;
    expect(resumePing.sync).toBe(true);
    expect(client.state.connected).toBe(false);
    ws.receive({type:"state",state:viewFor(gated,0)});
    expect(ws.sent.filter(message=>message.type==="openingComplete")).toHaveLength(1);
    ws.receive({type:"pong",sentAt:resumePing.sentAt,serverNow:Date.now(),synced:true,roomCode:gated.code});
    expect(client.state.connected).toBe(true);
    expect(ws.sent.filter(message=>message.type==="openingComplete")).toHaveLength(2);
    expect(ws.sent.at(-1)).toEqual({type:"openingComplete",game:gated.id,round:1});
  });
  it("显式同步协议已放行后不再用旧快照规则补播动画",()=>{
    const {ws}=online();
    const released=dealt({animation:true});
    ws.receive({type:"state",state:viewFor(released,0)});
    expect(client.state.openingCue).toBeNull();
  });
});
