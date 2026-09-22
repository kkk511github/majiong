import { DatabaseSync } from "node:sqlite";
import { afterEach, expect, it } from "vitest";
import { createGame, newPlayer, seats } from "../shared/engine";
import type { RoundRecord } from "../shared/types";
import { createRecords } from "../server/records";

const databases: DatabaseSync[] = [];
afterEach(() => {
  for (const db of databases.splice(0)) db.close();
});

function source() {
  const db = new DatabaseSync(":memory:");
  databases.push(db);
  db.exec(`CREATE TABLE accounts(id TEXT PRIMARY KEY,username TEXT,name TEXT);
    CREATE TABLE teams(id TEXT PRIMARY KEY,name TEXT);
    CREATE TABLE account_numbers(account_id TEXT PRIMARY KEY,member_id INTEGER);
    CREATE TABLE table_archives(state TEXT); CREATE TABLE rooms(state TEXT);
    INSERT INTO accounts VALUES ('member','online-member','正式成员'),
      ('practice-only','practice-only-member','仅练习成员');
    INSERT INTO account_numbers VALUES ('member',100001),('practice-only',100002);`);
  const records = createRecords(db);
  function hand(id: string, at: number, delta: number, reason = "hu"): RoundRecord {
    return {
      id, at, round: 1, names: ["正式成员"], scores: [90 + delta],
      initialScore: 90, settlementBase: 100, scoreDivisor: 2,
      playerIds: ["member"],
      result: { reason: reason as RoundRecord["result"]["reason"], winners: [0], details: {}, deltas: [delta] },
    };
  }
  function archive(record: RoundRecord, gameId: string, code = "123456", account = "member") {
    db.prepare("INSERT INTO round_records VALUES (?,?,?,?,?,?,?)").run(
      record.id, gameId, code, record.at, JSON.stringify([account]), 0, JSON.stringify(record),
    );
  }
  function ledger(record: RoundRecord, gameId: string, account = "member") {
    db.prepare("INSERT INTO point_records VALUES (?,?,?,?,?,?,?,?)").run(
      record.id, gameId, record.at, account, "历史成员", "", "历史未归队", record.result.deltas[0],
    );
  }
  return { db, records, hand, archive, ledger };
}

it("按日期汇总整天积分，不受分页影响且会员只看到自己", () => {
  const { db, records } = source();
  for (let index = 0; index < 21; index++) {
    const record: RoundRecord = {
      id: `match-${index}`, at: 1000 + index, round: 1,
      names: ["正式成员", "仅练习成员"], playerIds: ["member", "practice-only"],
      scores: [103, 97], settlementBase: 100, scoreDivisor: 1,
      result: { reason: "hu", winners: [0], details: {}, deltas: [3, -3] },
    };
    db.prepare("INSERT INTO match_records VALUES (?,?,?,?,?,?,?)").run(
      record.id, record.id, "123456", record.at, JSON.stringify(record.playerIds), 0, JSON.stringify(record),
    );
  }
  const query = new URLSearchParams({ from: "0", to: "86400000", page: "1" });
  const member = records.list(query, "member");
  expect(member.records).toHaveLength(20);
  expect(member.scoreTotals).toMatchObject([{ id: "member", points: 63 }]);
  query.set("calendar", "0");
  const compact = records.list(query, "member");
  expect(compact.records).toEqual(member.records);
  expect(compact.total).toBe(member.total);
  expect(compact.scoreTotals).toEqual(member.scoreTotals);
  expect(compact.dates).toBeUndefined();
  expect(compact.dateTotal).toBeUndefined();
  expect(records.list(query, "member", true).scoreTotals).toMatchObject([
    { id: "member", points: 63 }, { id: "practice-only", points: -63 },
  ]);
});

it("练习桌即使使用正式账号也只保存战绩，实时捕获和旧牌桌恢复不生成统计账本", () => {
  const { db, records, hand } = source();
  const game = createGame("练习桌", "practice-capture");
  game.players = seats.map(seat => newPlayer(seat === 0 ? "member" : `bot${seat}`, `成员${seat}`, seat > 0));
  game.phase = "finished";
  game.history = [hand("practice-1", 10, 999)];
  records.capture(game, false);
  expect(db.prepare("SELECT COUNT(*) AS n FROM round_records").get()!.n).toBe(1);
  expect(db.prepare("SELECT COUNT(*) AS n FROM point_records").get()!.n).toBe(0);
  db.prepare("INSERT INTO table_archives VALUES (?)").run(JSON.stringify(game));
  expect(createRecords(db).points(new URLSearchParams())).toMatchObject({ total: 0, tables: 0, points: 0 });
  expect(db.prepare("SELECT COUNT(*) AS n FROM round_records").get()!.n).toBe(1);
});

