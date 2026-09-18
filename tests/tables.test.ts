import { afterEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { makeServer } from "../server/service";
import {
  seedTestAdmin,
  registerTestPort,
  peerCredential,
} from "./account-fixtures";
import { botAction } from "../shared/engine";
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
  const s = makeServer({ database, port: 0, tickMs: 25 });
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

import type { TableSettings } from "../shared/types";
async function createTables(
  p: Awaited<ReturnType<typeof peer>>,
  settings: Partial<TableSettings> = {},
  count = 1,
  creationId = "setup-1",
  rules: Partial<Game["rules"]> = {},
) {
  p.send({
    type: "createTables",
    settings: {
      readyMode: "auto",
      continuousRounds: false,
      overtimePerTurn: false,
      ...settings,
    },
    // Keep lifecycle fixtures uncapped; B-profile bankruptcy has dedicated coverage.
    rules: { id: "nj-garden-v2", twoBankrupt: false, ...rules },
    count,
    creationId,
    requestId: creationId,
  });
  const { codes } = await p.read("tablesCreated");
  await p.read("ack", (m) => m.requestId === creationId);
  return codes;
}
async function fill(port: number, code: string) {
  const players = await Promise.all(
    ["东家", "南家", "西家", "北家"].map((n) => peer(port, n)),
  );
  for (let seat = 0; seat < 4; seat++) {
    players[seat].send({ type: "join", code, seat: seat as Seat });
    await players[seat].read("state");
  }
  return players;
}
async function win(
  s: ReturnType<typeof makeServer>,
  code: string,
  player: Awaited<ReturnType<typeof peer>>,
  seat: Seat = 0,
) {
  const g = s.games.get(code)!;
  g.phase = "playing";
  g.turn = seat;
  g.canSelfWin = true;
  // This helper represents a later ordinary win, not a newly dealt heavenly win.
  if(g.ruleState) {g.ruleState.heavenlyEligible=false;g.ruleState.heavenlyWaits={};}
  g.pending = undefined;
  g.deadline = Date.now() + 30000;
  g.players[seat]!.hand = [
    0, 4, 8, 36, 40, 44, 72, 76, 80, 108, 109, 110, 112, 113,
  ];
  g.players[seat]!.melds = [];
  g.lastDraw = 113;
  player.send({ type: "action", revision: g.revision, action: { type: "hu" } });
  return (
    await player.read(
      "state",
      (m) =>
        ["ended", "finished"].includes(m.state.phase) &&
        m.state.round === g.round,
    )
  ).state;
}
describe("建桌大厅真实联机", () => {
  it("新版每把展示10秒自动续局，离线等待；四人提前确认可跳过，最后一把不再发牌", async () => {
    const { s, port } = await boot(),
      host = await peer(port, "连续开桌人");
    const [code] = await createTables(host, {
      continuousRounds: true,
      overtimePerTurn: true,
      autoRenew: false,
    });
    const ps = await fill(port, code);
    await ps[0].read("state", (m) => m.state.phase === "playing");
    const ended = await win(s, code, ps[0]);
    expect(ended.history.at(-1)!.hands).toHaveLength(4);
    expect(ended.players.every((p) => p!.hand.length > 0)).toBe(true);
    let g = s.games.get(code)!;
    g.history.at(-1)!.at = Date.now() - 9000;
    await new Promise((r) => setTimeout(r, 75));
    expect(s.games.get(code)!.phase).toBe("ended");
    ps[2].socket.close();
    await ps[0].read("state", (m) => m.state.players[2]?.online === false);
    s.games.get(code)!.history.at(-1)!.at = Date.now() - 10001;
    await new Promise((r) => setTimeout(r, 75));
    expect(s.games.get(code)!.phase).toBe("ended");
    ps[2] = await peer(port, "西家", ps[2].session.token);
    await ps[0].read(
      "state",
      (m) => m.state.round === 2 && m.state.phase === "playing",
    );
    expect(s.games.get(code)!.players.map((p) => p!.score)).toEqual(
      ended.players.map((p) => p!.score),
    );
    await win(s, code, ps[0]);
    for (let i = 0; i < 3; i++) {
      ps[i].send({ type: "ready", requestId: `next-${i}` });
      await ps[i].read("ack", (m) => m.requestId === `next-${i}`);
    }
    expect(s.games.get(code)!.round).toBe(2);
    ps[3].send({ type: "ready" });
    await ps[0].read(
      "state",
      (m) => m.state.round === 3 && m.state.phase === "playing",
    );
    s.games.get(code)!.rules.rounds = 3;
    const final = await win(s, code, ps[0]);
    expect(final.phase).toBe("finished");
    s.games.get(code)!.table!.finishedAt = Date.now() - 11000;
    await new Promise((r) => setTimeout(r, 75));
    expect(s.games.get(code)!.round).toBe(3);
    expect(s.games.get(code)!.phase).toBe("finished");
  });
  it("一把结束后可提前手动准备，展示期过后仍等待离线牌友，重连才发下一把", async () => {
    const { s, port } = await boot();
    const host = await peer(port, "续局开桌人");
    const [code] = await createTables(host, {
      readyMode: "manual",
      resultSeconds: 5,
    });
    const players = await fill(port, code);
    for (let seat = 0; seat < 4; seat++) {
      players[seat].send({ type: "ready" });
      await players[seat].read(
        "state",
        (m) => !!m.state.players[seat]?.ready || m.state.phase === "playing",
      );
    }
    const ended = await win(s, code, players[0]);
    expect(ended.phase).toBe("ended");
    expect(ended.players.every((p) => p && !p.ready)).toBe(true);
    for (let seat = 0; seat < 4; seat++) {
      players[seat].send({ type: "ready" });
      await players[seat].read(
        "state",
        (m) => m.state.phase === "ended" && !!m.state.players[seat]?.ready,
      );
    }
    expect(s.games.get(code)!.round).toBe(1);
    players[2].socket.close();
    await players[0].read("state", (m) => m.state.players[2]?.online === false);
    s.games.get(code)!.history.at(-1)!.at = Date.now() - 6000;
    await new Promise((r) => setTimeout(r, 100));
    expect(s.games.get(code)!.phase).toBe("ended");
    const back = await peer(port, "西家", players[2].session.token);
    const next = (await back.read("state", (m) => m.state.round === 2)).state;
    expect(next.phase).toBe("playing");
    expect(next.players.every((p) => p?.online)).toBe(true);
    expect(next.history).toHaveLength(1);
  });
  it("空桌批量创建原子保存、重复提交不多开、重启保留设置和房号", async () => {
    const file = databasePath(),
      a = await boot(file),
      host = await peer(a.port, "开桌人");
    const codes = await createTables(
      host,
      { name: "周末八局", readyMode: "manual", autoRenew: false },
      3,
    );
    expect(a.s.games.size).toBe(3);
    expect(codes).toHaveLength(3);
    expect(
      [...a.s.games.values()].every((g) => g.players.every((p) => p === null)),
    ).toBe(true);
    expect(await createTables(host, {}, 3)).toEqual(codes);
    expect(a.s.games.size).toBe(3);
    host.send({
      type: "createTables",
      settings: {},
      count: 3,
      creationId: "over-limit",
    });
    expect((await host.read("error")).message).toContain("最多");
    await stop(a.s);
    const old = new DatabaseSync(file);
    old.prepare("UPDATE rooms SET updated_at=?").run(Date.now() - 2 * 86400000);
    old.close();
    const b = await boot(file),
      back = await peer(b.port, "开桌人", host.session.token);
    expect([...b.s.games.keys()].sort()).toEqual(codes.sort());
    back.send({ type: "tables" });
    const listing = await back.read("tables");
    expect(
      listing.tables.every(
        (t) =>
          t.managed &&
          t.settings.readyMode === "manual" &&
          !t.settings.autoRenew,
      ),
    ).toBe(true);
  });
  it("数据库故障不出现半批桌子，恢复后同一创建标识可重试", async () => {
    const file = databasePath(),
      { s, port } = await boot(file),
      host = await peer(port, "开桌人"),
      db = new DatabaseSync(file);
    try {
      db.exec(
        "CREATE TRIGGER fail_second BEFORE INSERT ON rooms WHEN (SELECT COUNT(*) FROM rooms)>=1 BEGIN SELECT RAISE(FAIL,'disk full'); END;",
      );
      host.send({
        type: "createTables",
        settings: {},
        count: 3,
        creationId: "retry",
      });
      expect((await host.read("error")).message).toContain("未生效");
      expect(s.games.size).toBe(0);
      expect(db.prepare("SELECT COUNT(*) AS n FROM rooms").get()!.n).toBe(0);
      db.exec("DROP TRIGGER fail_second");
      expect(await createTables(host, {}, 3, "retry")).toHaveLength(3);
    } finally {
      db.close();
    }
  });
  it("大厅桌序号跨批次和创建者唯一，重试不占号，收桌后复用最小空号", async () => {
    const { s, port } = await boot(),
      host = await peer(port, "桌序号管理员"),
      other = await peer(port, "另一位开桌人");
    const granted = await fetch(`http://127.0.0.1:${port}/api/admin/table-permissions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${host.session.token}`,
      },
      body: JSON.stringify({ accountId: other.session.id, canCreateTables: true }),
    });
    expect(granted.status).toBe(200);
    const numbers = (codes: string[]) => codes.map((code) => s.games.get(code)!.table!.number);
    const first = await createTables(host, {}, 2, "number-first");
    expect(numbers(first)).toEqual([1, 2]);
    const second = await createTables(host, {}, 1, "number-second");
    expect(numbers(second)).toEqual([3]);
    expect(await createTables(host, {}, 2, "number-first")).toEqual(first);
    expect(s.games.size).toBe(3);
    const anotherOwner = await createTables(other, {}, 2, "number-other");
    expect(numbers(anotherOwner)).toEqual([4, 5]);
    host.send({ type: "closeTable", code: first[1], requestId: "free-number-two" });
    await host.read("ack", (m) => m.requestId === "free-number-two");
    expect(s.games.has(first[1])).toBe(false);
    const replacements = await createTables(host, {}, 2, "number-reuse");
    expect(numbers(replacements)).toEqual([2, 6]);
    expect(await createTables(other, {}, 2, "number-other")).toEqual(anotherOwner);
    expect(s.games.size).toBe(6);
    expect([...s.games.values()].map((g) => g.table!.number).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6]);
    host.send({ type: "tables" });
    const listing = await host.read("tables", (m) => m.tables.length === 6);
    expect(listing.tables.map((t) => t.number).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6]);
    s.games.get(replacements[0])!.table!.createdAt = Date.now() + 60_000;
    const visitor = await peer(port, "按序看桌的牌友");
    visitor.send({ type: "tables" });
    const ordered = await visitor.read("tables", (m) => m.tables.length === 6);
    expect(ordered.tables.map((t) => t.number)).toEqual([1, 2, 3, 4, 5, 6]);
  });
  it.each([
    { label: "重复桌序号", numbers: [1, 2, 3, 4, 2], expected: [1, 5, 3, 4, 2] },
    { label: "非法桌序号", numbers: [1, 0, 3, 4, -2], expected: [1, 5, 3, 4, 2] },
  ])("重启修复$label保留合法序号、房号、设置和玩家积分，再重启稳定", async ({ numbers, expected }) => {
    const file = databasePath(),
      original = await boot(file),
      host = await peer(original.port, "旧桌序号管理员");
    const codes = await createTables(
      host,
      { readyMode: "manual", name: "保留原设置", autoRenew: false, scoreMultiplier: 0.2 },
      5,
      "legacy-numbers",
    );
    await fill(original.port, codes[1]);
    await stop(original.s);
    const db = new DatabaseSync(file);
    const seeded = codes.map((code, index) => {
      const game = JSON.parse(String(db.prepare("SELECT state FROM rooms WHERE json_extract(state, '$.code')=?").get(code)!.state)) as Game;
      game.table!.number = numbers[index];
      // The last-created DB row owns the earlier legitimate number 2. Fixing
      // a duplicate must not renumber already unique tables 3 and 4.
      game.table!.createdAt = [100, 500, 300, 400, 200][index];
      game.players.forEach((p, seat) => { if (p) p.score = [16, 8, 150, 186][seat]; });
      db.prepare("UPDATE rooms SET state=? WHERE id=?").run(JSON.stringify(game), game.id);
      return game;
    });
    db.close();
    const repaired = await boot(file);
    expect([...repaired.s.games.keys()].sort()).toEqual([...codes].sort());
    for (let index = 0; index < codes.length; index++) {
      const game = repaired.s.games.get(codes[index])!;
      expect(game.id).toBe(seeded[index].id);
      expect(game.table).toEqual({ ...seeded[index].table, number: expected[index] });
      expect(game.rules).toEqual(seeded[index].rules);
      expect(game.players.map((p) => p && { id: p.id, score: p.score })).toEqual(
        seeded[index].players.map((p) => p && { id: p.id, score: p.score }),
      );
    }
    const persisted = new DatabaseSync(file);
    for (const game of seeded) {
      const stored = JSON.parse(String(persisted.prepare("SELECT state FROM rooms WHERE id=?").get(game.id)!.state)) as Game;
      expect(stored.table!.number).toBe(repaired.s.games.get(game.code)!.table!.number);
      expect(stored.code).toBe(game.code);
    }
    persisted.close();
    await stop(repaired.s);
    const stable = await boot(file);
    expect(codes.map((code) => stable.s.games.get(code)!.table!.number)).toEqual(expected);
    expect(codes.map((code) => stable.s.games.get(code)!.id)).toEqual(seeded.map((g) => g.id));
  });
  it("大厅只列公开桌和自己的房号桌，昵称隐藏不泄露手牌", async () => {
    const { s, port } = await boot(),
      host = await peer(port, "开桌人"),
      visitor = await peer(port, "访客");
    const [publicCode] = await createTables(host, { privacy: "lobby" }),
      [privateCode] = await createTables(
        host,
        { visibility: "code" },
        1,
        "private",
      );
    host.send({ type: "join", code: publicCode });
    await host.read("state");
    visitor.send({ type: "tables" });
    const { tables } = await visitor.read("tables");
    expect(tables.map((t) => t.code)).toEqual([publicCode]);
    expect(tables[0].seats[0]!.name).toBe("牌友1");
    expect(tables[0]).not.toHaveProperty("wall");
    expect(tables[0].seats[0]).not.toHaveProperty("hand");
    visitor.send({ type: "join", code: privateCode, seat: 2 });
    expect((await visitor.read("state")).state.me).toBe(2);
    expect(s.games.get(privateCode)!.phase).toBe("waiting");
  });
  it("三人不发牌，第四真人入座自动开始，座位争抢不重复入座", async () => {
    const { s, port } = await boot(),
      host = await peer(port, "开桌人"),
      [code] = await createTables(host);
    const ps = await Promise.all(
      ["甲", "乙", "丙", "丁", "第五人"].map((n) => peer(port, n)),
    );
    for (let i = 0; i < 3; i++) {
      ps[i].send({ type: "join", code, seat: i as Seat });
      await ps[i].read("state");
    }
    expect(s.games.get(code)!.phase).toBe("waiting");
    expect(s.games.get(code)!.players[0]!.hand).toHaveLength(0);
    ps[0].send({ type: "addBot" });
    expect((await ps[0].read("error")).message).toContain("真人");
    ps[3].send({ type: "join", code, seat: 3 });
    ps[4].send({ type: "join", code, seat: 3 });
    const v = (await ps[3].read("state", (m) => m.state.phase === "playing"))
      .state;
    expect((await ps[4].read("error")).message).toMatch(/开局|座位/);
    expect(v.round).toBe(1);
    expect(v.me).toBe(3);
    expect(v.players[3]!.hand).toHaveLength(13);
    expect(v.players[0]!.hand).toEqual([]);
    expect(s.games.get(code)!.players.map((p) => p!.id)).toEqual(
      ps.slice(0, 4).map((p) => p.session.id),
    );
  });
  it("手动准备和离线门槛服务端生效，四人回到在线后恢复开局", async () => {
    const { s, port } = await boot(),
      host = await peer(port, "开桌人"),
      [code] = await createTables(host, { readyMode: "manual" }),
      ps = await fill(port, code);
    expect(s.games.get(code)!.phase).toBe("waiting");
    for (const p of ps.slice(0, 3)) p.send({ type: "ready" });
    await ps[3].read("state", (m) =>
      m.state.players.slice(0, 3).every((p) => p!.ready),
    );
    ps[0].socket.close();
    await ps[3].read("state", (m) => !m.state.players[0]!.online);
    ps[3].send({ type: "ready" });
    await ps[3].read("state", (m) => m.state.players.every((p) => p!.ready));
    expect(s.games.get(code)!.phase).toBe("waiting");
    const back = await peer(port, "甲回来了", ps[0].session.token);
    expect(
      (await back.read("state", (m) => m.state.phase === "playing")).state
        .round,
    ).toBe(1);
  });
  it("未准备和离线自动离座仅在首局前执行；空桌不被删除", async () => {
    const { s, port } = await boot(),
      host = await peer(port, "开桌人"),
      [code] = await createTables(host, {
        readyMode: "manual",
        kickUnready: true,
        kickAfterSeconds: 10,
      });
    const p = await peer(port, "迟到牌友");
    p.send({ type: "join", code });
    await p.read("state");
    s.games.get(code)!.players[0]!.joinedAt = Date.now() - 60000;
    await new Promise((r) => setTimeout(r, 100));
    expect(s.games.get(code)!.players[0]!.id).toBe(p.session.id);
    expect(s.games.get(code)!.table!.readyDeadline).toBeUndefined();
    const others = await Promise.all(
      ["二", "三", "四"].map((name) => peer(port, name)),
    );
    for (const other of others) {
      other.send({ type: "join", code });
      await other.read("state");
      other.send({ type: "ready" });
    }
    await p.read("state", (m) =>
      m.state.players.slice(1).every((x) => x?.ready),
    );
    expect(s.games.get(code)!.table!.readyDeadline).toBeGreaterThan(Date.now());
    s.games.get(code)!.table!.readyDeadline = Date.now() - 1;
    expect((await p.read("left")).lobby).toBe(true);
    expect(s.games.get(code)!.players[0]).toBeNull();
    expect(
      s.games
        .get(code)!
        .players.slice(1)
        .every((x) => x?.ready),
    ).toBe(true);
    expect(s.games.get(code)!.table!.readyDeadline).toBeUndefined();
    p.send({ type: "join", code, requestId: "join-again" });
    await p.read("ack", (m) => m.requestId === "join-again");
    expect(s.games.get(code)!.table!.readyDeadline).toBeGreaterThan(Date.now());
    p.socket.close();
    await host.read("tables", (m) =>
      m.tables.some((t) => t.seats[0]?.online === false),
    );
    s.games.get(code)!.players[0]!.disconnectedAt = Date.now() - 11000;
    await host.read("tables", (m) =>
      m.tables.some((t) => t.code === code && t.seats[0] === null),
    );
    expect(s.games.has(code)).toBe(true);
  });
  it("关闭托管时无限时且拒绝开启托管或矛盾的离线开局", async () => {
    const { s, port } = await boot(),
      host = await peer(port, "开桌人");
    host.send({
      type: "createTables",
      settings: { trusteeMode: "disabled", offlineStart: true },
      count: 1,
      creationId: "invalid",
    });
    expect((await host.read("error")).message).toContain("在线");
    const [code] = await createTables(host, { trusteeMode: "disabled" }),
      ps = await fill(port, code);
    expect(s.games.get(code)!.deadline).toBe(0);
    expect(s.games.get(code)!.rules.turnSeconds).toBe(0);
    ps[0].send({ type: "trustee", enabled: true });
    expect((await ps[0].read("error")).message).toContain("关闭托管");
    const revision = s.games.get(code)!.revision;
    await new Promise((r) => setTimeout(r, 100));
    expect(s.games.get(code)!.revision).toBe(revision);
  });
  it("单局托管结束后暂停，结算展示完仍须本人确认才开下一局", async () => {
    const { s, port } = await boot(),
      host = await peer(port, "开桌人"),
      [code] = await createTables(host, {
        trusteeMode: "round",
        resultSeconds: 5,
      }),
      ps = await fill(port, code);
    s.games.get(code)!.players[0]!.trustee = true;
    const ended = await win(s, code, ps[1], 1);
    expect(ended.players[0]!.awaitingReady).toBe(true);
    expect(ended.players[0]!.trustee).toBe(false);
    s.games.get(code)!.history.at(-1)!.at = Date.now() - 6000;
    await new Promise((r) => setTimeout(r, 100));
    expect(s.games.get(code)!.phase).toBe("ended");
    ps[0].send({ type: "ready" });
    const next = (await ps[0].read("state", (m) => m.state.round === 2)).state;
    expect(next.phase).toBe("playing");
    expect(next.history).toHaveLength(1);
  });
  it("自动准备在结算展示期后继续，托管连续局数达到阈值则结束", async () => {
    const { s, port } = await boot(),
      host = await peer(port, "开桌人"),
      [code] = await createTables(host, {
        trusteeMode: "afterRounds",
        trusteeRounds: 2,
        resultSeconds: 5,
      }),
      ps = await fill(port, code);
    s.games.get(code)!.players[0]!.trustee = true;
    await win(s, code, ps[1], 1);
    expect(s.games.get(code)!.phase).toBe("ended");
    s.games.get(code)!.history.at(-1)!.at = Date.now() - 6000;
    await ps[0].read(
      "state",
      (m) => m.state.round === 2 && m.state.phase === "playing",
    );
    const final = await win(s, code, ps[1], 1);
    expect(final.phase).toBe("finished");
    expect(final.table!.endReason).toContain("连续托管 2 局");
  });
  it("超时结束后换新房号续开空桌，重启保留战绩，并一次修复旧版复用房号的空桌", async () => {
    const file = databasePath(),
      { s, port } = await boot(file),
      host = await peer(port, "开桌人"),
      [code] = await createTables(host, {
        trusteeMode: "dissolve",
        resultSeconds: 5,
        privacy: "all",
      }),
      ps = await fill(port, code);
    const id = s.games.get(code)!.id;
    s.games.get(code)!.deadline = Date.now() - 91000;
    const ended = (
      await ps[0].read("state", (m) => m.state.phase === "finished")
    ).state;
    expect(ended.table!.endReason).toContain("超时");
    expect(ended.players[1]!.name).toBe("牌友2");
    expect(ended.events).toEqual([]);
    expect(s.games.get(code)!.id).toBe(id);
    s.games.get(code)!.table!.finishedAt = Date.now() - 6000;
    await ps[0].read("left");
    expect(s.games.has(code)).toBe(false);
    expect(s.games.size).toBe(1);
    const renewed = [...s.games.values()][0];
    expect(renewed.code).toMatch(/^\d{6}$/);
    expect(renewed.code).not.toBe(code);
    expect(renewed.id).not.toBe(id);
    expect(renewed.players.every((p) => p === null)).toBe(true);
    expect(renewed.table!.settings.trusteeMode).toBe("dissolve");
    const back = await peer(port, "东家", ps[0].session.token),
      records = (await back.read("records")).records;
    expect(records.some((r) => r.game === id)).toBe(true);
    expect(records[0].record.names[1]).toBe("牌友2");
    const db = new DatabaseSync(file);
    expect(
      JSON.parse(
        String(
          db.prepare("SELECT state FROM table_archives WHERE id=?").get(id)!
            .state,
        ),
      ).players.every(Boolean),
    ).toBe(true);
    db.close();
    await stop(s);
    const restarted = await boot(file);
    expect([...restarted.s.games.keys()]).toEqual([renewed.code]);
    expect(restarted.s.games.get(renewed.code)).toMatchObject({
      id: renewed.id,
      phase: "waiting",
      round: 0,
      history: [],
      players: [null, null, null, null],
    });
    const restored = await peer(restarted.port, "东家", ps[0].session.token);
    expect(
      (await restored.read("records")).records.some((r) => r.game === id),
    ).toBe(true);
    await stop(restarted.s);
    // Simulate an old release that persisted the renewed empty table under
    // the finished match's room code, while keeping the new game identity.
    const legacyDb = new DatabaseSync(file);
    const persisted = JSON.parse(
      String(legacyDb.prepare("SELECT state FROM rooms WHERE id=?").get(renewed.id)!.state),
    ) as Game;
    persisted.code = code;
    legacyDb.prepare("UPDATE rooms SET state=? WHERE id=?").run(
      JSON.stringify(persisted),
      renewed.id,
    );
    legacyDb.close();
    const repaired = await boot(file);
    expect(repaired.s.games.has(code)).toBe(false);
    expect(repaired.s.games.size).toBe(1);
    const repairedTable = [...repaired.s.games.values()][0];
    expect(repairedTable.code).toMatch(/^\d{6}$/);
    expect(repairedTable).toMatchObject({
      id: renewed.id,
      phase: "waiting",
      round: 0,
      history: [],
      players: [null, null, null, null],
      rules: renewed.rules,
      table: { settings: renewed.table!.settings },
    });
    await stop(repaired.s);
    const stable = await boot(file);
    expect([...stable.s.games.keys()]).toEqual([repairedTable.code]);
    expect(stable.s.games.get(repairedTable.code)!.id).toBe(renewed.id);
    const afterRepair = await peer(stable.port, "东家", ps[0].session.token);
    expect(
      (await afterRepair.read("records")).records.some((r) => r.game === id),
    ).toBe(true);
  });
  it.each(["twoBankrupt", "eightRounds"] as const)(
    "%s结束整桌后连续换新桌号，旧号不能再加入，战绩保留且新桌重置积分",
    async (ending) => {
      const { s, port } = await boot(),
        host = await peer(port, "续桌管理员"),
        [code] = await createTables(
          host,
          { continuousRounds: true, name: "自动续桌", scoreMultiplier: 0.2 },
          1,
          `renew-${ending}`,
          { rounds: 8, twoBankrupt: ending === "twoBankrupt" },
        ),
        ps = await fill(port, code);
      await ps[0].read("state", (m) => m.state.phase === "playing");
      const original = s.games.get(code)!;
      expect(original.rules.rounds).toBe(8);
      original.players.forEach((p) => { p!.overtimeUsedMs = 40000; });
      const finalRound = ending === "twoBankrupt" ? 1 : 8;
      async function finishMatch(activeCode: string) {
        const current = s.games.get(activeCode)!;
        if (ending === "twoBankrupt") {
          current.players.forEach(
            (p, seat) => (p!.score = [180, 0, 1, 179][seat]),
          );
          current.roundStartScores = [180, 0, 1, 179];
        }
        for (let round = 1; round <= finalRound; round++) {
          const settled = await win(s, activeCode, ps[0]);
          expect(settled.round).toBe(round);
          expect(settled.phase).toBe(
            round === finalRound ? "finished" : "ended",
          );
          if (round < finalRound) {
            s.games.get(activeCode)!.history.at(-1)!.at = Date.now() - 11000;
            await ps[0].read(
              "state",
              (m) =>
                m.state.code === activeCode &&
                m.state.round === round + 1 &&
                m.state.phase === "playing",
            );
          }
        }
      }
      await finishMatch(code);
      const finished = s.games.get(code)!;
      expect(finished.players.map((p) => p!.overtimeUsedMs)).toEqual([
        40000, 40000, 40000, 40000,
      ]);
      if (ending === "twoBankrupt")
        expect(finished.players.filter((p) => p!.score === 0)).toHaveLength(2);
      finished.table!.finishedAt = Date.now() - 11000;
      for (const p of ps) expect((await p.read("left")).lobby).toBe(true);
      expect(s.games.has(code)).toBe(false);
      expect(s.games.size).toBe(1);
      const renewed = [...s.games.values()][0];
      expect(renewed.code).toMatch(/^\d{6}$/);
      expect(renewed.code).not.toBe(code);
      expect(renewed.id).not.toBe(original.id);
      expect(renewed).toMatchObject({
        phase: "waiting",
        round: 0,
        history: [],
        initialScore: 90,
        players: [null, null, null, null],
      });
      expect(renewed.table!.settings).toEqual(finished.table!.settings);
      expect(renewed.rules).toEqual(finished.rules);
      expect(renewed.ownerId).toBe(original.ownerId);
      expect(renewed.scoreDivisor).toBe(5);
      expect(renewed.table).toMatchObject({
        creatorId: original.table!.creatorId,
        groupId: original.table!.groupId,
        number: original.table!.number,
      });
      host.send({ type: "tables" });
      const listing = await host.read("tables", (m) =>
        m.tables.some((t) => t.code === renewed.code),
      );
      expect(listing.tables.map((t) => t.code)).toEqual([renewed.code]);
      ps[0].send({ type: "join", code });
      expect((await ps[0].read("error")).message).toContain("房间不存在");
      const oldRecord = await fetch(
        `http://127.0.0.1:${port}/api/matches/${original.id}`,
        { headers: { Authorization: `Bearer ${ps[0].session.token}` } },
      );
      expect(oldRecord.status).toBe(200);
      const archived = await oldRecord.json();
      expect(archived.match.code).toBe(code);
      expect(archived.rounds).toHaveLength(finalRound);
      expect(archived.match.record.scores).toEqual(
        finished.players.map((p) => p!.score),
      );
      for (let seat = 0; seat < 4; seat++) {
        ps[seat].send({ type: "join", code: renewed.code, seat: seat as Seat });
        await ps[seat].read("state", (m) => m.state.code === renewed.code);
      }
      const restarted = (
        await ps[0].read(
          "state",
          (m) => m.state.code === renewed.code && m.state.phase === "playing",
        )
      ).state;
      expect(restarted.round).toBe(1);
      expect(restarted.history).toEqual([]);
      expect(restarted.players.map((p) => p!.score)).toEqual([90, 90, 90, 90]);
      expect(restarted.players.map((p) => p!.overtimeUsedMs ?? 0)).toEqual([
        0, 0, 0, 0,
      ]);
      await finishMatch(renewed.code);
      s.games.get(renewed.code)!.table!.finishedAt = Date.now() - 11000;
      for (const p of ps) await p.read("left");
      const next = [...s.games.values()][0];
      expect(s.games.size).toBe(1);
      expect(new Set([code, renewed.code, next.code]).size).toBe(3);
      expect(new Set([original.id, renewed.id, next.id]).size).toBe(3);
      expect(next).toMatchObject({
        phase: "waiting",
        round: 0,
        history: [],
        initialScore: 90,
        scoreDivisor: 5,
        ownerId: original.ownerId,
        players: [null, null, null, null],
        rules: original.rules,
        table: {
          creatorId: original.table!.creatorId,
          groupId: original.table!.groupId,
          number: original.table!.number,
          settings: original.table!.settings,
        },
      });
    },
  );
  it("成员不能申请解散，管理员可从大厅收起进行中的桌并禁止续桌", async () => {
    const { s, port } = await boot();
    const host = await peer(port, "管理员");
    const [empty, code] = await createTables(host, {allowDissolve:true,autoRenew:true}, 2);
    const visitor = await peer(port,"访客");
    visitor.send({type:"closeTable",code:empty});
    expect((await visitor.read("error")).message).toContain("管理员");
    host.send({type:"closeTable",code:empty,requestId:"empty-close"});
    await host.read("ack",m=>m.requestId==="empty-close");
    expect(s.games.has(empty)).toBe(false);
    const ps=await fill(port,code);
    ps[0].send({type:"dissolve",agree:true});
    expect((await ps[0].read("error")).message).toContain("只有管理员");
    expect(s.games.get(code)!.dissolve).toBeUndefined();
    expect(s.games.get(code)!.phase).toBe("playing");
    host.send({type:"closeTable",code,requestId:"active-close"});
    await host.read("ack",m=>m.requestId==="active-close");
    for(const p of ps) expect((await p.read("left")).lobby).toBe(true);
    expect(s.games.has(code)).toBe(false);
  });

});

