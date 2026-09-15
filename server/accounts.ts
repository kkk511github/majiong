import {
  randomBytes,
  randomUUID,
  createHash,
  scrypt,
  timingSafeEqual,
} from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { DatabaseSync } from "node:sqlite";
import type { Account } from "../shared/types";
import { membership, teamSchema } from "./teams";
import sharp from "sharp";
import { MIN_PASSWORD_LENGTH } from "../shared/account-profile";

export const ADMIN_USERNAME = "guanli@1";
export const tokenHash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
const SESSION_AGE = 30 * 86400000;
interface AccountRow {
  id: string;
  username: string;
  name: string;
  password_hash: string;
  role: Account["role"];
  must_change: number;
}
export interface AuthSession {
  id: string;
  name: string;
  token_hash: string;
  last_seen: number;
  account: Account;
}
export class AuthError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function accountSchema(db: DatabaseSync) {
  teamSchema(db);
  db.exec(`CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name TEXT NOT NULL, password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin','member')),
    must_change INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS account_audit (id TEXT PRIMARY KEY, account_id TEXT, event TEXT, at INTEGER NOT NULL);`);
  db.exec(`CREATE TABLE IF NOT EXISTS table_permissions (
    account_id TEXT PRIMARY KEY, can_create INTEGER NOT NULL CHECK(can_create IN (0,1)),
    granted_by TEXT NOT NULL, updated_at INTEGER NOT NULL);`);
  db.exec(`CREATE TABLE IF NOT EXISTS account_avatars (
    account_id TEXT PRIMARY KEY, digest TEXT NOT NULL, image BLOB NOT NULL);`);
  // Separate public numbers preserve all existing UUID references and old DB
  // insert statements. Allocate once, including historical accounts on upgrade.
  db.exec(`CREATE TABLE IF NOT EXISTS account_numbers (
    member_id INTEGER PRIMARY KEY AUTOINCREMENT, account_id TEXT NOT NULL UNIQUE);
    INSERT INTO sqlite_sequence(name,seq) SELECT 'account_numbers',100000
      WHERE NOT EXISTS(SELECT 1 FROM sqlite_sequence WHERE name='account_numbers');
    INSERT OR IGNORE INTO account_numbers(account_id)
      SELECT id FROM accounts WHERE id NOT IN(SELECT account_id FROM account_numbers)
      ORDER BY created_at,id;
    CREATE TRIGGER IF NOT EXISTS account_number_on_register AFTER INSERT ON accounts
    BEGIN INSERT OR IGNORE INTO account_numbers(account_id) VALUES(new.id); END;`);
}
function account(row: AccountRow, db: DatabaseSync): Account {
  return {
    id: row.id,
    memberId: String(
      db
        .prepare("SELECT member_id FROM account_numbers WHERE account_id=?")
        .get(row.id)!.member_id,
    ),
    username: row.username,
    name: row.name,
    avatar: avatarPath(db, row.id),
    role: row.role,
    mustChangePassword: !!row.must_change,
    ...membership(db, row.id),
    canManageAdmins:
      row.role === "admin" && row.username.toLowerCase() === ADMIN_USERNAME,
    canCreateTables:
      row.role === "admin" ||
      !!db
        .prepare(
          "SELECT 1 FROM table_permissions WHERE account_id=? AND can_create=1",
        )
        .get(row.id),
  };
}
function username(value: unknown) {
  if (
    typeof value !== "string" ||
    !/^[a-zA-Z0-9_.@-]{3,48}$/.test(value.trim())
  )
    throw new AuthError("账号需为 3–48 位字母、数字或 _ . @ -");
  return value.trim().toLowerCase();
}
function displayName(value: unknown) {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.trim().length > 12 ||
    /[\x00-\x1f]/.test(value)
  )
    throw new AuthError("昵称需要 1–12 个字");
  return value.trim();
}
function avatarPath(db: DatabaseSync, id: string): string | undefined {
  const row = db
    .prepare("SELECT digest FROM account_avatars WHERE account_id=?")
    .get(id);
  return row ? `/api/avatars/${id}/${row.digest}.jpg` : undefined;
}
function password(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length < MIN_PASSWORD_LENGTH ||
    value.length > 128 ||
    Buffer.byteLength(value) > 512
  )
    throw new AuthError(`密码需要 ${MIN_PASSWORD_LENGTH}–128 位字符`);
  return value;
}
const derive = (value: string, salt: string) =>
  new Promise<Buffer>((resolve, reject) => {
    scrypt(
      value,
      salt,
      64,
      { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 },
      (error, key) => (error ? reject(error) : resolve(key)),
    );
  });
