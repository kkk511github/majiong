import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, expect, it, vi } from "vitest";
import {
  chinaDate, createReportQueue, DAY_MS, parseReportConfig,
  type ReportSchedule, type TelegramReportConfig,
} from "../server/telegram-reports";

const openDatabases = new Set<DatabaseSync>();
const directories: string[] = [];
afterEach(() => {
  for (const db of openDatabases) db.close();
  openDatabases.clear();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});
const midnight = (day: number) => Date.parse(`2026-09-${day}T00:00:00+08:00`);
function periodConfig(weeklyFirstDay: 25 | 28) {
  return parseReportConfig({
    chatId: "-123456", chatTitle: "麻将统计", timezone: "Asia/Shanghai", countUnit: "completedTables",
    schedules: [
      { id: "daily-ding-ice", name: "日结丁战队+日结冰战队",
        teams: [{ id: "team-3", name: "日结丁战队" }, { id: "team-4", name: "日结冰战队" }],
        kind: "dailyScore", days: 1, firstEnd: "2026-09-19T00:00:00+08:00" },
      { id: "weekly-love", name: "一生所爱战队", teams: [{ id: "team-1", name: "一生所爱战队" }],
        kind: "weeklyTables", days: 7, firstEnd: `2026-09-${weeklyFirstDay}T00:00:00+08:00` },
      { id: "weekly-ding", name: "日结丁战队", teams: [{ id: "team-3", name: "日结丁战队" }],
        kind: "weeklyTables", days: 7, firstEnd: `2026-09-${weeklyFirstDay}T00:00:00+08:00` },
      { id: "weekly-jasmine-ice", name: "冰茉莉战队+日结冰战队",
        teams: [{ id: "team-2", name: "冰茉莉战队" }, { id: "team-4", name: "日结冰战队" }],
        kind: "weeklyTables", days: 7, firstEnd: `2026-09-${weeklyFirstDay}T00:00:00+08:00` },
    ],
  });
}
const savedConfig = (schedule: ReportSchedule, config: TelegramReportConfig) =>
  JSON.stringify({ ...schedule, chatId: config.chatId, countUnit: config.countUnit });
const schedules = (db: DatabaseSync) => db.prepare("SELECT * FROM report_schedules ORDER BY schedule_id").all();
const runs = (db: DatabaseSync) => db.prepare("SELECT * FROM report_runs ORDER BY end_at,schedule_id").all();
const historical = (db: DatabaseSync) => db.prepare("SELECT * FROM report_runs WHERE end_at<=? ORDER BY end_at,schedule_id").all(midnight(20));
function connect(path: string) {
  const db = new DatabaseSync(path);
  openDatabases.add(db);
  return db;
}
function close(db: DatabaseSync) {
  db.close();
  openDatabases.delete(db);
}
async function sentDailyHistory() {
  const directory = mkdtempSync(join(tmpdir(), "telegram-report-periods-"));
  directories.push(directory);
  const path = join(directory, "reports.sqlite");
  const db = connect(path);
  const oldConfig = periodConfig(25);
  const queue = createReportQueue(db, oldConfig);
  queue.enqueue(midnight(20));
  const send = vi.fn().mockResolvedValueOnce(1918).mockResolvedValueOnce(1919);
  await queue.deliverDue(midnight(20), run => ({
    filename: `日结${chinaDate(run.start_at)}.csv`, caption: "已发送历史",
    csv: `结算日期,金额\r\n${chinaDate(run.start_at)},0\r\n`,
  }), send);
  expect(send).toHaveBeenCalledTimes(2);
  expect(runs(db).map(run => [run.start_at, run.end_at, run.status, run.message_id])).toEqual([
    [midnight(18), midnight(19), "sent", 1918],
    [midnight(19), midnight(20), "sent", 1919],
  ]);
  return { db, path, oldConfig, newConfig: periodConfig(28), history: historical(db) };
}

/** The worker is stopped during the operational migration. Change exactly the
 * three weekly saved JSON rows, guarded by their full previous values. */
