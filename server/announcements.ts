import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  ANNOUNCEMENT_BODY_LIMIT,
  ANNOUNCEMENT_TITLE_LIMIT,
  type Announcement,
  type ControlAnnouncement,
} from "../shared/announcements";
import { AuthError } from "./accounts";

interface AnnouncementRow {
  id: string;
  status: ControlAnnouncement["status"];
  draft_title: string;
  draft_body: string;
  draft_version: number;
  revision: number;
  published_title: string | null;
  published_body: string | null;
  created_at: number;
  updated_at: number;
  published_at: number | null;
  published_by: string | null;
}

export function announcementSchema(db: DatabaseSync) {
  db.exec(`CREATE TABLE IF NOT EXISTS announcements (
    id TEXT PRIMARY KEY, status TEXT NOT NULL CHECK(status IN('draft','published','withdrawn')),
    draft_title TEXT NOT NULL, draft_body TEXT NOT NULL, draft_version INTEGER NOT NULL,
    revision INTEGER NOT NULL DEFAULT 0, published_title TEXT, published_body TEXT,
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, published_at INTEGER, published_by TEXT);
    CREATE TABLE IF NOT EXISTS announcement_reads (
    account_id TEXT NOT NULL, announcement_id TEXT NOT NULL, revision INTEGER NOT NULL, read_at INTEGER NOT NULL,
    PRIMARY KEY(account_id,announcement_id,revision));
    CREATE TABLE IF NOT EXISTS announcement_audit (
    id TEXT PRIMARY KEY, announcement_id TEXT NOT NULL, actor_id TEXT NOT NULL,
    event TEXT NOT NULL, revision INTEGER NOT NULL, at INTEGER NOT NULL, snapshot TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS announcement_requests (
    actor_id TEXT NOT NULL, request_id TEXT NOT NULL, fingerprint TEXT NOT NULL,
    response TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY(actor_id,request_id));
    CREATE INDEX IF NOT EXISTS announcements_published ON announcements(status,published_at);
    CREATE INDEX IF NOT EXISTS announcement_audit_target ON announcement_audit(announcement_id,at);`);
}

function control(row: AnnouncementRow): ControlAnnouncement {
  return {
    id: row.id,
    status: row.status,
    draftTitle: row.draft_title,
    draftBody: row.draft_body,
    draftVersion: row.draft_version,
    revision: row.revision,
    publishedTitle: row.published_title,
    publishedBody: row.published_body,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    publishedAt: row.published_at,
    publishedBy: row.published_by,
  };
}

function text(value: unknown, limit: number, label: string) {
  if (
    typeof value !== "string" ||
    value.trim().length > limit ||
    /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value)
  )
    throw new AuthError(`${label}最多 ${limit} 个字`);
  return value.trim();
}

function integer(value: unknown, label: string) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    throw new AuthError(`${label}不正确`);
  return value;
}