describe("新版计时服务端执行", () => {
  for (const claim of [false, true])
    for (const expired of [false, true])
      it(`${expired ? "超时进入" : "手动开启"}托管后自动${claim ? "点炮胡" : "自摸胡牌"}`, async () => {
        const { s, port } = await boot(),
          host = await peer(port, "托管胡牌管理员");
        const [code] = await createTables(host, {
          autoRenew: false,
          overtimeSeconds: 90,
        });
        const ps = await fill(port, code);
        await ps[0].read("state", (m) => m.state.phase === "playing");
        const g = s.games.get(code)!;
        g.phase = claim ? "claiming" : "playing";
        g.turn = claim ? 1 : 0;
        g.canSelfWin = true;
        g.lastDraw = 113;
        g.players[0]!.hand = [
          0, 4, 8, 36, 40, 44, 72, 76, 80, 108, 109, 110, 112, 113,
        ];
        g.players[0]!.melds = [];
        g.players[0]!.discards = [];
        g.players[0]!.trustee = !expired;
        g.players[0]!.overtimeUsedMs = 0;
        g.overtimeCharged = [];
        g.deadline = Date.now() + (expired ? -91_000 : 30_000);
        g.pending = undefined;
        if (claim) {
          g.players[0]!.hand.pop();
          g.players[1]!.discards = [113];
          g.pending = {
            tile: 113,
            from: 1,
            kind: "discard",
            openedAtRevision: g.revision,
            offers: { 0: ["hu", "pass"] },
            replies: {},
          };
        }
        const updated = (
          await ps[0].read("state", (m) => m.state.revision > g.revision)
        ).state;
        expect(updated.result!.winners).toEqual([0]);
        expect(updated.result!.reason).toBe("hu");
        expect(updated.players[0]!.discards).toEqual([]);
        expect(updated.players[0]!.trustee).toBe(true);
        if (claim) expect(updated.players[0]!.hand).toHaveLength(13);
        if (expired) {
          expect(updated.players[0]!.trusteeLocked).toBe(false);
          expect(updated.players[0]!.overtimeUsedMs).toBe(90_000);
        }
        ps[0].send({type:"trustee",enabled:false,requestId:"single-cancel"});
        await ps[0].read("ack",m=>m.requestId==="single-cancel");
        expect(s.games.get(code)!.players[0]!.trustee).toBe(false);
      });
  it.each([true, false])(
    "旧客户端计时设置 %s 都累计扣时，取消托管不回充额度",
    async (overtimePerTurn) => {
      const { s, port } = await boot(),
        host = await peer(port, "计时管理员");
      host.send({
        type: "createTables",
        settings: { autoRenew: false, overtimePerTurn },
        count: 1,
        creationId: "default-settings",
      });
      const {
        codes: [code],
      } = await host.read("tablesCreated");
      const ps = await fill(port, code);
      expect(s.games.get(code)!.phase).toBe("waiting");
      expect(s.games.get(code)!.scoreDivisor).toBe(2);
      expect(s.games.get(code)!.table!.settings.overtimePerTurn).toBe(false);
      for (const p of ps) p.send({ type: "ready" });
      await ps[0].read("state", (m) => m.state.phase === "playing");
      let g = s.games.get(code)!;
      g.deadline = Date.now() - 6000;
      const revision = g.revision;
      ps[0].send({
        type: "action",
        revision,
        action: { type: "discard", tile: g.players[0]!.hand[0] },
      });
      await ps[0].read(
        "state",
        (m) =>
          m.state.revision > revision &&
          (m.state.players[0]?.overtimeUsedMs ?? 0) >= 6000,
      );
      g = s.games.get(code)!;
      expect(g.players[0]!.overtimeUsedMs).toBeLessThan(7500);
      expect(g.players[0]!.trustee).toBe(false);
      g.phase = "playing";
      g.pending = undefined;
      g.turn = 0;
      g.deadline = Date.now() - 91000;
      g.overtimeCharged = [];
      g.players[0]!.hand.push(35);
      await ps[0].read("state", (m) => m.state.players[0]?.trustee === true);
      expect(s.games.get(code)!.players[0]!.overtimeUsedMs).toBe(90000);
      // A room persisted by an earlier server can still carry the old lock flag.
      s.games.get(code)!.players[0]!.trusteeLocked = true;
      ps[0].send({
        type: "trustee",
        enabled: false,
        requestId: "cancel-return",
      });
      await ps[0].read("ack", (m) => m.requestId === "cancel-return");
      expect(s.games.get(code)!.players[0]!.trusteeLocked).toBe(false);
      expect(s.games.get(code)!.players[0]!.overtimeUsedMs).toBe(90000);
    },
  );
  it("重启保持剩余额度与本次原始截止时间；三档倍率持久化并用于续桌", async () => {
    const file = databasePath(),
      a = await boot(file),
      host = await peer(a.port, "倍率管理员");
    const codes = await createTables(host, { scoreMultiplier: 0.2 }, 3);
    expect(codes.every((code) => a.s.games.get(code)!.scoreDivisor === 5)).toBe(
      true,
    );
    const ps = await fill(a.port, codes[0]);
    await ps[0].read("state", (m) => m.state.phase === "playing");
    const g = a.s.games.get(codes[0])!;
    // Simulate a game persisted by the previous per-decision release.
    g.table!.settings.overtimePerTurn = true;
    g.players[0]!.overtimeUsedMs = 42000;
    const deadline = Date.now() + 80000;
    g.deadline = deadline;
    ps[1].send({ type: "trustee", enabled: false, requestId: "persist-clock" });
    await ps[1].read("ack", (m) => m.requestId === "persist-clock");
    await stop(a.s);
    const b = await boot(file),
      restored = b.s.games.get(codes[0])!;
    expect(restored.deadline).toBe(deadline);
    expect(restored.players[0]!.overtimeUsedMs).toBe(42000);
    expect(restored.table!.settings.overtimePerTurn).toBe(false);
    expect(restored.scoreDivisor).toBe(5);
  });
});