function migrateWeeklyFixture(db: DatabaseSync, oldConfig: TelegramReportConfig, newConfig: TelegramReportConfig) {
  expect(db.prepare("SELECT COUNT(*) AS n FROM report_runs WHERE kind='weeklyTables'").get()!.n).toBe(0);
  const historyBefore = runs(db);
  const schedulesBefore = schedules(db);
  db.exec("BEGIN IMMEDIATE");
  try {
    for (const id of ["weekly-love", "weekly-ding", "weekly-jasmine-ice"]) {
      const before = oldConfig.schedules.find(schedule => schedule.id === id)!;
      const after = newConfig.schedules.find(schedule => schedule.id === id)!;
      const updated = db.prepare("UPDATE report_schedules SET config=? WHERE schedule_id=? AND config=?")
        .run(savedConfig(after, newConfig), id, savedConfig(before, oldConfig));
      expect(updated.changes).toBe(1);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  const schedulesAfter = schedules(db);
  expect(schedulesAfter.filter((row, i) => row.config !== schedulesBefore[i].config).map(row => row.schedule_id))
    .toEqual(["weekly-ding", "weekly-jasmine-ice", "weekly-love"]);
  expect(schedulesAfter.find(row => row.schedule_id === "daily-ding-ice"))
    .toEqual(schedulesBefore.find(row => row.schedule_id === "daily-ding-ice"));
  expect(runs(db)).toEqual(historyBefore);
}

it("refuses an implicit weekly period change and leaves sent daily snapshots and saved schedules intact", async () => {
  const { db, newConfig, history } = await sentDailyHistory();
  const before = schedules(db);
  expect(() => createReportQueue(db, newConfig)).toThrow("发送计划已改变");
  expect(schedules(db)).toEqual(before);
  expect(runs(db)).toEqual(history);
});

it("preserves daily continuity and sends the three first weekly periods only at September 28 after explicit migration and restart", async () => {
  const { db, path, oldConfig, newConfig, history } = await sentDailyHistory();
  expect(newConfig.schedules[0]).toEqual(oldConfig.schedules[0]);
  migrateWeeklyFixture(db, oldConfig, newConfig);
  close(db);

  const reopened = connect(path);
  const queue = createReportQueue(reopened, newConfig);
  expect(historical(reopened)).toEqual(history);
  queue.enqueue(midnight(21) - 1);
  expect(runs(reopened)).toEqual(history);
  queue.enqueue(midnight(21));
  expect(reopened.prepare("SELECT start_at,end_at,kind,status FROM report_runs WHERE end_at=?").all(midnight(21)))
    .toEqual([{ start_at: midnight(20), end_at: midnight(21), kind: "dailyScore", status: "pending" }]);
  queue.enqueue(midnight(22));
  expect(reopened.prepare("SELECT start_at,end_at,kind,status FROM report_runs WHERE end_at=?").all(midnight(22)))
    .toEqual([{ start_at: midnight(21), end_at: midnight(22), kind: "dailyScore", status: "pending" }]);

  for (const day of [25, 27]) {
    queue.enqueue(midnight(day));
    expect(reopened.prepare("SELECT COUNT(*) AS n FROM report_runs WHERE kind='weeklyTables'").get()!.n).toBe(0);
  }
  queue.enqueue(midnight(28) - 1);
  expect(reopened.prepare("SELECT COUNT(*) AS n FROM report_runs WHERE kind='weeklyTables'").get()!.n).toBe(0);
  queue.enqueue(midnight(28));
  const weekly = reopened.prepare("SELECT schedule_id,start_at,end_at FROM report_runs WHERE kind='weeklyTables' ORDER BY schedule_id").all();
  expect(weekly).toEqual(["weekly-ding", "weekly-jasmine-ice", "weekly-love"].map(schedule_id => ({
    schedule_id, start_at: midnight(21), end_at: midnight(28),
  })));
  for (const run of weekly) expect(Number(run.end_at) - Number(run.start_at)).toBe(7 * DAY_MS);
  expect(reopened.prepare("SELECT kind,COUNT(*) AS n FROM report_runs WHERE end_at=? GROUP BY kind ORDER BY kind").all(midnight(28)))
    .toEqual([{ kind: "dailyScore", n: 1 }, { kind: "weeklyTables", n: 3 }]);

  // Separate queue instances sharing the durable state cannot duplicate the
  // same daily boundary or the three parallel weekly schedules.
  const peerDb = connect(path);
  const peerQueue = createReportQueue(peerDb, newConfig);
  const beforeRepeatedEnqueue = runs(reopened);
  await Promise.all([Promise.resolve().then(() => queue.enqueue(midnight(28))), Promise.resolve().then(() => peerQueue.enqueue(midnight(28)))]);
  expect(runs(reopened)).toEqual(beforeRepeatedEnqueue);
  const daily = reopened.prepare("SELECT schedule_id,start_at,end_at FROM report_runs WHERE kind='dailyScore' ORDER BY end_at").all();
  expect(daily).toEqual(Array.from({ length: 10 }, (_, i) => ({
    schedule_id: "daily-ding-ice", start_at: midnight(i + 18), end_at: midnight(i + 19),
  })));
  expect(historical(reopened)).toEqual(history);
  close(peerDb);
  close(reopened);

  const restartedDb = connect(path);
  const restarted = createReportQueue(restartedDb, newConfig);
  restarted.enqueue(midnight(28));
  expect(runs(restartedDb)).toEqual(beforeRepeatedEnqueue);
  restarted.enqueue(midnight(29));
  expect(restartedDb.prepare("SELECT start_at,end_at,kind FROM report_runs WHERE end_at=?").all(midnight(29)))
    .toEqual([{ start_at: midnight(28), end_at: midnight(29), kind: "dailyScore" }]);
  const beforeOldConfig = runs(restartedDb);
  const savedSchedules = schedules(restartedDb);
  expect(() => createReportQueue(restartedDb, oldConfig)).toThrow("发送计划已改变");
  expect(runs(restartedDb)).toEqual(beforeOldConfig);
  expect(schedules(restartedDb)).toEqual(savedSchedules);
  expect(historical(restartedDb)).toEqual(history);
});
