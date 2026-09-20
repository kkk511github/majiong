import { mkdtempSync, readFileSync, rmSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { gzipSync } from "node:zlib";
import { afterEach, expect, it } from "vitest";
import { createGame, newPlayer, seats, startRound } from "../shared/engine";
import { seededRandom } from "../shared/tiles";
import type { Game, RoundRecord } from "../shared/types";
import { accountSchema } from "../server/accounts";
import { createRecords } from "../server/records";
import { dailyScoreRows } from "../server/telegram-reports";
import {
  clearGameRecords, databaseFingerprints, RECORD_CLEAR_BOUNDARY, RECORD_CLEAR_NOT_BEFORE,
} from "../scripts/clear-game-records";

const cutoff = Date.parse(RECORD_CLEAR_BOUNDARY);
const executionTime = Date.parse(RECORD_CLEAR_NOT_BEFORE);
const firstTwoMinutes = Date.parse("2026-09-21T00:01:59+08:00");
const directories: string[] = [];
afterEach(() => { for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true }); });

function source(journal = "WAL") {
  const dir = mkdtempSync(join(tmpdir(), "mahjong-record-clear-"));
  directories.push(dir);
  const file = join(dir, "games.sqlite");
  const db = new DatabaseSync(file);
  db.exec(`PRAGMA journal_mode=${journal};
    CREATE TABLE rooms(id TEXT PRIMARY KEY,state TEXT NOT NULL,updated_at INTEGER);
    CREATE TABLE table_archives(id TEXT PRIMARY KEY,state TEXT NOT NULL,at INTEGER NOT NULL);
    CREATE TABLE sessions(token_hash TEXT PRIMARY KEY,id TEXT,name TEXT,last_seen INTEGER);
    CREATE TABLE table_creations(session_id TEXT,creation_id TEXT,codes TEXT,PRIMARY KEY(session_id,creation_id));
    CREATE TABLE report_schedules(schedule_id TEXT PRIMARY KEY,config TEXT);
    CREATE TABLE report_runs(id TEXT PRIMARY KEY,payload TEXT,status TEXT);
    CREATE TABLE app_config(key TEXT PRIMARY KEY,value TEXT);
    CREATE TABLE feedback(id TEXT PRIMARY KEY,user_id TEXT,message TEXT,at INTEGER);`);
  accountSchema(db);
  for (const seat of seats) {
    const id = `player-${seat}`;
    db.prepare("INSERT INTO accounts VALUES (?,?,?,?,?,?,?)").run(id, seat === 0 ? "guanli" : `member${seat}`, `牌友${seat}`, `hashed-password-${seat}`, seat === 0 ? "admin" : "member", 0, cutoff - 10_000);
    db.prepare("INSERT INTO team_memberships VALUES (?,?,?,?,?)").run(id, `team-${seat + 1}`, 0, "player-0", cutoff - 1000);
    db.prepare("INSERT INTO table_permissions VALUES (?,?,?,?)").run(id, seat === 0 ? 1 : 0, "player-0", cutoff - 1000);
    db.prepare("INSERT INTO sessions VALUES (?,?,?,?)").run(`token-hash-${seat}`, id, `牌友${seat}`, cutoff - 1000);
  }
  db.exec(`INSERT INTO account_avatars VALUES ('player-0','avatar-digest',X'001122FF');
    INSERT INTO account_audit VALUES ('audit-1','player-0','{"event":"membership-changed","teamId":"team-1"}',1);
    INSERT INTO table_creations VALUES ('player-0','creation-1','["123456"]');
    INSERT INTO report_schedules VALUES ('daily','{"chatId":"protected","token":"protected"}');
    INSERT INTO report_runs VALUES ('sent-old','already-delivered-report','sent');
    INSERT INTO app_config VALUES ('rules','must-stay-identical');
    INSERT INTO feedback VALUES ('feedback-1','player-0','keep feedback',1);`);
  const records = createRecords(db);
  const round = (id: string, at: number, number: number): RoundRecord => ({
    id, at, round: number, playerIds: seats.map(s => `player-${s}`),
    names: seats.map(s => `牌友${s}`), scores: [110, 80, 80, 90],
    initialScore: 90, settlementBase: 100, scoreDivisor: 2,
    result: { reason: "draw", winners: [], details: {}, deltas: [20, -10, -10, 0] },
  });
  const game = (id: string, phase: Game["phase"], history: RoundRecord[]) => {
    let g = createGame("123456", id, { rounds: 8 });
    g.players = seats.map(s => ({ ...newPlayer(`player-${s}`, `牌友${s}`, false), ready: true }));
    g = startRound(g, cutoff - 300, seededRandom(32));
    g.phase = phase; g.history = history; g.round = 3;
    g.players.forEach((p, i) => { p!.score = 123 + i; p!.externalScore = i * -3; });
    g.initialScore = 90; g.settlementBase = 100; g.scoreDivisor = 2;
    g.table = { creatorId: "player-0", groupId: "group", number: 1, createdAt: cutoff - 5000,
      settings: { name: "保留设置", privacy: "all", autoRenew: true } as NonNullable<Game["table"]>["settings"],
      ...(phase === "finished" ? { finishedAt: history.at(-1)?.at ?? cutoff - 10 } : {}),
    };
    if (phase === "playing" || phase === "claiming") {
      g.replay!.id = `${id}-ongoing`; delete g.replay!.endedAt;
    } else if (history.length) {
      g.replay!.id = history.at(-1)!.id; g.replay!.endedAt = history.at(-1)!.at;
    }
    return g;
  };
  const room = (g: Game) => {
    records.capture(g);
    db.prepare("INSERT INTO rooms VALUES (?,?,?)").run(g.id, JSON.stringify(g), cutoff - 50);
  };
  const archive = (g: Game, at = cutoff - 10) => {
    records.capture(g);
    db.prepare("INSERT INTO table_archives VALUES (?,?,?)").run(g.id, JSON.stringify(g), at);
  };
  const active = game("active", "playing", [round("active-old", cutoff - 500, 1), round("active-boundary", cutoff, 2)]);
  room(active);
  const ended = game("ended", "ended", [round("ended-old", cutoff - 200, 2)]);
  room(ended);
  const finished = game("finished", "finished", [round("finished-old", cutoff - 100, 1)]);
  room(finished); archive(finished);
  const recent = game("recent", "finished", [round("recent-old", cutoff - 2, 1), round("recent-new", firstTwoMinutes, 2)]);
  archive(recent, firstTwoMinutes + 1);
  for (const [gameId, roundNumber] of [["active", 1], ["active", 2], ["ended", 2], ["recent", 1], ["recent", 2], ["finished", 1]] as const)
    for (const seat of seats)
      db.prepare("INSERT INTO round_rosters VALUES (?,?,?,?,?)").run(gameId, roundNumber, `player-${seat}`, `team-${seat + 1}`, `战队${seat}`);
  db.prepare("INSERT INTO round_replays VALUES (?,?)").run("orphan-old", gzipSync(JSON.stringify({ id: "orphan-old", endedAt: cutoff - 1 })));
  db.prepare("INSERT INTO round_replays VALUES (?,?)").run("orphan-new", gzipSync(JSON.stringify({ id: "orphan-new", endedAt: cutoff + 1 })));
  db.prepare("INSERT INTO round_replays VALUES (?,?)").run("ongoing-extra", gzipSync(JSON.stringify({ id: "ongoing-extra", startedAt: cutoff - 1 })));
  db.prepare("INSERT INTO round_rosters VALUES (?,?,?,?,?)").run("orphan", 99, "player-0", "team-1", "一生所爱战队");
  db.prepare("INSERT INTO admin_match_reads VALUES (?,?,?)").run("finished", "player-0", cutoff - 1);
  db.prepare("INSERT INTO admin_match_reads VALUES (?,?,?)").run("recent", "player-0", cutoff);
  db.close();
  const read = <T>(fn: (database: DatabaseSync) => T) => {
    const database = new DatabaseSync(file);
    try { return fn(database); } finally { database.close(); }
  };
  const apply = (backupName = "before.sqlite") => clearGameRecords({
    database: file, before: RECORD_CLEAR_BOUNDARY, apply: true, serviceStopped: true,
    backup: join(dir, backupName), now: executionTime,
  });
  return { dir, file, read, apply, active, ended, finished };
}