it("同桌语音只转发当前同桌，鉴权、格式和速率均受限制，不进入回放", async () => {
  const { encodeVoice } = await import("../shared/room-voice");
  const { s, port } = await boot(),
    host = await peer(port, "语音管理员");
  const [code] = await createTables(host);
  const ps = await fill(port, code);
  const g = s.games.get(code)!;
  const route = `http://127.0.0.1:${port}/api/voice/${g.id}`;
  const bytes = encodeVoice(
    Float32Array.from({ length: 16000 }, (_, i) => Math.sin(i * 0.1) * 0.2),
    16000,
  );
  const send = (token: string, body = bytes, url = route) =>
    fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "audio/wav",
        Authorization: `Bearer ${token}`,
      },
      body: new Uint8Array(body),
    });
  expect((await send("")).status).toBe(401);
  expect((await send(host.session.token)).status).toBe(403);
  expect(
    (await send(ps[0].session.token, bytes, route + "-other")).status,
  ).toBe(403);
  expect((await send(ps[0].session.token, new Uint8Array(50))).status).toBe(
    400,
  );
  const outside: any[] = [];
  host.socket.on("message", (raw) => {
    const m = JSON.parse(String(raw));
    if (m.type === "voice") outside.push(m);
  });
  const before = JSON.stringify(g);
  const res = await send(ps[1].session.token);
  expect(res.status).toBe(200);
  const receipt = await res.json();
  for (const p of ps) {
    const { message } = await p.read("voice");
    expect(message.id).toBe(receipt.id);
    expect(message.audio).toBe(Buffer.from(bytes).toString("base64"));
    expect(message.duration).toBe(1);
    expect(message.seat).toBe(1);
  }
  expect(outside).toEqual([]);
  expect(JSON.stringify(s.games.get(code))).toBe(before);
  expect((await send(ps[1].session.token)).status).toBe(429);
  expect((await send(ps[2].session.token, new Uint8Array(500000))).status).toBe(
    413,
  );
});

