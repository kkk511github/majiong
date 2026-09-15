import { expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRecords } from "../server/records";
import { makeServer } from "../server/service";
import {
  act,
  newPlayer,
  seats,
  startRound,
  viewFor,
  createGame,
} from "../shared/engine";
import { seededRandom } from "../shared/tiles";
import { replayedRound } from "./fixtures/replayed-round";
import type { RoundReplay } from "../shared/types";

it("逐步保存真实牌面，出牌和下一家摸牌分帧，ID不重用，实时视图永远不带回放暗牌", () => {
  const g = replayedRound();
  const replay = g.replay!;
  expect(replay.id).toBe(g.history.at(-1)!.id);
  expect(replay.frames[0].type).toBe("start");
  expect(replay.frames.at(-1)).toMatchObject({
    type: "finish",
    result: g.result,
  });
  expect(replay.frames.at(-1)!.players.map((p) => p.hand)).toEqual(
    g.players.map((p) => p!.hand),
  );
  const i = replay.frames.findIndex(
    (f, n) => f.type === "discard" && replay.frames[n + 1]?.type === "draw",
  );
  expect(i).toBeGreaterThan(0);
  const discarded = replay.frames[i],
    drawn = replay.frames[i + 1];
  expect(discarded.players[discarded.seat!].discards).toContain(discarded.tile);
  expect(drawn.players[drawn.seat!].hand).toContain(drawn.tile);
  expect(discarded.players[drawn.seat!].hand).not.toContain(drawn.tile);
  expect(JSON.stringify(replay)).not.toContain('"wall"');
  for (const seat of seats)
    expect(viewFor(g, seat)).not.toHaveProperty("replay");
  g.players.forEach((p) => {
    p!.ready = true;
  });
  const next = startRound(g, 1000000, seededRandom(2));
  expect(next.replay!.id).not.toBe(replay.id);
  expect(next.replay!.frames).toHaveLength(1);
  for (const seat of seats) {
    const view = viewFor(next, seat);
    expect(view).not.toHaveProperty("replay");
    expect(view.players[(seat + 1) % 4]!.hand).toEqual([]);
  }
  const before = JSON.stringify(next.replay);
  expect(() => act(next, next.turn, { type: "discard", tile: -1 })).toThrow();
  expect(JSON.stringify(next.replay)).toBe(before);
});

it("普通旁观会员可按ID读已结束回放；未登录和未结束不能读，存档幂等且重启后保留", async () => {
  const dir = mkdtempSync(join(tmpdir(), "replay-test-")),
    file = join(dir, "test.sqlite");
  let server = makeServer({ database: file, port: 0, host: "127.0.0.1" });
  let base = `http://127.0.0.1:${await server.listen()}`;
  let db: DatabaseSync | undefined;
  try {
    const registration = await fetch(base + "/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "replay-reader",
        name: "旁观会员",
        password: "Fixture-password-2026",
      }),
    });
    const account = await registration.json();
    expect(account.account.role).toBe("member");
    const headers = { Authorization: `Bearer ${account.token}` };
    db = new DatabaseSync(file);
    const records = createRecords(db),
      game = replayedRound();
    records.capture(game);
    records.capture(game);
    expect(db.prepare("SELECT count(*) n FROM round_replays").get()!.n).toBe(1);
    const path = "/api/replays/" + game.history[0].id;
    expect((await fetch(base + path)).status).toBe(401);
    const response = await fetch(base + path, { headers });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const replay = (await response.json()) as RoundReplay;
    expect(replay).toEqual(game.replay);
    expect(JSON.stringify(replay)).not.toContain('"playerIds"');
    expect(
      (await fetch(base + "/api/replays/unknown-99", { headers })).status,
    ).toBe(404);
    expect(
      (await fetch(base + "/api/replays/bad%20id", { headers })).status,
    ).toBe(400);
    let live = createGame("234568", "ongoing");
    live.players = seats.map((s) => newPlayer(`p${s}`, `p${s}`, true));
    live = startRound(live, 1000, seededRandom(4));
    records.capture(live);
    expect(
      (await fetch(base + "/api/replays/ongoing-1", { headers })).status,
    ).toBe(404);
    db.prepare("UPDATE round_records SET private_names=1 WHERE id=?").run(
      replay.id,
    );
    expect(
      (await (await fetch(base + path, { headers })).json()).names,
    ).toEqual(["牌友1", "牌友2", "牌友3", "牌友4"]);
    db.close();
    db = undefined;
    await server.close();
    server = makeServer({ database: file, port: 0, host: "127.0.0.1" });
    base = `http://127.0.0.1:${await server.listen()}`;
    expect(
      (await (await fetch(base + path, { headers })).json()).frames,
    ).toEqual(replay.frames);
    db = new DatabaseSync(file);
    db.prepare("DELETE FROM round_replays WHERE id=?").run(replay.id);
    const legacy = await (await fetch(base + path, { headers })).json();
    expect(legacy.summaryOnly).toBe(true);
    expect(legacy.frames).toHaveLength(1);
    expect(legacy.frames[0].result).toEqual(game.result);
  } finally {
    db?.close();
    await server.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
