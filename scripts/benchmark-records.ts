import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';
import { createRecords } from '../server/records';
import { replayedRound } from '../tests/fixtures/replayed-round';

// Synthetic records only. Never opens the deployment database.
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--output' || !args[1] || args[1].startsWith('--')))
  throw Error('Usage: tsx scripts/benchmark-records.ts [--output new-report.json]');
const dir = mkdtempSync(join(tmpdir(), 'mahjong-records-benchmark-'));
const db = new DatabaseSync(join(dir, 'fixture.sqlite'));
try {
  db.exec(`CREATE TABLE rooms(state TEXT); CREATE TABLE table_archives(state TEXT);
    CREATE TABLE accounts(id TEXT PRIMARY KEY,username TEXT,name TEXT,role TEXT);
    CREATE TABLE account_numbers(account_id TEXT PRIMARY KEY,member_id INTEGER UNIQUE);
    CREATE TABLE photos(account_id TEXT PRIMARY KEY,url TEXT);`);
  db.exec('BEGIN');
  const account = db.prepare('INSERT INTO accounts VALUES (?,?,?,?)');
  const number = db.prepare('INSERT INTO account_numbers VALUES (?,?)');
  for (let i = 0; i < 1000; i++) {
    account.run('p' + i, 'user' + i, 'Player ' + i, i === 0 ? 'admin' : 'member');
    number.run('p' + i, 100001 + i);
  }
  db.exec('COMMIT');
  const records = createRecords(db, id => db.prepare('SELECT url FROM photos WHERE account_id=?').get(id)?.url as string | undefined);
  const template = replayedRound().history[0];
  const insert = db.prepare('INSERT INTO match_records VALUES (?,?,?,?,?,?,?)');
  const hand = db.prepare('INSERT INTO round_records VALUES (?,?,?,?,?,?,?)');
  const roster = db.prepare('INSERT INTO round_rosters VALUES (?,?,?,?,?)');
  const size = 20000, start = Date.parse('2026-09-01T00:00:00+08:00');
  db.exec('BEGIN');
  for (let i = 0; i < size; i++) {
    const game = 'bench-' + i, at = start + i * 300000;
    const ids = Array.from({ length: 4 }, (_, seat) => 'p' + ((i * 4 + seat) % 1000));
    const names = ids.map(id => 'Player ' + id);
    const code = String(100000 + i);
    const record = { ...template, id: game + '-final', at, playerIds: ids, names,
      scores: [125, 80, 85, 90], externalScores: [2, -2, 0, 0], settlementBase: 100,
      scoreDivisor: 2, round: 8, totalRounds: 8, matchFinished: true };
    insert.run(game, game, code, at, JSON.stringify(ids), i % 2, JSON.stringify(record));
    if (i >= size - 100) {
      for (let r = 1; r <= 8; r++) {
        hand.run(game + '-' + r, game, code, at - (8 - r) * 10000, JSON.stringify(ids), i % 2,
          JSON.stringify({ ...record, id: game + '-' + r, round: r, matchFinished: false }));
        ids.forEach(id => roster.run(game, r, id, 'team', 'Historical team'));
      }
    }
  }
  db.exec('COMMIT; ANALYZE;');
  const cases: [string, () => unknown][] = [
    ['admin', () => records.list(new URLSearchParams({ calendar: '0' }), 'p0', true)],
    ['room-prefix', () => records.list(new URLSearchParams({ calendar: '0', code: '1199' }), 'p0', true)],
    ['member', () => records.list(new URLSearchParams({ calendar: '0', member: '100001' }), 'p0', true)],
    ['personal', () => records.list(new URLSearchParams({ calendar: '0' }), 'p0')],
    ['day', () => records.list(new URLSearchParams({ calendar: '0', from: String(start), to: String(start + 86400000) }), 'p0', true)],
    ['calendar', () => records.list(new URLSearchParams(), 'p0', true)],
    ['details', () => records.details('bench-19999', 'p0', true)],
    ['mark-read', () => records.markRead('bench-19999', 'p0')],
  ];
  const output = cases.map(([name, run]) => {
    run();
    const times: number[] = [];
    let result: unknown;
    for (let i = 0; i < 9; i++) {
      const started = performance.now(); result = run(); times.push(performance.now() - started);
    }
    times.sort((a, b) => a - b);
    const json = JSON.stringify(result, (key, value) => key === 'readAt' || key === 'adminReadAt' ? null : value);
    return { name, medianMs: Number(times[4].toFixed(3)), p95Ms: Number(times[8].toFixed(3)),
      bytes: Buffer.byteLength(json), sha256: createHash('sha256').update(json).digest('hex') };
  });
  const report = JSON.stringify({ tables: size, recordBytes: Buffer.byteLength(JSON.stringify(template)), results: output }, null, 2);
  if (args[1]) writeFileSync(args[1], report + '\n', { flag: 'wx' });
  console.log(report);
} finally {
  db.close();
  rmSync(dir, { recursive: true, force: true });
}
