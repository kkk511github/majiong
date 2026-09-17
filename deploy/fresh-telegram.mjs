import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DAY_MS, parseReportConfig } from '../server/telegram-reports.ts';

export function reportStart(value) {
  if (typeof value !== 'string' || !/^[0-9]{8}$/.test(value)) throw Error('统计起点必须是 YYYYMMDD');
  const iso = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  const at = Date.parse(`${iso}T00:00:00+08:00`);
  if (!Number.isFinite(at) || Number(value.slice(0, 4)) < 2000 || new Date(at + 8 * 3600000).toISOString().slice(0, 10) !== iso)
    throw Error('统计起点日期无效');
  return at;
}

export function freshTelegramConfig(db, input, now = Date.now(), starts) {
  const config = parseReportConfig(input);
  const anchors = starts && { dailyScore: reportStart(starts.daily), weeklyTables: reportStart(starts.weekly) };
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const schedule of config.schedules) {
      schedule.teams = schedule.teams.map(team => {
        const existing = db.prepare('SELECT id FROM teams WHERE name=?').get(team.name);
        const id = existing?.id ?? randomUUID();
        if (!existing) db.prepare('INSERT INTO teams(id,name,created_at) VALUES (?,?,?)').run(id, team.name, now);
        return { id, name: team.name };
      });
      // Preserve the weekday/time while avoiding backfill of the old server's periods.
      const anchor = Date.parse(schedule.firstEnd), interval = schedule.days * DAY_MS;
      const next = anchors ? anchors[schedule.kind] + interval
        : anchor > now ? anchor : anchor + (Math.floor((now - anchor) / interval) + 1) * interval;
      schedule.firstEnd = new Date(next + 8 * 3600000).toISOString().slice(0, 10) + 'T00:00:00+08:00';
    }
    const validated = parseReportConfig(config);
    db.exec('COMMIT');
    return validated;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [source, destination, daily, weekly] = process.argv.slice(2);
  if (!source || !destination) throw Error('Usage: fresh-telegram.mjs INPUT_CONFIG OUTPUT_CONFIG');
  const db = new DatabaseSync(process.env.DATABASE_PATH);
  try {
    const config = freshTelegramConfig(db, JSON.parse(readFileSync(source, 'utf8')), Date.now(), daily || weekly ? { daily, weekly } : undefined);
    writeFileSync(destination, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 });
    console.log('Configured empty teams and report periods; no historical data imported.');
  } finally { db.close(); }
}
