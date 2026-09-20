import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { settlementWorkbook } from "./report-xlsx/workbook";

export const DAY_MS = 86_400_000;
const CHINA_OFFSET = 8 * 3_600_000;
export type ReportKind = "dailyScore" | "weeklyTables";
export type ReportSchedule = {
  id: string;
  name: string;
  teams: { id: string; name: string }[];
  kind: ReportKind;
  days: 1 | 7;
  /** The first delivery boundary, at midnight in Asia/Shanghai. */
  firstEnd: string;
};
export type TelegramReportConfig = {
  chatId: string;
  chatTitle: string;
  timezone: "Asia/Shanghai";
  countUnit: "completedTables";
  schedules: ReportSchedule[];
};
export type ParticipationRow = {
  teamName: string;
  userId: string;
  username: string;
  rounds: number;
  points: number;
};
export type ScoreRow = { teamName: string; userId: string; username: string; score: number; points: number };
// CSV remains readable for previously persisted delivery snapshots.
export type ReportDocument = { filename: string; caption: string; csv?: string; xlsxBase64?: string };
export function reportBytes(doc: ReportDocument) {
  if (doc.xlsxBase64) return Buffer.from(doc.xlsxBase64, "base64");
  if (typeof doc.csv === "string") return Buffer.from(doc.csv, "utf8");
  throw new Error("报表文件内容缺失");
}

// Use the roster at the exclusive period boundary. Audit events allow delayed
// reports to ignore transfers after midnight; explicit null means no team.
const finalRoster = `WITH final_roster AS (
  SELECT m.account_id, CASE WHEN m.updated_at < ? THEN m.team_id ELSE (
    SELECT json_extract(a.event,'$.teamId') FROM account_audit a
    WHERE a.account_id=m.account_id AND a.at < ?
      AND json_extract(a.event,'$.event')='membership-changed'
    ORDER BY a.at DESC,a.rowid DESC LIMIT 1
  ) END AS team_id FROM team_memberships m
)`;

export function chinaDate(at: number) {
  return new Date(at + CHINA_OFFSET).toISOString().slice(0, 10);
}


export function parseReportConfig(value: unknown): TelegramReportConfig {
  const c = value as TelegramReportConfig;
  if (!c || !/^-[1-9]\d{0,15}$/.test(c.chatId) || !Number.isSafeInteger(Number(c.chatId)))
    throw new Error("Telegram 群 ID 尚未正确配置");
  if (typeof c.chatTitle !== "string" || !c.chatTitle.trim() || c.chatTitle.length > 128)
    throw new Error("请配置已核验的 Telegram 群名称");
  if (c.timezone !== "Asia/Shanghai" || c.countUnit !== "completedTables")
    throw new Error("请明确配置北京时间与已结束牌桌统计");
  if (!Array.isArray(c.schedules) || !c.schedules.length || c.schedules.length > 20)
    throw new Error("请配置战队报表时间");
  const ids = new Set<string>();
  const teamKinds = new Set<string>();
  for (const s of c.schedules) {
    if (!s || typeof s.id !== "string" || !/^[\w-]{1,100}$/.test(s.id) || ids.has(s.id))
      throw new Error("报表 ID 无效或计划重复");
    if (!Array.isArray(s.teams) || !s.teams.length || s.teams.length > 20)
      throw new Error("请配置报表包含的战队");
    for (const team of s.teams) {
      if (!team || typeof team.id !== "string" || !/^[\w-]{1,100}$/.test(team.id) ||
          typeof team.name !== "string" || !team.name.trim() || team.name.length > 24)
        throw new Error("战队 ID 或名称无效");
      const key = `${team.id}:${s.kind}`;
      if (teamKinds.has(key)) throw new Error("同一战队不能重复出现在同类报表中");
      teamKinds.add(key);
    }
    if (s.name !== s.teams.map(team => team.name).join("+"))
      throw new Error("报表名称必须对应所含战队");
    const end = Date.parse(s.firstEnd);
    if (!((s.kind === "dailyScore" && s.days === 1) || (s.kind === "weeklyTables" && s.days === 7)) || !/^\d{4}-\d{2}-\d{2}T00:00:00\+08:00$/.test(s.firstEnd) ||
        !Number.isSafeInteger(end) || chinaDate(end) !== s.firstEnd.slice(0, 10))
      throw new Error("日清算必须为 1 天、周结算必须为 7 天，首次发送时间必须是北京时间零点");
    ids.add(s.id);
  }
  return structuredClone(c);
}

