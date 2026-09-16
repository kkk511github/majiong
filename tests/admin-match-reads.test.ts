import { expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeServer } from "../server/service";
import { createRecords } from "../server/records";
import { replayedRound } from "./fixtures/replayed-round";

it("管理员已读按账号持久化；列表不触发、重复读取幂等、会员越权拒绝且不泄露", async () => {
  const dir = mkdtempSync(join(tmpdir(), "match-reads-")),
    file = join(dir, "test.sqlite");
  let server = makeServer({ database: file, port: 0, host: "127.0.0.1" });
  let base = `http://127.0.0.1:${await server.listen()}`;
  let db = new DatabaseSync(file);
  try {
    async function register(username: string) {
      return (
        await fetch(base + "/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username,
            name: username,
            password: "Fixture-2026",
          }),
        })
      ).json();
    }
    const a = await register("reader-a"),
      b = await register("reader-b"),
      m = await register("member-c");
    db.prepare("UPDATE accounts SET role='admin' WHERE id IN (?,?)").run(
      a.account.id,
      b.account.id,
    );
    const game = replayedRound();
    game.phase = "finished";
    game.players[0]!.id = m.account.id;
    game.history.at(-1)!.matchFinished = true;
    game.history.at(-1)!.playerIds = [m.account.id, "p1", "p2", "p3"];
    const records = createRecords(db);
    records.capture(game);
    const path = "/api/admin/match-reads/" + game.id;
    const auth = (u: typeof a) => ({ Authorization: `Bearer ${u.token}` });
    const read = async (u: typeof a) =>
      fetch(base + path, { method: "POST", headers: auth(u) });
    const list = async (u: typeof a, admin = true) =>
      (
        await (
          await fetch(base + (admin ? "/api/admin/records" : "/api/records"), {
            headers: auth(u),
          })
        ).json()
      ).records;
    expect((await list(a))[0].adminReadAt).toBeNull();
    expect(
      db.prepare("SELECT count(*) AS n FROM admin_match_reads").get()!.n,
    ).toBe(0);
    expect((await fetch(base + path, { method: "POST" })).status).toBe(401);
    expect((await read(m)).status).toBe(403);
    expect(
      (
        await fetch(base + "/api/admin/match-reads/missing", {
          method: "POST",
          headers: auth(a),
        })
      ).status,
    ).toBe(404);
    const response = await read(a);
    expect(response.status).toBe(200);
    const { readAt } = await response.json();
    expect(readAt).toBeGreaterThan(0);
    expect(await (await read(a)).json()).toEqual({ readAt });
    expect((await list(a))[0].adminReadAt).toBe(readAt);
    expect((await list(b))[0].adminReadAt).toBeNull();
    expect((await list(m, false))[0]).not.toHaveProperty("adminReadAt");
    records.capture(game);
    db.close();
    await server.close();
    server = makeServer({ database: file, port: 0, host: "127.0.0.1" });
    base = `http://127.0.0.1:${await server.listen()}`;
    db = new DatabaseSync(file);
    expect((await list(a))[0].adminReadAt).toBe(readAt);
    db.prepare("UPDATE accounts SET role='member' WHERE id=?").run(
      a.account.id,
    );
    expect((await read(a)).status).toBe(403);
    expect(
      db.prepare("SELECT count(*) AS n FROM admin_match_reads").get()!.n,
    ).toBe(1);
  } finally {
    db.close();
    await server.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
