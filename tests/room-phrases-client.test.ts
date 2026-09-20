import { afterEach, describe, expect, it, vi } from "vitest";
import { GameClient } from "../src/game-client";
import { createGame, newPlayer, viewFor } from "../shared/engine";
import { ROOM_PHRASES, ROOM_PHRASE_HISTORY_LIMIT, ROOM_PHRASE_TTL_MS, isRoomPhraseId, type RoomPhraseMessage } from "../shared/room-phrases";
import { createPhraseGate } from "../server/room-phrases";
import type { ClientMessage, ServerMessage } from "../shared/types";

class TestSocket {
  static OPEN = 1; static CLOSING = 2; static CLOSED = 3;
  static instances: TestSocket[] = [];
  readyState = 1;
  sent: ClientMessage[] = [];
  onopen?: () => void;
  onmessage?: (event: { data: string }) => void;
  onclose?: (event: { code: number }) => void;
  onerror?: () => void;
  constructor() { TestSocket.instances.push(this); }
  send(data: string) { this.sent.push(JSON.parse(data)); }
  close() { this.readyState = 3; this.onclose?.({ code: 1000 }); }
  receive(message: ServerMessage) { this.onmessage?.({ data: JSON.stringify(message) }); }
}
let client: GameClient | undefined;
function online(supported = true) {
  TestSocket.instances = [];
  vi.stubGlobal("WebSocket", TestSocket);
  vi.stubGlobal("location", { protocol: "http:", host: "localhost:5173" });
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: vi.fn() });
  client = new GameClient(); client.connect("我");
  const ws = TestSocket.instances[0]; ws.onopen?.();
  const game = createGame("123456", "phrase-room");
  game.players = ["me", "friend", "other", "fourth"].map(id => newPlayer(id, id));
  ws.receive({ type: "session", id: "me", name: "我", token: "test", roomCode: game.code, commandAck: true, ...(supported ? { roomPhrases: true } : {}) });
  ws.receive({ type: "state", state: viewFor(game, 0) });
  const message = (patch: Partial<RoomPhraseMessage> = {}): RoomPhraseMessage => ({
    id: "phrase-one", game: game.id, sender: "friend", name: "friend", seat: 1, phrase: "chat_01", at: Date.now(), ...patch,
  });
  return { client, ws, game, message };
}
afterEach(() => { client?.disconnect(); client = undefined; vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("固定短句白名单与服务端节流", () => {
  it("12条稳定ID与原素材对应，不接受任意文字或对象键", () => {
    expect(ROOM_PHRASES).toHaveLength(12);
    expect(ROOM_PHRASES.map(phrase => phrase.id)).toEqual(Array.from({ length: 12 }, (_, n) => `chat_${String(n + 1).padStart(2, "0")}`));
    expect(ROOM_PHRASES.every(phrase => isRoomPhraseId(phrase.id) && phrase.text.length > 0)).toBe(true);
    for (const invalid of ["chat_13", "快点呀", "__proto__", "constructor", null, 1]) expect(isRoomPhraseId(invalid)).toBe(false);
  });
  it("每账号2秒限制跨桌生效，重复请求只确认，换内容不能盗用旧ID", () => {
    const gate = createPhraseGate();
    expect(gate("a", "room", "chat_01", "request-1", 1000)).toBe(true);
    expect(gate("a", "room", "chat_01", "request-1", 1001)).toBe(false);
    expect(() => gate("a", "room", "chat_02", "request-1", 1001)).toThrow("请求已使用");
    expect(() => gate("a", "another-room", "chat_02", "request-2", 2999)).toThrow("发送太快");
    expect(gate("b", "room", "chat_02", "request-2", 1001)).toBe(true);
    expect(gate("a", "room", "chat_02", "request-2", 3000)).toBe(true);
  });
});

describe("客户端短句发送与游戏命令隔离", () => {
  it("服务ack后才成功，广播与其他状态不能提前成功；不挡打牌命令", async () => {
    const { client, ws, game, message } = online();
    expect(client.state.phrasesAvailable).toBe(true);
    const completed = vi.fn(), pending = client.sendPhrase(game.id, "chat_01").then(completed);
    const phrase = ws.sent.find(item => item.type === "phrase")!;
    expect(phrase).toMatchObject({ type: "phrase", game: game.id, phrase: "chat_01", requestId: expect.stringMatching(/^phrase-/) });
    client.ready();
    const move = ws.sent.find(item => item.type === "ready")!;
    expect(client.state.submitting).toBe("ready");
    ws.receive({ type: "phrase", message: message() });
    ws.receive({ type: "state", state: viewFor(game, 0) });
    ws.receive({ type: "ack", requestId: "unrelated" });
    await Promise.resolve(); expect(completed).not.toHaveBeenCalled();
    ws.receive({ type: "ack", requestId: phrase.requestId! });
    await pending; expect(completed).toHaveBeenCalledOnce();
    expect(client.state.submitting).toBe("ready");
    ws.receive({ type: "ack", requestId: move.requestId! });
    expect(client.state.submitting).toBeNull();
  });
  it("服务拒绝会reject但不打断游戏命令；未完成时重复点短句只发送一次", async () => {
    const { client, ws, game } = online();
    const failed = expect(client.sendPhrase(game.id, "chat_02")).rejects.toThrow("发送太快");
    await expect(client.sendPhrase(game.id, "chat_03")).rejects.toThrow("正在发送");
    expect(ws.sent.filter(item => item.type === "phrase")).toHaveLength(1);
    client.ready();
    const request = ws.sent.find(item => item.type === "phrase")!;
    ws.receive({ type: "error", requestId: request.requestId, message: "发送太快了，请稍候再发" });
    await failed;
    expect(client.state.submitting).toBe("ready");
    expect(client.state.error).toBe("");
  });
  it("8秒没有确认只报告超时，不重发短句或重连影响对局", async () => {
    vi.useFakeTimers();
    const { client, ws, game } = online();
    const failed = expect(client.sendPhrase(game.id, "chat_04")).rejects.toThrow("确认超时");
    await vi.advanceTimersByTimeAsync(8000); await failed;
    expect(ws.sent.filter(item => item.type === "phrase")).toHaveLength(1);
    expect(TestSocket.instances).toHaveLength(1);
    expect(client.state.connected).toBe(true);
  });
  it("旧服务器未声明能力、错桌及任意文本均不会发送", async () => {
    const { client, ws, game } = online(false);
    await expect(client.sendPhrase(game.id, "chat_01")).rejects.toThrow("服务正在更新");
    await expect(client.sendPhrase("another", "chat_01")).rejects.toThrow("连接牌桌");
    await expect(client.sendPhrase(game.id, "custom" as never)).rejects.toThrow("固定短句");
    expect(ws.sent.filter(item => item.type === "phrase")).toHaveLength(0);
  });
  it("断线拒绝未确认请求，重连能力恢复但不重放或重发短句", async () => {
    vi.useFakeTimers();
    const { client, ws, game, message } = online();
    ws.receive({ type: "phrase", message: message() });
    const failed = expect(client.sendPhrase(game.id, "chat_05")).rejects.toThrow("未确认");
    ws.close(); await failed;
    expect(client.phraseMessages).toEqual([]); expect(client.state.phrasesAvailable).toBe(false);
    await vi.advanceTimersByTimeAsync(2000);
    const next = TestSocket.instances.at(-1)!; expect(next).not.toBe(ws); next.onopen?.();
    next.receive({ type: "session", id: "me", name: "我", token: "test", roomCode: game.code, commandAck: true, roomPhrases: true });
    next.receive({ type: "state", state: viewFor(game, 0) });
    expect(client.state.phrasesAvailable).toBe(true);
    expect(client.phraseMessages).toEqual([]);
    expect(next.sent.filter(item => item.type === "phrase")).toHaveLength(0);
    ws.receive({ type: "phrase", message: message({ id: "late-old-socket" }) });
    expect(client.phraseMessages).toEqual([]);
  });
});

describe("客户端短句只保留当前桌的短期消息", () => {
  it("合法消息触发订阅，重复ID不重复；过期自动清除", async () => {
    vi.useFakeTimers();
    const { client, ws, message } = online();
    const update = vi.fn(); client.subscribe(update);
    ws.receive({ type: "phrase", message: message() });
    expect(client.phraseMessages).toHaveLength(1); expect(update).toHaveBeenCalledOnce();
    ws.receive({ type: "phrase", message: message() });
    expect(update).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(ROOM_PHRASE_TTL_MS + 1);
    expect(client.phraseMessages).toEqual([]); expect(update).toHaveBeenCalledTimes(2);
  });
  it("保留最多8条，拒绝错桌/错身份/过期/未知ID/未来时间；不写存储", () => {
    const { client, ws, message } = online();
    vi.mocked(localStorage.setItem).mockClear();
    for (let i = 0; i < 12; i++) ws.receive({ type: "phrase", message: message({ id: `message-${i}` }) });
    expect(client.phraseMessages).toHaveLength(ROOM_PHRASE_HISTORY_LIMIT);
    expect(client.phraseMessages[0].id).toBe("message-4");
    for (const patch of [{ game: "wrong" }, { seat: 0 as const }, { sender: "spoof" },
      { at: Date.now() - ROOM_PHRASE_TTL_MS - 1 }, { at: Date.now() + 60000 }, { phrase: "__proto__" as never }])
      ws.receive({ type: "phrase", message: message({ id: "bad", ...patch }) });
    expect(client.phraseMessages).toHaveLength(ROOM_PHRASE_HISTORY_LIMIT);
    expect(client.phraseMessages.some(item => item.id === "bad")).toBe(false);
    expect(localStorage.setItem).not.toHaveBeenCalled();
  });
  it("换桌立刻清空并拒绝旧桌未确认发送", async () => {
    const { client, ws, game, message } = online();
    ws.receive({ type: "phrase", message: message() });
    const failed = expect(client.sendPhrase(game.id, "chat_01")).rejects.toThrow("未确认");
    game.id = "new-table"; ws.receive({ type: "state", state: viewFor(game, 0) });
    await failed; expect(client.phraseMessages).toEqual([]);
  });
});
