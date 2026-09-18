import { DatabaseSync } from "node:sqlite";
import { afterEach, expect, it, vi } from "vitest";
import ExcelJS from "../server/report-xlsx/node_modules/exceljs";
import { settlementWorkbook } from "../server/report-xlsx/workbook";
import {
  DAY_MS, buildScheduledReport, createReportQueue, dailyScoreCsv, dailyScoreDocument, dailyScoreRows,
  parseReportConfig, participationCsv, participationRows, reportDocument, reportBytes, telegramApi, TelegramDeliveryError,
} from "../server/telegram-reports";

const databases: DatabaseSync[] = [];
const database = () => { const db = new DatabaseSync(":memory:"); databases.push(db); return db; };
afterEach(() => { for (const db of databases.splice(0)) db.close(); });
const end = Date.parse("2026-09-17T00:00:00+08:00");
async function readSheet(doc: Parameters<typeof reportBytes>[0]) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(reportBytes(doc) as any);
  return wb.worksheets[0];
}
const config = () => parseReportConfig({
  chatId: "-123456", chatTitle: "麻将统计", timezone: "Asia/Shanghai", countUnit: "completedTables",
  schedules: [
    { id: "weekly-love", name: "一生所爱战队", teams: [{ id: "team-1", name: "一生所爱战队" }], kind: "weeklyTables", days: 7, firstEnd: "2026-09-23T00:00:00+08:00" },
    { id: "weekly-jasmine-ice", name: "冰茉莉战队+日结冰战队", teams: [{ id: "team-2", name: "冰茉莉战队" }, { id: "team-4", name: "日结冰战队" }], kind: "weeklyTables", days: 7, firstEnd: "2026-09-23T00:00:00+08:00" },
    { id: "daily-ding-ice", name: "日结丁战队+日结冰战队", teams: [{ id: "team-3", name: "日结丁战队" }, { id: "team-4", name: "日结冰战队" }], kind: "dailyScore", days: 1, firstEnd: "2026-09-17T00:00:00+08:00" },
    { id: "weekly-ding", name: "日结丁战队", teams: [{ id: "team-3", name: "日结丁战队" }], kind: "weeklyTables", days: 7, firstEnd: "2026-09-23T00:00:00+08:00" },
  ],
});
function source() {
  const db = database();
  db.exec(`CREATE TABLE teams(id TEXT PRIMARY KEY,name TEXT);
    CREATE TABLE accounts(id TEXT PRIMARY KEY,username TEXT);
    CREATE TABLE account_numbers(account_id TEXT PRIMARY KEY,member_id INTEGER);
    CREATE TABLE team_memberships(account_id TEXT PRIMARY KEY,team_id TEXT,updated_at INTEGER);
    CREATE TABLE account_audit(id TEXT PRIMARY KEY,account_id TEXT,event TEXT,at INTEGER);
    INSERT INTO team_memberships VALUES ('u1','team-3',0),('u2','team-3',0);
    CREATE TABLE round_records(id TEXT PRIMARY KEY,record TEXT,code TEXT DEFAULT '123456');
    CREATE TABLE match_records(id TEXT PRIMARY KEY,game_id TEXT,at INTEGER,code TEXT DEFAULT '123456');
    CREATE TABLE point_records(record_id TEXT,game_id TEXT,at INTEGER,account_id TEXT,team_id TEXT,points REAL DEFAULT 0,PRIMARY KEY(record_id,account_id));
    INSERT INTO teams VALUES ('team-1','一生所爱战队'),('team-2','冰茉莉战队'),('team-3','日结丁战队'),('team-4','日结冰战队');
    INSERT INTO accounts VALUES ('u1','zhangsan'),('u2','李四'),('u3','no-games');
    INSERT INTO account_numbers VALUES ('u1',100001),('u2',100002),('u3',100003);`);
  function table(id: string, at: number | null, hands: number, team = "team-3", reason = "selfDraw") {
    if (at !== null) db.prepare("INSERT INTO match_records (id,game_id,at) VALUES (?,?,?)").run(id, id, at);
    for (let h = 0; h < hands; h++) {
      const record = `${id}-${h}`;
      db.prepare("INSERT INTO round_records (id,record) VALUES (?,?)").run(record, JSON.stringify({ result: { reason } }));
      for (const account of ["u1", "u2"]) db.prepare("INSERT INTO point_records (record_id,game_id,at,account_id,team_id) VALUES (?,?,?,?,?)").run(record, id, (at ?? end) - 20_000 + h, account, team);
    }
  }
  return { db, table };
}
it("三机器人体验桌即使存在旧积分流水也不进入日结和周结", () => {
  const { db, table } = source();
  table("experience", end - 1, 8);
  db.exec(`UPDATE round_records SET record=json_set(record,'$.experience',json('true'),'$.initialScore',90,'$.settlementBase',100);
    UPDATE point_records SET points=100;`);
  expect(participationRows(db, "team-3", end - DAY_MS, end)).toEqual([]);
  expect(dailyScoreRows(db, "team-3", end - DAY_MS, end)).toEqual([]);
  table("real", end - 1, 1);
  db.exec("UPDATE point_records SET points=20 WHERE game_id='real'");
  expect(participationRows(db, "team-3", end - DAY_MS, end).map(r => r.rounds)).toEqual([1, 1]);
  expect(dailyScoreRows(db, "team-3", end - DAY_MS, end).map(r => r.score)).toEqual([20, 20]);
});
it("333069 finishes after five hands: each member receives one table and three points", () => {
  const { db, table } = source(); table("333069", end - 1000, 5);
  expect(participationRows(db, "team-3", end - DAY_MS, end)).toEqual([
    { teamName: "日结丁战队", userId: "100001", username: "zhangsan", rounds: 1, points: 3 },
    { teamName: "日结丁战队", userId: "100002", username: "李四", rounds: 1, points: 3 },
  ]);
});
it("counts the table at its finish time, with a half-open day and no partial or empty table credits", () => {
  const { db, table } = source();
  table("start", end - DAY_MS, 4); table("last-ms", end - 1, 8);
  table("next-day", end, 8); table("before", end - DAY_MS - 1, 8);
  table("in-progress", null, 5); table("empty", end - 1, 0); table("dissolved-only", end - 1, 1, "team-3", "dissolved");
  expect(participationRows(db, "team-3", end - DAY_MS, end).map(r => [r.rounds, r.points])).toEqual([[2, 6], [2, 6]]);
  expect(participationRows(db, "team-3", end, end + DAY_MS).map(r => r.rounds)).toEqual([1, 1]);
});
it("moves the entire table to the final team once after a mid-table transfer", () => {
  const { db, table } = source(); table("transfer", end - 1, 5);
  db.prepare("UPDATE point_records SET team_id='team-4' WHERE record_id<>'transfer-0'").run();
  db.exec("UPDATE team_memberships SET team_id='team-4'");
  expect(participationRows(db, "team-4", end - DAY_MS, end).map(r => r.rounds)).toEqual([1, 1]);
  expect(participationRows(db, "team-3", end - DAY_MS, end)).toEqual([]);
});
it("exports exactly four columns with Chinese text, quoted names and safe spreadsheet text", () => {
  const csv = participationCsv([{ teamName: "日结丁战队", userId: "100001", username: '=HYPERLINK("x","y")', rounds: 5, points: 15 }]);
  expect(csv).toBe('\ufeff用户ID,用户名,局数,分数\r\n100001,"\'=HYPERLINK(""x"",""y"")",5,15\r\n');
  expect(participationCsv([])).toBe("\ufeff用户ID,用户名,局数,分数\r\n");
  const doc = reportDocument("冰茉莉战队", end - DAY_MS, end + 6 * DAY_MS, []);
  expect(doc.filename).toBe("冰茉莉战队20260916-20260922周结算.csv");
  expect(doc.caption).toContain("本期暂无已完成牌桌");
});
it("rejects ambiguous dates, duplicate schedules and private-chat recipients", () => {
  expect(() => parseReportConfig({ ...config(), chatId: "123456" })).toThrow();
  expect(() => parseReportConfig({ ...config(), schedules: [config().schedules[0], config().schedules[0]] })).toThrow();
  expect(() => parseReportConfig({ ...config(), schedules: [{ ...config().schedules[0], firstEnd: "2026-02-30T00:00:00+08:00" }] })).toThrow();
  expect(() => parseReportConfig({ ...config(), schedules: [{ ...config().schedules[0], days: 1 }] })).toThrow();
});
it("queues one daily file at midnight and three weekly files only after the full seven-day period", () => {
  const db = database(), queue = createReportQueue(db, config());
  queue.enqueue(end - 1); expect(queue.status()).toHaveLength(0);
  queue.enqueue(end); expect(queue.status()).toHaveLength(1);
  queue.enqueue(end); expect(queue.status()).toHaveLength(1);
  const weeklyEnd = Date.parse("2026-09-23T00:00:00+08:00");
  queue.enqueue(weeklyEnd - 1); expect(queue.status()).toHaveLength(6);
  queue.enqueue(weeklyEnd); expect(queue.status()).toHaveLength(10);
  const sameMidnight = queue.status().filter(row => row.end_at === weeklyEnd);
  expect(sameMidnight.filter(row => row.kind === "dailyScore")).toHaveLength(1);
  expect(sameMidnight.filter(row => row.kind === "weeklyTables")).toHaveLength(3);
  const weekly = queue.status().filter(row => row.name === "一生所爱战队");
  expect(weekly).toHaveLength(1);
  expect(weekly[0].start_at).toBe(Date.parse("2026-09-16T00:00:00+08:00"));
  expect(Number(weekly[0].end_at) - Number(weekly[0].start_at)).toBe(7 * DAY_MS);
});
it("daily net scores charge one saved table fee then divide by two, never by the app multiplier", async () => {
  const { db, table } = source(); table("333069", end - 1, 5);
  db.exec(`UPDATE round_records SET record=json_set(record,'$.initialScore',90,'$.settlementBase',100,'$.scoreDivisor',5);
    UPDATE point_records SET points=CASE account_id WHEN 'u1' THEN 14 ELSE -18 END;`);
  expect(dailyScoreRows(db, "team-3", end - DAY_MS, end)).toEqual([
    { teamName: "日结丁战队", userId: "100001", username: "zhangsan", score: 60, points: 30 },
    { teamName: "日结丁战队", userId: "100002", username: "李四", score: -100, points: -50 },
  ]);
  const doc = await buildScheduledReport(db, config().schedules[2], end - DAY_MS, end);
  const sheet = await readSheet(doc);
  expect(sheet.getCell("F3").value).toBe(60);
  expect(sheet.getCell("G3").value).toEqual({ formula: "F3*0.5", result: 30 });
});
it("daily scores use completed hand timestamps across midnight and transfers, with only one fee", () => {
  const { db, table } = source(); table("overnight", null, 3);
  db.exec(`UPDATE round_records SET record=json_set(record,'$.initialScore',90,'$.settlementBase',100);
    UPDATE point_records SET points=11;`);
  db.prepare("UPDATE point_records SET at=? WHERE record_id='overnight-0'").run(end - 1);
  db.prepare("UPDATE point_records SET at=?,team_id='team-4' WHERE record_id='overnight-1'").run(end);
  db.prepare("UPDATE point_records SET at=?,team_id='team-4' WHERE record_id='overnight-2'").run(end + DAY_MS);
  expect(dailyScoreRows(db, "team-3", end - DAY_MS, end).map(r => [r.score, r.points])).toEqual([[1, 0.5], [1, 0.5]]);
  db.prepare("UPDATE team_memberships SET team_id='team-4',updated_at=?").run(end);
  expect(dailyScoreRows(db, "team-4", end, end + DAY_MS).map(r => [r.score, r.points])).toEqual([[11, 5.5], [11, 5.5]]);
  expect(dailyScoreRows(db, "team-4", end + DAY_MS, end + 2 * DAY_MS).map(r => r.score)).toEqual([11, 11]);
  expect(participationRows(db, "team-3", end - DAY_MS, end + 2 * DAY_MS)).toEqual([]);
});
it("daily scores exclude dissolved hands, keep zero totals, and never invent missing legacy fees", () => {
  const { db, table } = source(); table("legacy", end - 1, 1); table("cancelled", end - 1, 1, "team-3", "dissolved");
  db.exec("UPDATE point_records SET points=999 WHERE game_id='cancelled'");
  db.exec("UPDATE point_records SET points=-1 WHERE game_id='legacy' AND account_id='u2'");
  expect(dailyScoreRows(db, "team-3", end - DAY_MS, end).map(r => [r.score, r.points])).toEqual([[0, 0], [-1, -0.5]]);
});
it("daily file has scores and positive/negative numeric points, while filenames use the covered date", () => {
  expect(dailyScoreCsv([{ teamName: "日结丁战队", userId: "100001", username: "=abc", score: -1, points: -0.5 }]))
    .toBe("\ufeff用户ID,用户名,分数,积分\r\n100001,'=abc,-1,-0.5\r\n");
  const doc = dailyScoreDocument("日结丁战队", end - DAY_MS, end, []);
  expect(doc.filename).toBe("日结丁战队20260916日清算.csv");
  expect(doc.csv).toBe("\ufeff用户ID,用户名,分数,积分\r\n");
  expect(doc.caption).toContain("2026-09-17 00:00:00");
  expect(reportDocument("冰茉莉战队", Date.parse("2026-12-29T00:00:00+08:00"), Date.parse("2027-01-05T00:00:00+08:00"), []).filename)
    .toBe("冰茉莉战队20261229-20270104周结算.csv");
});
it("migrates the pre-first-delivery v1 schedule safely and refuses overwriting historical runs", () => {
  const empty = database();
  empty.exec("CREATE TABLE report_schedules(team_id TEXT PRIMARY KEY,config TEXT); CREATE TABLE report_runs(id TEXT PRIMARY KEY);");
  const queue = createReportQueue(empty, config()); queue.enqueue(end);
  expect(queue.status()).toHaveLength(1);
  expect(empty.prepare("SELECT COUNT(*) AS n FROM report_schedules").get()!.n).toBe(4);
  const used = database();
  used.exec("CREATE TABLE report_schedules(team_id TEXT PRIMARY KEY,config TEXT); CREATE TABLE report_runs(id TEXT PRIMARY KEY); INSERT INTO report_runs VALUES ('preserve-me');");
  expect(() => createReportQueue(used, config())).toThrow("不能自动改写历史");
  expect(used.prepare("SELECT id FROM report_runs").get()!.id).toBe("preserve-me");
});
it("sends the four groups at the weekly boundary and never resends after restart", async () => {
  const db = database(), queue = createReportQueue(db, config());
  const weeklyEnd = end + 6 * DAY_MS;
  queue.enqueue(weeklyEnd);
  const send = vi.fn(async () => 100);
  await queue.deliverDue(weeklyEnd, run => ({ filename: `${run.schedule_id}-${run.kind}`, csv: run.kind, caption: "test" }), send);
  expect(send).toHaveBeenCalledTimes(10);
  const restarted = createReportQueue(db, config()); restarted.enqueue(weeklyEnd);
  await restarted.deliverDue(weeklyEnd, () => { throw new Error("already sent"); }, send);
  expect(send).toHaveBeenCalledTimes(10);
  restarted.enqueue(weeklyEnd + DAY_MS);
  expect(restarted.status().filter(row => row.status === "pending").map(row => row.kind)).toEqual(["dailyScore"]);
});
const document = { filename: "test.csv", caption: "测试", csv: "用户ID,用户名,局数,积分\r\n" };
it("does not resend successful documents after restart and catches up each missed interval separately", async () => {
  const db = database(), queue = createReportQueue(db, config()); queue.enqueue(end);
  const send = vi.fn(async () => 10);
  await queue.deliverDue(end, () => document, send);
  const restarted = createReportQueue(db, config()); restarted.recoverInterrupted(); restarted.enqueue(end);
  await restarted.deliverDue(end, () => document, send);
  expect(send).toHaveBeenCalledTimes(1);
  restarted.enqueue(end + 2 * DAY_MS);
  await restarted.deliverDue(end + 2 * DAY_MS, () => document, send);
  expect(send).toHaveBeenCalledTimes(3);
  expect(restarted.status().every(r => r.status === "sent")).toBe(true);
});
it("honors Telegram retry_after and preserves the original CSV across retries", async () => {
  const db = database(), c = config(); c.schedules = [c.schedules[2]];
  const queue = createReportQueue(db, c); queue.enqueue(end);
  const send = vi.fn().mockRejectedValueOnce(new TelegramDeliveryError("retry", "限速", 120)).mockResolvedValueOnce(10);
  await queue.deliverDue(end, () => document, send);
  await queue.deliverDue(end + 119_999, () => { throw new Error("must reuse saved file"); }, send);
  expect(send).toHaveBeenCalledTimes(1);
  await queue.deliverDue(end + 120_000, () => { throw new Error("must reuse saved file"); }, send);
  expect(send.mock.calls[1][0]).toEqual(document);
  expect(queue.status()[0].status).toBe("sent");
});
it("does not blindly resend a document after a lost upload response or interrupted process", async () => {
  const db = database(), queue = createReportQueue(db, config()); queue.enqueue(end);
  const send = vi.fn(async () => { throw new Error("socket closed"); });
  await queue.deliverDue(end, () => document, send);
  expect(queue.status().every(r => r.status === "uncertain")).toBe(true);
  db.exec("UPDATE report_runs SET status='sending'"); queue.recoverInterrupted();
  await queue.deliverDue(end + DAY_MS, () => document, send);
  expect(send).toHaveBeenCalledTimes(1);
});
it("refuses silently changing an existing schedule or recipient", () => {
  const db = database(); createReportQueue(db, config());
  expect(() => createReportQueue(db, { ...config(), chatId: "-987654" })).toThrow("发送计划已改变");
});
const fakeToken = "123456:TEST_TOKEN_ONLY_NOT_A_REAL_SECRET";
it("combines all of a final member's daily history, including former teams, charging each fee once", async () => {
  const { db, table } = source();
  table("ding", end - 1, 2); table("ice", end - 1, 1, "team-4"); table("former-team", end - 1, 1, "team-2");
  db.exec(`UPDATE round_records SET record=json_set(record,'$.initialScore',90,'$.settlementBase',100);
    UPDATE point_records SET points=10;
    UPDATE point_records SET team_id='team-4',points=20 WHERE record_id='ding-1';
    UPDATE point_records SET points=CASE account_id WHEN 'u1' THEN -4 ELSE -10 END WHERE game_id='ice';
    UPDATE point_records SET points=999 WHERE game_id='former-team';`);
  const rows = dailyScoreRows(db, ["team-3", "team-4"], end - DAY_MS, end);
  expect(rows).toEqual([
    { teamName: "日结丁战队", userId: "100001", username: "zhangsan", score: 995, points: 497.5 },
    { teamName: "日结丁战队", userId: "100002", username: "李四", score: 989, points: 494.5 },
  ]);
  expect(dailyScoreRows(db, ["team-3", "team-4", "team-3"], end - DAY_MS, end)).toEqual(rows);
  const doc = await buildScheduledReport(db, config().schedules[2], end - DAY_MS, end);
  expect(doc.filename).toBe("日结算表2026.9.16.xlsx");
  expect((await readSheet(doc)).rowCount).toBe(5);
});
it("assigns all distinct weekly tables exclusively to the final team, never across two reports", async () => {
  const { db, table } = source();
  table("jasmine", end - 1, 5, "team-2"); table("ice", end - 1, 8, "team-4");
  table("ding", end - 1, 5); table("love", end - 1, 5, "team-1");
  db.exec("UPDATE point_records SET team_id='team-4' WHERE record_id='jasmine-4' OR record_id='ding-4'");
  db.exec("UPDATE team_memberships SET team_id='team-4'");
  // Duplicate match snapshots must still represent only one actual table.
  db.prepare("INSERT INTO match_records (id,game_id,at) VALUES ('duplicate','jasmine',?)").run(end - 1);
  expect(participationRows(db, ["team-2", "team-4"], end - DAY_MS, end).map(r => [r.rounds, r.points])).toEqual([[4, 12], [4, 12]]);
  const weekly = config().schedules.filter(s => s.kind === "weeklyTables");
  expect(weekly.map(s => participationRows(db,s.teams.map(t=>t.id),end-DAY_MS,end).length)).toEqual([0,2,0]);
  expect((await buildScheduledReport(db, config().schedules[1], end - DAY_MS, end + 6 * DAY_MS)).filename)
    .toBe("冰茉莉战队+日结冰战队工资总表2026.9.16-9.22.xlsx");
});
it("rejects overlapping same-kind groups, misleading names and empty groups", () => {
  const c = config(), daily = c.schedules[2];
  expect(() => parseReportConfig({ ...c, schedules: [...c.schedules, { ...daily, id: "another" }] })).toThrow("重复");
  expect(() => parseReportConfig({ ...c, schedules: [{ ...daily, name: "错误战队" }] })).toThrow("名称");
  expect(() => parseReportConfig({ ...c, schedules: [{ ...daily, teams: [] }] })).toThrow();
  const { db } = source();
  expect(() => dailyScoreRows(db, [], end - DAY_MS, end)).toThrow();
  expect(() => participationRows(db, ["team-3", "missing"], end - DAY_MS, end)).toThrow("不存在");
});
it("migrates an empty v2 queue to groups but preserves and refuses any existing v2 deliveries", () => {
  for (const hasHistory of [false, true]) {
    const db = database();
    db.exec("CREATE TABLE report_schedules(schedule_id TEXT PRIMARY KEY,config TEXT); CREATE TABLE report_runs(id TEXT PRIMARY KEY,team_id TEXT,kind TEXT);");
    db.prepare("INSERT INTO report_schedules VALUES (?,?)").run("team-3:dailyScore", "v2");
    if (hasHistory) {
      db.exec("INSERT INTO report_runs VALUES ('preserve-me','team-3','dailyScore')");
      expect(() => createReportQueue(db, config())).toThrow("不能自动改写历史");
      expect(db.prepare("SELECT id FROM report_runs").get()!.id).toBe("preserve-me");
      expect(db.prepare("SELECT config FROM report_schedules").get()!.config).toBe("v2");
    } else {
      const queue = createReportQueue(db, config()); queue.enqueue(end);
      expect(queue.status()).toHaveLength(1);
      expect(JSON.parse(String(queue.status()[0].teams)).map((t: { id: string }) => t.id)).toEqual(["team-3", "team-4"]);
    }
  }
});
it("refuses silently removing an existing group", () => {
  const db = database(), c = config(); createReportQueue(db, c);
  c.schedules.pop();
  expect(() => createReportQueue(db, c)).toThrow("发送计划已改变");
  expect(db.prepare("SELECT COUNT(*) AS n FROM report_schedules").get()!.n).toBe(4);
});
it("verifies the exact named group and the bot's document permission", async () => {
  const request = vi.fn()
    .mockResolvedValueOnce(Response.json({ ok: true, result: { id: 1, is_bot: true, username: "test_bot" } }))
    .mockResolvedValueOnce(Response.json({ ok: true, result: { id: -123456, title: "wrong group", type: "group" } }));
  await expect(telegramApi(fakeToken, request).verifyDestination("-123456", "麻将统计")).rejects.toMatchObject({ outcome: "blocked" });
  expect(request).toHaveBeenCalledTimes(2);
});
it("uploads a UTF-8 CSV attachment and verifies the returned destination", async () => {
  const request = vi.fn(async (_url: unknown, init?: RequestInit) => {
    const form = init!.body as FormData;
    expect(form.get("chat_id")).toBe("-123456");
    const file = form.get("document") as File;
    expect(file.name).toBe("test.csv"); expect(await file.text()).toBe(document.csv);
    return Response.json({ ok: true, result: { message_id: 77, chat: { id: -123456 } } });
  });
  expect(await telegramApi(fakeToken, request as typeof fetch).sendDocument(document, "-123456")).toBe(77);
});
it("redacts tokens and classifies an ambiguous upload separately from a retryable preflight", async () => {
  const request = vi.fn(async () => { throw new Error(`fetch failed at https://api.telegram.org/bot${fakeToken}/sendDocument`); });
  const api = telegramApi(fakeToken, request);
  await expect(api.sendDocument(document, "-123456")).rejects.toMatchObject({ outcome: "uncertain", message: "上传结果未确认，请核对群内文件" });
  await expect(api.verifyDestination("-123456", "麻将统计")).rejects.toMatchObject({ outcome: "retry", message: "Telegram 暂时无法连接" });
});