it("defaults to dry-run and does not create a fee table, backup, lock, or change any row", async () => {
  const s = source();
  const before = s.read(databaseFingerprints);
  const result = await clearGameRecords({ database: s.file, before: RECORD_CLEAR_BOUNDARY });
  expect(result.mode).toBe("dry-run");
  expect(result.counts).toMatchObject({ round_records: 4, match_records: 1, rooms_updated: 3, archives_updated: 1, table_archives: 1, active_rooms_preserved: 1 });
  expect(s.read(databaseFingerprints)).toEqual(before);
  expect(existsSync(s.file + ".clear-game-records.lock")).toBe(false);
});

it.each(["WAL", "DELETE"])("backs up and clears only old records under %s, retaining every account/team/permission/config row and all current game state", async journal => {
  const s = source(journal);
  const before = s.read(databaseFingerprints);
  const result = await s.apply();
  expect(result).toMatchObject({ mode: "applied", verified: true });
  const backupDb = new DatabaseSync(join(s.dir, "before.sqlite"), { readOnly: true });
  try { expect(databaseFingerprints(backupDb)).toEqual(before); } finally { backupDb.close(); }
  s.read(db => {
    const after = databaseFingerprints(db);
    for (const [table, hash] of Object.entries(result.protectedTables)) expect(after[table], table).toEqual(hash);
    const active = JSON.parse(String(db.prepare("SELECT state FROM rooms WHERE id='active'").get()!.state));
    expect(active).toEqual(JSON.parse(JSON.stringify({ ...s.active, history: [s.active.history[1]] })));
    const ended = JSON.parse(String(db.prepare("SELECT state FROM rooms WHERE id='ended'").get()!.state));
    const { replay: _oldReplay, ...oldEnded } = s.ended;
    expect(ended).toEqual(JSON.parse(JSON.stringify({ ...oldEnded, history: [] })));
    expect(db.prepare("SELECT updated_at FROM rooms WHERE id='active'").get()!.updated_at).toBe(cutoff - 50);
    expect(db.prepare("SELECT id FROM round_records ORDER BY id").all()).toEqual([{ id: "active-boundary" }, { id: "recent-new" }]);
    expect(db.prepare("SELECT id FROM table_archives").all()).toEqual([{ id: "recent" }]);
    expect(db.prepare("SELECT id FROM round_replays ORDER BY id").all()).toEqual([{ id: "ongoing-extra" }, { id: "orphan-new" }, { id: "recent-new" }]);
    expect(db.prepare("SELECT game_id FROM admin_match_reads").all()).toEqual([{ game_id: "recent" }]);
    expect(db.prepare("SELECT DISTINCT game_id,round FROM round_rosters ORDER BY game_id,round").all()).toEqual([{ game_id: "active", round: 2 }, { game_id: "active", round: 3 }, { game_id: "recent", round: 2 }]);
    const fees = db.prepare("SELECT DISTINCT game_id FROM record_clear_fee_carryover ORDER BY game_id").all();
    expect(fees).toEqual([{ game_id: "active" }, { game_id: "ended" }, { game_id: "recent" }]);
    expect(db.prepare("SELECT DISTINCT cleared_before FROM record_clear_fee_carryover").all()).toEqual([{ cleared_before: cutoff }]);
  });
  expect(existsSync(s.file + ".clear-game-records.lock")).toBe(false);
});

