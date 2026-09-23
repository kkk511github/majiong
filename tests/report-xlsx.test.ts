import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { expect, it, vi } from "vitest";
import ExcelJS from "../server/report-xlsx/node_modules/exceljs";
import { settlementWorkbook } from "../server/report-xlsx/workbook";
import {
  createReportQueue, DAY_MS, parseReportConfig, reportBytes, TelegramDeliveryError,
  type ParticipationRow, type ReportDocument, type ReportKind, type ScoreRow,
} from "../server/telegram-reports";

async function readWorkbook(doc: ReportDocument) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(reportBytes(doc) as any);
  return wb;
}

const teamName = "日结丁战队+日结冰战队";
const scoreRows: ScoreRow[] = [
  { teamName: "日结丁战队", userId: "100001", username: "甲", score: 11, points: 5.5 },
  { teamName: "日结丁战队", userId: "100002", username: "乙", score: -16, points: -8 },
  { teamName: "日结冰战队", userId: "100003", username: "丙", score: 0, points: 0 },
];
const participationRows: ParticipationRow[] = scoreRows.map((row, i) => ({
  teamName: row.teamName, userId: row.userId, username: row.username, rounds: i + 1, points: (i + 1) * 3,
}));
const kinds: ReportKind[] = ["dailyScore", "weeklyTables"];

it.each(kinds)("%s removes retired fields from the actual XLSX and preserves the six-column layout", async kind => {
  const rows = kind === "dailyScore" ? scoreRows : participationRows;
  const wb = await readWorkbook(await settlementWorkbook(kind, teamName, "2026-09-16", "2026-09-22", rows));
  const sheet = wb.worksheets[0];
  expect(wb.worksheets).toHaveLength(1);
  expect(sheet.getRow(2).values).toEqual([
    undefined, "战队名", "玩家ID", "昵称", kind === "dailyScore" ? "50分数" : "50局数", "50金额", "总结算",
  ]);
  expect(sheet.columnCount).toBe(6);
  expect(sheet.actualColumnCount).toBe(6);
  sheet.eachRow(row => row.eachCell((cell, column) => {
    expect(column).toBeLessThanOrEqual(6);
    expect(cell.text).not.toMatch(/20分数|20金额|50积分/);
  }));
  expect(sheet.model.merges).toEqual(["A1:F1"]);
  expect(Array.from({ length: 6 }, (_, i) => sheet.getColumn(i + 1).width)).toEqual([19, 15, 28, 16, 16, 16]);
  expect(sheet.views[0]).toMatchObject({ state: "frozen", ySplit: 2, topLeftCell: "A3", showGridLines: false });
  expect(sheet.autoFilter).toBe("A2:F5");
  expect(sheet.pageSetup).toMatchObject({
    printArea: "A1:F6", printTitlesRow: "1:2", orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0,
  });
  expect(sheet.getRow(1).height).toBe(32);
  expect(sheet.getRow(2).height).toBe(24);
  expect(sheet.getRow(3).height).toBe(26);
  expect(sheet.getRow(6).height).toBe(28);
  expect(sheet.getCell("A3").value).toBe("日结丁战队");
  expect(sheet.getCell(kind === 'dailyScore' ? "A4" : "A5").value).toBe("日结冰战队");
});

it.each(kinds)("%s preserves numeric inputs, signed cached amounts and every bottom total", async kind => {
  const daily = kind === "dailyScore";
  const rows = daily ? scoreRows : participationRows;
  const sheet = (await readWorkbook(await settlementWorkbook(kind, teamName, "2026-09-16", "2026-09-22", rows))).worksheets[0];
  const expectedRows = daily ? [scoreRows[0], scoreRows[2], scoreRows[1]] : rows;
  expectedRows.forEach((row, i) => {
    const r = i + 3;
    expect(sheet.getCell(`D${r}`).value).toBe(daily ? (row as ScoreRow).score : (row as ParticipationRow).rounds);
    expect(sheet.getCell(`E${r}`).formula).toBe(`D${r}*${daily ? "0.5" : "3"}`);
    expect(sheet.getCell(`E${r}`).result ?? 0).toBe(row.points);
    expect(sheet.getCell(`F${r}`).formula).toBe(`E${r}`);
    expect(sheet.getCell(`F${r}`).result ?? 0).toBe(row.points);
  });
  expect(sheet.getCell("A6").value).toBe("总计：");
  const totals = daily ? [-5, -2.5, -2.5] : [6, 18, 18];
  ["D", "E", "F"].forEach((col, i) => {
    const cell = sheet.getCell(`${col}6`);
    expect(cell.value).toEqual({ formula: `SUM(${col}3:${col}5)`, result: totals[i] });
    expect(cell.font.bold).toBe(true);
    expect(cell.border.top).toMatchObject({ style: "thin" });
  });
  expect(sheet.getCell("E3").numFmt).toBe(daily ? "0.#######" : "0");
  expect(sheet.getCell("F6").numFmt).toBe(daily ? "0.#######" : "0");
  if (daily) for (const col of ["D", "E", "F"]) expect(sheet.getCell(`${col}5`).numFmt).toBe("0");
});

