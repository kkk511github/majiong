import type { DatabaseSync } from 'node:sqlite';
import type { Game } from '../shared/types';
import type { ClientUpdateSettings } from '../shared/client-update';
import { AuthError } from './accounts';
import { clientVersionPolicy } from './client-version';

// An ended round is still part of the same match. Finished/closed tables and
// pre-deal waiting rooms are never grandfathered, nor are their renewed copies.
export const activeUpdateTable = (game?: Game): game is Game => !!game && game.round > 0 &&
  !game.table?.closed && ['playing', 'claiming', 'ended'].includes(game.phase);

export function createClientUpdateSettings(db: DatabaseSync, games: () => Iterable<Game>, initialMinimum?: string) {
  db.exec(`CREATE TABLE IF NOT EXISTS client_update_settings (id INTEGER PRIMARY KEY CHECK(id=1), state TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS client_update_grants (game_id TEXT NOT NULL, account_id TEXT NOT NULL, PRIMARY KEY(game_id,account_id));
    CREATE TABLE IF NOT EXISTS client_update_audit (revision INTEGER PRIMARY KEY, actor_id TEXT NOT NULL, at INTEGER NOT NULL, before_state TEXT NOT NULL, after_state TEXT NOT NULL);`);
  const stored = db.prepare('SELECT state FROM client_update_settings WHERE id=1').get();
  const initial = clientVersionPolicy(initialMinimum);
  let settings: ClientUpdateSettings = stored ? JSON.parse(String(stored.state)) : {
    enabled: !!initial.minimum, minimumVersion: initial.minimum ?? '', revision: 0, updatedAt: 0, updatedBy: null,
  };
  let policy = clientVersionPolicy(settings.enabled ? settings.minimumVersion : undefined);
  let grants = new Set<string>();
  const key = (game: string, id: string) => JSON.stringify([game, id]);
  function snapshot(enabled: boolean) {
    const rows: [string, string][] = [];
    if (enabled) for (const game of games()) if (activeUpdateTable(game)) {
      for (const player of game.players) if (player && !player.bot) rows.push([game.id, player.id]);
    }
    return rows;
  }
  function write(next: ClientUpdateSettings, rows: [string, string][], actor?: string) {
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare('INSERT INTO client_update_settings VALUES(1,?) ON CONFLICT(id) DO UPDATE SET state=excluded.state').run(JSON.stringify(next));
      db.prepare('DELETE FROM client_update_grants').run();
      const insert = db.prepare('INSERT INTO client_update_grants VALUES(?,?)');
      for (const row of rows) insert.run(...row);
      if (actor) db.prepare('INSERT INTO client_update_audit VALUES(?,?,?,?,?)')
        .run(next.revision, actor, next.updatedAt, JSON.stringify(settings), JSON.stringify(next));
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
    settings = next;
    policy = clientVersionPolicy(settings.enabled ? settings.minimumVersion : undefined);
    grants = new Set(rows.map(([game, id]) => key(game, id)));
  }
  if (!stored) write(settings, snapshot(settings.enabled));
  else for (const row of db.prepare('SELECT game_id,account_id FROM client_update_grants').all())
    grants.add(key(String(row.game_id), String(row.account_id)));
  return {
    get: (): ClientUpdateSettings => ({ ...settings }),
    accepts: (version: unknown) => policy.accepts(version),
    allowsExisting(version: unknown, id: string, game?: Game) {
      return policy.accepts(version) || (activeUpdateTable(game) &&
        game.players.some(p => p?.id === id && !p.bot) && grants.has(key(game.id, id)));
    },
    save(actor: string, body: Record<string, unknown>) {
      if (!Number.isSafeInteger(body.revision) || body.revision !== settings.revision)
        throw new AuthError('设置已变化，请刷新后再保存', 409);
      if (typeof body.enabled !== 'boolean' || typeof body.minimumVersion !== 'string')
        throw new AuthError('请填写强制更新开关和最低版本');
      const minimumVersion = body.minimumVersion.trim();
      if (body.enabled && !minimumVersion) throw new AuthError('开启强制更新前必须填写最低版本');
      try { clientVersionPolicy(minimumVersion); }
      catch { throw new AuthError('最低版本必须为 x.y.z，例如 0.7.37'); }
      const next = { enabled: body.enabled, minimumVersion, revision: settings.revision + 1, updatedAt: Date.now(), updatedBy: actor };
      write(next, snapshot(next.enabled), actor);
      return { ...settings };
    },
  };
}
