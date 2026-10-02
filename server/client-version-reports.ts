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
  // Separate table keeps old runtimes' six-column INSERTs compatible during rollout.
  db.exec(`CREATE TABLE IF NOT EXISTS client_platform_reports (
    account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
    platform TEXT CHECK(platform IN ('ios','android','web')),
    reported_at INTEGER NOT NULL
  ); CREATE INDEX IF NOT EXISTS client_version_reports_reported_at ON client_version_reports(reported_at);
  CREATE TRIGGER IF NOT EXISTS client_platform_reports_delete AFTER DELETE ON accounts
  BEGIN DELETE FROM client_platform_reports WHERE account_id=old.id; END;`);
  const savePlatform=db.prepare(`INSERT INTO client_platform_reports VALUES (?,?,?)
    ON CONFLICT(account_id) DO UPDATE SET platform=excluded.platform,reported_at=excluded.reported_at
    WHERE excluded.reported_at>=client_platform_reports.reported_at`);
  const save=db.prepare(`INSERT INTO client_version_reports VALUES (?,?,?,?,?,?)
    ON CONFLICT(account_id) DO UPDATE SET version=excluded.version,major=excluded.major,
    minor=excluded.minor,patch=excluded.patch,reported_at=excluded.reported_at
    WHERE excluded.reported_at>=client_version_reports.reported_at`);
  return {
    record(accountId:string,value:unknown,now=Date.now(),platform?:unknown) {
      const parts=parseClientVersion(value);
      // Never store arbitrary client strings. An old/invalid latest report is
      // unknown, rather than falsely retaining a previous upgraded version.
      save.run(accountId,parts?String(value):null,parts?.[0]??null,parts?.[1]??null,parts?.[2]??null,now);
      savePlatform.run(accountId,platform==='ios'||platform==='android'||platform==='web'?platform:null,now);
    },
  };
}
