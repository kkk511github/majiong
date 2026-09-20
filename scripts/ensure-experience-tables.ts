import { randomInt, randomUUID } from "node:crypto";
import { chmodSync, closeSync, existsSync, mkdirSync, openSync, realpathSync, statSync, unlinkSync } from "node:fs";
import { basename, dirname, isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import * as sqlite from "node:sqlite";
import type { DatabaseSync } from "node:sqlite";
import { createExperienceTable } from "../server/experience-table";
import { newGameRules } from "../shared/nanjing-rules";
import { normalizeTableSettings } from "../shared/table-settings";
import type { Game } from "../shared/types";
import { TABLE_CREATOR_USERNAME } from "../shared/permissions";

export interface EnsureExperienceOptions {
  databasePath: string;
  count: number;
  apply?: boolean;
  backupPath?: string;
  sourceCodes?: string[];
  creatorId?: string;
}
interface RoomInfo { id: string; code: string; number: number; name: string; phase: string; sourceCode?: string }
export interface EnsureExperienceResult {
  mode: "dry-run" | "apply";
  target: number;
  existing: RoomInfo[];
  planned: RoomInfo[];
  created: RoomInfo[];
  skippedClosedSources: string[];
  backupPath?: string;
  restartRequired: boolean;
  message: string;
}
const tableExists = (db: DatabaseSync, name: string) => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
const summary = (game: Game): RoomInfo => ({ id: game.id, code: game.code, number: game.table!.number, name: game.table!.settings.name, phase: game.phase, sourceCode: game.table!.experience?.sourceCode });

function validateOptions(options: EnsureExperienceOptions) {
  if (!options.databasePath || !isAbsolute(options.databasePath)) throw Error("必须用 DATABASE_PATH 指定已有数据库的绝对路径");
  if (!existsSync(options.databasePath) || !statSync(options.databasePath).isFile()) throw Error("DATABASE_PATH 必须指向已有的普通数据库文件，不会创建空数据库");
  if (!Number.isInteger(options.count) || options.count < 1 || options.count > 100) throw Error("--count 必须为 1–100 的整数");
  if (options.backupPath && !isAbsolute(options.backupPath)) throw Error("--backup 必须是绝对路径");
  if (options.sourceCodes && (!options.sourceCodes.length || options.sourceCodes.some(code => !/^\d{6}$/.test(code)) || new Set(options.sourceCodes).size !== options.sourceCodes.length)) throw Error("--source-codes 需要不重复的六位桌号，以逗号分隔");
  if (options.creatorId !== undefined && !options.creatorId.trim()) throw Error("--creator-id 不能为空");
}
function readGames(db: DatabaseSync, table: "rooms" | "table_archives"): Game[] {
  if (!tableExists(db, table)) return [];
  const games: Game[] = [];
  for (const row of db.prepare(`SELECT id,state FROM ${table}`).iterate()) {
    let value: unknown;
    try { value = JSON.parse(String(row.state)); } catch { throw Error(`${table} 存在无法读取的牌局状态，未执行补桌`); }
    const game = value as Game;
    if (!game || game.version !== 1 || typeof game.id !== "string" || game.id !== row.id || typeof game.code !== "string" || !Array.isArray(game.players) || game.players.length !== 4) throw Error(`${table} 存在不支持的牌局状态，未执行补桌`);
    games.push(game);
  }
  return games;
}
function plan(db: DatabaseSync, options: EnsureExperienceOptions) {
  if (!tableExists(db, "rooms") || !tableExists(db, "accounts")) throw Error("目标不是已有麻将数据库：缺少 rooms/accounts");
  const rooms = readGames(db, "rooms"), archives = readGames(db, "table_archives"), history = [...rooms, ...archives];
  const existing = rooms.filter(game => !!game.table?.experience && !game.table.closed);
  const planned: Game[] = [];
  if (existing.length >= options.count) return { existing, planned, skippedClosedSources: [] as string[] };
  const formal = rooms.filter(game => game.table && !game.table.closed && !game.table.experience);
  const admins = db.prepare("SELECT id FROM accounts WHERE role='admin' AND must_change=0 AND lower(username)=?").all(TABLE_CREATOR_USERNAME).map(row => String(row.id));
  if (options.creatorId && !admins.includes(options.creatorId)) throw Error(`指定 creator 不是唯一可开桌管理员 ${TABLE_CREATOR_USERNAME}`);
  if (!admins.length) throw Error(`未找到已完成改密的开桌管理员 ${TABLE_CREATOR_USERNAME}，未执行补桌`);
  if (options.sourceCodes?.some(code => !formal.some(game => game.code === code))) throw Error("指定源桌中存在非活跃正式桌，未执行补桌");
  const allowed = options.sourceCodes ? options.sourceCodes.map(code => formal.find(game => game.code === code)!) : formal.sort((a, b) => a.table!.number - b.table!.number || a.code.localeCompare(b.code));
  const occupiedSources = new Set(existing.map(game => game.table!.experience!.sourceCode));
  const skippedClosedSources: string[] = [];
  const candidates = allowed.filter(game => !occupiedSources.has(game.code));
  const missing = options.count - existing.length;
  if (candidates.length < missing) throw Error(`还需 ${missing} 张体验桌，但只有 ${candidates.length} 张不同的可用正式源桌；已跳过正在使用的来源`);
  const usedCodes = new Set(history.map(game => game.code));
  const usedIds = new Set(history.map(game => game.id));
  for (const table of ["match_records", "round_records"]) {
    if (tableExists(db, table)) for (const row of db.prepare(`SELECT DISTINCT code FROM ${table}`).iterate()) usedCodes.add(String(row.code));
  }
  if (tableExists(db, "table_creations")) {
    for (const row of db.prepare("SELECT codes FROM table_creations").iterate()) {
      let codes: unknown; try { codes = JSON.parse(String(row.codes)); } catch { throw Error("历史开桌编号记录损坏，未执行补桌"); }
      if (!Array.isArray(codes) || codes.some(code => typeof code !== "string")) throw Error("历史开桌编号记录损坏，未执行补桌");
      codes.forEach(code => usedCodes.add(code));
    }
  }
  const numbers = history.map(game => game.table?.number).filter((n): n is number => Number.isSafeInteger(n) && n! > 0);
  let number = numbers.reduce((max, n) => Math.max(max, n), 0);
  const names = new Set(existing.map(game => game.table!.settings.name));
  const now = Date.now();
  for (const original of candidates.slice(0, missing)) {
    let code = "";
    for (let attempt = 0; attempt < 10000; attempt++) { const candidate = String(randomInt(100000, 1000000)); if (!usedCodes.has(candidate)) { code = candidate; break; } }
    if (!code) throw Error("无法分配未使用的六位桌号，未执行补桌");
    usedCodes.add(code);
    let id: string; do { id = randomUUID(); } while (usedIds.has(id)); usedIds.add(id);
    let nameIndex = 1; while (names.has(`机器人体验${nameIndex}`)) nameIndex++;
    const name = `机器人体验${nameIndex}`; names.add(name);
    number++; if (!Number.isSafeInteger(number)) throw Error("桌序号已超出安全整数范围，未执行补桌");
    const source = structuredClone(original);
    source.rules = newGameRules(source.rules);
    source.table!.creatorId = options.creatorId ?? (admins.includes(source.table!.creatorId) ? source.table!.creatorId : admins[0]);
    source.table!.settings = normalizeTableSettings({ ...source.table!.settings, name, autoRenew: true });
    const created = createExperienceTable(source, code, id, number, now);
    if (created.players[0] !== null || created.players.slice(1).some(player => !player?.bot || !player.online || !player.ready)) throw Error("体验桌座位初始化失败，未执行补桌");
    planned.push(created);
  }
  return { existing, planned, skippedClosedSources };
}
async function privateBackup(databasePath: string, requested?: string) {
  if (typeof sqlite.backup !== "function") throw Error("在线备份需要 Node.js 24；不会使用不安全的文件复制替代");
  let destination = requested;
  if (!destination) {
    const folder = resolve(dirname(databasePath), ".experience-table-backups");
    if (!existsSync(folder)) mkdirSync(folder, { mode: 0o700 });
    const info = statSync(folder);
    if (!info.isDirectory() || (info.mode & 0o077) !== 0) throw Error("数据库旁的备份目录必须是私有目录（权限700）");
    destination = resolve(folder, `${basename(databasePath)}.${new Date().toISOString().replace(/[:.]/g, "-")}.${randomUUID()}.sqlite`);
  }
  // Exclusive creation prevents overwriting the database, a previous backup or
  // a symlink. The online SQLite backup includes committed WAL content.
  const reserved = openSync(destination, "wx", 0o600); closeSync(reserved);
  const reader = new sqlite.DatabaseSync(databasePath, { readOnly: true });
  try {
    await sqlite.backup(reader, destination);
    chmodSync(destination, 0o600);
    const check = new sqlite.DatabaseSync(destination, { readOnly: true });
    try { if (check.prepare("PRAGMA quick_check").get()?.quick_check !== "ok") throw Error("备份完整性检查失败"); } finally { check.close(); }
    return destination;
  } catch (error) {
    unlinkSync(destination);
    throw error;
  } finally { reader.close(); }
}

export async function ensureExperienceTables(options: EnsureExperienceOptions): Promise<EnsureExperienceResult> {
  validateOptions(options);
  const databasePath = realpathSync(options.databasePath);
  const db = new sqlite.DatabaseSync(databasePath, { readOnly: !options.apply });
  let transaction = false, backupPath: string | undefined;
  try {
    db.exec("PRAGMA busy_timeout=5000");
    db.exec(options.apply ? "BEGIN IMMEDIATE" : "BEGIN"); transaction = true;
    const current = plan(db, options);
    if (options.apply && current.planned.length) {
      // Reserve writers before planning. A separate read connection can back up
      // the committed database while this transaction has not changed any rows.
      backupPath = await privateBackup(databasePath, options.backupPath);
      const insert = db.prepare("INSERT INTO rooms(id,state,updated_at) VALUES(?,?,?)");
      for (const game of current.planned) insert.run(game.id, JSON.stringify(game), Date.now());
    }
    db.exec("COMMIT"); transaction = false;
    const created = options.apply ? current.planned.map(summary) : [];
    return { mode: options.apply ? "apply" : "dry-run", target: options.count, existing: current.existing.map(summary), planned: current.planned.map(summary), created,
      skippedClosedSources: current.skippedClosedSources, backupPath, restartRequired: created.length > 0,
      message: created.length ? "已原子补齐体验桌；需重启加载。脚本未重启服务。" : current.planned.length ? "dry-run：未写入数据库；确认后加 --apply。正在运行的服务届时需重启加载。" : "活跃体验桌数量已满足目标，未修改任何牌桌。" };
  } catch (error) {
    if (transaction) { db.exec("ROLLBACK"); transaction = false; }
    if (backupPath) throw new Error(`未写入任何新牌桌，事务已回滚；备份保留于 ${backupPath}`, { cause: error });
    throw error;
  } finally { db.close(); }
}

export function parseExperienceArguments(args: string[], databasePath = process.env.DATABASE_PATH): EnsureExperienceOptions {
  const result: EnsureExperienceOptions = { databasePath: databasePath ?? "", count: NaN, apply: false };
  const seen = new Set<string>();
  for (let index = 0; index < args.length; index++) {
    const option = args[index]; if (seen.has(option)) throw Error(`参数重复：${option}`); seen.add(option);
    if (option === "--apply") { result.apply = true; continue; }
    if (!["--count", "--backup", "--source-codes", "--creator-id"].includes(option)) throw Error(`未知参数：${option}`);
    const value = args[++index]; if (!value || value.startsWith("--")) throw Error(`${option} 缺少参数值`);
    if (option === "--count") { if (!/^\d+$/.test(value)) throw Error("--count 必须是整数"); result.count = Number(value); }
    if (option === "--backup") result.backupPath = value;
    if (option === "--source-codes") result.sourceCodes = value.split(",");
    if (option === "--creator-id") result.creatorId = value;
  }
  return result;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.includes("--help")) {
    console.log("DATABASE_PATH=/absolute/mahjong.sqlite npx tsx scripts/ensure-experience-tables.ts --count 3 [--apply] [--backup /absolute/backup.sqlite] [--source-codes 345811,559668,810152] [--creator-id admin-uuid]\n默认 dry-run；只新增缺少的体验桌，不更改已有/关闭牌桌。写入前在线备份，写入后需重启加载；本命令不重启服务。");
  } else {
    try { console.log(JSON.stringify(await ensureExperienceTables(parseExperienceArguments(process.argv.slice(2))), null, 2)); }
    catch (error) { console.error(JSON.stringify({ error: error instanceof Error ? error.message : "补桌失败" })); process.exitCode = 1; }
  }
}
