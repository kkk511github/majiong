import { afterEach, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { createClientUpdateSettings } from '../server/client-update-settings';
import { createGame, newPlayer } from '../shared/engine';

const databases: DatabaseSync[] = [];
afterEach(() => databases.splice(0).forEach(db => db.close()));
function fixture() {
  const db = new DatabaseSync(':memory:'); databases.push(db);
  const active = createGame('123456', 'active-match'); active.round = 1; active.phase = 'playing';
  active.players[0] = newPlayer('old', '旧玩家'); active.players[0]!.online = false;
  const waiting = createGame('234567', 'waiting-match'); waiting.players[0] = newPlayer('waiting', '等待玩家');
  const games = [active, waiting];
  const policy = createClientUpdateSettings(db, () => games);
  return { db, active, waiting, games, policy };
}
it('snapshots actual active seats including offline users; waiting/new seats cannot inherit an exemption', () => {
  const f = fixture();
  f.policy.save('admin', { enabled: true, minimumVersion: '0.7.37', revision: 0 });
  expect(f.policy.allowsExisting(undefined, 'old', f.active)).toBe(true);
  expect(f.policy.allowsExisting('0.7.36', 'waiting', f.waiting)).toBe(false);
  f.active.players[1] = newPlayer('new', '插入玩家');
  expect(f.policy.allowsExisting(undefined, 'new', f.active)).toBe(false);
  expect(f.policy.allowsExisting(undefined, 'old', { ...f.active, id: 'renewed-match' })).toBe(false);
  f.active.phase = 'ended'; expect(f.policy.allowsExisting(undefined, 'old', f.active)).toBe(true);
  f.active.round++; f.active.phase = 'playing'; expect(f.policy.allowsExisting(undefined, 'old', f.active)).toBe(true);
  f.active.phase = 'finished'; expect(f.policy.allowsExisting(undefined, 'old', f.active)).toBe(false);
});
it('preserves grants across restart without grandfathering newly inserted games; persisted switch overrides environment', () => {
  const f = fixture(); f.policy.save('admin', { enabled: true, minimumVersion: '0.7.37', revision: 0 });
  const later = { ...f.active, id: 'later-game' }; f.games.push(later);
  const restored = createClientUpdateSettings(f.db, () => f.games, '9.0.0');
  expect(restored.get().minimumVersion).toBe('0.7.37');
  expect(restored.allowsExisting(undefined, 'old', f.active)).toBe(true);
  expect(restored.allowsExisting(undefined, 'old', later)).toBe(false);
  restored.save('admin', { enabled: false, minimumVersion: '0.7.37', revision: 1 });
  const disabled = createClientUpdateSettings(f.db, () => f.games, '9.0.0');
  expect(disabled.accepts(undefined)).toBe(true);
  expect(f.db.prepare('SELECT * FROM client_update_grants').all()).toHaveLength(0);
  expect(f.db.prepare('SELECT * FROM client_update_audit').all()).toHaveLength(2);
});
it('rejects stale/invalid writes and rolls back settings, grants and cache together on a database failure', () => {
  const f = fixture();
  expect(() => f.policy.save('admin', { enabled: true, minimumVersion: '', revision: 0 })).toThrow('最低版本');
  expect(() => f.policy.save('admin', { enabled: true, minimumVersion: 'latest', revision: 0 })).toThrow('x.y.z');
  expect(() => f.policy.save('admin', { enabled: true, minimumVersion: '0.7.37', revision: 3 })).toThrow('设置已变化');
  f.db.exec("CREATE TRIGGER fail_policy BEFORE INSERT ON client_update_audit BEGIN SELECT RAISE(ABORT,'disk failed'); END;");
  expect(() => f.policy.save('admin', { enabled: true, minimumVersion: '0.7.37', revision: 0 })).toThrow('disk failed');
  expect(f.policy.get()).toMatchObject({ enabled: false, revision: 0 });
  expect(createClientUpdateSettings(f.db, () => f.games).get()).toMatchObject({ enabled: false, revision: 0 });
  expect(f.db.prepare('SELECT * FROM client_update_grants').all()).toHaveLength(0);
});