it("旧练习战绩和真人战绩共存时只迁移真人积分，包含外部输赢且只扣一次桌费", () => {
  const { db, hand, archive } = source();
  archive(hand("practice-1", 10, 999), "practice", "练习桌");
  const online = hand("online-1", 20, 30);
  online.result.externalDeltas = [4];
  archive(online, "online");
  const records = createRecords(db);
  expect(records.points(new URLSearchParams())).toMatchObject({ completedRounds: 1, playerRounds: 1, tables: 1, points: 12 });
  expect(db.prepare("SELECT record_id,points FROM point_records").all()).toEqual([{ record_id: "online-1", points: 34 }]);
  const csv = records.exportPoints(new URLSearchParams());
  expect(csv).toContain('"online-member","正式成员","100001","1","12"');
  expect(csv).not.toContain("999");
  expect(createRecords(db).points(new URLSearchParams()).points).toBe(12);
  expect(db.prepare("SELECT COUNT(*) AS n FROM round_records").get()!.n).toBe(2);
});

it("已入账的练习和解散记录不进入汇总或CSV，也不抢占异常混合牌桌的首把桌费", () => {
  const { db, records, hand, archive, ledger } = source();
  for (const [id, at, delta, reason, code] of [
    ["old-practice", 1, 999, "hu", "练习桌"],
    ["old-partial", 2, 888, "dissolved", "123456"],
    ["online-1", 20, 30, "hu", "123456"],
    ["online-2", 30, 10, "hu", "123456"],
  ] as const) {
    const record = hand(id, at, delta, reason);
    archive(record, "mixed-legacy", code);
    ledger(record, "mixed-legacy");
  }
  const onlyPractice = hand("only-practice", 15, 777);
  archive(onlyPractice, "practice-table", "练习桌", "practice-only");
  ledger(onlyPractice, "practice-table", "practice-only");
  const all = records.points(new URLSearchParams());
  expect(all).toMatchObject({ total: 1, completedRounds: 2, playerRounds: 2, tables: 1, points: 15 });
  expect(all.rows[0]).toMatchObject({ accountId: "member", rounds: 2, tables: 1, points: 15 });
  const firstDay = new URLSearchParams({ from: "20", to: "30" });
  const secondDay = new URLSearchParams({ from: "30", to: "40" });
  expect(records.points(firstDay).points).toBe(10);
  expect(records.points(secondDay).points).toBe(5);
  const csv = records.exportPoints(new URLSearchParams({ page: "99" }));
  expect(csv).toContain('"online-member","正式成员","100001","1","15"');
  expect(csv).not.toContain("practice-only-member");
  expect(createRecords(db).points(new URLSearchParams())).toEqual(all);
  expect(db.prepare("SELECT COUNT(*) AS n FROM point_records").get()!.n).toBe(5);
});

it("未关联战绩的旧积分仍按原值统计，不因新增练习过滤丢失", () => {
  const { records, hand, ledger } = source();
  ledger(hand("orphan-ledger", 10, 18), "old-room");
  expect(records.points(new URLSearchParams())).toMatchObject({ completedRounds: 1, playerRounds: 1, tables: 1, points: 18 });
});

it('正式服务器体验桌保留战绩，但机器人体验不进入会员积分、CSV或重启迁移',()=>{
  const {db,records,hand}=source();
  const g=createGame('876543','experience');
  g.players=seats.map(seat=>newPlayer(seat===0?'member':`bot-${seat}`,String(seat),seat>0));
  g.table={creatorId:'member',groupId:'experience',number:1,createdAt:0,settings:{} as any,experience:{sourceCode:'123456'}};
  g.phase='finished';g.history=[hand('experience-round',10,999)];
  records.capture(g,false);
  const stored=JSON.parse(String(db.prepare('SELECT record FROM round_records').get()!.record));
  expect(stored.experience).toBe(true);
  expect(db.prepare('SELECT COUNT(*) AS n FROM point_records').get()!.n).toBe(0);
  expect(createRecords(db).points(new URLSearchParams()).points).toBe(0);
  expect(records.exportPoints(new URLSearchParams())).not.toContain('999');
});