it("old records never return after createRecords startup and recapture; a repeated clear is a no-op", async () => {
  const s = source();
  await s.apply();
  s.read(db => {
    const records = createRecords(db);
    for (const row of db.prepare("SELECT state FROM rooms UNION ALL SELECT state FROM table_archives").all())
      records.capture(JSON.parse(String(row.state)) as Game, false);
    expect(db.prepare("SELECT COUNT(*) AS n FROM round_records WHERE at<?").get(cutoff)!.n).toBe(0);
    expect(db.prepare("SELECT COUNT(*) AS n FROM point_records WHERE at<?").get(cutoff)!.n).toBe(0);
    expect(db.prepare("SELECT COUNT(*) AS n FROM match_records WHERE at<?").get(cutoff)!.n).toBe(0);
  });
  const after = s.read(databaseFingerprints);
  const repeated = await s.apply("repeat.sqlite");
  expect(repeated.counts.round_records).toBe(0);
  expect(repeated.counts.rooms_updated).toBe(0);
  expect(s.read(databaseFingerprints)).toEqual(after);
});

it("refuses early execution, missing stopped-service acknowledgement, unauthorized boundary, and reused backup paths without deletion", async () => {
  const s = source();
  const before = s.read(databaseFingerprints);
  const base = { database: s.file, before: RECORD_CLEAR_BOUNDARY, apply: true, backup: join(s.dir, "unused.sqlite") };
  await expect(clearGameRecords({ ...base, now: executionTime })).rejects.toThrow("service-stopped");
  for (const now of [cutoff, firstTwoMinutes, executionTime - 1])
    await expect(clearGameRecords({ ...base, serviceStopped: true, now })).rejects.toThrow("not arrived");
  for (const before of ["2026-09-20T00:02:00+08:00", "2026-09-21T00:02:00+08:00"])
    await expect(clearGameRecords({ ...base, serviceStopped: true, now: executionTime, before })).rejects.toThrow("requires --before");
  await expect(clearGameRecords({ ...base, serviceStopped: true, now: executionTime, backup: s.file })).rejects.toThrow("already exists");
  expect(s.read(databaseFingerprints)).toEqual(before);
  expect(existsSync(base.backup)).toBe(false);
  expect(existsSync(s.file + ".clear-game-records.lock")).toBe(false);
});

it("backup failure makes zero data changes and removes the maintenance lock", async () => {
  const s = source();
  const before = s.read(databaseFingerprints);
  await expect(clearGameRecords({ database: s.file, before: RECORD_CLEAR_BOUNDARY, apply: true,
    serviceStopped: true, now: executionTime, backup: join(s.dir, "missing", "backup.sqlite") })).rejects.toThrow();
  expect(s.read(databaseFingerprints)).toEqual(before);
  expect(existsSync(s.file + ".clear-game-records.lock")).toBe(false);
});

