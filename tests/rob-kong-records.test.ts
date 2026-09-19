import { afterEach, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createGame, newPlayer, seats } from "../shared/engine";
import { newGameRules } from "../shared/nanjing-rules";
import { normalizeTableSettings } from "../shared/table-settings";
import { settlementRows } from "../shared/settlement";
import type { Game, Result, RoundRecord } from "../shared/types";
import { createRecords } from "../server/records";
import { teamSchema } from "../server/teams";
import { dailyScoreRows, participationRows } from "../server/telegram-reports";

const from = Date.parse("2026-09-21T00:00:00+08:00"), day = 86_400_000, at = from + 12 * 3_600_000;
const users = ["u0", "u1", "u2", "u3"], names = ["甲", "乙", "丙", "丁"];
const databases: { db: DatabaseSync; directory: string }[] = [];
afterEach(() => { for (const { db, directory } of databases.splice(0)) { db.close(); rmSync(directory, { recursive: true, force: true }); } });
function source() {
  const directory = mkdtempSync(join(tmpdir(), "rob-kong-records-")), db = new DatabaseSync(join(directory, "records.sqlite"));
  databases.push({ db, directory });
  db.exec(`CREATE TABLE accounts(id TEXT PRIMARY KEY,username TEXT,name TEXT);
    CREATE TABLE account_numbers(account_id TEXT PRIMARY KEY,member_id INTEGER);
    CREATE TABLE account_audit(id TEXT PRIMARY KEY,account_id TEXT,event TEXT,at INTEGER);
    CREATE TABLE table_archives(state TEXT); CREATE TABLE rooms(state TEXT);`);
  teamSchema(db);
  users.forEach((id, seat) => {
    db.prepare("INSERT INTO accounts VALUES(?,?,?)").run(id, `real-player-${seat}`, names[seat]);
    db.prepare("INSERT INTO account_numbers VALUES(?,?)").run(id, 100001 + seat);
    db.prepare("INSERT INTO team_memberships VALUES(?,?,?,?,?)").run(id, "team-3", 0, "fixture", from - 1);
  });
  return { db, records: createRecords(db) };
}
function roundResult(legacy = false): Result {
  return legacy ? {
    reason: "hu", winners: [0], from: 1, winningTile: 16,
    details: { 0: { total: 48, items: [{ label: "抢杠胡", value: 48 }], kinds: [] } },
    deltas: [144, -144, 0, 0],
    transfers: [{ from: 1, to: 0, amount: 144, reason: "抢杠包三家" }],
  } : {
    reason: "hu", robbedKong: true, winners: [0], from: 1, winningTile: 16,
    details: { 0: { total: 48, items: [{ label: "抢杠胡", value: 48 }], kinds: [] } },
    deltas: [48, -144, 48, 48],
    transfers: [0, 2, 3].map(to => ({ from: 1, to: to as 0 | 2 | 3, amount: 48, reason: "抢杠赔三家" })),
  };
}
function game(id: string, legacy = false, experience = false): Game {
  const g = createGame("123456", id, newGameRules({ id: "nj-garden-b-v3", rounds: 8 }));
  // Start above the payout amount and use a fee-neutral record baseline so
  // this projection test isolates the actual three-way payout from table fees.
  g.initialScore = 200; g.settlementBase = 200; g.scoreDivisor = 1;
  g.players = seats.map(seat => newPlayer(experience && seat > 0 ? `experience-${id}-${seat}` : users[seat], names[seat], experience && seat > 0, 200));
  g.table = { creatorId: users[0], groupId: id, number: 1, createdAt: from,
    settings: normalizeTableSettings({ name: experience ? "机器人体验" : "正式牌桌", autoRenew: true }),
    ...(experience ? { experience: { sourceCode: "654321" } } : {}) };
  g.phase = "playing"; g.round = 1;
  const result = roundResult(legacy);
  g.history = [{ id: `${id}-1`, at, round: 1, result, names: [...names], scores: result.deltas.map(delta => 200 + delta), initialScore: 200, settlementBase: 200, scoreDivisor: 1,
    playerIds: g.players.map(player => player!.id), rules: g.rules }];
  return g;
}
function finish(records: ReturnType<typeof createRecords>, g: Game) {
  records.capture(g); // Use the live roster path before persisting the final hand.
  g.phase = "finished"; g.result = g.history[0].result; g.table!.finishedAt = at;
  g.players.forEach((player, seat) => { player!.score = g.history[0].scores[seat]; });
  records.capture(g); records.capture(g); // Duplicate pushes must not duplicate points.
}
const ledger = (db: DatabaseSync, id: string) => db.prepare("SELECT account_id,points FROM point_records WHERE game_id=? ORDER BY account_id").all(id);

