import type { DatabaseSync } from 'node:sqlite';

/** Derived lookup only; original records remain the source of truth. */
export const DEFAULT_RECORD_BACKFILL_LIMIT = 100_000;
export function createRecordParticipantIndex(db: DatabaseSync, options: { maxBackfillRows?: number } = {}) {
  const maxRows = options.maxBackfillRows ?? Number(process.env.MAHJONG_RECORD_INDEX_MAX_BACKFILL_ROWS ?? DEFAULT_RECORD_BACKFILL_LIMIT);
  if (options.maxBackfillRows !== Infinity && (!Number.isSafeInteger(maxRows) || maxRows < 0 || maxRows === Number.MAX_SAFE_INTEGER))
    throw Error('MAHJONG_RECORD_INDEX_MAX_BACKFILL_ROWS must be a non-negative safe integer');
  db.exec('BEGIN IMMEDIATE');
  try {
    // Check under the write lock: concurrent candidate startups must not both
    // backfill. Missing triggers mean a restored/partial index is not ready.
    const exists = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='record_participants'").get();
    const triggers = db.prepare(`SELECT COUNT(*) AS n FROM sqlite_master WHERE type='trigger' AND name IN (
      'match_records_participants_insert','match_records_participants_delete','match_records_participants_update',
      'round_records_participants_insert','round_records_participants_delete','round_records_participants_update')`).get();
    const backfill = !exists || Number(triggers!.n) !== 6;
    if (backfill && maxRows !== Infinity) {
      let rows = 0;
      for (const source of ['match_records', 'round_records']) {
        rows += Number(db.prepare(`SELECT COUNT(*) AS n FROM (SELECT 1 FROM ${source} LIMIT ?)`).get(maxRows - rows + 1)!.n);
        if (rows > maxRows) throw Error(`Record participant backfill exceeds startup budget (${maxRows} rows). Rehearse on a database snapshot with npm run check:records-upgrade; set MAHJONG_RECORD_INDEX_MAX_BACKFILL_ROWS to a measured budget only in a maintenance window.`);
      }
    }
    db.exec(`CREATE TABLE IF NOT EXISTS record_participants (
      source TEXT NOT NULL, record_id TEXT NOT NULL, account_id TEXT NOT NULL,
      PRIMARY KEY(source,account_id,record_id));
      CREATE INDEX IF NOT EXISTS record_participants_record ON record_participants(source,record_id);`);
    if (backfill) db.exec('DELETE FROM record_participants');
    for (const source of ['match_records', 'round_records']) {
      const insert = `INSERT OR IGNORE INTO record_participants
        SELECT '${source}',new.id,value FROM json_each(CASE WHEN json_valid(new.player_ids) THEN new.player_ids ELSE '[]' END) WHERE type='text';`;
      db.exec(`CREATE TRIGGER IF NOT EXISTS ${source}_participants_insert AFTER INSERT ON ${source}
        BEGIN DELETE FROM record_participants WHERE source='${source}' AND record_id=new.id; ${insert} END;
        CREATE TRIGGER IF NOT EXISTS ${source}_participants_delete AFTER DELETE ON ${source}
        BEGIN DELETE FROM record_participants WHERE source='${source}' AND record_id=old.id; END;
        CREATE TRIGGER IF NOT EXISTS ${source}_participants_update AFTER UPDATE OF id,player_ids ON ${source}
        BEGIN DELETE FROM record_participants WHERE source='${source}' AND record_id IN (old.id,new.id); ${insert} END;`);
      // Backfill and triggers commit atomically. Later launches do not rescan
      // history; imports, clears and captures all update this transactionally.
      if (backfill) db.exec(`INSERT OR IGNORE INTO record_participants
        SELECT '${source}',r.id,p.value FROM ${source} r,json_each(CASE WHEN json_valid(r.player_ids) THEN r.player_ids ELSE '[]' END) p WHERE p.type='text';`);
    }
    db.exec('COMMIT');
  } catch (error) {
    if (db.isTransaction) db.exec('ROLLBACK');
    throw error;
  }
}
