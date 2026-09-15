import type { DatabaseSync } from "node:sqlite";

export function teamSchema(db: DatabaseSync) {
  db.exec(`CREATE TABLE IF NOT EXISTS teams (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS team_memberships (account_id TEXT PRIMARY KEY, team_id TEXT REFERENCES teams(id), blocked INTEGER NOT NULL DEFAULT 0 CHECK(blocked IN(0,1)), updated_by TEXT NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS club_migrations (id TEXT PRIMARY KEY);`);
  if (!db.prepare("SELECT 1 FROM club_migrations WHERE id='initial-teams'").get()) {
    db.exec("BEGIN");
    try {
      ["一生所爱战队", "冰茉莉战队", "日结丁战队", "日结冰战队"].forEach((name, i) => {
        db.prepare("INSERT OR IGNORE INTO teams VALUES (?,?,?)").run(`team-${i + 1}`, name, Date.now());
      });
      db.prepare("INSERT INTO club_migrations VALUES ('initial-teams')").run();
      db.exec("COMMIT");
    } catch (e) { db.exec("ROLLBACK"); throw e; }
  }
}
export function membership(db: DatabaseSync, id: string) {
  const row = db.prepare("SELECT m.team_id, m.blocked, t.name FROM team_memberships m LEFT JOIN teams t ON t.id=m.team_id WHERE m.account_id=?").get(id);
  return { teamId: row?.team_id ? String(row.team_id) : null, teamName: row?.name ? String(row.name) : null, playBlocked: !!row?.blocked, canPlay: !!row?.name && !row?.blocked };
}
