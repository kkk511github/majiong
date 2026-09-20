import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  buildScheduledReport, createReportQueue, parseReportConfig, reportBytes,
  telegramApi, TelegramDeliveryError,
} from "./telegram-reports";

const configFile = process.env.TELEGRAM_REPORT_CONFIG;
if (!configFile) throw new Error("缺少 TELEGRAM_REPORT_CONFIG 配置文件路径");
const config = parseReportConfig(JSON.parse(readFileSync(configFile, "utf8")));
const command = process.argv[2] ?? "run";
if (!["run", "once", "check", "status", "preview", "freeze"].includes(command)) throw new Error("未知报表命令");
if (command === "freeze" && !process.argv.includes("--worker-stopped"))
  throw new Error("冻结报表前必须先停止常驻报告进程");
const statePath = process.env.TELEGRAM_REPORT_STATE ?? "data/telegram-reports.sqlite";
mkdirSync(dirname(statePath), { recursive: true });
const state = new DatabaseSync(statePath);
const queue = createReportQueue(state, config);
const source = new DatabaseSync(process.env.DATABASE_PATH ?? "data/mahjong.sqlite", { readOnly: true });
source.exec("PRAGMA busy_timeout=5000");
for (const s of config.schedules) {
  for (const expected of s.teams) {
    const team = source.prepare("SELECT name FROM teams WHERE id=?").get(expected.id);
    if (!team || team.name !== expected.name) throw new Error(`报表战队 ${expected.name} 未在麻将系统核验通过`);
  }
}

if (command === "freeze") {
  const now = Date.now();
  queue.enqueue(now);
  console.log(JSON.stringify(await queue.freezeDue(now,
    run => buildScheduledReport(source, { teams: JSON.parse(run.teams), name: run.name, kind: run.kind }, run.start_at, run.end_at))));
  source.close(); state.close();
} else if (command === "status") {
  console.log(JSON.stringify(queue.status(), null, 2));
  source.close(); state.close();
} else if (command === "preview") {
  const [scheduleId, start, end, directory] = process.argv.slice(3);
  const schedule = config.schedules.find(s => s.id === scheduleId);
  if (!schedule || !start || !end || !directory) throw new Error("preview 需要报表 ID、起止时间和输出目录");
  const from = Date.parse(start), to = Date.parse(end);
  const doc = await buildScheduledReport(source, schedule, from, to);
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, doc.filename), reportBytes(doc), { mode: 0o600 });
  console.log(JSON.stringify({ filename: doc.filename, caption: doc.caption }));
  source.close(); state.close();
} else {
  const tokenFile = process.env.TELEGRAM_BOT_TOKEN_FILE;
  if (!tokenFile) throw new Error("缺少 TELEGRAM_BOT_TOKEN_FILE 凭据文件路径");
  const api = telegramApi(readFileSync(tokenFile, "utf8").trim());
  if (command === "check") {
    await api.verifyDestination(config.chatId, config.chatTitle);
    console.log(JSON.stringify({ verified: true }));
    source.close(); state.close();
  } else {
    queue.recoverInterrupted();
    let stopped = false;
    let wake: (() => void) | undefined;
    for (const signal of ["SIGTERM", "SIGINT"] as const) process.once(signal, () => { stopped = true; wake?.(); });
    let lastError = "";
    const heartbeat = join(dirname(statePath), "heartbeat.json");
    do {
      const now = Date.now();
      queue.enqueue(now);
      try {
        // Verify the exact configured group before uploading any member data.
        const due = state.prepare("SELECT 1 FROM report_runs WHERE status='pending' AND next_attempt<=? LIMIT 1").get(now);
        if (due) {
          await api.verifyDestination(config.chatId, config.chatTitle);
          await queue.deliverDue(now,
            run => buildScheduledReport(source, { teams: JSON.parse(run.teams), name: run.name, kind: run.kind }, run.start_at, run.end_at),
            (doc, chatId) => api.sendDocument(doc, chatId));
        }
        lastError = "";
      } catch (error) {
        const message = error instanceof TelegramDeliveryError ? error.message : "报表任务暂未完成，将重新检查";
        if (message !== lastError) console.error(message);
        lastError = message;
      }
      const needsAttention = Number(state.prepare("SELECT COUNT(*) AS n FROM report_runs WHERE status IN ('blocked','uncertain')").get()!.n);
      writeFileSync(heartbeat, JSON.stringify({ at: Date.now(), needsAttention, error: lastError }), { mode: 0o600 });
      if (command === "once" || stopped) break;
      const next = config.schedules.map(s => {
        const first = Date.parse(s.firstEnd), interval = s.days * 86_400_000;
        return first > now ? first : first + (Math.floor((now - first) / interval) + 1) * interval;
      });
      const delay = Math.max(50, Math.min(30_000, Math.min(...next) - Date.now()));
      await new Promise<void>(resolve => {
        const timer = setTimeout(() => { wake = undefined; resolve(); }, delay);
        wake = () => { clearTimeout(timer); wake = undefined; resolve(); };
      });
    } while (!stopped);
    source.close(); state.close();
  }
}