it("uses the last roster before the boundary even when delivery is delayed, honoring leave-team events", () => {
  const { db, table } = source(); table("prior",end-1,2);
  const event = db.prepare("INSERT INTO account_audit VALUES (?,?,?,?)");
  for (const account of ["u1","u2"]) {
    event.run(account+"-1",account,JSON.stringify({event:"membership-changed",teamId:"team-3"}),end-1000);
    event.run(account+"-2",account,JSON.stringify({event:"membership-changed",teamId:"team-4"}),end);
  }
  db.prepare("UPDATE team_memberships SET team_id='team-4',updated_at=?").run(end);
  expect(participationRows(db,"team-3",end-DAY_MS,end)).toHaveLength(2);
  expect(participationRows(db,"team-4",end-DAY_MS,end)).toHaveLength(0);
  event.run("leave","u1",JSON.stringify({event:"membership-changed",teamId:null}),end-1);
  expect(dailyScoreRows(db,["team-3","team-4"],end-DAY_MS,end).map(r=>r.userId)).toEqual(["100002"]);
});

it("excludes practice tables from both score and weekly participation even if imported into server history", () => {
  const {db,table}=source(); table("online",end-1,1);table("practice",end-1,3);
  db.exec(`UPDATE round_records SET code='练习桌' WHERE id LIKE 'practice-%';
    UPDATE match_records SET code='练习桌' WHERE id='practice';
    UPDATE point_records SET points=CASE game_id WHEN 'practice' THEN 999 ELSE 10 END;`);
  expect(dailyScoreRows(db,"team-3",end-DAY_MS,end).map(r=>r.score)).toEqual([10,10]);
  expect(participationRows(db,"team-3",end-DAY_MS,end).map(r=>r.rounds)).toEqual([1,1]);
});