it('sorts the entire daily report by signed numeric amount, breaks ties by numeric ID, and never mutates input or weekly order', async () => {
  const amounts = [-8, 10, 100, 0, 10, 9.5, -0.5];
  const ids = ['100001', '10', '100003', '100004', '2', '100006', '100007'];
  const rows: ScoreRow[] = amounts.map((points, i) => ({ teamName: i % 2 ? '日结冰战队' : '日结丁战队', userId: ids[i], username: `玩家${i}`, score: points * 2, points }));
  const before = structuredClone(rows); Object.freeze(rows);
  const doc = await settlementWorkbook('dailyScore', teamName, '2026-09-23', '2026-09-23', rows);
  const sheet = (await readWorkbook(doc)).worksheets[0];
  const expected = [2, 4, 1, 5, 3, 6, 0].map(i => before[i]);
  expected.forEach((row, i) => {
    const r = i + 3;
    expect(sheet.getRow(r).values).toEqual([undefined, row.teamName, row.userId, row.username, row.score,
      { formula: `D${r}*0.5`, ...(row.points ? { result: row.points } : {}) },
      { formula: `E${r}`, ...(row.points ? { result: row.points } : {}) }]);
  });
  expect(sheet.getCell('A10').value).toBe('总计：');
  expect(sheet.getCell('E10').value).toEqual({ formula: 'SUM(E3:E9)', result: 121 });
  expect(sheet.getCell('D10').result).toBe(242); expect(sheet.getCell('F10').result).toBe(121);
  expect(sheet.autoFilter).toBe('A2:F9'); expect(doc.caption).toContain('分数÷2=121');
  expect(rows).toEqual(before);
  const weeklyRows = before.map((row, i) => ({ ...row, rounds: i + 1, points: (i + 1) * 3 }));
  const weekly = (await readWorkbook(await settlementWorkbook('weeklyTables', teamName, '2026-09-17', '2026-09-23', weeklyRows))).worksheets[0];
  expect(weeklyRows.map((_, i) => weekly.getCell(i + 3, 2).value)).toEqual(ids);
});

it('keeps a single daily participant above the total', async () => {
  const sheet = (await readWorkbook(await settlementWorkbook('dailyScore', teamName, '2026-09-23', '2026-09-23', [scoreRows[1]]))).worksheets[0];
  expect(sheet.getCell('B3').value).toBe('100002'); expect(sheet.getCell('E3').result).toBe(-8);
  expect(sheet.getCell('A4').value).toBe('总计：'); expect(sheet.getCell('E4').result).toBe(-8);
});

it.each(kinds)('%s displays nicknames as safe text, retains IDs for duplicate names and falls back only when missing', async kind => {
  const names = ['同名牌友', '同名牌友', '=SUM(A1:A9)', '这是一个超过十八个字符需要完整换行显示的昵称', '   '];
  const rows = names.map((nickname, i) => ({ teamName: '日结丁战队', userId: String(100001+i), username: `login-${i}`, nickname, score: 10, rounds: 2, points: kind === 'dailyScore' ? 5 : 6 }));
  const sheet = (await readWorkbook(await settlementWorkbook(kind, teamName, '2026-09-23', '2026-09-23', rows))).worksheets[0];
  expect(sheet.getCell('C2').value).toBe('昵称');
  rows.forEach((row, i) => {
    const cell = sheet.getCell(i+3, 3);
    expect(cell.value).toBe(i === 4 ? 'login-4' : names[i]);
    expect(cell.type).toBe(ExcelJS.ValueType.String); expect(cell.formula).toBeUndefined();
    expect(sheet.getCell(i+3, 2).value).toBe(row.userId);
  });
  expect(sheet.getRow(6).height).toBe(42);
});