describe('正式服务器机器人体验桌',()=>{
  it('体验桌按原设置续桌并保留三名已准备机器人，等待真人再开局',async()=>{
    const {s,port}=await boot(), host=await peer(port,'管理员');
    const [source]=await createTables(host,{autoRenew:true,readyMode:'manual',resultSeconds:5});
    host.send({type:'createExperienceTable',sourceCode:source});
    const code=(await host.read('tablesCreated')).codes[0];
    host.send({type:'join',code});
    await host.read('state',m=>m.state.code===code);
    host.send({type:'ready'});
    await host.read('state',m=>m.state.phase==='playing');
    const original=s.games.get(code)!;
    original.phase='finished';
    original.table!.finishedAt=Date.now()-11000;
    await host.read('left');
    expect(s.games.has(code)).toBe(false);
    const renewed=[...s.games.values()].find(g=>g.table?.experience)!;
    expect(renewed.code).not.toBe(code);
    expect(renewed.phase).toBe('waiting');
    expect(renewed.players[0]).toBeNull();
    expect(renewed.players.slice(1).every(p=>p?.bot&&p.ready&&p.score===90)).toBe(true);
    expect(renewed.table!.settings).toEqual(original.table!.settings);
    expect(renewed.rules).toEqual(original.rules);
    expect(renewed.table!.experience).toEqual({sourceCode:source});
  });
  it('只允许管理员创建，复制正式桌配置，三机器人和真人走同一开局流程，可重启恢复和收桌',async()=>{
    const database=databasePath();
    let {s,port}=await boot(database);
    const host=await peer(port,'管理员');
    const [source]=await createTables(host,{autoRenew:true,readyMode:'manual',overtimeSeconds:87,resultSeconds:5,scoreMultiplier:0.2});
    const member=await peer(port,'体验成员');
    member.send({type:'createExperienceTable',sourceCode:source});
    expect((await member.read('error')).message).toContain('只有管理员');
    host.send({type:'createExperienceTable',sourceCode:source,requestId:'experience'});
    const code=(await host.read('tablesCreated')).codes[0];
    await host.read('ack',m=>m.requestId==='experience');
    const original=s.games.get(source)!, room=s.games.get(code)!;
    expect(room.rules).toEqual(original.rules);
    expect(room.table!.settings).toEqual(original.table!.settings);
    expect(room.players[0]).toBeNull();
    expect(room.players.slice(1).every(p=>p?.bot&&p.ready)).toBe(true);
    expect(room.phase).toBe('waiting');
    host.send({type:'createExperienceTable',sourceCode:source});
    expect((await host.read('tablesCreated')).codes).toEqual([code]);
    member.send({type:'join',code});
    await member.read('state',m=>m.state.players[0]?.id===member.session.id);
    expect(s.games.get(code)!.phase).toBe('waiting');
    member.send({type:'ready'});
    await member.read('state',m=>m.state.phase==='playing');
    expect(s.games.get(code)!.players.filter(p=>p?.bot)).toHaveLength(3);
    await stop(s);
    ({s,port}=await boot(database));
    expect(s.games.get(code)!.table!.experience).toEqual({sourceCode:source});
    expect(s.games.get(code)!.players.filter(p=>p?.bot)).toHaveLength(3);
    const admin=await peer(port,'管理员');
    admin.send({type:'closeTable',code,requestId:'remove-experience'});
    await admin.read('ack',m=>m.requestId==='remove-experience');
    expect(s.games.has(code)).toBe(false);
    expect(s.games.has(source)).toBe(true);
  });
});
