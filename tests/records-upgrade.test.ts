import { afterEach, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rehearseRecordsUpgrade } from '../scripts/check-records-upgrade';

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
function snapshot() {
  const dir = mkdtempSync(join(tmpdir(), 'mahjong-upgrade-')); dirs.push(dir);
  const file = join(dir, 'source.sqlite'), db = new DatabaseSync(file);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0;
    CREATE TABLE accounts(id TEXT PRIMARY KEY,secret BLOB);
    INSERT INTO accounts VALUES ('private-fixture-account',x'010203');
    CREATE TABLE match_records(id TEXT PRIMARY KEY,player_ids TEXT);
    CREATE TABLE round_records(id TEXT PRIMARY KEY,player_ids TEXT);
    INSERT INTO match_records VALUES ('match','["a","b","a"]');
    INSERT INTO round_records VALUES ('round','["b","c"]'),('invalid','invalid');`);
  return { dir, file, db };
}
it('rehearsal includes uncheckpointed WAL, verifies original rows and keeps source and prior output untouched', async () => {
  const { dir, file, db } = snapshot(), output = join(dir, 'result');
  try {
    const sourceBytes = readFileSync(file), walBytes = readFileSync(file + '-wal');
    const report = await rehearseRecordsUpgrade({ snapshot: file, output });
    expect(report).toMatchObject({ passed: true, productionModified: false, totalRecords: 3, lookupRows: 4, integrity: 'ok', sourceTablesPreserved: true });
    expect(readFileSync(file)).toEqual(sourceBytes); expect(readFileSync(file + '-wal')).toEqual(walBytes);
    expect(db.prepare("SELECT name FROM sqlite_master WHERE name='record_participants'").get()).toBeUndefined();
    expect(statSync(output).mode & 0o777).toBe(0o700);
    expect(statSync(join(output, 'rehearsal.sqlite')).mode & 0o777).toBe(0o600);
    const saved = readFileSync(join(output, 'report.json'));
    await expect(rehearseRecordsUpgrade({ snapshot: file, output })).rejects.toThrow();
    expect(readFileSync(join(output, 'report.json'))).toEqual(saved);
    expect(saved.toString()).not.toMatch(/secret|private-fixture-account|010203/);
  } finally { db.close(); }
});
it('exceeded time budget fails the release check without destroying evidence', async () => {
  const { dir, file, db } = snapshot();
  try {
    const report = await rehearseRecordsUpgrade({ snapshot: file, output: join(dir, 'too-slow'), maxBackfillMs: Number.MIN_VALUE });
    expect(report.passed).toBe(false); expect(report.warnings).toContain('Backfill exceeds the maintenance time budget');
    expect(statSync(join(dir, 'too-slow', 'report.json')).isFile()).toBe(true);
  } finally { db.close(); }
});
