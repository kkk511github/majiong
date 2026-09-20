import { createHash } from "node:crypto";
import {
  closeSync, existsSync, fsyncSync, openSync, realpathSync, statSync, unlinkSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { backup, DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";
import { gunzipSync } from "node:zlib";

/** Preserve every new-day record, including the two minutes before maintenance. */
export const RECORD_CLEAR_BOUNDARY = "2026-09-21T00:00:00+08:00";
/** Authorization to execute is independent of the earlier data cutoff. */
export const RECORD_CLEAR_NOT_BEFORE = "2026-09-21T00:02:00+08:00";
const FEE_TABLE = "record_clear_fee_carryover";
const MUTABLE_TABLES = new Set([
  "round_records", "match_records", "point_records", "round_replays",
  "round_rosters", "admin_match_reads", "table_archives", "rooms", FEE_TABLE,
]);
const REQUIRED_TABLES = [...MUTABLE_TABLES].filter(name => name !== FEE_TABLE);
type Row = Record<string, unknown>;
type Fingerprint = { rows: number; sha256: string };
type StateChange = { id: string; state: string };
type Options = {
  database: string;
  before: string;
  apply?: boolean;
  serviceStopped?: boolean;
  backup?: string;
  /** Test clock; the command line always uses the actual current time. */
  now?: number;
};
type Plan = {
  deleteIds: Record<string, string[]>;
  rosters: { game: string; round: number; account: string }[];
  reads: { game: string; admin: string }[];
  rooms: StateChange[];
  archives: StateChange[];
  fees: { game: string; account: string }[];
  historyRemoved: number;
  completedReplaysRemoved: number;
  activeRooms: number;
};

function quote(identifier: string) {
  return '"' + identifier.replaceAll('"', '""') + '"';
}

function encoded(value: unknown) {
  return JSON.stringify(value, (_, item: unknown) => {
    if (typeof item === "bigint") return { $sqliteInteger: item.toString() };
    if (item instanceof Uint8Array) return { $sqliteBlob: Buffer.from(item).toString("base64") };
    return item;
  });
}

function tableNames(db: DatabaseSync) {
  return db.prepare("SELECT name FROM sqlite_schema WHERE type='table' ORDER BY name")
    .all().map(row => String(row.name));
}

/** Hash complete rows (including passwords/BLOBs), but never print their contents. */
export function databaseFingerprints(db: DatabaseSync): Record<string, Fingerprint> {
  const out: Record<string, Fingerprint> = {};
  for (const name of tableNames(db)) {
    const statement = db.prepare(`SELECT * FROM ${quote(name)}`);
    statement.setReadBigInts(true);
    const rows = [...statement.iterate()].map(row => encoded(row)).sort();
    const hash = createHash("sha256");
    for (const row of rows) hash.update(row + "\n");
    out[name] = { rows: rows.length, sha256: hash.digest("hex") };
  }
  return out;
}

function schema(db: DatabaseSync) {
  return encoded(db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_schema ORDER BY type,name").all());
}

function integrity(db: DatabaseSync) {
  const rows = db.prepare("PRAGMA integrity_check").all();
  if (rows.length !== 1 || rows[0].integrity_check !== "ok")
    throw new Error("SQLite integrity_check failed; no deletion is allowed");
}

function timestamp(value: unknown, context: string) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    throw new Error(`Invalid timestamp: ${context}; no deletion is allowed`);
  return value;
}

function jsonObject(value: unknown, context: string): Row {
  let parsed: unknown;
  try { parsed = JSON.parse(String(value)); } catch {
    throw new Error(`Malformed JSON: ${context}; no deletion is allowed`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new Error(`Invalid object: ${context}; no deletion is allowed`);
  return parsed as Row;
}

function makePlan(db: DatabaseSync, cutoff: number): Plan {
  for (const name of REQUIRED_TABLES)
    if (!tableNames(db).includes(name)) throw new Error(`Required table missing: ${name}`);
  const plan: Plan = {
    deleteIds: { round_records: [], match_records: [], point_records: [], round_replays: [], table_archives: [] },
    rosters: [], reads: [], rooms: [], archives: [], fees: [],
    historyRemoved: 0, completedReplaysRemoved: 0, activeRooms: 0,
  };
  const keepRounds = new Set<string>();
  const feeGames = new Set<string>();
  const roundTimes = new Map<string, number>();
  const roundKey = (game: string, round: unknown) => {
    if (typeof round !== "number" || !Number.isSafeInteger(round) || round < 0)
      throw new Error(`Invalid round in ${game}; no deletion is allowed`);
    return encoded([game, round]);
  };
  for (const table of ["round_records", "match_records"] as const) {
    for (const row of db.prepare(`SELECT id,game_id,at,record FROM ${table}`).iterate()) {
      const at = timestamp(row.at, `${table}.${row.id}`);
      const record = jsonObject(row.record, `${table}.${row.id}`);
      if (timestamp(record.at, `${table}.${row.id}.record.at`) !== at)
        throw new Error(`Inconsistent record timestamp: ${table}.${row.id}`);
      if (table === "round_records") {
        roundTimes.set(String(row.id), at);
        if (at >= cutoff) keepRounds.add(roundKey(String(row.game_id), record.round));
      }
      if (at < cutoff) plan.deleteIds[table].push(String(row.id));
    }
  }
  // point_records has a composite primary key. Delete by its own timestamp,
  // after verifying that a linked hand has the same settlement time.
  for (const row of db.prepare("SELECT record_id,at FROM point_records").iterate()) {
    const at = timestamp(row.at, `point_records.${row.record_id}`);
    const roundAt = roundTimes.get(String(row.record_id));
    if (roundAt !== undefined && roundAt !== at)
      throw new Error(`Inconsistent point timestamp: ${row.record_id}`);
    if (at < cutoff) plan.deleteIds.point_records.push(String(row.record_id));
  }
  for (const row of db.prepare("SELECT DISTINCT game_id FROM point_records WHERE at>=?").iterate(cutoff))
    feeGames.add(String(row.game_id));
  plan.deleteIds.point_records = [...new Set(plan.deleteIds.point_records)];
  for (const row of db.prepare("SELECT id,payload FROM round_replays").iterate()) {
    if (!(row.payload instanceof Uint8Array)) throw new Error(`Invalid replay payload: ${row.id}`);
    const replay = jsonObject(gunzipSync(row.payload).toString("utf8"), `round_replays.${row.id}`);
    if (replay.id !== row.id) throw new Error(`Inconsistent replay identity: ${row.id}`);
    if (replay.endedAt === undefined) continue; // Never discard an unfinished replay.
    const endedAt = timestamp(replay.endedAt, `round_replays.${row.id}.endedAt`);
    const roundAt = roundTimes.get(String(row.id));
    if (roundAt !== undefined && (roundAt < cutoff) !== (endedAt < cutoff))
      throw new Error(`Inconsistent replay boundary: ${row.id}`);
    if (endedAt < cutoff) plan.deleteIds.round_replays.push(String(row.id));
  }
  for (const table of ["rooms", "table_archives"] as const) {
    for (const row of db.prepare(`SELECT * FROM ${table}`).iterate()) {
      const g = jsonObject(row.state, `${table}.${row.id}`);
      if (g.version !== 1 || g.id !== row.id || !Array.isArray(g.history) || !Array.isArray(g.players))
        throw new Error(`Unrecognized game state: ${table}.${row.id}`);
      const history = g.history as Row[];
      const kept = history.filter(record => {
        if (!record || typeof record !== "object") throw new Error(`Invalid history in ${row.id}`);
        const at = timestamp(record.at, `${table}.${row.id}.history`);
        if (at >= cutoff) keepRounds.add(roundKey(String(row.id), record.round));
        return at >= cutoff;
      });
      const replay = g.replay as Row | undefined;
      if (replay !== undefined && (!replay || typeof replay !== "object" || Array.isArray(replay)))
        throw new Error(`Invalid game replay: ${table}.${row.id}`);
      const oldReplay = replay?.endedAt !== undefined &&
        timestamp(replay.endedAt, `${table}.${row.id}.replay.endedAt`) < cutoff;
      if (table === "rooms" && ["playing", "claiming"].includes(String(g.phase))) {
        plan.activeRooms++;
        keepRounds.add(roundKey(String(row.id), g.round));
      }
      if (table === "rooms" && ["playing", "claiming", "ended"].includes(String(g.phase)) &&
          !(g.table as Row | undefined)?.closed) feeGames.add(String(row.id));
      if (table === "table_archives" && timestamp(row.at, `table_archives.${row.id}`) < cutoff &&
          !kept.length && (!replay || oldReplay)) {
        plan.deleteIds.table_archives.push(String(row.id));
        continue;
      }
      if (kept.length !== history.length || oldReplay) {
        plan.historyRemoved += history.length - kept.length;
        if (oldReplay) { delete g.replay; plan.completedReplaysRemoved++; }
        g.history = kept;
        const change = { id: String(row.id), state: JSON.stringify(g) };
        (table === "rooms" ? plan.rooms : plan.archives).push(change);
      }
    }
  }
  for (const row of db.prepare("SELECT game_id,round,account_id FROM round_rosters").iterate()) {
    if (!keepRounds.has(roundKey(String(row.game_id), row.round)))
      plan.rosters.push({ game: String(row.game_id), round: Number(row.round), account: String(row.account_id) });
  }
  for (const row of db.prepare("SELECT game_id,admin_id,read_at FROM admin_match_reads").iterate()) {
    if (timestamp(row.read_at, "admin_match_reads.read_at") < cutoff)
      plan.reads.push({ game: String(row.game_id), admin: String(row.admin_id) });
  }
  // Only retain whether a historical table fee was already assigned. No old
  // result, score, hand, replay, team assignment, or name is kept in this marker.
  plan.fees = db.prepare(`SELECT DISTINCT p.game_id AS game,p.account_id AS account
    FROM point_records p JOIN round_records r ON r.id=p.record_id
    WHERE p.at<? AND r.code<>'练习桌'
      AND COALESCE(json_extract(r.record,'$.experience'),0)=0
      AND COALESCE(json_extract(r.record,'$.result.reason'),'')<>'dissolved'`)
    .all(cutoff).filter(row => feeGames.has(String(row.game)))
    .map(row => ({ game: String(row.game), account: String(row.account) }));
  return plan;
}

function planCounts(db: DatabaseSync, plan: Plan, cutoff: number) {
  return {
    round_records: plan.deleteIds.round_records.length,
    match_records: plan.deleteIds.match_records.length,
    point_records: Number(db.prepare("SELECT COUNT(*) AS n FROM point_records WHERE at<?").get(cutoff)!.n),
    round_replays: plan.deleteIds.round_replays.length,
    round_rosters: plan.rosters.length,
    admin_match_reads: plan.reads.length,
    table_archives: plan.deleteIds.table_archives.length,
    rooms_updated: plan.rooms.length,
    archives_updated: plan.archives.length,
    history_entries_removed_from_retained_states: plan.historyRemoved,
    completed_replays_removed_from_retained_states: plan.completedReplaysRemoved,
    active_rooms_preserved: plan.activeRooms,
    fee_markers: plan.fees.length,
  };
}

function applyPlan(db: DatabaseSync, plan: Plan, cutoff: number) {
  db.exec(`CREATE TABLE IF NOT EXISTS ${FEE_TABLE} (
    game_id TEXT NOT NULL, account_id TEXT NOT NULL, cleared_before INTEGER NOT NULL,
    PRIMARY KEY(game_id,account_id));`);
  const fee = db.prepare(`INSERT INTO ${FEE_TABLE} VALUES (?,?,?)
    ON CONFLICT(game_id,account_id) DO UPDATE SET cleared_before=MAX(cleared_before,excluded.cleared_before)`);
  for (const row of plan.fees) fee.run(row.game, row.account, cutoff);
  for (const [table, ids] of Object.entries(plan.deleteIds)) {
    const statement = db.prepare(`DELETE FROM ${quote(table)} WHERE ${table === "point_records" ? "record_id" : "id"}=?${table === "point_records" ? " AND at<?" : ""}`);
    for (const id of ids) statement.run(...(table === "point_records" ? [id, cutoff] : [id]));
  }
  const roster = db.prepare("DELETE FROM round_rosters WHERE game_id=? AND round=? AND account_id=?");
  for (const row of plan.rosters) roster.run(row.game, row.round, row.account);
  const read = db.prepare("DELETE FROM admin_match_reads WHERE game_id=? AND admin_id=?");
  for (const row of plan.reads) read.run(row.game, row.admin);
  for (const [table, changes] of [["rooms", plan.rooms], ["table_archives", plan.archives]] as const) {
    const update = db.prepare(`UPDATE ${table} SET state=? WHERE id=?`);
    for (const row of changes) update.run(row.state, row.id);
  }
}

function assertProtected(before: Record<string, Fingerprint>, after: Record<string, Fingerprint>) {
  for (const table of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (!MUTABLE_TABLES.has(table) && encoded(before[table]) !== encoded(after[table]))
      throw new Error(`Protected table changed: ${table}; rolling back`);
  }
}

/** Exact expected rows catch accidental changes to live state or retained rows,
 * including changes made indirectly by a database trigger. */
function expectedRetainedRows(db: DatabaseSync, plan: Plan, cutoff: number) {
  const expected: Record<string, string[]> = {};
  for (const table of REQUIRED_TABLES) {
    const statement = db.prepare(`SELECT * FROM ${quote(table)}`);
    statement.setReadBigInts(true);
    const deletes = new Set(plan.deleteIds[table] ?? []);
    const rosters = new Set(plan.rosters.map(row => encoded([row.game, row.round, row.account])));
    const reads = new Set(plan.reads.map(row => encoded([row.game, row.admin])));
    const states = new Map((table === "rooms" ? plan.rooms : table === "table_archives" ? plan.archives : [])
      .map(row => [row.id, row.state]));
    expected[table] = [...statement.iterate()].flatMap(original => {
      const row = { ...original };
      if (deletes.has(String(table === "point_records" ? row.record_id : row.id)) &&
          (table !== "point_records" || Number(row.at) < cutoff)) return [];
      if (table === "round_rosters" && rosters.has(encoded([row.game_id, Number(row.round), row.account_id]))) return [];
      if (table === "admin_match_reads" && reads.has(encoded([row.game_id, row.admin_id]))) return [];
      if (states.has(String(row.id))) row.state = states.get(String(row.id))!;
      return [encoded(row)];
    }).sort();
  }
  return expected;
}

function assertRetainedRows(db: DatabaseSync, expected: Record<string, string[]>) {
  for (const [table, rows] of Object.entries(expected)) {
    const statement = db.prepare(`SELECT * FROM ${quote(table)}`);
    statement.setReadBigInts(true);
    if (encoded([...statement.iterate()].map(row => encoded(row)).sort()) !== encoded(rows))
      throw new Error(`Preserved rows or current game state changed: ${table}; rolling back`);
  }
}

/** Read-only unless apply, stopped-service acknowledgement and backup are supplied. */
export async function clearGameRecords(options: Options) {
  if (options.before !== RECORD_CLEAR_BOUNDARY)
    throw new Error(`This one-shot command requires --before ${RECORD_CLEAR_BOUNDARY}`);
  const cutoff = Date.parse(options.before);
  if (options.apply && !options.serviceStopped)
    throw new Error("Stop the game service and report worker, then pass --service-stopped");
  if (options.apply && (options.now ?? Date.now()) < Date.parse(RECORD_CLEAR_NOT_BEFORE))
    throw new Error("The authorized clear time has not arrived; use dry-run only");
  if (options.apply && !options.backup) throw new Error("--backup is required for --apply");
  const file = realpathSync(options.database);
  if (!statSync(file).isFile()) throw new Error("Database must be an existing regular file");
  const backupPath = options.backup ? resolve(options.backup) : undefined;
  if (options.apply && backupPath && existsSync(backupPath))
    throw new Error("Backup path already exists; choose a new path (backups are never overwritten)");
  const lockPath = file + ".clear-game-records.lock";
  let lock: number | undefined, db: DatabaseSync | undefined, transaction = false;
  try {
    if (options.apply) lock = openSync(lockPath, "wx", 0o600);
    db = new DatabaseSync(file, { readOnly: !options.apply });
    db.exec("PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON");
    // A reserved write lock excludes every other writer while allowing the
    // separate backup reader in both WAL and rollback-journal databases.
    db.exec(options.apply ? "BEGIN IMMEDIATE" : "BEGIN");
    transaction = true;
    integrity(db);
    const before = databaseFingerprints(db);
    const beforeSchema = schema(db);
    const plan = makePlan(db, cutoff);
    const retainedRows = expectedRetainedRows(db, plan, cutoff);
    const counts = planCounts(db, plan, cutoff);
    const protectedTables = Object.fromEntries(Object.entries(before).filter(([name]) => !MUTABLE_TABLES.has(name)));
    if (!options.apply) {
      db.exec("ROLLBACK"); transaction = false;
      return { mode: "dry-run", before: options.before, counts, protectedTables };
    }
    // Reserve a unique restricted-permission destination before SQLite opens it.
    const backupFd = openSync(backupPath!, "wx", 0o600);
    closeSync(backupFd);
    const reader = new DatabaseSync(file, { readOnly: true });
    try { await backup(reader, backupPath!); } finally { reader.close(); }
    const saved = new DatabaseSync(backupPath!, { readOnly: true });
    try {
      integrity(saved);
      if (schema(saved) !== beforeSchema || encoded(databaseFingerprints(saved)) !== encoded(before))
        throw new Error("Backup differs from locked source; no deletion is allowed");
    } finally { saved.close(); }
    const durableBackup = openSync(backupPath!, "r");
    try { fsyncSync(durableBackup); } finally { closeSync(durableBackup); }
    const durableDirectory = openSync(dirname(backupPath!), "r");
    try { fsyncSync(durableDirectory); } finally { closeSync(durableDirectory); }
    applyPlan(db, plan, cutoff);
    integrity(db);
    assertProtected(before, databaseFingerprints(db));
    assertRetainedRows(db, retainedRows);
    const remainder = makePlan(db, cutoff);
    if (Object.values(remainder.deleteIds).some(ids => ids.length) || remainder.rooms.length ||
        remainder.archives.length || remainder.rosters.length || remainder.reads.length)
      throw new Error("Old records remain after clearing; rolling back");
    db.exec("COMMIT"); transaction = false;
    return { mode: "applied", before: options.before, backup: backupPath, counts, protectedTables, verified: true };
  } catch (error) {
    if (transaction && db) db.exec("ROLLBACK");
    throw error;
  } finally {
    db?.close();
    if (lock !== undefined) { closeSync(lock); unlinkSync(lockPath); }
  }
}

async function main(args: string[]) {
  const options: Partial<Options> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--apply") options.apply = true;
    else if (arg === "--service-stopped") options.serviceStopped = true;
    else if (["--database", "--before", "--backup"].includes(arg)) {
      const value = args[++i];
      if (!value || value.startsWith("--")) throw new Error(`Missing value for ${arg}`);
      options[arg.slice(2) as "database" | "before" | "backup"] = value;
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!options.database || !options.before)
    throw new Error(`Usage: tsx scripts/clear-game-records.ts --database FILE --before ${RECORD_CLEAR_BOUNDARY} [--apply --service-stopped --backup NEW_FILE]`);
  console.log(JSON.stringify(await clearGameRecords(options as Options), null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch(error => {
    console.error(error instanceof Error ? error.message : "Clear failed");
    process.exitCode = 1;
  });
}