describe("抢杠赔三家的真实账本投影", () => {
  it("仅一名胡牌者时三名收款真人均入账，战绩、日结和周结保留四人参与", () => {
    const { db, records } = source(), g = game("rob-three-recipients"); finish(records, g);
    expect(ledger(db, g.id)).toEqual(users.map((account_id, seat) => ({ account_id, points: [48, -144, 48, 48][seat] })));
    const details = records.details(g.id, users[0]);
    expect(details.rounds).toHaveLength(1); expect(details.rounds[0].record.result.winners).toEqual([0]);
    expect(details.rounds[0].record.result.robbedKong).toBe(true);
    expect(details.rounds[0].record.result.transfers?.map(transfer => [transfer.from, transfer.to, transfer.amount, transfer.reason])).toEqual([[1, 0, 48, "抢杠赔三家"], [1, 2, 48, "抢杠赔三家"], [1, 3, 48, "抢杠赔三家"]]);
    const net = settlementRows(details.match.record).sort((a, b) => a.seat - b.seat);
    expect(net.map(row => row.net)).toEqual([48, -144, 48, 48]); expect(net.reduce((sum, row) => sum + row.net, 0)).toBe(0);
    const points = records.points(new URLSearchParams({ from: String(from), to: String(from + day) }));
    expect(points).toMatchObject({ total: 4, completedRounds: 1, playerRounds: 4, tables: 1, points: 0 });
    expect(points.rows.filter(row => row.points > 0).map(row => row.accountId).sort()).toEqual(["u0", "u2", "u3"]);
    const daily = dailyScoreRows(db, "team-3", from, from + day);
    expect(daily.map(row => [row.username, row.score, row.points])).toEqual(users.map((_, seat) => [`real-player-${seat}`, [48, -144, 48, 48][seat], [24, -72, 24, 24][seat]]));
    expect(participationRows(db, "team-3", from, from + 7 * day).map(row => [row.username, row.rounds, row.points])).toEqual(users.map((_, seat) => [`real-player-${seat}`, 1, 3]));
  });
  it("旧抢杠包三家无robbedKong标记仍保留144给胡者的原账，重启补记录不重算", () => {
    const { db, records } = source(), legacy = game("legacy-rob-bao", true); finish(records, legacy);
    const oldRound = db.prepare("SELECT record FROM round_records WHERE game_id=?").get(legacy.id)!.record;
    const oldLedger = ledger(db, legacy.id);
    db.prepare("INSERT INTO table_archives VALUES(?)").run(JSON.stringify(legacy));
    const fresh = game("new-rob-payout"); finish(records, fresh);
    const restarted = createRecords(db); restarted.capture(legacy, false); restarted.capture(fresh, false);
    expect(db.prepare("SELECT record FROM round_records WHERE game_id=?").get(legacy.id)!.record).toBe(oldRound);
    expect(ledger(db, legacy.id)).toEqual(oldLedger);
    const saved = JSON.parse(String(oldRound)) as RoundRecord;
    expect(saved.result).not.toHaveProperty("robbedKong"); expect(saved.result.winners).toEqual([0]);
    expect(saved.result.deltas).toEqual([144, -144, 0, 0]); expect(saved.result.transfers).toEqual([{ from: 1, to: 0, amount: 144, reason: "抢杠包三家" }]);
    const totals = restarted.points(new URLSearchParams());
    expect(totals.rows.map(row => [row.accountId, row.points])).toEqual([["u0", 192], ["u1", -288], ["u2", 48], ["u3", 48]]);
    expect(totals).toMatchObject({ completedRounds: 2, playerRounds: 8, tables: 2, points: 0 });
  });
  it("三机器人体验桌保留新抢杠战绩但不会写积分，实时和重启后均不进日报周报", () => {
    const { db, records } = source(), experience = game("experience-rob", false, true); finish(records, experience);
    expect(db.prepare("SELECT COUNT(*) n FROM round_records").get()!.n).toBe(1);
    const stored = JSON.parse(String(db.prepare("SELECT record FROM round_records").get()!.record)) as RoundRecord;
    expect(stored.experience).toBe(true); expect(stored.result.robbedKong).toBe(true); expect(stored.result.winners).toEqual([0]);
    expect(db.prepare("SELECT COUNT(*) n FROM point_records").get()!.n).toBe(0);
    db.prepare("INSERT INTO table_archives VALUES(?)").run(JSON.stringify(experience));
    const restarted = createRecords(db);
    expect(db.prepare("SELECT COUNT(*) n FROM point_records").get()!.n).toBe(0);
    expect(restarted.points(new URLSearchParams())).toMatchObject({ total: 0, completedRounds: 0, points: 0 });
    expect(dailyScoreRows(db, "team-3", from, from + day)).toEqual([]);
    expect(participationRows(db, "team-3", from, from + 7 * day)).toEqual([]);
  });
});
