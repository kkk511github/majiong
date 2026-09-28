import ExcelJS from "exceljs";
import { fileURLToPath } from "node:url";
import type { ParticipationRow, ReportDocument, ReportKind, ScoreRow } from "../telegram-reports";

/** Fill the reviewed templates. This isolated dependency is installed only in
 * the reporting image; the game server does not load a spreadsheet runtime. */
export async function settlementWorkbook(kind: ReportKind, teamName: string, start: string, end: string,
  rows: (ParticipationRow | ScoreRow)[]): Promise<ReportDocument> {
  const daily = kind === "dailyScore";
  // Rank each complete report by its signed numeric amount, not by team
  // or formatted text. Copy first so callers and saved delivery snapshots stay intact.
  const orderedRows = [...rows].sort((a, b) => b.points - a.points ||
    a.userId.localeCompare(b.userId, 'en', { numeric: true }));
  const day = (date: string, year: boolean) => {
    const [y, m, d] = date.split("-").map(Number);
    return `${year ? y + "." : ""}${m}.${d}`;
  };
  const dates = start === end ? day(start, true) : `${day(start, true)}-${day(end, start.slice(0,4) !== end.slice(0,4))}`;
  const name = teamName.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_");
  const title = daily ? `日结算表${dates}` : `${name}工资总表${dates}`;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(fileURLToPath(new URL(`./templates/${kind}.xlsx`, import.meta.url)));
  const sheet = wb.worksheets[0];
  // Keep the reviewed template styling while permanently omitting its retired
  // 20-rate fields from every generated daily and weekly settlement.
  sheet.unMergeCells("A1");
  for (let c = sheet.getRow(2).cellCount; c >= 1; c--) {
    if (["20分数", "20金额"].includes(sheet.getCell(2, c).text)) sheet.spliceColumns(c, 1);
  }
  const cols = 6;
  sheet.getCell("C2").value = "昵称";
  sheet.getCell("E2").value = "50金额";
  sheet.mergeCells("A1:F1");
  // Templates supply compact base widths. Widen only IDs/numeric columns
  // when their actual values need it; long names wrap instead of widening all rows.
  const textUnits=(text:string)=>Array.from(text).reduce((n,c)=>n+(/\p{Mark}|\u200d/u.test(c)?0:c.codePointAt(0)!>255?2:1),0);
  const lines=(text:string,width:number)=>text.split(/\r?\n/).reduce((n,line)=>n+Math.max(1,Math.ceil(textUnits(line)/Math.max(1,width-2))),0);
  const numericText=(n:number)=>Number.isInteger(n)?String(n):n.toFixed(7).replace(/0+$/,'').replace(/\.$/,'');
  const totals=[0,0,0];
  for(const row of orderedRows){
    sheet.getColumn(2).width=Math.max(sheet.getColumn(2).width??10,textUnits(row.userId)+2);
    const values=[daily?(row as ScoreRow).score:(row as ParticipationRow).rounds,row.points,row.points];
    values.forEach((n,i)=>{totals[i]+=n;sheet.getColumn(i+4).width=Math.max(sheet.getColumn(i+4).width??10,numericText(n).length+2);});
  }
  totals.forEach((n,i)=>sheet.getColumn(i+4).width=Math.max(sheet.getColumn(i+4).width??10,numericText(n).length+2));
  const styles = Array.from({ length: cols }, (_, i) => structuredClone(sheet.getCell(3, i + 1).style));
  sheet.getCell("A1").value = title;
  const titleWidth=Array.from({length:cols},(_,i)=>sheet.getColumn(i+1).width??10).reduce((a,b)=>a+b,0);
  sheet.getCell('A1').alignment={...sheet.getCell('A1').alignment,wrapText:true};
  sheet.getRow(1).height=Math.max(28,Math.ceil(textUnits(title)*16/12/(titleWidth-2))*20+6);
  wb.creator = "金陵麻将";
  wb.calcProperties.fullCalcOnLoad = true;
  for (const [i, data] of orderedRows.entries()) {
    const r = i + 3;
    const line = sheet.getRow(r);
    line.height = 22;
    const points = data.points;
    const nickname = data.nickname?.trim() ? data.nickname : data.username;
    line.values = daily
      ? [data.teamName, data.userId, nickname, (data as ScoreRow).score,
        { formula: `D${r}*0.5`, result: points }, { formula: `E${r}`, result: points }]
      : [data.teamName, data.userId, nickname, (data as ParticipationRow).rounds,
        { formula: `D${r}*3`, result: points }, { formula: `E${r}`, result: points }];
    for (let c = 1; c <= cols; c++) {
      const cell = line.getCell(c);
      cell.style = structuredClone(styles[c - 1]);
      const value = cell.value;
      const number = typeof value === "number" ? value
        : value && typeof value === "object" && "formula" in value ? cell.result : undefined;
      if (typeof number === "number") cell.numFmt = Number.isInteger(number) ? "0" : "0.#######";
    }
    for(const c of [1,3])line.getCell(c).alignment = { vertical: "middle", horizontal: "left", wrapText: true };
    const textLines=Math.max(lines(data.teamName,sheet.getColumn(1).width!),lines(nickname,sheet.getColumn(3).width!));
    line.height=Math.max(22,textLines*16+4);
  }
  if (!rows.length) sheet.getCell("A3").value = "本期无结算记录";
  const last = String.fromCharCode(64 + cols);
  const lastDetail = Math.max(3, rows.length + 2);
  const totalRow = sheet.getRow(lastDetail + 1);
  totalRow.height = 24;
  totalRow.getCell(1).value = "总计：";
  for (let c = 1; c <= cols; c++) {
    const cell = totalRow.getCell(c);
    cell.style = structuredClone(styles[c - 1]);
    cell.font = { ...cell.font, bold: true };
    cell.border = { top: { style: "thin", color: { argb: "FF808080" } } };
    if (c < 4) continue;
    const column = String.fromCharCode(64 + c);
    let total = 0;
    for (let r = 3; r <= rows.length + 2; r++) {
      const value = sheet.getCell(r, c).value;
      total += typeof value === "number" ? value
        : value && typeof value === "object" && "formula" in value ? Number(value.result ?? 0) : 0;
    }
    cell.value = { formula: `SUM(${column}3:${column}${lastDetail})`, result: total };
    cell.numFmt = Number.isInteger(total) ? "0" : "0.#######";
  }
  sheet.autoFilter = `A2:${last}${lastDetail}`;
  sheet.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0,
    printTitlesRow: "1:2", printArea: `A1:${last}${totalRow.number}` };
  const bytes = Buffer.from(await wb.xlsx.writeBuffer());
  return { filename: `${title}.xlsx`, xlsxBase64: bytes.toString("base64"),
    caption: `${teamName} ${daily ? "日结算" : "周结算"}\n${start} 至 ${end}（北京时间）\n按整桌结束时间归属日期，跨零点不拆桌\n按统计期结束时最终战队归属\n${daily ? "分数÷2" : "局数×3"}=${Number(rows.reduce((n,r)=>n+r.points,0).toFixed(6))}${rows.length ? "" : "\n本期无结算记录"}` };
}