it.each(kinds)("%s keeps an empty report printable with formula totals of zero", async kind => {
  const doc = await settlementWorkbook(kind, teamName, "2026-12-29", "2027-01-04", []);
  const sheet = (await readWorkbook(doc)).worksheets[0];
  expect(sheet.getCell("A1").text).toContain("2026.12.29-2027.1.4");
  expect(doc.filename).toContain("2026.12.29-2027.1.4.xlsx");
  expect(sheet.getCell("A3").value).toBe("本期无结算记录");
  expect(sheet.getCell("A4").value).toBe("总计：");
  expect(sheet.autoFilter).toBe("A2:F3");
  expect(sheet.pageSetup.printArea).toBe("A1:F4");
  for (const col of ["D", "E", "F"]) {
    expect(sheet.getCell(`${col}3`).value).toBeNull();
    expect(sheet.getCell(`${col}4`).formula).toBe(`SUM(${col}3:${col}3)`);
    expect(sheet.getCell(`${col}4`).result ?? 0).toBe(0);
  }
  expect(doc.caption).toContain("本期无结算记录");
});

it("keeps long names and formula-like member text as strings, without losing fractional precision", async () => {
  const names = ['=HYPERLINK("x","y")', "+SUM(A1:A9)", "@SUM(A1:A9)", "-1+2", "名字很长的玩家需要换行显示并保留完整姓名"];
  const rows: ScoreRow[] = names.map((username, i) => ({
    teamName: "日结丁战队", userId: `00000${i + 1}`, username, score: i === 0 ? 1.000001 : 0,
    points: i === 0 ? 0.5000005 : 0,
  }));
  const doc = await settlementWorkbook("dailyScore", "日结丁战队", "2026-09-20", "2026-09-20", rows);
  const sheet = (await readWorkbook(doc)).worksheets[0];
  expect(doc.filename).toBe("日结算表2026.9.20.xlsx");
  names.forEach((name, i) => {
    const cell = sheet.getCell(i + 3, 3);
    expect(cell.value).toBe(name);
    expect(cell.type).toBe(ExcelJS.ValueType.String);
    expect(cell.formula).toBeUndefined();
    expect(cell.alignment).toMatchObject({ wrapText: true, horizontal: "left", vertical: "middle" });
    expect(sheet.getCell(i + 3, 2).value).toBe(`00000${i + 1}`);
  });
  expect(sheet.getRow(7).height).toBe(42);
  expect(sheet.getCell("D3").value).toBe(1.000001);
  expect(sheet.getCell("E3").result).toBe(0.5000005);
  expect(sheet.getCell("F8").result).toBe(0.5000005);
  expect(sheet.getCell("F8").numFmt).toBe("0.#######");
});

it("retries a six-column XLSX on the next day using the identical saved bytes after restart", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    const end = Date.parse("2026-09-20T00:00:00+08:00");
    const config = parseReportConfig({
      chatId: "-123456", chatTitle: "麻将统计", timezone: "Asia/Shanghai", countUnit: "completedTables",
      schedules: [{ id: "daily-ding", name: "日结丁战队", teams: [{ id: "team-3", name: "日结丁战队" }],
        kind: "dailyScore", days: 1, firstEnd: "2026-09-20T00:00:00+08:00" }],
    });
    const queue = createReportQueue(db, config);
    queue.enqueue(end);
    const build = vi.fn(() => settlementWorkbook("dailyScore", "日结丁战队", "2026-09-19", "2026-09-19", scoreRows));
    const send = vi.fn<(...args: any[]) => Promise<number>>()
      .mockRejectedValueOnce(new TelegramDeliveryError("retry", "rate limit", 86_400))
      .mockResolvedValueOnce(101);
    await queue.deliverDue(end, build, send);
    const persisted = db.prepare("SELECT document,sha256 FROM report_runs").get()!;
    const restarted = createReportQueue(db, config);
    await restarted.deliverDue(end + DAY_MS, () => { throw new Error("must use persisted bytes"); }, send);
    expect(build).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledTimes(2);
    const before = send.mock.calls[0][0] as ReportDocument;
    const after = send.mock.calls[1][0] as ReportDocument;
    expect(after).toEqual(before);
    expect(reportBytes(after)).toEqual(reportBytes(before));
    expect(createHash("sha256").update(reportBytes(after)).digest("hex")).toBe(persisted.sha256);
    expect(db.prepare("SELECT document,sha256 FROM report_runs").get()).toEqual(persisted);
    expect(restarted.status()[0]).toMatchObject({ status: "sent", message_id: 101 });
    expect((await readWorkbook(after)).worksheets[0].getRow(2).values).toEqual([
      undefined, "战队名", "玩家ID", "昵称", "50分数", "50金额", "总结算",
    ]);
  } finally {
    db.close();
  }
});
