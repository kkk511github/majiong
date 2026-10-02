import type { DatabaseSync } from 'node:sqlite';

/** Derived lookup only; original records remain the source of truth. */
export function createRecordParticipantIndex(db: DatabaseSync) {
  const exists = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='record_participants'").get();
  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS record_participants (
      source TEXT NOT NULL, record_id TEXT NOT NULL, account_id TEXT NOT NULL,
      PRIMARY KEY(source,account_id,record_id));
      CREATE INDEX IF NOT EXISTS record_participants_record ON record_participants(source,record_id);`);
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
      if (!exists) db.exec(`INSERT OR IGNORE INTO record_participants
        SELECT '${source}',r.id,p.value FROM ${source} r,json_each(CASE WHEN json_valid(r.player_ids) THEN r.player_ids ELSE '[]' END) p WHERE p.type='text';`);
    }
    db.exec('COMMIT');
  } catch (error) {
    if (db.isTransaction) db.exec('ROLLBACK');
    throw error;
  }
}
