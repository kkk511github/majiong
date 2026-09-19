import { afterEach, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync, existsSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensureExperienceTables, parseExperienceArguments } from "../scripts/ensure-experience-tables";
import { createGame, newPlayer } from "../shared/engine";
import { newGameRules } from "../shared/nanjing-rules";
import { normalizeTableSettings } from "../shared/table-settings";
import { createExperienceTable, fillExperienceBots } from "../server/experience-table";
import type { Game } from "../shared/types";
const open: { folder: string; db: DatabaseSync }[] = [];
afterEach(() => { for (const item of open.splice(0)) { item.db.close(); rmSync(item.folder, { recursive: true, force: true }); } });
function fixture() {
  const folder = mkdtempSync(join(tmpdir(), "experience-ops-")), path = join(folder, "mahjong.sqlite"), db = new DatabaseSync(path); open.push({ folder, db });
  db.exec(`PRAGMA journal_mode=WAL;
    CREATE TABLE rooms(id TEXT PRIMARY KEY,state TEXT NOT NULL,updated_at INTEGER);
    CREATE TABLE table_archives(id TEXT PRIMARY KEY,state TEXT NOT NULL,at INTEGER);
    CREATE TABLE accounts(id TEXT PRIMARY KEY,role TEXT,must_change INTEGER);
    CREATE TABLE match_records(code TEXT);
    CREATE TABLE round_records(code TEXT);
    CREATE TABLE table_creations(codes TEXT);
    INSERT INTO accounts VALUES('admin-1','admin',0);`);
  const codes = ["345811", "559668", "810152", "878967", "192809"];
  const sources = codes.map((code, index) => {
    const game = createGame(code, `source-${code}`, newGameRules({ rounds: 8, turnSeconds: 10 }));
    game.ownerId = "admin-1";
    game.table = { creatorId: "admin-1", groupId: game.id, number: index + 1, createdAt: 1,
      settings: normalizeTableSettings({ name: `正式桌${index + 1}`, trusteeMode: "afterRounds", trusteeRounds: 2, readyMode: "manual", autoRenew: false, overtimeSeconds: 87 }) };
    db.prepare("INSERT INTO rooms VALUES(?,?,?)").run(game.id, JSON.stringify(game), 100);
    return game;
  });
  const insert = (game: Game) => db.prepare("INSERT INTO rooms VALUES(?,?,?)").run(game.id, JSON.stringify(game), 500);
  const rows = () => db.prepare("SELECT * FROM rooms ORDER BY id").all();
  return { folder, path, db, sources, insert, rows };
}

