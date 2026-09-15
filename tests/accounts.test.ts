import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocket } from "ws";
import { makeServer } from "../server/service";
import { accountSchema, provisionAdministrator } from "../server/accounts";
import { createRecords } from "../server/records";
import { createGame, newPlayer, seats } from "../shared/engine";
import { settlementRows } from "../shared/settlement";
import { externalRound } from "./fixtures/external-round";
import type { Game, RoundRecord, ServerMessage } from "../shared/types";
const password = "Tests-Only-Passphrase-42",
  directories: string[] = [],
  active: ReturnType<typeof makeServer>[] = [],
  sockets: WebSocket[] = [];
afterEach(async () => {
  for (const ws of sockets.splice(0)) ws.close();
  for (const s of active.splice(0)) await s.close();
  for (const path of directories.splice(0))
    rmSync(path, { recursive: true, force: true });
});
async function boot(forcePassword = false, tickMs = 60000) {
  const directory = mkdtempSync(join(tmpdir(), "jinling-accounts-"));
  directories.push(directory);
  const file = join(directory, "test.sqlite"),
    seed = new DatabaseSync(file);
  await provisionAdministrator(seed, {
    username: "guanli@1",
    password,
    mustChangePassword: forcePassword,
  });
  seed.close();
  const server = makeServer({
    database: file,
    port: 0,
    host: "127.0.0.1",
    tickMs,
  });
  active.push(server);
  const port = await server.listen(),
    base = `http://127.0.0.1:${port}`;
  async function request(path: string, body?: unknown, token?: string) {
    const response = await fetch(base + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  }
  async function auth(username: string, admin = false) {
    const result = (
      await request(`/api/auth/${admin ? "login" : "register"}`, {
        username,
        password,
        name: username,
      })
    ).body;
    if (result.account) {
      const fixtureDb = new DatabaseSync(file);
      fixtureDb
        .prepare("INSERT OR REPLACE INTO team_memberships VALUES (?,?,?,?,?)")
        .run(result.account.id, "team-1", 0, "test-fixture", Date.now());
      fixtureDb.close();
    }
    return result;
  }
  return { server, port, file, base, request, auth };
}
async function socket(port: number, token?: string) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  sockets.push(ws);
  const queue: ServerMessage[] = [];
  ws.on("message", (raw) => queue.push(JSON.parse(String(raw))));
  await new Promise<void>((resolve) => ws.once("open", resolve));
  function send(message: object) {
    ws.send(JSON.stringify(message));
  }
  async function read(type: ServerMessage["type"]) {
    const until = Date.now() + 3000;
    while (Date.now() < until) {
      const index = queue.findIndex((m) => m.type === type);
      if (index >= 0) return queue.splice(index, 1)[0] as any;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    throw Error(`Missing ${type}: ${JSON.stringify(queue)}`);
  }
  send({ type: "hello", name: "任意昵称", token });
  return { ws, send, read };
}
function fixtureMatch(index: number, ids = ["p0", "p1", "p2", "p3"]) {
  const g = createGame(String(700001 + index), `match-${index}`, { rounds: 8 });
  g.players = seats.map((seat) =>
    newPlayer(ids[seat], ["刘连", "小雪", "可爱多", "激情岁月"][seat]),
  );
  g.round = 8;
  g.phase = "finished";
  g.players.forEach((p, i) => (p!.score = [210, 130, -10, 30][i]));
  for (let round = 1; round <= 8; round++)
    g.history.push({
      id: `${g.id}-${round}`,
      round,
      at: Date.now() + index,
      names: g.players.map((p) => p!.name),
      scores: g.players.map((p) => p!.score),
      result: {
        reason: "draw",
        winners: [],
        details: {},
        deltas: [0, 0, 0, 0],
      },
      initialScore: 90,
      scoreDivisor: 2,
    });
  g.result = g.history.at(-1)!.result;
  return g;
}
describe("正式账号和管理员权限", () => {
  it("反馈接口与其他接口一致拒绝过期会话和未改初始密码的管理员", async () => {
    const expired = await boot();
    const user = await expired.auth("expiredfb");
    const db = new DatabaseSync(expired.file);
    db.prepare("UPDATE sessions SET last_seen=? WHERE id=?").run(
      Date.now() - 31 * 86400000,
      user.account.id,
    );
    db.close();
    expect(
      (
        await expired.request(
          "/api/feedback",
          { message: "过期会话反馈" },
          user.token,
        )
      ).status,
    ).toBe(401);
    const initial = await boot(true);
    const admin = await initial.auth("guanli@1", true);
    expect(
      (
        await initial.request(
          "/api/feedback",
          { message: "未修改初始密码" },
          admin.token,
        )
      ).status,
    ).toBe(403);
  });
  it("管理员账号不能被抢注，注册不能声明管理员，密码只保存派生哈希", async () => {
    const { request, auth, file } = await boot();
    expect(
      (
        await request("/api/auth/register", {
          username: "GUANLI@1",
          password,
          name: "冒用",
        })
      ).status,
    ).toBe(400);
    const response = await request("/api/auth/register", {
      username: "member1",
      password,
      name: "普通牌友",
      role: "admin",
      canCreateTables: true,
    });
    expect(response.body.account.role).toBe("member");
    expect(response.body.account.canCreateTables).toBe(false);
    expect(response.body.account).not.toHaveProperty("password_hash");
    const db = new DatabaseSync(file),
      stored = db
        .prepare("SELECT password_hash FROM accounts WHERE username='member1'")
        .get()!;
    db.close();
    expect(stored.password_hash).toMatch(/^scrypt-v1:/);
    expect(stored.password_hash).not.toContain(password);
    expect(
      (await request("/api/admin/records", undefined, response.body.token))
        .status,
    ).toBe(403);
    expect((await request("/api/admin/records")).status).toBe(401);
    const admin = await auth("guanli@1", true);
    expect(admin.account.role).toBe("admin");
  });
  it("匿名无法连桌，会员不能绕过界面使用新旧两条开桌接口，四个账号入座从90分开始", async () => {
    const { auth, port } = await boot();
    const anonymous = await socket(port);
    expect((await anonymous.read("error")).code).toBe("AUTH_REQUIRED");
    const member = await auth("member1"),
      peer = await socket(port, member.token);
    await peer.read("session");
    for (const command of [
      { type: "create", role: "admin" },
      { type: "createTables", count: 1, settings: {}, creationId: "fake" },
      { type: "closeTable", code: "123456" },
    ]) {
      peer.send(command);
      expect((await peer.read("error")).message).toContain("管理员");
    }
    const admin = await auth("guanli@1", true),
      owner = await socket(port, admin.token);
    await owner.read("session");
    owner.send({
      type: "createTables",
      count: 1,
      settings: { readyMode: "manual" },
      creationId: "real",
    });
    const code = (await owner.read("tablesCreated")).codes[0];
    peer.send({ type: "join", code });
    expect((await peer.read("state")).state.players[0].score).toBe(90);
    for (let i = 2; i <= 4; i++) {
      const next = await auth(`member${i}`),
        p = await socket(port, next.token);
      await p.read("session");
      p.send({ type: "join", code });
      const view = (await p.read("state")).state;
      expect(view.players[view.me].score).toBe(90);
      if (i === 4) expect(view.phase).toBe("waiting");
    }
  });
  it("同账号换设备旋转会话，冒用昵称无效，退出后令牌立即作废", async () => {
    const { auth, request, port } = await boot();
    const first = await auth("member1"),
      peer = await socket(port, first.token);
    await peer.read("session");
    const bad = await request("/api/auth/login", {
      username: "member1",
      password: "wrong-password",
    });
    expect(bad.status).toBe(401);
    const next = (
      await request("/api/auth/login", { username: "MEMBER1", password })
    ).body;
    expect(next.account.id).toBe(first.account.id);
    expect(next.token).not.toBe(first.token);
    expect(
      (await request("/api/auth/session", undefined, first.token)).status,
    ).toBe(401);
    const back = await socket(port, next.token);
    const session = await back.read("session");
    expect(session.name).toBe("member1");
    await request("/api/auth/logout", {}, next.token);
    expect(
      (await request("/api/auth/session", undefined, next.token)).status,
    ).toBe(401);
  });
  it("管理员初始密码必须更换，新密码登录有效，旧会话和旧密码失效", async () => {
    const { auth, request, port } = await boot(true);
    const admin = await auth("guanli@1", true);
    expect(admin.account.mustChangePassword).toBe(true);
    expect(
      (await request("/api/admin/records", undefined, admin.token)).status,
    ).toBe(403);
    const p = await socket(port, admin.token);
    expect((await p.read("error")).code).toBe("AUTH_REQUIRED");
    const response = await request(
      "/api/auth/password",
      { currentPassword: password, password: "New-test-passphrase-77" },
      admin.token,
    );
    expect(response.body.account.mustChangePassword).toBe(false);
    expect(
      (await request("/api/auth/session", undefined, admin.token)).status,
    ).toBe(401);
    expect(
      (await request("/api/auth/login", { username: "guanli@1", password }))
        .status,
    ).toBe(401);
    expect(
      (await request("/api/admin/records", undefined, response.body.token))
        .status,
    ).toBe(200);
  });
  it("连续错误登录限流，正确账号也必须等待该账号的限流窗口", async () => {
    const { request } = await boot();
    let response;
    for (let i = 0; i < 16; i++)
      response = await request("/api/auth/login", {
        username: "no-account",
        password,
      });
    expect(response!.status).toBe(429);
  });
});
describe("管理员每桌最终战绩", () => {
  it("桌外外包在战绩、回放和积分查询中一致，重复保存与重启不重算", async () => {
    const { file, auth, request, server } = await boot();
    const a = await auth("extmember");
    expect(a).toHaveProperty("account.id");
    const ids = [a.account.id, "outside-1", "outside-2", "outside-3"];
    const db = new DatabaseSync(file);
    try {
      const records = createRecords(db);
      let game = externalRound({ ids });
      records.capture(game);
      for (const multiplier of [2, 1, 2]) {
        game = externalRound({ previous: game, ids, multiplier });
        records.capture(game);
      }
      const original = structuredClone(game);
      // Re-capture cannot rewrite either the snapshot or already-booked points.
      game.rules.id = "nj-open-v2";
      game.history[3].result.externalDeltas = [999, 0, -999, 0];
      game.players[0]!.externalScore = 999;
      game.replay!.frames.at(-1)!.players[0].externalScore = 999;
      records.capture(game);
      expect(
        db
          .prepare(
            "SELECT SUM(points) points, COUNT(*) count FROM point_records WHERE account_id=?",
          )
          .get(a.account.id),
      ).toMatchObject({ points: -300, count: 4 });
      const detail = await request(
        "/api/matches/external-ledger",
        undefined,
        a.token,
      );
      expect(detail.status).toBe(200);
      expect(detail.body.match.record.externalScores).toEqual([
        -300, 0, 300, 0,
      ]);
      expect(
        detail.body.rounds.map((r: any) => r.record.result.externalDeltas[0]),
      ).toEqual([-50, -100, -50, -100]);
      expect(
        detail.body.rounds.every(
          (r: any) => r.record.rules.id === "nj-garden-v2",
        ),
      ).toBe(true);
      expect(
        (await request("/api/replays/external-ledger-4", undefined, a.token))
          .body,
      ).toEqual(original.replay);
      db.close();
      await server.close();
      active.splice(active.indexOf(server), 1);
      const restarted = makeServer({
        database: file,
        port: 0,
        host: "127.0.0.1",
      });
      active.push(restarted);
      const base = `http://127.0.0.1:${await restarted.listen()}`;
      const headers = { Authorization: `Bearer ${a.token}` };
      const restored = await (
        await fetch(base + "/api/matches/external-ledger", { headers })
      ).json();
      expect(restored).toEqual(detail.body);
      const replay = await (
        await fetch(base + "/api/replays/external-ledger-4", { headers })
      ).json();
      expect(replay).toEqual(original.replay);
    } finally {
      try {
        db.close();
      } catch {}
    }
  });
  it("5桌各8局只返回5条；进行中不显示，重复保存不重复，同房续桌另记一条，会员只能查自己", async () => {
    const { file, auth, request } = await boot();
    const admin = await auth("guanli@1", true),
      a = await auth("member1"),
      b = await auth("member2");
    const db = new DatabaseSync(file),
      records = createRecords(db);
    for (let i = 0; i < 5; i++) {
      const game = fixtureMatch(i, [a.account.id, "p1", "p2", "p3"]);
      records.capture(game);
      records.capture(game);
    }
    const unfinished = fixtureMatch(5);
    unfinished.phase = "ended";
    unfinished.round = 1;
    records.capture(unfinished);
    const finals = (await request("/api/admin/records", undefined, admin.token))
      .body;
    expect(finals.total).toBe(5);
    expect(finals.dateTotal).toBe(5);
    expect(finals.dates.reduce((n: number, d: any) => n + d.count, 0)).toBe(5);
    const hiddenDates = (await request("/api/records", undefined, b.token))
      .body;
    expect(hiddenDates.dates).toEqual([]);
    expect(hiddenDates.dateTotal).toBe(0);
    const emptyDay = (
      await request("/api/admin/records?from=0&to=1", undefined, admin.token)
    ).body;
    expect(emptyDay.total).toBe(0);
    expect(emptyDay.dates).toEqual(finals.dates);
    expect(finals.records).toHaveLength(5);
    expect(
      finals.records.every(
        (r: any) => r.record.matchFinished && r.record.round === 8,
      ),
    ).toBe(true);
    expect((await request("/api/records", undefined, a.token)).body.total).toBe(
      5,
    );
    expect((await request("/api/records", undefined, b.token)).body.total).toBe(
      0,
    );
    const detail = await request("/api/matches/match-0", undefined, a.token);
    expect(detail.status).toBe(200);
    expect(detail.body.rounds).toHaveLength(8);
    expect(new Set(detail.body.rounds.map((r: any) => r.record.id)).size).toBe(
      8,
    );
    expect(detail.body.match.record.memberIds[0]).toBe(a.account.memberId);
    expect(
      detail.body.rounds.every(
        (r: any) => r.record.memberIds[0] === a.account.memberId,
      ),
    ).toBe(true);
    db.prepare("INSERT OR REPLACE INTO round_rosters VALUES (?,?,?,?,?)").run(
      "match-0",
      1,
      a.account.id,
      "team-1",
      "一生所爱战队",
    );
    const managed = await request(
      "/api/matches/match-0",
      undefined,
      admin.token,
    );
    expect(managed.body.match.record.teamNames[0]).toBe("一生所爱战队");
    const privateView = await request(
      "/api/matches/match-0",
      undefined,
      a.token,
    );
    expect(JSON.stringify(privateView.body)).not.toContain("teamNames");
    expect(JSON.stringify(privateView.body)).not.toContain("一生所爱战队");
    expect(
      (await request("/api/matches/match-0", undefined, b.token)).status,
    ).toBe(404);
    expect((await request("/api/matches/match-0")).status).toBe(401);
    // Public IDs follow the existing privacy mode too.
    db.prepare(
      "UPDATE match_records SET private_names=1 WHERE game_id='match-0'",
    ).run();
    db.prepare(
      "UPDATE round_records SET private_names=1 WHERE game_id='match-0'",
    ).run();
    const masked = (await request("/api/matches/match-0", undefined, a.token))
      .body;
    expect(masked.match.record.memberIds.slice(1)).toEqual(["", "", ""]);
    expect(masked.rounds[0].record.names[1]).toBe("牌友2");
    const renewed = fixtureMatch(6);
    renewed.code = "700001";
    records.capture(renewed);
    const sameCode = (
      await request("/api/admin/records?code=700001", undefined, admin.token)
    ).body;
    expect(sameCode.total).toBe(2);
    expect(sameCode.dateTotal).toBe(2);
    expect(sameCode.dates.reduce((n: number, d: any) => n + d.count, 0)).toBe(
      2,
    );
    expect(new Set(sameCode.records.map((r: any) => r.game)).size).toBe(2);
    db.close();
    expect(
      (await request("/api/admin/records?from=0&to=1", undefined, admin.token))
        .body.total,
    ).toBe(0);
  });
  it("重启从归档补齐最终战绩，旧版零分局保持原口径", async () => {
    const { file, server } = await boot();
    await server.close();
    active.splice(active.indexOf(server), 1);
    const db = new DatabaseSync(file),
      old = fixtureMatch(7);
    delete old.initialScore;
    delete old.scoreDivisor;
    old.history.forEach((record) => {
      delete record.initialScore;
      delete record.scoreDivisor;
    });
    db.prepare("INSERT INTO table_archives VALUES (?,?,?)").run(
      old.id,
      JSON.stringify(old),
      Date.now(),
    );
    db.close();
    const restarted = makeServer({ database: file, port: 0 });
    active.push(restarted);
    const inspect = new DatabaseSync(file),
      rows = inspect.prepare("SELECT record FROM match_records").all();
    inspect.close();
    expect(rows).toHaveLength(1);
    const record = JSON.parse(String(rows[0].record));
    expect(record.initialScore).toBe(0);
    expect(record.scoreDivisor).toBe(1);
  });
  it("210/130/-10/30桌上分对应+120/+40/-100/-60输赢、+60/+20/-50/-30记分，不会把90分再除2", () => {
    const record = fixtureMatch(0).history[7];
    const rows = settlementRows(record).sort((a, b) => a.seat - b.seat);
    expect(rows.map((row) => row.net)).toEqual([120, 40, -100, -60]);
    expect(rows.map((row) => row.recorded)).toEqual([60, 20, -50, -30]);
    const odd = { ...record, scores: [91, 89, 90, 90] } as RoundRecord;
    expect(settlementRows(odd).map((row) => row.recorded)).toEqual([
      0.5, 0, 0, -0.5,
    ]);
  });
});

describe("可独立授予和收回开桌权限", () => {
  it("普通注册无法自授权；仅管理员能查询和授予，账号角色与全桌战绩权限不升级", async () => {
    const { request, auth } = await boot();
    const member = await auth("perm-user"),
      admin = await auth("guanli@1", true);
    for (const token of [undefined, member.token]) {
      expect(
        (await request("/api/admin/table-permissions", undefined, token))
          .status,
      ).toBe(token ? 403 : 401);
      expect(
        (
          await request(
            "/api/admin/table-permissions",
            { accountId: member.account.id, canCreateTables: true },
            token,
          )
        ).status,
      ).toBe(token ? 403 : 401);
    }
    expect(
      (
        await request(
          "/api/auth/profile",
          { name: "改名", canCreateTables: true, role: "admin" },
          member.token,
        )
      ).body.account.canCreateTables,
    ).toBe(false);
    const granted = await request(
      "/api/admin/table-permissions",
      { accountId: member.account.id, canCreateTables: true },
      admin.token,
    );
    expect(granted.status).toBe(200);
    expect(granted.body.account.role).toBe("member");
    expect(granted.body.account.canCreateTables).toBe(true);
    expect(
      (await request("/api/admin/records", undefined, member.token)).status,
    ).toBe(403);
    expect(
      (await request("/api/admin/table-permissions", undefined, member.token))
        .status,
    ).toBe(403);
    const listed = await request(
      "/api/admin/table-permissions?username=PERM-USER",
      undefined,
      admin.token,
    );
    expect(listed.body.accounts).toHaveLength(1);
    expect(Object.keys(listed.body.accounts[0]).sort()).toEqual([
      "canCreateTables",
      "id",
      "name",
      "role",
      "username",
    ]);
    expect(
      (
        await request(
          "/api/admin/table-permissions",
          { accountId: admin.account.id, canCreateTables: false },
          admin.token,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await request(
          "/api/admin/table-permissions",
          { accountId: "missing", canCreateTables: true },
          admin.token,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await request(
          "/api/admin/table-permissions",
          { accountId: member.account.id, canCreateTables: "true" },
          admin.token,
        )
      ).status,
    ).toBe(400);
  });
  it("同一连接立即获得和失去权限，只能收自己的桌；撤权后旧请求也被拦截，已开桌保持", async () => {
    const { auth, request, port, server, file } = await boot();
    const a = await auth("guanli@1", true),
      m = await auth("live-user"),
      p = await socket(port, m.token),
      owner = await socket(port, a.token);
    await p.read("session");
    await owner.read("session");
    owner.send({
      type: "createTables",
      count: 1,
      settings: {},
      creationId: "admin-table",
    });
    const other = (await owner.read("tablesCreated")).codes[0];
    const grant = () =>
      request(
        "/api/admin/table-permissions",
        { accountId: m.account.id, canCreateTables: true },
        a.token,
      );
    await grant();
    expect((await p.read("accountUpdated")).account.canCreateTables).toBe(true);
    await grant();
    await p.read("accountUpdated");
    p.send({
      type: "createTables",
      count: 1,
      settings: {},
      creationId: "owned",
    });
    const code = (await p.read("tablesCreated")).codes[0];
    p.send({ type: "closeTable", code: other });
    expect((await p.read("error")).message).toContain("自己");
    p.send({ type: "closeTable", code, requestId: "close-own" });
    await p.read("ack");
    expect(server.games.has(code)).toBe(false);
    p.send({
      type: "createTables",
      count: 1,
      settings: {},
      creationId: "keep-table",
    });
    const kept = (await p.read("tablesCreated")).codes[0];
    await request(
      "/api/admin/table-permissions",
      { accountId: m.account.id, canCreateTables: false },
      a.token,
    );
    expect((await p.read("accountUpdated")).account.canCreateTables).toBe(
      false,
    );
    for (const c of [
      { type: "create" },
      {
        type: "createTables",
        count: 1,
        settings: {},
        creationId: "keep-table",
      },
      { type: "closeTable", code: kept },
    ]) {
      p.send(c);
      expect((await p.read("error")).message).toContain("权限");
    }
    expect(server.games.has(kept)).toBe(true);
    expect(
      (await request("/api/admin/table-permissions", undefined, a.token)).body
        .total,
    ).toBe(0);
    const db = new DatabaseSync(file);
    const logs = db
      .prepare(
        "SELECT event FROM account_audit WHERE account_id=? AND event LIKE '%table-permission-changed%'",
      )
      .all(m.account.id);
    db.close();
    expect(logs).toHaveLength(2);
    expect(
      logs.every((l) => JSON.parse(String(l.event)).actorId === a.account.id),
    ).toBe(true);
  });
  it("授权持久化且不修改密码或会话，重启后仍可开桌", async () => {
    const { auth, request, server, file } = await boot();
    const a = await auth("guanli@1", true),
      m = await auth("persist-user");
    await request(
      "/api/admin/table-permissions",
      { accountId: m.account.id, canCreateTables: true },
      a.token,
    );
    await server.close();
    active.splice(active.indexOf(server), 1);
    const next = makeServer({
      database: file,
      port: 0,
      host: "127.0.0.1",
      tickMs: 60000,
    });
    active.push(next);
    const port = await next.listen();
    const p = await socket(port, m.token);
    expect((await p.read("session")).account.canCreateTables).toBe(true);
    p.send({ type: "create", rules: { rounds: 4 } });
    expect((await p.read("state")).state.phase).toBe("waiting");
  });
});

describe("授权与自动续桌", () => {
  for (const revoked of [false, true]) {
    it(`已结束的牌桌只在创建者仍有权限时自动续桌：收回=${revoked}`, async () => {
      const { auth, request, port, server } = await boot(false, 20);
      const admin = await auth("guanli@1", true);
      const member = await auth("renew-member");
      await request(
        "/api/admin/table-permissions",
        { accountId: member.account.id, canCreateTables: true },
        admin.token,
      );
      const peer = await socket(port, member.token);
      await peer.read("session");
      peer.send({
        type: "createTables",
        count: 1,
        settings: { autoRenew: true },
        creationId: "renew-permission-test",
      });
      const { codes } = await peer.read("tablesCreated");
      const original = server.games.get(codes[0])!;
      if (revoked)
        await request(
          "/api/admin/table-permissions",
          { accountId: member.account.id, canCreateTables: false },
          admin.token,
        );
      if (revoked)
        expect(server.games.get(original.code)!.table!.settings.autoRenew).toBe(
          false,
        );
      const finished = fixtureMatch(50);
      finished.code = original.code;
      finished.id = original.id;
      finished.table = { ...original.table!, finishedAt: Date.now() - 30000 };
      server.games.set(finished.code, finished);
      if (revoked) {
        await new Promise((resolve) => setTimeout(resolve, 150));
        expect(server.games.get(finished.code)?.id).toBe(finished.id);
        expect(server.games.get(finished.code)?.phase).toBe("finished");
      } else {
        const until = Date.now() + 2000;
        while (
          server.games.get(finished.code)?.id === finished.id &&
          Date.now() < until
        )
          await new Promise((resolve) => setTimeout(resolve, 10));
        expect(server.games.get(finished.code)?.id).not.toBe(finished.id);
        expect(server.games.get(finished.code)?.phase).toBe("waiting");
      }
    });
  }
});

describe("前台同步只返回本人视角", () => {
  it("同步不换连接、不推进牌局、不泄露其他人的手牌，离桌后清除旧桌", async () => {
    const { auth, port, server } = await boot();
    const account = await auth("guanli@1", true);
    const peer = await socket(port, account.token);
    const session = await peer.read("session");
    const g = createGame("765432", "resume-private");
    g.players = seats.map((i) =>
      newPlayer(i === 0 ? session.id : "friend" + i, "牌友" + i),
    );
    g.players.forEach((p, i) => {
      p!.hand = [i * 4, i * 4 + 1, i * 4 + 2];
      p!.online = true;
    });
    g.phase = "playing";
    g.revision = 7;
    g.deadline = Date.now() + 90000;
    server.games.set(g.code, g);
    peer.send({ type: "ping", sync: true, sentAt: 12 });
    const view = (await peer.read("state")).state;
    expect(view.players[0].hand).toEqual(g.players[0]!.hand);
    for (const i of [1, 2, 3]) expect(view.players[i].hand).toEqual([]);
    expect(await peer.read("pong")).toMatchObject({
      sentAt: 12,
      synced: true,
      roomCode: g.code,
    });
    expect(g.revision).toBe(7);
    expect(peer.ws.readyState).toBe(WebSocket.OPEN);
    server.games.delete(g.code);
    peer.send({ type: "ping", sync: true, sentAt: 13 });
    expect(await peer.read("pong")).toMatchObject({ sentAt: 13, synced: true });
  });
});

describe("公开会员编号", () => {
  it("旧账号补号幂等，注册编号唯一且登录、改昵称后不变", async () => {
    const legacy = new DatabaseSync(":memory:");
    legacy.exec(
      "CREATE TABLE accounts(id TEXT PRIMARY KEY,username TEXT,name TEXT,password_hash TEXT,role TEXT,must_change INTEGER,created_at INTEGER)",
    );
    legacy
      .prepare("INSERT INTO accounts VALUES (?,?,?,?,?,?,?)")
      .run("old-a", "old-a", "旧账号", "hash", "member", 0, 1);
    accountSchema(legacy);
    const before = legacy.prepare("SELECT * FROM account_numbers").all();
    expect(before[0].member_id).toBe(100001);
    accountSchema(legacy);
    expect(legacy.prepare("SELECT * FROM account_numbers").all()).toEqual(
      before,
    );
    legacy.close();
    const { auth, request } = await boot();
    const a = await auth("id-user-a"),
      b = await auth("id-user-b");
    expect(a.account.memberId).toMatch(/^\d{6,}$/);
    expect(b.account.memberId).not.toBe(a.account.memberId);
    const changed = await request(
      "/api/auth/profile",
      { name: "改过昵称" },
      a.token,
    );
    expect(changed.body.account.memberId).toBe(a.account.memberId);
    const login = await request("/api/auth/login", {
      username: "id-user-a",
      password,
    });
    expect(login.body.account.memberId).toBe(a.account.memberId);
  });
});

describe("四位密码与个人头像", () => {
  it("三位被拒绝，四位可注册、登录、修改密码，旧密码随即失效", async () => {
    const { request } = await boot();
    expect(
      (
        await request("/api/auth/register", {
          username: "short3",
          name: "短密码",
          password: "123",
        })
      ).status,
    ).toBe(400);
    const user = await request("/api/auth/register", {
      username: "short4",
      name: "四位密码",
      password: "1234",
    });
    expect(user.status).toBe(200);
    const login = await request("/api/auth/login", {
      username: "short4",
      password: "1234",
    });
    expect(login.status).toBe(200);
    expect(
      (
        await request(
          "/api/auth/password",
          { currentPassword: "1234", password: "234" },
          login.body.token,
        )
      ).status,
    ).toBe(400);
    const changed = await request(
      "/api/auth/password",
      { currentPassword: "1234", password: "2345" },
      login.body.token,
    );
    expect(changed.status).toBe(200);
    expect(
      (
        await request("/api/auth/login", {
          username: "short4",
          password: "1234",
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await request("/api/auth/login", {
          username: "short4",
          password: "2345",
        })
      ).status,
    ).toBe(200);
  });
  it("头像重新编码持久保存、同步牌桌，更新不能修改别人的头像，隐私桌隐藏头像", async () => {
    const { request, auth, base, file, port, server } = await boot();
    const owner = await auth("guanli@1", true),
      user = await auth("photo-user");
    const image =
      "data:image/png;base64," +
      (
        await sharp({
          create: {
            width: 256,
            height: 200,
            channels: 3,
            background: "#cc3a41",
          },
        })
          .png()
          .toBuffer()
      ).toString("base64");
    expect((await request("/api/auth/avatar", { image })).status).toBe(401);
    const peer = await socket(port, owner.token);
    await peer.read("session");
    peer.send({
      type: "createTables",
      count: 1,
      settings: { readyMode: "manual" },
      creationId: "avatar-table",
    });
    const code = (await peer.read("tablesCreated")).codes[0];
    peer.send({ type: "join", code });
    await peer.read("state");
    const saved = await request(
      "/api/auth/avatar",
      { image, accountId: user.account.id },
      owner.token,
    );
    expect(saved.status).toBe(200);
    const path = saved.body.account.avatar;
    expect(path).toMatch(/^\/api\/avatars\/[a-f0-9-]{36}\/[a-f0-9]{64}\.jpg$/);
    const live = await peer.read("state");
    expect(live.state.players[live.state.me].avatar).toBe(path);
    const photo = await fetch(base + path);
    expect(photo.headers.get("content-type")).toBe("image/jpeg");
    const bytes = Buffer.from(await photo.arrayBuffer()),
      meta = await sharp(bytes).metadata();
    expect([meta.width, meta.height]).toEqual([192, 192]);
    expect(meta.exif).toBeUndefined();
    const db = new DatabaseSync(file);
    expect(db.prepare("SELECT account_id FROM account_avatars").all()).toEqual([
      { account_id: owner.account.id },
    ]);
    db.close();
    const other = await socket(port, user.token);
    await other.read("session");
    other.send({ type: "join", code });
    const otherView = (await other.read("state")).state;
    expect(
      otherView.players.find((p: any) => p?.id === owner.account.id).avatar,
    ).toBe(path);
    server.games.get(code)!.table!.settings.privacy = "all";
    other.send({ type: "ready" });
    let privateView = (await other.read("state")).state;
    while (privateView.table.settings.privacy !== "all")
      privateView = (await other.read("state")).state;
    expect(
      privateView.players.find((p: any) => p?.id === owner.account.id).avatar,
    ).toBeUndefined();
    // Verify persistence via another authenticated account read as well.
    expect(
      (await request("/api/auth/session", undefined, owner.token)).body.account
        .avatar,
    ).toBe(path);
    expect(
      (await request("/api/auth/session", undefined, user.token)).body.account
        .avatar,
    ).toBeUndefined();
    expect(
      (await request("/api/auth/avatar", { image: null }, owner.token)).status,
    ).toBe(200);
    expect((await fetch(base + path)).status).toBe(404);
    expect(
      (await request("/api/auth/session", undefined, owner.token)).body.account
        .avatar,
    ).toBeUndefined();
  });
  it("拒绝伪造图片、SVG、超限内容及过期登录，不影响已有头像", async () => {
    const { request, auth, file } = await boot();
    const user = await auth("bad-photo");
    for (const image of [
      "https://example.com/p.jpg",
      "data:image/svg+xml;base64,PHN2Zy8+",
      "data:image/png;base64,bm90YW5pbWFnZQ==",
    ])
      expect(
        (await request("/api/auth/avatar", { image }, user.token)).status,
      ).toBe(400);
    expect(
      (
        await request(
          "/api/auth/avatar",
          { image: "x".repeat(180001) },
          user.token,
        )
      ).status,
    ).toBe(413);
    const db = new DatabaseSync(file);
    db.prepare("DELETE FROM sessions WHERE id=?").run(user.account.id);
    db.close();
    expect(
      (await request("/api/auth/avatar", { image: null }, user.token)).status,
    ).toBe(401);
  });
});
