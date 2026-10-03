import { backup, DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { chmodSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRecordParticipantIndex, DEFAULT_RECORD_BACKFILL_LIMIT } from '../server/record-participants';

const sources = ['match_records', 'round_records'] as const;
const quote = (name: string) => '"' + name.replaceAll('"', '""') + '"';

function fingerprints(db: DatabaseSync) {
  const result: Record<string, string> = {};
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name<>'record_participants' ORDER BY name").all();
  for (const { name } of tables) {
    const hash = createHash('sha256');
    // Stream rather than load rooms, account data or replay blobs into an array.
    const statement = db.prepare(`SELECT * FROM ${quote(String(name))}`);
    statement.setReadBigInts(true);
    for (const row of statement.iterate()) hash.update(JSON.stringify(row, (_key, value) =>
      typeof value === 'bigint' ? { integer: value.toString() } :
        value instanceof Uint8Array ? { blob: Buffer.from(value).toString('base64') } : value) + '\n');
    result[String(name)] = hash.digest('hex');
  }
  return result;
}

/** Never initializes the supplied snapshot. All writes use a fresh private copy. */
export async function rehearseRecordsUpgrade(options: {
  snapshot: string; output: string; maxBackfillMs?: number; maxAddedBytes?: number;
}) {
  const maxBackfillMs = options.maxBackfillMs ?? 5000;
  const maxAddedBytes = options.maxAddedBytes ?? 256 * 1024 * 1024;
  if (!Number.isFinite(maxBackfillMs) || maxBackfillMs <= 0 || !Number.isSafeInteger(maxAddedBytes) || maxAddedBytes < 0)
    throw Error('Invalid rehearsal budgets');
  const snapshot = resolve(options.snapshot), output = resolve(options.output);
  if (!statSync(snapshot).isFile()) throw Error('Snapshot must be an existing SQLite file');
  mkdirSync(dirname(output), { recursive: true });
  // Exclusive directory creation: backups/reports from previous runs are never overwritten.
  mkdirSync(output, { mode: 0o700 });
  const copy = join(output, 'rehearsal.sqlite');
  const original = new DatabaseSync(snapshot, { readOnly: true });
  try { await backup(original, copy); } finally { original.close(); }
  chmodSync(copy, 0o600);
  const db = new DatabaseSync(copy);
  try {
    if (db.prepare('PRAGMA quick_check').all().some(row => Object.values(row)[0] !== 'ok'))
      throw Error('Snapshot integrity check failed');
    for (const source of sources) if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(source))
      throw Error(`Missing ${source}; use a snapshot of the existing deployment database`);
    const before = fingerprints(db);
    const counts = Object.fromEntries(sources.map(source => [source, Number(db.prepare(`SELECT COUNT(*) n FROM ${source}`).get()!.n)]));
    // Rehearse a cold first upgrade even if the snapshot already has the index.
    for (const source of sources) for (const suffix of ['insert', 'delete', 'update'])
      db.exec(`DROP TRIGGER IF EXISTS ${source}_participants_${suffix}`);
    db.exec('DROP TABLE IF EXISTS record_participants');
    const logicalBytes = () => Number(db.prepare('PRAGMA page_count').get()!.page_count) * Number(db.prepare('PRAGMA page_size').get()!.page_size);
    const beforeBytes = logicalBytes();
    const started = performance.now();
    createRecordParticipantIndex(db, { maxBackfillRows: Infinity });
    const backfillMs = performance.now() - started;
    const addedBytes = Math.max(0, logicalBytes() - beforeBytes);
    for (const source of sources) {
      const expected = `SELECT DISTINCT r.id AS record_id,p.value AS account_id FROM ${source} r,
        json_each(CASE WHEN json_valid(r.player_ids) THEN r.player_ids ELSE '[]' END) p WHERE p.type='text'`;
      const actual = `SELECT record_id,account_id FROM record_participants WHERE source='${source}'`;
      if (db.prepare(`SELECT * FROM (${expected} EXCEPT ${actual}) LIMIT 1`).get() ||
          db.prepare(`SELECT * FROM (${actual} EXCEPT ${expected}) LIMIT 1`).get())
        throw Error('Participant index does not match its source');
    }
    createRecordParticipantIndex(db, { maxBackfillRows: 0 });
    if (JSON.stringify(before) !== JSON.stringify(fingerprints(db))) throw Error('Source data changed during rehearsal');
    if (db.prepare('PRAGMA integrity_check').all().some(row => Object.values(row)[0] !== 'ok'))
      throw Error('Rehearsal integrity check failed');
    const warnings: string[] = [];
    if (backfillMs > maxBackfillMs) warnings.push('Backfill exceeds the maintenance time budget');
    if (addedBytes > maxAddedBytes) warnings.push('Database growth exceeds the storage budget');
    const totalRecords = Object.values(counts).reduce((a, b) => a + b, 0);
    const report = {
      kind: 'records-upgrade-rehearsal', at: new Date().toISOString(), node: process.version,
      sourceReadOnly: true, productionModified: false, coldBackfill: true,
      counts, totalRecords, lookupRows: Number(db.prepare('SELECT COUNT(*) n FROM record_participants').get()!.n),
      backfillMs, addedBytes, maxBackfillMs, maxAddedBytes,
      sourceTablesPreserved: true, integrity: 'ok', warmRestart: 'ok',
      startupBudgetRequiresApproval: totalRecords > DEFAULT_RECORD_BACKFILL_LIMIT,
      passed: warnings.length === 0, warnings,
      note: 'Local copy only; addedBytes is allocated page growth (existing free pages may be reused). Budget approval, backup restore, live locks, mobile devices and runtime rollout still require release verification. Copy contains sensitive data; keep private and do not deploy it.',
    };
    writeFileSync(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    return report;
  } finally { db.close(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--help') {
    console.log('npm run check:records-upgrade -- --snapshot /path/to/backup.sqlite --output output/new-rehearsal [--max-ms 5000] [--max-added-bytes 268435456]\nUses SQLite backup (including WAL), never migrates the supplied snapshot. Requires a Node runtime supporting node:sqlite backup. Output directory must not exist; contains a PRIVATE database copy. Nonzero exit on failed checks/budgets.');
  } else {
    try {
      const flags = new Map<string, string>();
      for (let i = 0; i < args.length; i += 2) {
        if (!['--snapshot', '--output', '--max-ms', '--max-added-bytes'].includes(args[i]) || !args[i + 1] || args[i + 1].startsWith('--') || flags.has(args[i]))
          throw Error('Invalid arguments; use --help');
        flags.set(args[i], args[i + 1]);
      }
      if (!flags.has('--snapshot') || !flags.has('--output')) throw Error('--snapshot and --output are required');
      const report = await rehearseRecordsUpgrade({ snapshot: flags.get('--snapshot')!, output: flags.get('--output')!,
        maxBackfillMs: flags.has('--max-ms') ? Number(flags.get('--max-ms')) : undefined,
        maxAddedBytes: flags.has('--max-added-bytes') ? Number(flags.get('--max-added-bytes')) : undefined });
      console.log(JSON.stringify(report, null, 2));
      if (!report.passed) process.exitCode = 1;
    } catch (error) {
      console.error(error instanceof Error ? error.message : 'Upgrade rehearsal failed'); process.exitCode = 1;
    }
  }
}