describe("explicit experience-table maintenance", () => {
  it("defaults to dry-run, creates no backup and leaves the database unchanged", async () => {
    const f = fixture(), before = f.rows();
    const options = parseExperienceArguments(["--count", "3"], f.path);
    expect(options.apply).toBe(false);
    const result = await ensureExperienceTables(options);
    expect(result.planned).toHaveLength(3); expect(result.created).toEqual([]); expect(f.rows()).toEqual(before);
    expect(existsSync(join(f.folder, ".experience-table-backups"))).toBe(false);
  });
  it("atomically creates 3 waiting tables with private online backup, distinct sources and one human slot", async () => {
    const f = fixture(), before = f.rows(), result = await ensureExperienceTables({ databasePath: f.path, count: 3, apply: true, sourceCodes: f.sources.map(s => s.code), creatorId: "admin-1" });
    expect(result.created).toHaveLength(3); expect(result.restartRequired).toBe(true); expect(result.message).toContain("需重启加载");
    expect(new Set(result.created.map(r => r.code)).size).toBe(3); expect(new Set(result.created.map(r => r.number)).size).toBe(3);
    expect(new Set(result.created.map(r => r.sourceCode)).size).toBe(3);
    expect(result.created.map(r => r.name)).toEqual(["机器人体验1", "机器人体验2", "机器人体验3"]);
    for (const row of before) expect(f.db.prepare("SELECT * FROM rooms WHERE id=?").get(row.id)).toEqual(row);
    for (const row of result.created) {
      const game = JSON.parse(String(f.db.prepare("SELECT state FROM rooms WHERE id=?").get(row.id)!.state)) as Game;
      expect(game.phase).toBe("waiting"); expect(game.round).toBe(0); expect(game.players[0]).toBeNull();
      expect(game.players.slice(1).every(player => player?.bot && player.ready && player.online)).toBe(true);
      expect(game.table!.settings).toMatchObject({ autoRenew: true, readyMode: "manual", trusteeMode: "afterRounds", trusteeRounds: 2, overtimeSeconds: 87 });
      expect(game.rules).toEqual(f.sources[0].rules);
    }
    expect(statSync(result.backupPath!).mode & 0o077).toBe(0);
    const backup = new DatabaseSync(result.backupPath!, { readOnly: true });
    expect(backup.prepare("SELECT * FROM rooms ORDER BY id").all()).toEqual(before); backup.close();
    const after = f.rows();
    const again = await ensureExperienceTables({ databasePath: f.path, count: 3, apply: true });
    expect(again.created).toEqual([]); expect(again.backupPath).toBeUndefined(); expect(f.rows()).toEqual(after);
  });
  it("preserves an in-progress table with a human and adds only the missing two", async () => {
    const f = fixture(), active = createExperienceTable(f.sources[0], "111111", "playing-experience", 9, 100);
    active.table!.settings.name = "机器人体验1"; active.table!.settings.autoRenew = false;
    active.phase = "playing"; active.round = 3; active.players[0] = newPlayer("human", "真人"); active.players[0].score = 57;
    f.insert(active); const original = f.db.prepare("SELECT * FROM rooms WHERE id=?").get(active.id);
    const result = await ensureExperienceTables({ databasePath: f.path, count: 3, apply: true });
    expect(result.existing).toHaveLength(1); expect(result.created).toHaveLength(2);
    expect(result.created.map(r => r.name)).toEqual(["机器人体验2", "机器人体验3"]);
    expect(result.created.every(r => r.sourceCode !== f.sources[0].code)).toBe(true);
    expect(f.db.prepare("SELECT * FROM rooms WHERE id=?").get(active.id)).toEqual(original);
  });
  it("keeps manually closed archives unchanged and uses fresh IDs, codes and table numbers", async () => {
    const f = fixture(), closed = createExperienceTable(f.sources[0], "851650", "manual-closed", 44, 10);
    closed.table!.closed = true; closed.phase = "finished"; closed.table!.endReason = "管理员解散牌桌";
    f.db.prepare("INSERT INTO table_archives VALUES(?,?,?)").run(closed.id, JSON.stringify(closed), 12);
    f.db.exec("INSERT INTO match_records VALUES('222222'); INSERT INTO round_records VALUES('333333'); INSERT INTO table_creations VALUES('[\"444444\"]')");
    const archive = f.db.prepare("SELECT * FROM table_archives").all();
    const result = await ensureExperienceTables({ databasePath: f.path, count: 3, apply: true });
    expect(result.created[0].sourceCode).toBe(f.sources[0].code);
    expect(result.created.every(r => r.id !== closed.id && r.number > 44 && !["851650", "222222", "333333", "444444", ...f.sources.map(s => s.code)].includes(r.code))).toBe(true);
    expect(f.db.prepare("SELECT * FROM table_archives").all()).toEqual(archive);
    expect(f.db.prepare("SELECT * FROM rooms WHERE id=?").get(closed.id)).toBeUndefined();
  });
  it("rolls back all new rooms if any insert fails and keeps the pre-change backup", async () => {
    const f = fixture(), before = f.rows(), backup = join(f.folder, "safe.sqlite");
    f.db.exec("CREATE TRIGGER fail_second BEFORE INSERT ON rooms WHEN json_extract(NEW.state,'$.table.settings.name')='机器人体验2' BEGIN SELECT RAISE(ABORT,'test refusal'); END");
    await expect(ensureExperienceTables({ databasePath: f.path, count: 3, apply: true, backupPath: backup })).rejects.toThrow("事务已回滚");
    expect(f.rows()).toEqual(before); expect(existsSync(backup)).toBe(true); expect(statSync(backup).mode & 0o077).toBe(0);
  });
  it("fails closed for a missing DB, invalid admin, insufficient distinct sources, or an existing backup", async () => {
    const f = fixture(), before = f.rows();
    await expect(ensureExperienceTables({ databasePath: join(f.folder, "missing.sqlite"), count: 3, apply: true })).rejects.toThrow("已有");
    await expect(ensureExperienceTables({ databasePath: f.path, count: 3, apply: true, creatorId: "missing" })).rejects.toThrow("管理员");
    await expect(ensureExperienceTables({ databasePath: f.path, count: 3, apply: true, sourceCodes: [f.sources[0].code] })).rejects.toThrow("可用正式源桌");
    await expect(ensureExperienceTables({ databasePath: f.path, count: 3, apply: true, backupPath: f.path })).rejects.toThrow();
    expect(f.rows()).toEqual(before);
  });
  it("the existing renewal helper repopulates only robot seats and retains experience settings", () => {
    const f = fixture(), original = createExperienceTable(f.sources[0], "666666", "experience-original", 10, 1);
    original.table!.settings.autoRenew = true;
    const renewed = createGame("777777", "experience-renewed", original.rules);
    renewed.table = { ...original.table!, createdAt: 2 }; fillExperienceBots(renewed);
    expect(renewed.players[0]).toBeNull(); expect(renewed.players.slice(1).every(p => p?.bot && p.ready && p.online)).toBe(true);
    expect(renewed.table.experience).toEqual(original.table!.experience); expect(renewed.table.settings.autoRenew).toBe(true);
  });
});