/** One completed table per participant, all assigned to their final team. */
export function participationRows(db: DatabaseSync, teamIds: string | string[], from: number, to: number): ParticipationRow[] {
  const teams = validateReportRange(db, teamIds, from, to);
  const rows = db.prepare(`
    ${finalRoster}
    SELECT CAST(n.member_id AS TEXT) AS user_id, a.username, t.name AS team_name, COUNT(DISTINCT p.game_id) AS rounds
    FROM match_records m
    JOIN point_records p ON p.game_id=m.game_id
    JOIN round_records r ON r.id=p.record_id
    JOIN accounts a ON a.id=p.account_id
    JOIN account_numbers n ON n.account_id=p.account_id
    JOIN final_roster f ON f.account_id=p.account_id
    JOIN teams t ON t.id=f.team_id
    WHERE f.team_id IN (${teams.map(() => "?").join(",")}) AND m.at>=? AND m.at<?
      AND m.code<>'练习桌' AND r.code<>'练习桌'
      AND json_extract(r.record,'$.result.reason')<>'dissolved'
      AND COALESCE(json_extract(r.record,'$.experience'),0)=0
    GROUP BY p.account_id, n.member_id, a.username, t.name
    ORDER BY t.name, n.member_id
  `).all(to, to, ...teams, from, to);
  return rows.map(row => {
    const rounds = Number(row.rounds);
    if (!Number.isSafeInteger(rounds * 3)) throw new Error("报表局数超出有效范围");
    return { teamName: String(row.team_name), userId: String(row.user_id), username: String(row.username), rounds, points: rounds * 3 };
  });
}

function validateReportRange(db: DatabaseSync, teamIds: string | string[], from: number, to: number) {
  if (![from, to].every(Number.isSafeInteger) || from < 0 || from >= to)
    throw new Error("报表时间范围无效");
  const teams = [...new Set(typeof teamIds === "string" ? [teamIds] : teamIds)];
  if (!teams.length || teams.length > 20) throw new Error("报表战队范围无效");
  for (const id of teams) {
    if (!db.prepare("SELECT 1 FROM teams WHERE id=?").get(id)) throw new Error("报表战队不存在");
  }
  return teams;
}

/** Daily net score follows hand settlement time and the period's final roster.
 * Raw points include in-table and outside transfers. Apply the saved table fee
 * once, before filtering dates/teams, then use the requested fixed divisor 2.
 * Never divide the already-converted app points a second time. */
export function dailyScoreRows(db: DatabaseSync, teamIds: string | string[], from: number, to: number): ScoreRow[] {
  const teams = validateReportRange(db, teamIds, from, to);
  const initial = "COALESCE(json_extract(r.record,'$.initialScore'),0)";
  const baseline = `COALESCE(json_extract(r.record,'$.settlementBase'),${initial})`;
  const feeNotPreviouslyCleared = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='record_clear_fee_carryover'").get()
    ? "AND NOT EXISTS (SELECT 1 FROM record_clear_fee_carryover carry WHERE carry.game_id=p.game_id AND carry.account_id=p.account_id)"
    : "";
  const rows = db.prepare(`
    ${finalRoster}
    SELECT CAST(n.member_id AS TEXT) AS user_id, a.username, t.name AS team_name,
      ROUND(SUM(p.points + CASE WHEN p.record_id=(
        SELECT first.record_id FROM point_records first
        JOIN round_records original ON original.id=first.record_id
        WHERE first.game_id=p.game_id AND first.account_id=p.account_id
          AND original.code<>'练习桌'
          AND COALESCE(json_extract(original.record,'$.experience'),0)=0
          AND json_extract(original.record,'$.result.reason')<>'dissolved'
        ORDER BY first.at,first.record_id LIMIT 1
      ) ${feeNotPreviouslyCleared} THEN ${initial}-${baseline} ELSE 0 END),6) AS score
    FROM point_records p
    JOIN round_records r ON r.id=p.record_id
    JOIN accounts a ON a.id=p.account_id
    JOIN account_numbers n ON n.account_id=p.account_id
    JOIN final_roster f ON f.account_id=p.account_id
    JOIN teams t ON t.id=f.team_id
    WHERE f.team_id IN (${teams.map(() => "?").join(",")}) AND p.at>=? AND p.at<?
      AND r.code<>'练习桌'
      AND json_extract(r.record,'$.result.reason')<>'dissolved'
      AND COALESCE(json_extract(r.record,'$.experience'),0)=0
    GROUP BY p.account_id,n.member_id,a.username,t.name
    ORDER BY t.name,n.member_id
  `).all(to, to, ...teams, from, to);
  return rows.map(row => {
    const score = Number(row.score);
    if (!Number.isFinite(score) || Math.abs(score) > Number.MAX_SAFE_INTEGER)
      throw new Error("报表分数超出有效范围");
    return { teamName: String(row.team_name), userId: String(row.user_id), username: String(row.username), score, points: score / 2 };
  });
}