it("renders template columns, dates and formulas; member text cannot become a formula", async () => {
  const { db,table } = source(); table("weekly",end-1,5);
  db.prepare("UPDATE accounts SET username=? WHERE id='u1'").run('=HYPERLINK("https://bad.invalid","x")');
  const doc = await buildScheduledReport(db,config().schedules[3],end-DAY_MS,end+6*DAY_MS);
  const sh = await readSheet(doc);
  expect(sh.getCell("A1").value).toBe("日结丁战队工资总表2026.9.16-9.22");
  expect(sh.getRow(2).values).toEqual([undefined,"战队名","玩家ID","用户名","20金额","50局数","50积分","总结算"]);
  expect(sh.getCell("A3").value).toBe("日结丁战队");
  expect(sh.getCell("B3").value).toBe("100001");
  expect(sh.getCell("C3").type).toBe(ExcelJS.ValueType.String);
  expect(sh.getCell("F3").value).toEqual({formula:"E3*3",result:3});
  expect(sh.getCell("G4").value).toEqual({formula:"D4+F4",result:3});
  expect(sh.getCell("G4").numFmt).toBe("0");
  const crossYear = await buildScheduledReport(db,config().schedules[3],Date.parse("2026-12-29T00:00:00+08:00"),Date.parse("2027-01-05T00:00:00+08:00"));
  expect(crossYear.filename).toBe("日结丁战队工资总表2026.12.29-2027.1.4.xlsx");
  expect((await readSheet(crossYear)).getCell("A3").value).toBe("本期无结算记录");
});

