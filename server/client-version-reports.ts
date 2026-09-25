import type {DatabaseSync} from 'node:sqlite';
import {parseClientVersion} from './client-version';

/** Last authenticated report per account, not an installation attestation. */
export function createClientVersionReports(db:DatabaseSync) {
  db.exec(`CREATE TABLE IF NOT EXISTS client_version_reports (
    account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
    version TEXT, major INTEGER, minor INTEGER, patch INTEGER,
    reported_at INTEGER NOT NULL
  ); CREATE INDEX IF NOT EXISTS client_version_reports_version ON client_version_reports(major,minor,patch);
  CREATE TRIGGER IF NOT EXISTS client_version_reports_delete AFTER DELETE ON accounts
  BEGIN DELETE FROM client_version_reports WHERE account_id=old.id; END;`);
  const save=db.prepare(`INSERT INTO client_version_reports VALUES (?,?,?,?,?,?)
    ON CONFLICT(account_id) DO UPDATE SET version=excluded.version,major=excluded.major,
    minor=excluded.minor,patch=excluded.patch,reported_at=excluded.reported_at
    WHERE excluded.reported_at>=client_version_reports.reported_at`);
  return {
    record(accountId:string,value:unknown,now=Date.now()) {
      const parts=parseClientVersion(value);
      // Never store arbitrary client strings. An old/invalid latest report is
      // unknown, rather than falsely retaining a previous upgraded version.
      save.run(accountId,parts?String(value):null,parts?.[0]??null,parts?.[1]??null,parts?.[2]??null,now);
    },
  };
}
