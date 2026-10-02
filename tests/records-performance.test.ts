import { afterEach, expect, it, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { createRecords } from '../server/records';
import { createRecordParticipantIndex } from '../server/record-participants';
import type { RoundRecord } from '../shared/types';

const opened: DatabaseSync[] = [];
afterEach(() => opened.splice(0).forEach(db => db.close()));
function fixture() {
  const db = new DatabaseSync(':memory:'); opened.push(db);
  db.exec(`CREATE TABLE accounts(id TEXT PRIMARY KEY,role TEXT);
    CREATE TABLE account_numbers(account_id TEXT PRIMARY KEY,member_id INTEGER UNIQUE);
    CREATE TABLE rooms(state TEXT); CREATE TABLE table_archives(state TEXT);
    INSERT INTO accounts VALUES('admin','admin'),('a','member'),('b','member');
    INSERT INTO account_numbers VALUES('a',100001),('b',100002);`);
  const avatar = vi.fn((id: string) => 'photo-' + id);
  const records = createRecords(db, avatar);
  function insert(source: string, id: string, game = id, round = 1, at = round, ids = ['a', 'b'], code = '012345') {
    const record: RoundRecord = { id, round, at, names: ids, playerIds: ids,
      scores: [103, 97], settlementBase: 100, result: { reason: 'hu', winners: [0], details: {}, deltas: [3, -3] } };
    db.prepare(`INSERT INTO ${source} VALUES(?,?,?,?,?,?,?)`).run(id, game, code, at, JSON.stringify(ids), 1, JSON.stringify(record));
  }
  return { db, records, insert, avatar };
}

it('derived participant index follows inserts, owner corrections, ID changes, replaces and deletes for both scopes', () => {
  const { db, records, insert } = fixture();
  for (const [source, scope] of [['match_records', 'matches'], ['round_records', 'rounds']]) {
    insert(source, source);
    const q = new URLSearchParams({ scope, calendar: '0' });
    expect(records.list(q, 'a').total).toBe(1);
    db.prepare(`UPDATE ${source} SET id=?,player_ids=?,record=json_set(record,'$.playerIds',json(?)) WHERE id=?`)
      .run(source + '-new', '["b"]', '["b"]', source);
    expect(records.list(q, 'a').total).toBe(0);
    expect(records.list(q, 'b').total).toBe(1);
    db.prepare(`INSERT OR REPLACE INTO ${source} SELECT id,game_id,code,at,'["a"]',private_names,json_set(record,'$.playerIds',json('["a"]')) FROM ${source}`).run();
    expect(records.list(q, 'b').total).toBe(0);
    expect(records.list(q, 'a').total).toBe(1);
    db.exec(`DELETE FROM ${source}`);
    expect(records.list(q, 'a').total).toBe(0);
    expect(db.prepare('SELECT * FROM record_participants WHERE source=?').all(source)).toEqual([]);
  }
});

it('UPDATE OR REPLACE collisions clear both old owners and transaction rollback restores lookup rows', () => {
  const { db, records, insert } = fixture();
  for (const [source, scope] of [['match_records', 'matches'], ['round_records', 'rounds']]) {
    insert(source, source + '-a', source + '-a', 1, 1, ['a']);
    insert(source, source + '-b', source + '-b', 1, 1, ['b']);
    const q = new URLSearchParams({ scope, calendar: '0' });
    db.exec('BEGIN');
    db.prepare(`UPDATE OR REPLACE ${source} SET id=? WHERE id=?`).run(source + '-b', source + '-a');
    expect(records.list(q, 'a').total).toBe(1);
    expect(records.list(q, 'b').total).toBe(0);
    db.exec('ROLLBACK');
    expect(records.list(q, 'a').total).toBe(1);
    expect(records.list(q, 'b').total).toBe(1);
    db.exec(`DELETE FROM ${source}`);
  }
});

it('first upgrade backfills both scopes atomically, preserves malformed historical rows and does not rescan on restart', () => {
  const { db, insert } = fixture();
  for (const source of ['match_records', 'round_records']) {
    for (const suffix of ['insert', 'delete', 'update']) db.exec(`DROP TRIGGER ${source}_participants_${suffix}`);
    insert(source, source);
    db.prepare(`UPDATE ${source} SET player_ids='invalid' WHERE id=?`).run(source);
    insert(source, source + '-valid');
  }
  db.exec('DROP TABLE record_participants');
  createRecordParticipantIndex(db);
  expect(db.prepare('SELECT COUNT(*) n FROM record_participants').get()!.n).toBe(4);
  const prepare = vi.spyOn(db, 'prepare');
  createRecordParticipantIndex(db);
  expect(prepare.mock.calls.some(([sql]) => sql.includes('SELECT') && sql.includes('json_each'))).toBe(false);
  prepare.mockRestore();
});

it('membership and numeric room prefixes use lookup indexes and retain latest-snapshot filtering before date/owner filters', () => {
  const { db, records, insert } = fixture();
  insert('match_records', 'old', 'game', 1, 1);
  insert('match_records', 'new', 'game', 1, 2, ['b']);
  expect(records.list(new URLSearchParams({ from: '0', to: '2' }), 'a').total).toBe(0);
  expect(records.list(new URLSearchParams({ member: '100001' }), 'admin', true).total).toBe(0);
  insert('match_records', 'other', 'other', 1, 3);
  const statements: string[] = [];
  const original = db.prepare.bind(db);
  const spy = vi.spyOn(db, 'prepare').mockImplementation(sql => { statements.push(sql); return original(sql); });
  expect(records.list(new URLSearchParams({ member: '100001', code: '012', calendar: '0' }), 'admin', true).total).toBe(1);
  spy.mockRestore();
  const sql = statements.find(sql => sql.startsWith('SELECT COUNT(*) AS total'))!;
  const plan = original('EXPLAIN QUERY PLAN ' + sql).all('012*', 100001).map(r => String(r.detail)).join('\n');
  expect(plan).toMatch(/SEARCH record_participants USING COVERING INDEX/);
  expect(plan).not.toContain('json_each');
  const roomPlan = original('EXPLAIN QUERY PLAN SELECT id FROM match_records WHERE code GLOB ?').all('012*').map(r => String(r.detail)).join('\n');
  expect(roomPlan).toMatch(/SEARCH match_records USING INDEX match_records_code/);
});

it('details batch metadata, preserve per-round historical teams/privacy, and refresh metadata between requests', () => {
  const { db, records, insert, avatar } = fixture();
  insert('match_records', 'final', 'game', 8);
  for (let round = 1; round <= 8; round++) insert('round_records', 'r' + round, 'game', round);
  db.exec(`INSERT INTO round_rosters VALUES('game',1,'a','t1','First'),('game',5,'a','t2','Second');`);
  const prepare = vi.spyOn(db, 'prepare');
  const admin = records.details('game', 'admin', true);
  expect(admin.rounds.map(r => r.record.teamNames![0])).toEqual(['First','First','First','First','Second','Second','Second','Second']);
  expect(prepare.mock.calls).toHaveLength(5);
  expect(avatar).toHaveBeenCalledTimes(2);
  prepare.mockRestore();
  const member = records.details('game', 'a');
  expect(member.match.record.playerIds).toEqual(['a', '']);
  expect(member.match.record.avatars).toEqual(['photo-a', undefined]);
  expect(member.match.record.memberIds).toEqual(['100001', '']);
  expect(member.match.record.teamNames).toBeUndefined();
  db.exec("UPDATE account_numbers SET member_id=200001 WHERE account_id='a'; UPDATE round_rosters SET team_name='Corrected' WHERE round=5");
  expect(records.details('game', 'admin', true).match.record).toMatchObject({ memberIds: ['200001','100002'], teamNames: ['Corrected','历史未记录'] });
  expect(() => records.details('game', 'unrelated')).toThrow('未找到可查看');
});

it('mark-read verifies current role, ID and existence without loading records or photos; remains idempotent', () => {
  const { db, records, insert, avatar } = fixture();
  insert('match_records', 'final', 'game');
  const prepare = vi.spyOn(db, 'prepare');
  const first = records.markRead('game', 'admin');
  expect(records.markRead('game', 'admin')).toEqual(first);
  expect(avatar).not.toHaveBeenCalled();
  expect(prepare.mock.calls.some(([sql]) => sql.includes('round_records') || sql.includes('SELECT *'))).toBe(false);
  expect(() => records.markRead('game', 'a')).toThrow('仅管理员');
  expect(() => records.markRead('bad/id', 'admin')).toThrow('牌桌 ID');
  expect(() => records.markRead('missing', 'admin')).toThrow('未找到');
  prepare.mockRestore();
});