it("saves binary Excel snapshots across retries and keeps sent CSV history untouched", async () => {
  const state = database(), queue = createReportQueue(state,config());
  queue.enqueue(end);
  await queue.deliverDue(end,()=>document,async()=>10);
  const original = state.prepare("SELECT document,sha256,message_id FROM report_runs WHERE end_at=?").get(end);
  queue.enqueue(end+DAY_MS);
  const {db,table} = source(); table("game",end+DAY_MS-1,2);
  const build = vi.fn(run=>buildScheduledReport(db,{...config().schedules[2]},run.start_at,run.end_at));
  const send = vi.fn().mockRejectedValueOnce(new TelegramDeliveryError("retry","rate",1)).mockResolvedValue(11);
  await queue.deliverDue(end+DAY_MS,build,send);
  db.exec("UPDATE team_memberships SET team_id='team-1'");
  const restarted = createReportQueue(state,config());
  await restarted.deliverDue(end+DAY_MS+1000,build,send);
  expect(build).toHaveBeenCalledTimes(1);
  expect(send.mock.calls[0][0].xlsxBase64).toBe(send.mock.calls[1][0].xlsxBase64);
  expect(state.prepare("SELECT document,sha256,message_id FROM report_runs WHERE end_at=?").get(end)).toEqual(original);
});