function csvCell(value: string | number) {
  let text = String(value);
  // Untrusted account names must remain text when opened in Excel.
  if (typeof value === "string" && /^[\s\u0000-\u001f]*[=+@-]|^[\t\r\n]/u.test(text)) text = "'" + text;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function participationCsv(rows: ParticipationRow[]) {
  return "\ufeff" + [
    ["用户ID", "用户名", "局数", "分数"],
    ...rows.map(r => [r.userId, r.username, r.rounds, r.points]),
  ].map(row => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export function dailyScoreCsv(rows: ScoreRow[]) {
  return "\ufeff" + [
    ["用户ID", "用户名", "分数", "积分"],
    ...rows.map(r => [r.userId, r.username, r.score, r.points]),
  ].map(row => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

function reportFilename(teamName: string, from: number, to: number, kind: ReportKind) {
  const name = teamName.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_");
  const start = chinaDate(from).replaceAll("-", "");
  const end = chinaDate(to - 1).replaceAll("-", "");
  return kind === "dailyScore" ? `${name}${start}日清算.csv` : `${name}${start}-${end}周结算.csv`;
}

function reportPeriod(from: number, to: number) {
  const format = (at: number) => new Date(at + CHINA_OFFSET).toISOString().slice(0, 19).replace("T", " ");
  return `${format(from)} 至 ${format(to)}（北京时间，不含结束时刻）`;
}

export function reportDocument(teamName: string, from: number, to: number, rows: ParticipationRow[]): ReportDocument {
  return {
    filename: reportFilename(teamName, from, to, "weeklyTables"),
    caption: `${teamName} 周结算\n${reportPeriod(from, to)}\n局数×3=${rows.reduce((n, r) => n + r.points, 0)} 分${rows.length ? "" : "\n本期暂无已完成牌桌"}`,
    csv: participationCsv(rows),
  };
}

export function dailyScoreDocument(teamName: string, from: number, to: number, rows: ScoreRow[]): ReportDocument {
  return {
    filename: reportFilename(teamName, from, to, "dailyScore"),
    caption: `${teamName} 日清算\n${reportPeriod(from, to)}\n分数÷2=${Number(rows.reduce((n, r) => n + r.points, 0).toFixed(6))} 积分${rows.length ? "" : "\n本期暂无已结算分数"}`,
    csv: dailyScoreCsv(rows),
  };
}

export async function buildScheduledReport(db: DatabaseSync, schedule: Pick<ReportSchedule, "teams" | "name" | "kind">, from: number, to: number): Promise<ReportDocument> {
  const teams = schedule.teams.map(team => team.id);
  if (schedule.kind !== "dailyScore" && schedule.kind !== "weeklyTables") throw new Error("未知报表类型");
  const rows = schedule.kind === "dailyScore" ? dailyScoreRows(db, teams, from, to) : participationRows(db, teams, from, to);
  return settlementWorkbook(schedule.kind, schedule.name, chinaDate(from), chinaDate(to - 1), rows);
}

type Run = {
  id: string; schedule_id: string; name: string; teams: string; start_at: number; end_at: number;
  kind: ReportKind; chat_id: string; status: string; document: string | null; attempts: number;
};

export class TelegramDeliveryError extends Error {
  constructor(public readonly outcome: "retry" | "blocked" | "uncertain", message: string, public readonly retrySeconds = 60) {
    super(message);
  }
}

/** Own durable database, separate from the game's read-only database. */
export function createReportQueue(db: DatabaseSync, config: TelegramReportConfig) {
  db.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;");
  db.exec("BEGIN IMMEDIATE");
  try {
    // v1/v2 keyed individual teams. Group migration is only automatic before
    // any formal delivery was queued; never rewrite previously sent history.
    const oldColumns = db.prepare("PRAGMA table_info(report_runs)").all();
    if (oldColumns.length && !oldColumns.some(c => c.name === "teams")) {
      if (Number(db.prepare("SELECT COUNT(*) AS n FROM report_runs").get()!.n) > 0)
        throw new Error("旧版已有报表任务，请核对发送记录后再迁移，不能自动改写历史");
      db.exec("DROP TABLE report_schedules; DROP TABLE report_runs;");
    }
    db.exec(`CREATE TABLE IF NOT EXISTS report_schedules (schedule_id TEXT PRIMARY KEY, config TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS report_runs (
      id TEXT PRIMARY KEY, schedule_id TEXT NOT NULL, name TEXT NOT NULL, teams TEXT NOT NULL,
      kind TEXT NOT NULL CHECK(kind IN ('dailyScore','weeklyTables')),
      start_at INTEGER NOT NULL, end_at INTEGER NOT NULL, chat_id TEXT NOT NULL,
      status TEXT NOT NULL, document TEXT, sha256 TEXT,
      attempts INTEGER NOT NULL DEFAULT 0, next_attempt INTEGER NOT NULL DEFAULT 0,
      message_id INTEGER, sent_at INTEGER, error TEXT,
      UNIQUE(schedule_id,start_at,end_at,chat_id));
    CREATE INDEX IF NOT EXISTS report_runs_due ON report_runs(status,next_attempt,end_at);`);
    for (const s of config.schedules) {
      const id = s.id;
      const value = JSON.stringify({ ...s, chatId: config.chatId, countUnit: config.countUnit });
      const old = db.prepare("SELECT config FROM report_schedules WHERE schedule_id=?").get(id);
      if (old && old.config !== value) throw new Error(`报表 ${s.name} 的发送计划已改变，请先核对已有发送记录`);
      db.prepare("INSERT OR IGNORE INTO report_schedules VALUES (?,?)").run(id, value);
    }
    const savedIds = db.prepare("SELECT schedule_id FROM report_schedules").all();
    if (savedIds.some(row => !config.schedules.some(s => s.id === row.schedule_id)))
      throw new Error("发送计划已改变，请先核对已有发送记录");
    db.exec("COMMIT");
  } catch (e) { db.exec("ROLLBACK"); throw e; }

  function recoverInterrupted() {
    // Bot API has no idempotency key for sendDocument. A lost response cannot
    // safely be retried until an operator checks whether the document arrived.
    db.prepare("UPDATE report_runs SET status='uncertain',error='发送过程中服务重启，请核对群内是否已收到' WHERE status='sending'").run();
  }
  function enqueue(now: number) {
    for (const s of config.schedules) {
      const interval = s.days * DAY_MS;
      const last = db.prepare("SELECT MAX(end_at) AS end_at FROM report_runs WHERE schedule_id=? AND chat_id=?").get(s.id, config.chatId);
      let end = last?.end_at == null ? Date.parse(s.firstEnd) : Number(last.end_at) + interval;
      // Bounded recovery catches up without blocking the game or the worker.
      for (let n = 0; end <= now && n < 100; end += interval, n++) {
        db.prepare(`INSERT OR IGNORE INTO report_runs
          (id,schedule_id,name,teams,kind,start_at,end_at,chat_id,status) VALUES (?,?,?,?,?,?,?,?,'pending')`)
          .run(`${s.id}:${end}`, s.id, s.name, JSON.stringify(s.teams), s.kind, end - interval, end, config.chatId);
      }
    }
  }
  async function deliverDue(now: number, build: (run: Run) => ReportDocument | Promise<ReportDocument>,
    send: (document: ReportDocument, chatId: string) => Promise<number>) {
    const due = db.prepare("SELECT * FROM report_runs WHERE status='pending' AND next_attempt<=? ORDER BY end_at,schedule_id LIMIT 20").all(now) as unknown as Run[];
    for (const run of due) {
      let doc: ReportDocument;
      try {
        doc = run.document ? JSON.parse(run.document) : await build(run);
      } catch {
        db.prepare("UPDATE report_runs SET error='读取统计数据失败，将重试',next_attempt=? WHERE id=? AND status='pending'").run(now + 60_000, run.id);
        continue;
      }
      const saved = JSON.stringify(doc);
      const claimed = db.prepare(`UPDATE report_runs SET status='sending',document=?,sha256=?,attempts=attempts+1,error=NULL
        WHERE id=? AND status='pending' AND next_attempt<=? AND attempts=?`)
        .run(saved, createHash("sha256").update(reportBytes(doc)).digest("hex"), run.id, now, run.attempts);
      if (!claimed.changes) continue;
      try {
        const messageId = await send(doc, run.chat_id);
        db.prepare("UPDATE report_runs SET status='sent',message_id=?,sent_at=? WHERE id=?").run(messageId, Date.now(), run.id);
      } catch (error) {
        const e = error instanceof TelegramDeliveryError ? error : new TelegramDeliveryError("uncertain", "发送结果未确认，请核对群内文件");
        db.prepare("UPDATE report_runs SET status=?,error=?,next_attempt=? WHERE id=?")
          .run(e.outcome === "retry" ? "pending" : e.outcome, e.message, now + Math.max(1, e.retrySeconds) * 1000, run.id);
      }
    }
  }
  async function freezeDue(now: number, build: (run: Run) => ReportDocument | Promise<ReportDocument>) {
    // Used only while the normal worker is stopped, before clearing source data.
    // Do not send, retry uncertain deliveries, or rewrite an existing snapshot.
    const due = db.prepare("SELECT * FROM report_runs WHERE status='pending' AND document IS NULL AND end_at<=? ORDER BY end_at,schedule_id").all(now) as unknown as Run[];
    let frozen = 0;
    for (const run of due) {
      const document = await build(run);
      const changed = db.prepare("UPDATE report_runs SET document=?,sha256=? WHERE id=? AND status='pending' AND document IS NULL")
        .run(JSON.stringify(document), createHash("sha256").update(reportBytes(document)).digest("hex"), run.id);
      frozen += Number(changed.changes);
    }
    return { frozen };
  }
  function status() {
    return db.prepare("SELECT id,name,teams,kind,start_at,end_at,status,attempts,message_id,sent_at,error FROM report_runs ORDER BY end_at DESC,schedule_id LIMIT 100").all();
  }
  return { recoverInterrupted, enqueue, deliverDue, freezeDue, status };
}

/** All failures use local messages; never put URLs containing a bot token in logs. */
export function telegramApi(token: string, request: typeof fetch = fetch) {
  if (!/^\d{5,}:[A-Za-z0-9_-]{20,}$/.test(token)) throw new Error("Telegram bot token 格式不正确");
  async function call(method: string, body: FormData | Record<string, unknown>, sending = false): Promise<any> {
    let response: Response;
    try {
      response = await request(`https://api.telegram.org/bot${token}/${method}`, {
        method: "POST", signal: AbortSignal.timeout(30_000),
        ...(body instanceof FormData ? { body } : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
      });
    } catch {
      throw new TelegramDeliveryError(sending ? "uncertain" : "retry", sending ? "上传结果未确认，请核对群内文件" : "Telegram 暂时无法连接");
    }
    let data: any;
    try { data = await response.json(); }
    catch { throw new TelegramDeliveryError(sending ? "uncertain" : "retry", "Telegram 返回了无法确认的响应"); }
    if (!data.ok) {
      const retry = response.status === 429 || data.error_code === 429 || response.status >= 500;
      throw new TelegramDeliveryError(retry ? "retry" : "blocked", retry ? "Telegram 暂时拒绝请求，将重试" : `Telegram 拒绝请求（${Number(data.error_code) || response.status}），请检查机器人和群权限`, Number(data.parameters?.retry_after) || 60);
    }
    return data.result;
  }
  async function verifyDestination(chatId: string, title: string) {
    const me = await call("getMe", {});
    const chat = await call("getChat", { chat_id: chatId });
    if (!me.is_bot || String(chat.id) !== chatId || !["group", "supergroup"].includes(chat.type) || chat.title !== title)
      throw new TelegramDeliveryError("blocked", "机器人目标群与已确认配置不一致");
    const member = await call("getChatMember", { chat_id: chatId, user_id: me.id });
    if (["left", "kicked"].includes(member.status) || (member.status === "restricted" && (!member.is_member || !member.can_send_documents)))
      throw new TelegramDeliveryError("blocked", "机器人尚未入群或没有发送文件权限");
    if (member.status === "member" && chat.permissions?.can_send_documents === false)
      throw new TelegramDeliveryError("blocked", "统计群未允许机器人发送文件");
    return { username: String(me.username), chatId: String(chat.id), title: String(chat.title) };
  }
  async function sendDocument(doc: ReportDocument, chatId: string) {
    const form = new FormData();
    form.set("chat_id", chatId); form.set("caption", doc.caption);
    form.set("document", new Blob([reportBytes(doc)], { type: doc.xlsxBase64
      ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "text/csv;charset=utf-8" }), doc.filename);
    const message = await call("sendDocument", form, true);
    if (!Number.isSafeInteger(message.message_id) || message.message_id < 1 || String(message.chat?.id) !== chatId)
      throw new TelegramDeliveryError("uncertain", "Telegram 文件发送回执未能核验");
    return message.message_id as number;
  }
  return { verifyDestination, sendDocument };
}
