import { afterEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { makeServer } from "../server/service";
import { DEFAULT_TABLE_SETTINGS } from "../shared/table-settings";
import type { ClientMessage, ServerMessage } from "../shared/types";
import { seedTestAdmin, registerTestPort, peerCredential } from "./account-fixtures";

const servers: ReturnType<typeof makeServer>[] = [], sockets: WebSocket[] = [], directories: string[] = [];
afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.close();
  for (const server of servers.splice(0)) await server.close();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});
async function boot(file?: string) {
  if (!file) { const dir = mkdtempSync(join(tmpdir(), "mahjong-phrases-")); directories.push(dir); file = join(dir, "test.sqlite"); }
  await seedTestAdmin(file);
  const server = makeServer({ database: file, host: "127.0.0.1", port: 0, tickMs: 60000 });
  servers.push(server);
  const port = await server.listen(); registerTestPort(port);
  return { server, port, file };
}
async function peer(port: number, name: string, token?: string) {
  token ??= await peerCredential(port, name);
  const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`), messages: ServerMessage[] = [];
  sockets.push(socket);
  socket.on("message", raw => messages.push(JSON.parse(String(raw))));
  await new Promise<void>(resolve => socket.once("open", resolve));
  const send = (message: ClientMessage | Record<string, unknown>) => socket.send(JSON.stringify(message));
  async function read<T extends ServerMessage["type"]>(type: T, match: (message: Extract<ServerMessage, { type: T }>) => boolean = () => true): Promise<Extract<ServerMessage, { type: T }>> {
    const until = Date.now() + 4000;
    while (Date.now() < until) {
      const index = messages.findIndex(message => message.type === type && match(message as never));
      if (index >= 0) return messages.splice(index, 1)[0] as never;
      await new Promise(resolve => setTimeout(resolve, 5));
    }
    throw Error(`Waiting for ${type}: ${messages.map(message => message.type).join(",")}`);
  }
  send({ type: "hello", token, name });
  const session = await read("session");
  return { socket, messages, send, read, session };
}
async function tableFixture() {
  const service = await boot();
  const peers = [] as Awaited<ReturnType<typeof peer>>[];
  for (const name of ["短句甲", "短句乙", "短句丙", "短句丁", "另一桌"]) peers.push(await peer(service.port, name));
  peers[0].send({ type: "createTables", count: 2, creationId: randomUUID(),
    settings: { ...DEFAULT_TABLE_SETTINGS, name: "短句验证", readyMode: "manual", autoRenew: false }, rules: { turnSeconds: 0 } });
  const created = await peers[0].read("tablesCreated"), codes = created.codes;
  for (let seat = 0; seat < 4; seat++) {
    peers[seat].send({ type: "join", code: codes[0], seat });
    await peers[seat].read("state", message => message.state.players[seat]?.id === peers[seat].session.id);
  }
  peers[4].send({ type: "join", code: codes[1], seat: 0 });
  await peers[4].read("state", message => message.state.code === codes[1]);
  for (const player of peers.slice(0, 4)) player.send({ type: "ready" });
  const current = await peers[0].read("state", message => message.state.phase === "playing");
  return { ...service, peers, game: current.state.id, code: current.state.code, otherGame: service.server.games.get(codes[1])!.id };
}

describe("固定短句真实WebSocket闭环", () => {
  it("四个真实连接互相收到同一条短句，另一桌不收；不改牌局或数据库历史", async () => {
    const { server, file, peers, game, code } = await tableFixture();
    const before = JSON.stringify(server.games.get(code));
    const database = new DatabaseSync(file);
    const stored = String(database.prepare("SELECT state FROM rooms WHERE id=?").get(game)!.state);
    try {
      for (let seat = 0; seat < 4; seat++) {
        expect(peers[seat].session.roomPhrases).toBe(true);
        const requestId = `phrase-seat-${seat}`;
        const phrase = `chat_${String(seat + 1).padStart(2, "0")}`;
        peers[seat].send({ type: "phrase", game, phrase, requestId });
        const delivered = await Promise.all(peers.slice(0, 4).map(player => player.read("phrase")));
        expect(new Set(delivered.map(message => message.message.id)).size).toBe(1);
        for (const message of delivered) expect(message.message).toMatchObject({
          game, sender: peers[seat].session.id, name: peers[seat].session.name, seat, phrase,
        });
        expect((await peers[seat].read("ack", ack => ack.requestId === requestId)).requestId).toBe(requestId);
      }
      peers[4].send({ type: "ping", sentAt: 123 }); await peers[4].read("pong");
      expect(peers[4].messages.some(message => message.type === "phrase")).toBe(false);
      expect(JSON.stringify(server.games.get(code))).toBe(before);
      expect(String(database.prepare("SELECT state FROM rooms WHERE id=?").get(game)!.state)).toBe(stored);
      expect(database.prepare("SELECT COUNT(*) AS n FROM round_records").get()!.n).toBe(0);
    } finally { database.close(); }
  });

  it("拒绝陌生短句、自定义文字、冒名字段和跨桌请求；重复请求只确认，频率限制生效", async () => {
    const { peers, game, otherGame } = await tableFixture();
    const host = peers[0];
    for (const [requestId, patch] of [
      ["invalid-id", { phrase: "chat_99" }],
      ["custom-text", { text: "用户自定义文本" }],
      ["spoof-identity", { sender: peers[1].session.id, seat: 1, name: "冒名" }],
      ["wrong-table", { game: otherGame }],
    ] as const) {
      host.send(Object.assign({ type: "phrase", game, phrase: "chat_01", requestId }, patch));
      expect((await host.read("error", error => error.requestId === requestId)).requestId).toBe(requestId);
    }
    const packet = { type: "phrase", game, phrase: "chat_01", requestId: "one-accepted" };
    host.send(packet);
    await Promise.all(peers.slice(0, 4).map(player => player.read("phrase")));
    await host.read("ack", ack => ack.requestId === packet.requestId);
    host.send(packet);
    await host.read("ack", ack => ack.requestId === packet.requestId);
    expect(peers.slice(0, 4).every(player => !player.messages.some(message => message.type === "phrase"))).toBe(true);
    host.send({ ...packet, phrase: "chat_02", requestId: "too-soon" });
    expect((await host.read("error", error => error.requestId === "too-soon")).message).toContain("发送太快");
    peers[4].send({ ...packet, requestId: "outsider" });
    expect((await peers[4].read("error", error => error.requestId === "outsider")).message).toContain("对应的联机牌桌");
    expect(peers[4].messages.some(message => message.type === "phrase")).toBe(false);
  });

  it("未认证连接不能发送，断线重连与服务重启均不补发短句历史", async () => {
    const { server, file, peers, port, game } = await tableFixture();
    const anonymous = new WebSocket(`ws://127.0.0.1:${port}/ws`); sockets.push(anonymous);
    const unauthenticated: any[] = []; anonymous.on("message", raw => unauthenticated.push(JSON.parse(String(raw))));
    await new Promise<void>(resolve => anonymous.once("open", resolve));
    anonymous.send(JSON.stringify({ type: "phrase", game, phrase: "chat_01", requestId: "not-authenticated" }));
    await new Promise<void>(resolve => anonymous.once("close", () => resolve()));
    expect(unauthenticated.some(message => message.type === "error" && message.code === "AUTH_REQUIRED")).toBe(true);
    peers[0].send({ type: "phrase", game, phrase: "chat_12", requestId: "before-reconnect" });
    await Promise.all(peers.slice(0, 4).map(player => player.read("phrase")));
    await peers[0].read("ack", ack => ack.requestId === "before-reconnect");
    const back = await peer(port, peers[0].session.name, peers[0].session.token);
    await back.read("state", message => message.state.id === game);
    back.send({ type: "ping", sentAt: 321 }); await back.read("pong");
    expect(back.messages.some(message => message.type === "phrase")).toBe(false);
    await server.close(); servers.splice(servers.indexOf(server), 1);
    const restarted = await boot(file), restored = await peer(restarted.port, peers[0].session.name, peers[0].session.token);
    await restored.read("state", message => message.state.id === game);
    restored.send({ type: "ping", sentAt: 322 }); await restored.read("pong");
    expect(restored.session.roomPhrases).toBe(true);
    expect(restored.messages.some(message => message.type === "phrase")).toBe(false);
  });
});
