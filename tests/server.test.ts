import { afterEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { makeServer } from "../server/service";
import { seedTestAdmin, registerTestPort, peerCredential } from "./account-fixtures";
import { botAction } from "../shared/engine";
import { version } from "../package.json";
import type {
  ClientMessage,
  Game,
  Seat,
  ServerMessage,
  View,
} from "../shared/types";
const active: ReturnType<typeof makeServer>[] = [],
  sockets: WebSocket[] = [],
  directories: string[] = [];
afterEach(async () => {
  for (const s of sockets.splice(0)) s.close();
  for (const s of active.splice(0)) await s.close();
  for (const d of directories.splice(0))
    rmSync(d, { recursive: true, force: true });
});
function databasePath() {
  const directory = mkdtempSync(join(tmpdir(), "jinling-server-"));
  directories.push(directory);
  return join(directory, "test.sqlite");
}
async function boot(database = ":memory:") {
  if (database === ":memory:") database = databasePath();
  await seedTestAdmin(database);
  const s = makeServer({ database, port: 0, tickMs: 60000 });
  active.push(s);
  const port = await s.listen();
  registerTestPort(port);
  return { s, port };
}
async function stop(s: ReturnType<typeof makeServer>) {
  await s.close();
  active.splice(active.indexOf(s), 1);
}
async function peer(port: number, name: string, token?: string) {
  token ??= await peerCredential(port, name);
  const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  sockets.push(socket);
  const messages: ServerMessage[] = [];
  let latest: View | null = null;
  socket.on("message", (data) => {
    const m = JSON.parse(String(data));
    messages.push(m);
    if (m.type === "state") latest = m.state;
  });
  await new Promise<void>((r) => socket.on("open", r));
  const send = (m: ClientMessage) => socket.send(JSON.stringify(m));
  async function read<T extends ServerMessage["type"]>(
    type: T,
    match: (message: Extract<ServerMessage, { type: T }>) => boolean = () =>
      true,
  ): Promise<Extract<ServerMessage, { type: T }>> {
    const until = Date.now() + 4000;
    while (Date.now() < until) {
      const i = messages.findIndex((m) => m.type === type && match(m as never));
      if (i >= 0) return messages.splice(i, 1)[0] as never;
      await new Promise((r) => setTimeout(r, 10));
    }
    throw Error(
      `Timed out waiting for ${type}: ${messages.map((m) => m.type).join(",")}`,
    );
  }
  send({ type: "hello", name, token });
  const session = await read("session");
  return { socket, send, read, session, latest: () => latest };
}
describe("真实 WebSocket 房间服务", () => {
  it("服务消息带服务器时间，校时原样回传标识但不接受客户端时间改变牌局", async () => {
    const { s, port } = await boot();
    const host = await peer(port, "校时房主");
    expect(host.session.timeSync).toBe(true);
    expect(host.session.serverVersion).toBe(version);
    expect(Math.abs(host.session.serverNow! - Date.now())).toBeLessThan(2000);
    host.send({ type: "create" });
    const update = await host.read("state");
    const before = JSON.stringify(s.games.get(update.state.code));
    for (const sentAt of [0, 9_999_999_999_999, -1]) {
      const start = Date.now();
      host.send({ type: "ping", sentAt });
      const pong = await host.read("pong");
      expect(pong.sentAt).toBe(sentAt);
      expect(pong.serverNow).toBeGreaterThanOrEqual(start);
      expect(pong.serverNow).toBeLessThanOrEqual(Date.now());
    }
    expect(JSON.stringify(s.games.get(update.state.code))).toBe(before);
  });
  it("保存并推送成功状态后确认操作，失败携带同一个请求标识", async () => {
    const {s, port} = await boot();
    const host = await peer(port, "房主");
    expect(host.session.commandAck).toBe(true);
    host.send({type: "create"});
    const {state} = await host.read("state");
    host.send({type: "ready", requestId: "ready-1"});
    const ack = await host.read("ack");
    expect(ack.requestId).toBe("ready-1");
    expect(host.latest()!.players[0]!.ready).toBe(true);
    expect(s.games.get(state.code)!.players[0]!.ready).toBe(true);
    host.send({type: "action", action: {type: "hu"}, revision: state.revision, requestId: "bad-action"});
    expect((await host.read("error")).requestId).toBe("bad-action");
    expect(s.games.get(state.code)!.phase).toBe("waiting");
  });

  it("旧版本遗留的四人已准备等待桌，在重启后房主回桌时恢复开局", async () => {
    const file = databasePath();
    const first = await boot(file), host = await peer(first.port, "房主");
    host.send({type: "create"});
    const {state} = await host.read("state");
    for (let i = 0; i < 3; i++) host.send({type: "addBot"});
    await host.read("state", m => m.state.players.every(Boolean));
    await stop(first.s);
    const db = new DatabaseSync(file);
    const saved = JSON.parse(String(db.prepare("SELECT state FROM rooms WHERE id=?").get(state.id)!.state)) as Game;
    saved.players.forEach(p => p!.ready = true);
    db.prepare("UPDATE rooms SET state=? WHERE id=?").run(JSON.stringify(saved), saved.id);
    db.close();
    const resumed = await boot(file);
    expect(resumed.s.games.get(state.code)!.phase).toBe("waiting");
    const back = await peer(resumed.port, "房主", host.session.token);
    const restored = (await back.read("state")).state;
    expect(restored.phase).toBe("playing");
    expect(restored.round).toBe(1);
    expect(restored.players[0]!.hand).toHaveLength(14);
  });
  it.each([1, 2, 3])("%i 位真人先准备，再补齐陪练也会自动开局，而且只发一次牌", async (humans) => {
    const { s, port } = await boot();
    const peers = await Promise.all(Array.from({length: humans}, (_, i) => peer(port, `牌友${i}`)));
    const host = peers[0];
    host.send({type: "create"});
    const {state} = await host.read("state");
    for (const p of peers.slice(1)) {
      p.send({type: "join", code: state.code});
      await p.read("state");
    }
    for (const p of peers) {
      p.send({type: "ready"});
      await p.read("state", m => m.state.players[m.state.me]!.ready);
    }
    for (let count = humans; count < 4; count++) {
      expect(s.games.get(state.code)!.phase).toBe("waiting");
      host.send({type: "addBot"});
      if (count < 3) await host.read("state", m => m.state.players.filter(Boolean).length === count + 1);
    }
    const playing = (await host.read("state", m => m.state.phase === "playing")).state;
    expect(playing.round).toBe(1);
    expect(playing.players[0]!.hand).toHaveLength(14);
    const before = structuredClone(s.games.get(state.code));
    host.send({type: "ready"});
    await host.read("error");
    expect(s.games.get(state.code)).toEqual(before);
  });

  it("已准备的真人离线时不发牌，回桌后自动开局", async () => {
    const {s, port} = await boot();
    const a = await peer(port, "房主"), b = await peer(port, "牌友");
    a.send({type: "create"});
    const {state} = await a.read("state");
    b.send({type: "join", code: state.code});
    await b.read("state");
    b.send({type: "ready"});
    await a.read("state", m => !!m.state.players[1]?.ready);
    b.socket.close();
    await a.read("state", m => m.state.players[1]?.online === false);
    a.send({type: "addBot"}); a.send({type: "addBot"}); a.send({type: "ready"});
    await a.read("state", m => m.state.players.every(p => p?.ready));
    expect(s.games.get(state.code)!.phase).toBe("waiting");
    const back = await peer(port, "牌友", b.session.token);
    expect((await back.read("state")).state.phase).toBe("playing");
    expect((await a.read("state", m => m.state.phase === "playing")).state.round).toBe(1);
  });

  it("房主离桌后转交给在座真人，后加入更靠前空位的玩家不能夺走房主", async () => {
    const { s, port } = await boot();
    const [a, b, c] = await Promise.all(
      ["甲", "乙", "丙"].map((n) => peer(port, n)),
    );
    a.send({ type: "create" });
    const { state } = await a.read("state");
    expect(state.ownerId).toBe(a.session.id);
    b.send({ type: "join", code: state.code });
    await b.read("state");
    a.send({ type: "leave" });
    await a.read("left");
    await b.read("state", (m) => m.state.ownerId === b.session.id);
    c.send({ type: "join", code: state.code });
    const joined = (await c.read("state")).state;
    expect(joined.me).toBe(0);
    expect(joined.ownerId).toBe(b.session.id);
    c.send({ type: "addBot" });
    expect((await c.read("error")).message).toContain("房主");
    b.send({ type: "addBot" });
    await b.read("state", (m) => m.state.players.some((p) => !!p?.bot));
    b.socket.close();
    await c.read("state", (m) => m.state.players[1]?.online === false);
    expect(s.games.get(state.code)!.ownerId).toBe(b.session.id);
    const rejoined = await peer(port, "乙", b.session.token);
    expect((await rejoined.read("state")).state.ownerId).toBe(b.session.id);
  });

  it("数据库拒绝写入时，准备、加入和离桌均不提前改变内存或确认成功", async () => {
    const file = databasePath();
    const { s, port } = await boot(file);
    const [a, b] = await Promise.all(["甲", "乙"].map((n) => peer(port, n)));
    a.send({ type: "create" });
    const { state } = await a.read("state");
    const before = structuredClone(s.games.get(state.code)!);
    const control = new DatabaseSync(file);
    try {
      control.exec(
        "CREATE TRIGGER reject_write BEFORE INSERT ON rooms BEGIN SELECT RAISE(FAIL, 'simulated disk failure'); END; CREATE TRIGGER reject_delete BEFORE DELETE ON rooms BEGIN SELECT RAISE(FAIL, 'simulated disk failure'); END;",
      );
      a.send({ type: "ready" });
      expect((await a.read("error")).message).toContain("本次操作未生效");
      expect(s.games.get(state.code)).toEqual(before);
      b.send({ type: "join", code: state.code });
      expect((await b.read("error")).message).toContain("本次操作未生效");
      expect(s.games.get(state.code)).toEqual(before);
      a.send({ type: "leave" });
      expect((await a.read("error")).message).toContain("本次操作未生效");
      expect(a.latest()!.code).toBe(state.code);
      expect(s.games.get(state.code)).toEqual(before);
      expect(
        JSON.parse(
          String(
            control
              .prepare("SELECT state FROM rooms WHERE id = ?")
              .get(before.id)!.state,
          ),
        ),
      ).toEqual(before);
      control.exec("DROP TRIGGER reject_write; DROP TRIGGER reject_delete;");
      a.send({ type: "ready" });
      await a.read("state", (m) => m.state.players[0]!.ready);
      b.send({ type: "join", code: state.code });
      await b.read("state");
      a.send({ type: "leave" });
      await a.read("left");
      await b.read("state", (m) => m.state.ownerId === b.session.id);
      b.send({ type: "leave" });
      await b.read("left");
      expect(s.games.has(state.code)).toBe(false);
      expect(control.prepare("SELECT COUNT(*) AS n FROM rooms").get()!.n).toBe(
        0,
      );
    } finally {
      control.exec(
        "DROP TRIGGER IF EXISTS reject_write; DROP TRIGGER IF EXISTS reject_delete;",
      );
      control.close();
    }
  });

  it("出牌保存失败不消耗牌或版本号，数据库恢复后同一操作可以重试", async () => {
    const file = databasePath();
    const { s, port } = await boot(file);
    const peers = await Promise.all(
      ["甲", "乙", "丙", "丁"].map((n) => peer(port, n)),
    );
    peers[0].send({ type: "create" });
    const { state } = await peers[0].read("state");
    for (const p of peers.slice(1)) {
      p.send({ type: "join", code: state.code });
      await p.read("state");
    }
    for (const p of peers) p.send({ type: "ready" });
    await peers[0].read("state", (m) => m.state.phase === "playing");
    const before = structuredClone(s.games.get(state.code)!);
    const message: ClientMessage = {
      type: "action",
      revision: before.revision,
      action: { type: "discard", tile: before.players[0]!.hand[0] },
    };
    const control = new DatabaseSync(file);
    try {
      control.exec(
        "CREATE TRIGGER reject_write BEFORE INSERT ON rooms BEGIN SELECT RAISE(FAIL, 'simulated disk failure'); END;",
      );
      peers[0].send(message);
      expect((await peers[0].read("error")).message).toContain(
        "本次操作未生效",
      );
      expect(s.games.get(state.code)).toEqual(before);
      expect(
        JSON.parse(
          String(
            control
              .prepare("SELECT state FROM rooms WHERE id = ?")
              .get(before.id)!.state,
          ),
        ),
      ).toEqual(before);
      control.exec("DROP TRIGGER reject_write;");
      peers[0].send(message);
      const after = (
        await peers[0].read("state", (m) => m.state.revision > before.revision)
      ).state;
      expect(after.revision).toBe(before.revision + 1);
      expect(after.players[0]!.hand).not.toContain(before.players[0]!.hand[0]);
      peers[0].send(message);
      expect((await peers[0].read("error")).message).toContain("已更新");
      expect(s.games.get(state.code)!.revision).toBe(after.revision);
    } finally {
      control.exec("DROP TRIGGER IF EXISTS reject_write;");
      control.close();
    }
  });

  it.each(["playing", "claiming", "ended"] as const)(
    "服务真正关闭并重启后恢复 %s 阶段，原会话回桌继续",
    async (phase) => {
      const file = databasePath();
      const { s, port } = await boot(file);
      const peers = await Promise.all(
        ["甲", "乙", "丙", "丁"].map((n) => peer(port, n)),
      );
      peers[0].send({ type: "create", rules: { turnSeconds: 60 } });
      const { state } = await peers[0].read("state");
      for (const p of peers.slice(1)) {
        p.send({ type: "join", code: state.code });
        await p.read("state");
      }
      for (const p of peers) p.send({ type: "ready" });
      await peers[0].read("state", (m) => m.state.phase === "playing");
      for (
        let step = 0;
        s.games.get(state.code)!.phase !== phase && step < 1000;
        step++
      ) {
        const g = s.games.get(state.code)!;
        expect(["playing", "claiming"]).toContain(g.phase);
        const seat = (
          g.phase === "playing"
            ? g.turn
            : Object.keys(g.pending!.offers)
                .map(Number)
                .find((i) => g.pending!.replies[i as Seat] === undefined)
        ) as Seat;
        const action = botAction(g, seat)!;
        peers[seat].send({ type: "action", revision: g.revision, action });
        await peers[0].read("state", (m) => m.state.revision > g.revision);
      }
      const before = structuredClone(s.games.get(state.code)!);
      expect(before.phase).toBe(phase);
      await stop(s);
      const resumed = await boot(file);
      const after = resumed.s.games.get(state.code)!;
      const gameplay = (g: Game) => {
        const { deadline, revision, players, ...rest } = g;
        return {
          ...rest,
          players: players.map((p) => {
            const { online, disconnectedAt, trustee, trusteeLocked, resumedDeadline, ...player } = p!;
            return player;
          }),
        };
      };
      expect(JSON.parse(JSON.stringify(gameplay(after)))).toEqual(
        JSON.parse(JSON.stringify(gameplay(before))),
      );
      expect(after.players.every((p) => !p!.online)).toBe(true);
      expect(after.players.every((p) => !p!.trustee)).toBe(true);
      if (phase !== "ended")
        expect(after.deadline - Date.now()).toBeGreaterThan(55000);
      const back = await Promise.all(
        peers.map((p) => peer(resumed.port, p.session.name, p.session.token)),
      );
      for (let i = 0; i < 4; i++) {
        expect(back[i].session.roomCode).toBe(state.code);
        const restored = (await back[i].read("state")).state;
        expect(restored.me).toBe(i);
        expect(restored.players[i]!.trustee).toBe(false);
        if (phase !== "ended")
          expect(restored.players[i]!.hand).toEqual(before.players[i]!.hand);
        if (phase !== "ended")
          for (let j = 0; j < 4; j++)
            if (i !== j) expect(restored.players[j]!.hand).toEqual([]);
      }
      const current = resumed.s.games.get(state.code)!;
      if (phase === "ended") {
        for (const p of back) p.send({ type: "ready" });
        const next = await back[0].read("state", (m) => m.state.round === before.round + 1);
        expect(next.state.history).toEqual(before.history);
      } else {
        const seat = (
          phase === "playing"
            ? current.turn
            : Object.keys(current.pending!.offers)
                .map(Number)
                .find((i) => current.pending!.replies[i as Seat] === undefined)
        ) as Seat;
        back[seat].send({
          type: "action",
          revision: current.revision,
          action: botAction(current, seat)!,
        });
        const next = await back[seat].read(
          "state",
          (m) => m.state.revision > current.revision,
        );
        expect(next.state.round).toBe(before.round);
      }
    },
  );

  it("同一窗口两家胡牌可用原版本响应，重复请求不能改写响应或再次结算", async () => {
    const { s, port } = await boot();
    const peers = await Promise.all(
      ["甲", "乙", "丙", "丁"].map((n) => peer(port, n)),
    );
    peers[0].send({ type: "create" });
    const { state } = await peers[0].read("state");
    for (const p of peers.slice(1)) {
      p.send({ type: "join", code: state.code });
      await p.read("state");
    }
    const g = s.games.get(state.code)!;
    g.phase = "claiming";
    g.round = 1;
    g.deadline = Date.now() + 30000;
    const before = g.revision;
    g.pending = {
      openedAtRevision: before,
      tile: 120,
      from: 0,
      kind: "discard",
      offers: { 1: ["hu", "pass"], 2: ["hu", "pass"] },
      replies: {},
    };
    g.players[1]!.hand = [0, 1, 2, 3, 4, 5, 9, 10, 11, 18, 19, 20, 30].map(
      (k) => k * 4 + 1,
    );
    g.players[2]!.hand = [0, 1, 2, 3, 4, 5, 12, 13, 14, 21, 22, 23, 30].map(
      (k) => k * 4 + 2,
    );
    peers[1].send({ type: "action", revision: before, action: { type: "hu" }, requestId: "winner-1" });
    await peers[1].read("ack", m => m.requestId === "winner-1");
    const firstResponse = structuredClone(s.games.get(state.code));
    // The claim-window revision exception must not let one seat answer twice.
    for (const requestId of ["winner-1", "winner-duplicate-new-id"]) {
      peers[1].send({ type: "action", revision: before, action: { type: "pass" }, requestId });
      await peers[1].read("error", m => m.requestId === requestId);
      expect(s.games.get(state.code)).toEqual(firstResponse);
    }
    peers[2].send({ type: "action", revision: before, action: { type: "hu" } });
    const ended = await peers[0].read(
      "state",
      (m) => m.state.phase === "ended",
    );
    expect(ended.state.result!.winners).toEqual([1, 2]);
    expect(ended.state.result!.deltas.reduce((a, b) => a + b, 0)).toBe(0);
    const settled = structuredClone(s.games.get(state.code));
    for (const requestId of ["winner-1", "winner-retry-after-settlement"]) {
      peers[1].send({ type: "action", revision: before, action: { type: "hu" }, requestId });
      await peers[1].read("error", m => m.requestId === requestId);
      expect(s.games.get(state.code)).toEqual(settled);
    }
  });
  it("创建加入、四人准备、屏蔽手牌、拒绝过期与重复出牌", async () => {
    const { s, port } = await boot();
    const peers = await Promise.all(
      ["甲", "乙", "丙", "丁"].map((n) => peer(port, n)),
    );
    peers[0].send({ type: "create" });
    const created = await peers[0].read("state");
    const code = created.state.code;
    for (const p of peers.slice(1)) {
      p.send({ type: "join", code });
      await p.read("state");
    }
    for (const p of peers) p.send({ type: "ready" });
    const states = await Promise.all(
      peers.map((p) => p.read("state", (m) => m.state.phase === "playing")),
    );
    for (let i = 0; i < 4; i++) {
      const v = states[i].state;
      expect(v.me).toBe(i);
      expect(v.players[i]!.hand).toHaveLength(i === 0 ? 14 : 13);
      expect(v).not.toHaveProperty("wall");
      for (let j = 0; j < 4; j++)
        if (j !== i) expect(v.players[j]!.hand).toEqual([]);
    }
    peers[0].send({
      type: "action",
      revision: -100,
      action: { type: "discard", tile: states[0].state.players[0]!.hand[0] },
    });
    expect((await peers[0].read("error")).message).toContain("已更新");
    peers[1].send({
      type: "action",
      revision: states[1].state.revision,
      action: { type: "discard", tile: states[1].state.players[1]!.hand[0] },
    });
    expect((await peers[1].read("error")).message).toContain("还没轮到");
    const action = { type: "discard" as const, tile: states[0].state.players[0]!.hand[0] };
    peers[0].send({ type: "action", revision: states[0].state.revision, action, requestId: "discard-once" });
    await peers[0].read("ack", m => m.requestId === "discard-once");
    const accepted = structuredClone(s.games.get(code));
    for (const requestId of ["discard-once", "duplicate-discard-new-id"]) {
      peers[0].send({ type: "action", revision: states[0].state.revision, action, requestId });
      await peers[0].read("error", m => m.requestId === requestId);
      expect(s.games.get(code)).toEqual(accepted);
    }
  });
  it("持有随机会话凭证才能恢复自己的座位，冒用昵称不能恢复", async () => {
    const { port } = await boot();
    const a = await peer(port, "甲");
    a.send({ type: "create" });
    const created = await a.read("state");
    a.socket.close();
    await new Promise((r) => setTimeout(r, 30));
    const b = await peer(port, "甲", a.session.token);
    const recovered = await b.read("state");
    expect(recovered.state.code).toBe(created.state.code);
    expect(b.session.id).toBe(a.session.id);
    const c = await peer(port, "甲");
    expect(c.session.id).not.toBe(a.session.id);
    c.send({ type: "action", revision: 0, action: { type: "hu" } });
    expect((await c.read("error")).message).toContain("请先创建");
  });
  it("无凭证消息、畸形 JSON 与非法昵称不会使服务崩溃", async () => {
    const { port } = await boot();
    const p = await peer(port, "测试");
    p.socket.send("{no-json");
    expect((await p.read("error")).message.length).toBeGreaterThan(0);
    p.send({ type: "join", code: "../private" });
    expect((await p.read("error")).message).toContain("6 位");
    const response = await fetch(`http://127.0.0.1:${port}/api/health`);
    expect((await response.json()).ok).toBe(true);
  });
  it("房主才能补电脑，房间坐满后拒绝第五人", async () => {
    const { port } = await boot();
    const a = await peer(port, "甲"),
      b = await peer(port, "乙");
    a.send({ type: "create" });
    const { state } = await a.read("state");
    b.send({ type: "join", code: state.code });
    await b.read("state");
    b.send({ type: "addBot" });
    expect((await b.read("error")).message).toContain("房主");
    a.send({ type: "addBot" });
    a.send({ type: "addBot" });
    await a.read("state", (m) => m.state.players.every(Boolean));
    const c = await peer(port, "丙");
    c.send({ type: "join", code: state.code });
    expect((await c.read("error")).message).toContain("坐满");
  });
});