it("a mid-delete database error rolls the entire transaction back while retaining its verified backup", async () => {
  const s = source();
  s.read(db => db.exec("CREATE TRIGGER abort_record_clear BEFORE DELETE ON match_records BEGIN SELECT RAISE(ABORT,'test rollback'); END"));
  const before = s.read(databaseFingerprints);
  await expect(s.apply()).rejects.toThrow("test rollback");
  expect(s.read(databaseFingerprints)).toEqual(before);
  expect(readFileSync(join(s.dir, "before.sqlite")).subarray(0, 15).toString()).toBe("SQLite format 3");
});

it.each([
  ["accounts", "UPDATE accounts SET password_hash='changed'"],
  ["rooms", "UPDATE rooms SET state=json_set(state,'$.players[0].score',999999) WHERE id='active'"],
])("detects and rolls back an unexpected trigger change to %s", async (table, change) => {
  const s = source();
  s.read(db => db.exec(`CREATE TRIGGER tamper_with_clear AFTER ${table === "rooms" ? "UPDATE ON rooms" : "DELETE ON point_records"} BEGIN ${change}; END`));
  const before = s.read(databaseFingerprints);
  await expect(s.apply()).rejects.toThrow(table);
  expect(s.read(databaseFingerprints)).toEqual(before);
});

it("malformed room JSON aborts without a partial clear or backup", async () => {
  const s = source();
  s.read(db => db.exec("UPDATE rooms SET state='not-json' WHERE id='active'"));
  const before = s.read(databaseFingerprints);
  await expect(s.apply()).rejects.toThrow("Malformed JSON");
  expect(s.read(databaseFingerprints)).toEqual(before);
  expect(existsSync(join(s.dir, "before.sqlite"))).toBe(false);
});

it("an existing maintenance lock excludes a competing clear without removing that lock", async () => {
  const s = source();
  const before = s.read(databaseFingerprints);
  writeFileSync(s.file + ".clear-game-records.lock", "other invocation", { mode: 0o600 });
  await expect(s.apply()).rejects.toThrow("EEXIST");
  expect(s.read(databaseFingerprints)).toEqual(before);
  expect(readFileSync(s.file + ".clear-game-records.lock", "utf8")).toBe("other invocation");
});

it("the physically cleared first hand never recharges its fee in member statistics or daily reports", async () => {
  const s = source();
  const query = new URLSearchParams({ from: String(cutoff), to: String(executionTime) });
  const original = s.read(db => ({
    points: createRecords(db).points(query).points,
    report: dailyScoreRows(db, "team-1", cutoff, executionTime),
  }));
  await s.apply();
  const cleared = s.read(db => ({
    points: createRecords(db).points(query).points,
    report: dailyScoreRows(db, "team-1", cutoff, executionTime),
  }));
  expect(cleared).toEqual(original);
  expect(cleared.report[0].score).toBe(40);
  expect(cleared.report[0].points).toBe(20);
});

it("executes after 00:02 while retaining new records at 00:00:00 and 00:01:59 and their replay/archive state", async () => {
  expect(RECORD_CLEAR_BOUNDARY).toBe("2026-09-21T00:00:00+08:00");
  expect(RECORD_CLEAR_NOT_BEFORE).toBe("2026-09-21T00:02:00+08:00");
  const s = source();
  const result = await clearGameRecords({ database: s.file, before: RECORD_CLEAR_BOUNDARY, apply: true,
    serviceStopped: true, now: executionTime + 1, backup: join(s.dir, "after-0002.sqlite") });
  expect(result).toMatchObject({ mode: "applied", before: "2026-09-21T00:00:00+08:00", verified: true });
  s.read(db => {
    expect(db.prepare("SELECT id,at FROM round_records ORDER BY at").all()).toEqual([
      { id: "active-boundary", at: cutoff }, { id: "recent-new", at: firstTwoMinutes },
    ]);
    expect(db.prepare("SELECT at,COUNT(*) AS n FROM point_records GROUP BY at ORDER BY at").all()).toEqual([
      { at: cutoff, n: 4 }, { at: firstTwoMinutes, n: 4 },
    ]);
    expect(db.prepare("SELECT at FROM match_records WHERE id='recent'").get()!.at).toBe(firstTwoMinutes);
    expect(db.prepare("SELECT COUNT(*) AS n FROM round_replays WHERE id='recent-new'").get()!.n).toBe(1);
    const archive = JSON.parse(String(db.prepare("SELECT state FROM table_archives WHERE id='recent'").get()!.state));
    expect(archive.history.map((r: RoundRecord) => r.at)).toEqual([firstTwoMinutes]);
    expect(archive.replay.endedAt).toBe(firstTwoMinutes);
  });
});