export function createAnnouncements(
  db: DatabaseSync,
  onChanged: () => void = () => {},
) {
  announcementSchema(db);
  function transaction<T>(fn: () => T): T {
    db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      db.exec("COMMIT");
      return result;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
  function get(id: string) {
    const row = db
      .prepare("SELECT * FROM announcements WHERE id=?")
      .get(id) as unknown as AnnouncementRow | undefined;
    if (!row) throw new AuthError("公告不存在", 404);
    return row;
  }
  function audit(actorId: string, event: string, row: AnnouncementRow) {
    db.prepare("INSERT INTO announcement_audit VALUES (?,?,?,?,?,?,?)").run(
      randomUUID(),
      row.id,
      actorId,
      event,
      row.revision,
      Date.now(),
      JSON.stringify(control(row)),
    );
  }
  function published(accountId: string) {
    const rows = db
      .prepare(
        `SELECT a.*,
      (SELECT MAX(r.revision) FROM announcement_reads r WHERE r.account_id=? AND r.announcement_id=a.id) AS read_revision
      FROM announcements a WHERE a.status='published' ORDER BY a.published_at DESC,a.rowid DESC`,
      )
      .all(accountId) as unknown as (AnnouncementRow & {
      read_revision: number | null;
    })[];
    const announcements: Announcement[] = rows.map((row) => ({
      id: row.id,
      title: row.published_title!,
      body: row.published_body!,
      revision: row.revision,
      publishedAt: row.published_at!,
      readRevision: row.read_revision,
      unread: row.read_revision !== row.revision,
    }));
    return {
      announcements,
      unreadCount: announcements.filter((item) => item.unread).length,
    };
  }
  function read(accountId: string, id: string, value: unknown) {
    const revision = integer(value, "公告版本");
    return transaction(() => {
      const row = get(id);
      if (row.status !== "published" || row.revision !== revision)
        throw new AuthError("公告已更新或撤回，请刷新后查看", 409);
      db.prepare(
        "INSERT INTO announcement_reads VALUES (?,?,?,?) ON CONFLICT DO NOTHING",
      ).run(accountId, id, revision, Date.now());
      const receipt = db
        .prepare(
          "SELECT read_at FROM announcement_reads WHERE account_id=? AND announcement_id=? AND revision=?",
        )
        .get(accountId, id, revision)!;
      return { id, revision, readAt: Number(receipt.read_at) };
    });
  }
  function list() {
    const rows = db
      .prepare(
        "SELECT * FROM announcements ORDER BY COALESCE(published_at,created_at) DESC,rowid DESC",
      )
      .all() as unknown as AnnouncementRow[];
    return { announcements: rows.map(control) };
  }
  function mutate(
    actorId: string,
    requestId: unknown,
    fingerprint: string,
    event: "draft-saved" | "published" | "withdrawn",
    apply: () => AnnouncementRow,
  ) {
    if (
      typeof requestId !== "string" ||
      !/^[a-zA-Z0-9_-]{8,128}$/.test(requestId)
    )
      throw new AuthError("请提供有效的操作编号");
    let changed = false;
    const response = transaction(() => {
      const previous = db
        .prepare(
          "SELECT fingerprint,response FROM announcement_requests WHERE actor_id=? AND request_id=?",
        )
        .get(actorId, requestId);
      if (previous) {
        if (previous.fingerprint !== fingerprint)
          throw new AuthError("操作编号已用于其他请求，请重新操作", 409);
        return JSON.parse(String(previous.response)) as {
          announcement: ControlAnnouncement;
        };
      }
      const updated = apply(),
        response = { announcement: control(updated) };
      audit(actorId, event, updated);
      db.prepare("INSERT INTO announcement_requests VALUES (?,?,?,?,?)").run(
        actorId,
        requestId,
        fingerprint,
        JSON.stringify(response),
        Date.now(),
      );
      changed = true;
      return response;
    });
    if (changed && event !== "draft-saved") onChanged();
    return response;
  }
  function save(
    actorId: string,
    id: string | undefined,
    body: Record<string, unknown>,
  ) {
    const title = text(body.title, ANNOUNCEMENT_TITLE_LIMIT, "公告标题");
    const content = text(body.body, ANNOUNCEMENT_BODY_LIMIT, "公告正文");
    const version = id ? integer(body.expectedDraftVersion, "草稿版本") : 0;
    const fingerprint = JSON.stringify([
      "draft-save",
      id ?? null,
      version,
      title,
      content,
    ]);
    return mutate(actorId, body.requestId, fingerprint, "draft-saved", () => {
      const now = Date.now();
      if (id) {
        const old = get(id);
        if (old.draft_version !== version)
          throw new AuthError("草稿已被其他管理员修改，请刷新后重试", 409);
        db.prepare(
          "UPDATE announcements SET draft_title=?,draft_body=?,draft_version=draft_version+1,updated_at=? WHERE id=?",
        ).run(title, content, now, id);
      } else {
        id = randomUUID();
        db.prepare(
          `INSERT INTO announcements(id,status,draft_title,draft_body,draft_version,created_at,updated_at)
          VALUES (?,'draft',?,?,1,?,?)`,
        ).run(id, title, content, now, now);
      }
      return get(id);
    });
  }
  function publish(actorId: string, id: string, body: Record<string, unknown>) {
    const revision = integer(body.expectedRevision, "公告版本"),
      version = integer(body.expectedDraftVersion, "草稿版本");
    return mutate(
      actorId,
      body.requestId,
      JSON.stringify(["publish", id, revision, version]),
      "published",
      () => {
        const old = get(id);
        if (old.revision !== revision || old.draft_version !== version)
          throw new AuthError("公告已被其他管理员修改，请刷新后重试", 409);
        if (!old.draft_title || !old.draft_body)
          throw new AuthError("请填写公告标题和正文后再发布");
        const now = Date.now();
        db.prepare(
          `UPDATE announcements SET status='published',revision=revision+1,
        published_title=draft_title,published_body=draft_body,published_at=?,published_by=?,updated_at=? WHERE id=?`,
        ).run(now, actorId, now, id);
        return get(id);
      },
    );
  }
  function withdraw(
    actorId: string,
    id: string,
    body: Record<string, unknown>,
  ) {
    const revision = integer(body.expectedRevision, "公告版本");
    return mutate(
      actorId,
      body.requestId,
      JSON.stringify(["withdraw", id, revision]),
      "withdrawn",
      () => {
        const old = get(id);
        if (old.revision !== revision || old.status !== "published")
          throw new AuthError("公告已更新或撤回，请刷新后重试", 409);
        // The revision also guards against stale editors republishing a withdrawal.
        db.prepare(
          "UPDATE announcements SET status='withdrawn',revision=revision+1,draft_version=draft_version+1,updated_at=? WHERE id=?",
        ).run(Date.now(), id);
        return get(id);
      },
    );
  }
  return { published, read, list, save, publish, withdraw };
}