it("uploads XLSX as binary with the Excel MIME type", async () => {
  const {db,table}=source(); table("g",end-1,1);
  const doc=await buildScheduledReport(db,config().schedules[2],end-DAY_MS,end);
  const request = vi.fn(async (_url: unknown, init?: RequestInit) => {
    const file=(init!.body as FormData).get("document") as File;
    expect(file.name).toBe(doc.filename);
    expect(file.type).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(Buffer.from(await file.arrayBuffer())).toEqual(reportBytes(doc));
    return Response.json({ok:true,result:{message_id:78,chat:{id:-123456}}});
  });
  expect(await telegramApi(fakeToken,request as typeof fetch).sendDocument(doc,"-123456")).toBe(78);
});

it("adds formula totals to all numeric columns, outside the filter, including signed fractions and empty reports", async () => {
  const rows = [
    { teamName: "日结丁战队", userId: "100001", username: "甲", score: 11, points: 5.5 },
    { teamName: "日结冰战队", userId: "100002", username: "乙", score: -16, points: -8 },
  ];
  const daily = await readSheet(await settlementWorkbook("dailyScore", "日结丁战队+日结冰战队", "2026-09-16", "2026-09-16", rows));
  expect(daily.getCell("A5").value).toBe("总计：");
  expect(daily.autoFilter).toBe("A2:H4");
  expect(daily.getCell("F5").value).toEqual({ formula: "SUM(F3:F4)", result: -5 });
  expect(daily.getCell("G5").value).toEqual({ formula: "SUM(G3:G4)", result: -2.5 });
  expect(daily.getCell("H5").value).toEqual({ formula: "SUM(H3:H4)", result: -2.5 });
  for (const col of ["D", "E"]) expect(daily.getCell(`${col}5`).formula).toBe(`SUM(${col}3:${col}4)`);
  for (const name of ["日结丁战队", "一生所爱战队", "冰茉莉战队+日结冰战队"]) {
    const weekly = await readSheet(await settlementWorkbook("weeklyTables", name, "2026-09-16", "2026-09-22",
      rows.map((r, i) => ({...r, rounds: i + 1, points: (i + 1) * 3}))));
    expect(weekly.getCell("A5").value).toBe("总计：");
    expect(weekly.getCell("E5").value).toEqual({ formula: "SUM(E3:E4)", result: 3 });
    expect(weekly.getCell("G5").value).toEqual({ formula: "SUM(G3:G4)", result: 9 });
  }
  for (const kind of ["dailyScore", "weeklyTables"] as const) {
    const empty = await readSheet(await settlementWorkbook(kind, "日结丁战队", "2026-09-16", "2026-09-16", []));
    expect(empty.getCell("A3").value).toBe("本期无结算记录");
    expect(empty.getCell("A4").value).toBe("总计：");
    expect(empty.getCell("D4").formula).toBe("SUM(D3:D3)");
    expect(empty.getCell("D4").result ?? 0).toBe(0);
  }
});