export async function hashPassword(value: string) {
  password(value);
  const salt = randomBytes(16).toString("hex");
  return `scrypt-v1:${salt}:${(await derive(value, salt)).toString("hex")}`;
}
async function verifyPassword(value: string, encoded?: string) {
  const [scheme, salt, expected] = (encoded ?? "").split(":");
  const valid =
    scheme === "scrypt-v1" &&
    /^[a-f0-9]{32}$/.test(salt ?? "") &&
    /^[a-f0-9]{128}$/.test(expected ?? "");
  // Unknown accounts incur the same password derivation cost.
  const actual = await derive(
    value,
    valid ? salt : "00000000000000000000000000000000",
  );
  return !!valid && timingSafeEqual(actual, Buffer.from(expected, "hex"));
}
/** Local operator / test fixture only; never reachable from a public request. */
export async function provisionAdministrator(
  db: DatabaseSync,
  input: {
    username: string;
    password: string;
    name?: string;
    mustChangePassword?: boolean;
  },
) {
  accountSchema(db);
  const login = username(input.username);
  if (db.prepare("SELECT 1 FROM accounts WHERE username=?").get(login))
    throw new Error("账号已存在，未修改其密码或权限");
  const id = randomUUID(),
    encoded = await hashPassword(input.password);
  db.prepare("INSERT INTO accounts VALUES (?,?,?,?,?,?,?)").run(
    id,
    login,
    input.name ?? "牌桌管理员",
    encoded,
    "admin",
    input.mustChangePassword === false ? 0 : 1,
    Date.now(),
  );
  db.prepare("INSERT INTO account_audit VALUES (?,?,?,?)").run(
    randomUUID(),
    id,
    "admin-provisioned",
    Date.now(),
  );
  return id;
}
export async function readJSON(req: IncomingMessage, maxBytes = 8192) {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const raw of req) {
    const chunk = Buffer.from(raw);
    length += chunk.length;
    if (length > maxBytes) throw new AuthError("请求内容过长", 413);
    chunks.push(chunk);
  }
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!body || typeof body !== "object" || Array.isArray(body)) throw Error();
    return body as Record<string, unknown>;
  } catch {
    throw new AuthError("请求格式不正确");
  }
}
export function createAccounts(
  db: DatabaseSync,
  revoke: (id: string) => void,
  permissionsChanged: (account: Account) => void = () => {},
) {
  accountSchema(db);
  const rates = new Map<string, { count: number; until: number }>();
  let hashing = 0;
  let avatarUploads = 0;
  function limit(key: string, maximum: number) {
    const now = Date.now();
    if (rates.size > 2000)
      for (const [key, item] of rates) if (item.until <= now) rates.delete(key);
    const entry = rates.get(key);
    if (entry && entry.until > now) {
      if (++entry.count > maximum)
        throw new AuthError("尝试过于频繁，请 15 分钟后再试", 429);
    } else {
      if (rates.size >= 10000)
        throw new AuthError("登录服务繁忙，请稍后重试", 429);
      rates.set(key, { count: 1, until: now + 15 * 60000 });
    }
  }
  function getSession(token: unknown): AuthSession | undefined {
    if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token)) return;
    const row = db
      .prepare(
        `SELECT a.*, s.token_hash, s.last_seen FROM sessions s
      JOIN accounts a ON a.id=s.id WHERE s.token_hash=? AND s.last_seen>?`,
      )
      .get(tokenHash(token), Date.now() - SESSION_AGE) as unknown as
      (AccountRow & { token_hash: string; last_seen: number }) | undefined;
    if (!row) return;
    return {
      id: row.id,
      name: row.name,
      token_hash: row.token_hash,
      last_seen: row.last_seen,
      account: account(row, db),
    };
  }
  function requireSession(req: IncomingMessage, admin = false) {
    const session = getSession(
      req.headers.authorization?.replace(/^Bearer /, ""),
    );
    if (!session) throw new AuthError("请登录账号后继续", 401);
    if (session.account.mustChangePassword)
      throw new AuthError("请先设置你的新密码", 403);
    if (admin && session.account.role !== "admin")
      throw new AuthError("仅管理员可以执行此操作", 403);
    return session;
  }
  function issue(row: AccountRow) {
    const token = randomBytes(32).toString("hex");
    db.prepare(
      `INSERT INTO sessions VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET
      token_hash=excluded.token_hash, name=excluded.name, last_seen=excluded.last_seen`,
    ).run(tokenHash(token), row.id, row.name, Date.now());
    revoke(row.id);
    return { token, account: account(row, db) };
  }
  function canOpenTables(id: string) {
    const row = db
      .prepare("SELECT * FROM accounts WHERE id=? AND must_change=0")
      .get(id) as unknown as AccountRow | undefined;
    return !!row && account(row, db).canCreateTables === true;
  }
  function getAccount(id: string) {
    const row = db
      .prepare("SELECT * FROM accounts WHERE id=?")
      .get(id) as unknown as AccountRow | undefined;
    return row ? account(row, db) : undefined;
  }
  function notifyAccount(id: string) {
    const updated = getAccount(id);
    if (updated) permissionsChanged(updated);
    return updated;
  }
  function requirePlay(id: string) {
    const a = getAccount(id);
    if (!a || a.mustChangePassword)
      throw new AuthError("请先登录并设置密码", 403);
    if (a.playBlocked)
      throw new AuthError("你的牌局权限已暂停，请联系管理员", 403);
    if (!a.canPlay) throw new AuthError("请联系管理员分配战队后再入桌", 403);
  }
  async function handle(
    req: IncomingMessage,
    res: ServerResponse,
    path: string,
  ): Promise<boolean> {
    if (path.startsWith("/api/avatars/")) {
      const match =
        /^\/api\/avatars\/([a-f0-9-]{36})\/([a-f0-9]{64})\.jpg$/.exec(path);
      const row =
        req.method === "GET" && match
          ? db
              .prepare(
                "SELECT image FROM account_avatars WHERE account_id=? AND digest=?",
              )
              .get(match[1], match[2])
          : undefined;
      if (!row) {
        res.statusCode = 404;
        res.end('{"error":"头像不存在"}');
        return true;
      }
      res.setHeader("Content-Type", "image/jpeg");
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.end(Buffer.from(row.image as Uint8Array));
      return true;
    }
    if (
      !path.startsWith("/api/auth/") &&
      path !== "/api/admin/table-permissions"
    )
      return false;
    res.setHeader("Cache-Control", "no-store");
    let entered = false;
    try {
      if (path === "/api/auth/avatar") {
        const session = requireSession(req);
        if (req.method !== "POST") throw new AuthError("请求方式不支持", 405);
        limit(`avatar:${session.id}`, 30);
        if (avatarUploads >= 4)
          throw new AuthError("头像服务繁忙，请稍后重试", 429);
        avatarUploads++;
        try {
          const body = await readJSON(req, 180000);
          let image: Buffer | undefined;
          if (body.image !== null) {
            const match =
              typeof body.image === "string" &&
              /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(
                body.image,
              );
            if (!match) throw new AuthError("请选择 JPG、PNG 或 WebP 图片");
            try {
              const input = sharp(Buffer.from(match[2], "base64"), {
                limitInputPixels: 1048576,
                failOn: "warning",
              });
              const meta = await input.metadata();
              if (
                !["jpeg", "png", "webp"].includes(meta.format ?? "") ||
                (meta.pages ?? 1) !== 1
              )
                throw Error();
              image = await input
                .rotate()
                .resize(192, 192, { fit: "cover" })
                .flatten({ background: "#e9e4d4" })
                .jpeg({ quality: 85 })
                .toBuffer();
            } catch {
              throw new AuthError("图片无法读取，请重新选择一张照片");
            }
          }
          // Upload/decode are asynchronous: a revoked session must not save.
          if (requireSession(req).id !== session.id)
            throw new AuthError("请重新登录", 401);
          if (image)
            db.prepare(
              "INSERT INTO account_avatars VALUES (?,?,?) ON CONFLICT(account_id) DO UPDATE SET digest=excluded.digest,image=excluded.image",
            ).run(
              session.id,
              createHash("sha256").update(image).digest("hex"),
              image,
            );
          else
            db.prepare("DELETE FROM account_avatars WHERE account_id=?").run(
              session.id,
            );
          res.end(JSON.stringify({ account: notifyAccount(session.id) }));
        } finally {
          avatarUploads--;
        }
        return true;
      }
      if (path === "/api/admin/table-permissions") {
        const actor = requireSession(req, true);
        if (req.method === "GET") {
          const query = new URL(req.url ?? "/", "http://localhost")
            .searchParams;
          const search = query.get("username")?.trim() ?? "";
          const page = Number(query.get("page") ?? 1),
            pageSize = 20;
          if (!Number.isInteger(page) || page < 1 || page > 100000)
            throw new AuthError("页码不正确");
          const where = search
            ? "a.username=?"
            : "a.role='member' AND p.can_create=1";
          const args = search ? [username(search)] : [];
          const from =
            " FROM accounts a LEFT JOIN table_permissions p ON p.account_id=a.id WHERE " +
            where;
          const total = Number(
            db.prepare("SELECT COUNT(*) AS n" + from).get(...args)!.n,
          );
          const rows = db
            .prepare(
              "SELECT a.*" + from + " ORDER BY a.username LIMIT ? OFFSET ?",
            )
            .all(
              ...args,
              pageSize,
              (page - 1) * pageSize,
            ) as unknown as AccountRow[];
          res.end(
            JSON.stringify({
              accounts: rows.map((row) => {
                const a = account(row, db);
                return {
                  id: a.id,
                  username: a.username,
                  name: a.name,
                  role: a.role,
                  canCreateTables: a.canCreateTables,
                };
              }),
              total,
              page,
              pageSize,
            }),
          );
          return true;
        }
        if (req.method !== "POST") throw new AuthError("请求方式不支持", 405);
        limit(`permissions:${actor.id}`, 150);
        const body = await readJSON(req);
        requireSession(req, true);
        if (
          typeof body.accountId !== "string" ||
          body.accountId.length > 100 ||
          typeof body.canCreateTables !== "boolean"
        )
          throw new AuthError("请指定账号和开桌权限");
        const target = db
          .prepare("SELECT * FROM accounts WHERE id=?")
          .get(body.accountId) as unknown as AccountRow | undefined;
        if (!target) throw new AuthError("账号不存在，请让牌友先注册", 404);
        if (target.role === "admin")
          throw new AuthError("管理员已拥有开桌权限，无需单独授权");
        const before = account(target, db).canCreateTables;
        if (before !== body.canCreateTables) {
          db.exec("BEGIN");
          try {
            db.prepare(
              "INSERT INTO table_permissions VALUES (?,?,?,?) ON CONFLICT(account_id) DO UPDATE SET can_create=excluded.can_create, granted_by=excluded.granted_by, updated_at=excluded.updated_at",
            ).run(
              target.id,
              body.canCreateTables ? 1 : 0,
              actor.id,
              Date.now(),
            );
            db.prepare("INSERT INTO account_audit VALUES (?,?,?,?)").run(
              randomUUID(),
              target.id,
              JSON.stringify({
                event: "table-permission-changed",
                actorId: actor.id,
                canCreateTables: body.canCreateTables,
              }),
              Date.now(),
            );
            db.exec("COMMIT");
          } catch (error) {
            db.exec("ROLLBACK");
            throw error;
          }
        }
        const updated = account(target, db);
        permissionsChanged(updated);
        res.end(
          JSON.stringify({
            account: {
              id: updated.id,
              username: updated.username,
              name: updated.name,
              role: updated.role,
              canCreateTables: updated.canCreateTables,
            },
          }),
        );
        return true;
      }
      if (path === "/api/auth/session" && req.method === "GET") {
        const session = getSession(
          req.headers.authorization?.replace(/^Bearer /, ""),
        );
        if (!session) throw new AuthError("请登录账号后继续", 401);
        res.end(JSON.stringify({ account: session.account }));
        return true;
      }
      if (req.method !== "POST") throw new AuthError("请求方式不支持", 405);
      limit(`ip:${req.socket.remoteAddress ?? "unknown"}`, 150);
      const body = await readJSON(req);
      if (path === "/api/auth/logout") {
        const session = getSession(
          req.headers.authorization?.replace(/^Bearer /, ""),
        );
        if (session) {
          db.prepare("DELETE FROM sessions WHERE id=?").run(session.id);
          revoke(session.id);
        }
        res.end('{"ok":true}');
        return true;
      }
      if (path === "/api/auth/profile") {
        const session = requireSession(req),
          name = displayName(body.name);
        db.prepare("UPDATE accounts SET name=? WHERE id=?").run(
          name,
          session.id,
        );
        db.prepare("UPDATE sessions SET name=? WHERE id=?").run(
          name,
          session.id,
        );
        res.end(JSON.stringify({ account: { ...session.account, name } }));
        return true;
      }
      if (
        ![
          "/api/auth/login",
          "/api/auth/register",
          "/api/auth/password",
        ].includes(path)
      )
        throw new AuthError("接口不存在", 404);
      if (hashing >= 6) throw new AuthError("登录服务繁忙，请稍后重试", 429);
      hashing++;
      entered = true;
      if (path === "/api/auth/password") {
        const session = getSession(
          req.headers.authorization?.replace(/^Bearer /, ""),
        );
        if (!session) throw new AuthError("请重新登录", 401);
        limit(`password:${session.id}`, 12);
        const old = db
          .prepare("SELECT * FROM accounts WHERE id=?")
          .get(session.id) as unknown as AccountRow;
        if (
          !(await verifyPassword(
            password(body.currentPassword),
            old.password_hash,
          ))
        )
          throw new AuthError("原密码不正确", 400);
        const next = password(body.password);
        if (next === body.currentPassword)
          throw new AuthError("新密码不能与原密码相同");
        const encoded = await hashPassword(next);
        // A concurrent password change must not overwrite a newer credential.
        const changed = db
          .prepare(
            "UPDATE accounts SET password_hash=?, must_change=0 WHERE id=? AND password_hash=?",
          )
          .run(encoded, old.id, old.password_hash);
        if (!changed.changes)
          throw new AuthError("密码已经变更，请重新登录", 401);
        db.prepare("INSERT INTO account_audit VALUES (?,?,?,?)").run(
          randomUUID(),
          old.id,
          "password-changed",
          Date.now(),
        );
        res.end(
          JSON.stringify(
            issue({ ...old, password_hash: encoded, must_change: 0 }),
          ),
        );
        return true;
      }
      const login = username(body.username),
        secret = password(body.password);
      limit(`account:${login}`, 15);
      let row = db
        .prepare("SELECT * FROM accounts WHERE username=?")
        .get(login) as unknown as AccountRow | undefined;
      if (path === "/api/auth/register") {
        if (login === ADMIN_USERNAME)
          throw new AuthError("该管理员账号已保留，请使用登录入口");
        if (row) throw new AuthError("该账号已注册，请直接登录");
        const name = displayName(body.name),
          encoded = await hashPassword(secret);
        // Migrate only a valid unbound device session possessed by this registrant.
        const legacy =
          typeof body.legacyToken === "string" &&
          /^[a-f0-9]{64}$/.test(body.legacyToken)
            ? db
                .prepare(
                  "SELECT id FROM sessions WHERE token_hash=? AND last_seen>? AND NOT EXISTS(SELECT 1 FROM accounts WHERE accounts.id=sessions.id)",
                )
                .get(tokenHash(body.legacyToken), Date.now() - SESSION_AGE)
            : undefined;
        const id = legacy ? String(legacy.id) : randomUUID();
        row = {
          id,
          username: login,
          name,
          password_hash: encoded,
          role: "member",
          must_change: 0,
        };
        try {
          db.prepare("INSERT INTO accounts VALUES (?,?,?,?,?,?,?)").run(
            id,
            login,
            name,
            encoded,
            "member",
            0,
            Date.now(),
          );
        } catch {
          throw new AuthError("账号或设备已完成注册，请直接登录");
        }
      } else {
        if (!(await verifyPassword(secret, row?.password_hash)))
          throw new AuthError("账号或密码不正确", 401);
        // Verify the password hash is still current after the asynchronous derivation.
        const current = db
          .prepare("SELECT * FROM accounts WHERE id=? AND password_hash=?")
          .get(row!.id, row!.password_hash) as unknown as
          AccountRow | undefined;
        if (!current) throw new AuthError("账号或密码不正确", 401);
        row = current;
      }
      rates.delete(`account:${login}`);
      res.end(JSON.stringify(issue(row!)));
    } catch (error) {
      res.statusCode = error instanceof AuthError ? error.status : 500;
      res.end(
        JSON.stringify({
          error:
            error instanceof AuthError
              ? error.message
              : "账号服务暂时不可用，请稍后重试",
        }),
      );
    } finally {
      if (entered) hashing--;
    }
    return true;
  }
  return {
    getSession,
    requireSession,
    handle,
    canOpenTables,
    getAccount,
    getAvatar: (id: string) => avatarPath(db, id),
    notifyAccount,
    requirePlay,
  };
}
