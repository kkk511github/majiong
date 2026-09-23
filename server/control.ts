import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { DatabaseSync } from "node:sqlite";
import type { Account } from "../shared/types";
import {
  ADMIN_USERNAME,
  AuthError,
  displayName,
  password,
  readJSON,
  type AuthSession,
  type createAccounts,
} from "./accounts";
import { createAnnouncements } from "./announcements";
import type { ClientUpdateSettings } from '../shared/client-update';

type Accounts = ReturnType<typeof createAccounts>;

/** Browser administration follows the existing one-session-per-account login rules. */
export function createControl(
  db: DatabaseSync,
  accounts: Accounts,
  onAnnouncementsChanged: () => void = () => {},
  clientUpdates?: { get: () => ClientUpdateSettings; save: (actor: string, body: Record<string, unknown>) => ClientUpdateSettings },
) {
  const announcements = createAnnouncements(db, onAnnouncementsChanged);
  const bearer = (req: IncomingMessage) =>
    req.headers.authorization?.replace(/^Bearer /, "");
  function requireSession(req: IncomingMessage): AuthSession {
    return accounts.requireSession(req, true);
  }

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
  function audit(
    actorId: string,
    targetId: string,
    event: Record<string, unknown>,
  ) {
    db.prepare("INSERT INTO account_audit VALUES (?,?,?,?)").run(
      randomUUID(),
      targetId,
      JSON.stringify({ ...event, actorId }),
      Date.now(),
    );
  }
  function targetAccount(id: string): Account {
    const target = accounts.getAccount(id);
    if (!target) throw new AuthError("账号不存在", 404);
    return target;
  }
  function mayChange(actor: AuthSession, target: Account, sensitive: boolean) {
    if (
      sensitive &&
      (target.id === actor.id ||
        target.username.toLowerCase() === ADMIN_USERNAME)
    )
      throw new AuthError("不能通过后台重置或暂停本人及 guanli@1 账号", 403);
    if (target.role === "admin" && !actor.account.canManageAdmins)
      throw new AuthError("其他管理员的人员设置仅限 guanli@1 管理", 403);
  }
  function members(query: URLSearchParams) {
    const page = Number(query.get("page") ?? 1),
      pageSize = 20;
    if (!Number.isSafeInteger(page) || page < 1 || page > 100000)
      throw new AuthError("页码不正确");
    const q = (query.get("q") ?? "").trim(),
      team = query.get("team") ?? "",
      status = query.get("status") ?? "";
    if (q.length > 100 || team.length > 100)
      throw new AuthError("筛选内容过长");
    if (!["", "active", "suspended"].includes(status))
      throw new AuthError("账号状态不正确");
    const where = ["1=1"],
      args: (string | number)[] = [];
    if (q) {
      where.push(
        "(instr(lower(a.username),lower(?))>0 OR instr(a.name,?)>0 OR instr(lower(a.id),lower(?))>0 OR EXISTS(SELECT 1 FROM account_numbers n WHERE n.account_id=a.id AND CAST(n.member_id AS TEXT)=?))",
      );
      args.push(q, q, q, q);
    }
    if (team === "unassigned") where.push("m.team_id IS NULL");
    else if (team) {
      where.push("m.team_id=?");
      args.push(team);
    }
    if (status) {
      where.push("COALESCE(s.suspended,0)=?");
      args.push(status === "suspended" ? 1 : 0);
    }
    const from =
      " FROM accounts a LEFT JOIN team_memberships m ON m.account_id=a.id LEFT JOIN account_suspensions s ON s.account_id=a.id WHERE " +
      where.join(" AND ");
    const total = Number(
      db.prepare("SELECT COUNT(*) AS n" + from).get(...args)!.n,
    );
    const rows = db
      .prepare(
        "SELECT a.id" +
          from +
          " ORDER BY a.created_at DESC,a.rowid DESC LIMIT ? OFFSET ?",
      )
      .all(...args, pageSize, (page - 1) * pageSize);
    return {
      accounts: rows.map((row) => accounts.getAccount(String(row.id))),
      total,
      page,
      pageSize,
    };
  }
  function memberAudit(id: string) {
    targetAccount(id);
    const rows = db
      .prepare(
        "SELECT * FROM account_audit WHERE account_id=? ORDER BY at DESC,rowid DESC LIMIT 50",
      )
      .all(id);
    return {
      audit: rows.map((row) => {
        let detail: Record<string, unknown> = {};
        try {
          const parsed: unknown = JSON.parse(String(row.event));
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
            detail = parsed as Record<string, unknown>;
        } catch {
          /* Historical audit events are plain strings. */
        }
        const actorId =
          typeof detail.actorId === "string" ? detail.actorId : "";
        const values = (input: unknown) => {
          if (!input || typeof input !== "object" || Array.isArray(input))
            return undefined;
          const source = input as Record<string, unknown>,
            safe: Record<string, unknown> = {};
          for (const key of [
            "name",
            "teamId",
            "teamName",
            "suspended",
            "playBlocked",
          ])
            if (
              ["string", "boolean"].includes(typeof source[key]) ||
              source[key] === null
            )
              safe[key] = source[key];
          return safe;
        };
        return {
          id: String(row.id),
          at: Number(row.at),
          actorId,
          actorName: actorId
            ? (accounts.getAccount(actorId)?.name ?? "已注销管理员")
            : "系统",
          event:
            typeof detail.event === "string"
              ? detail.event
              : Object.keys(detail).length
                ? "account-updated"
                : String(row.event),
          before: values(detail.before),
          after: values(
            detail.after ??
              (detail.event === "membership-changed" ? detail : undefined),
          ),
          reason: typeof detail.reason === "string" ? detail.reason : undefined,
        };
      }),
    };
  }
  async function handle(
    req: IncomingMessage,
    res: ServerResponse,
    url: URL,
  ): Promise<boolean> {
    const path = url.pathname;
    const memberPath =
      path === "/api/announcements" || path.startsWith("/api/announcements/");
    if (!memberPath && !path.startsWith("/api/control/")) return false;
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    try {
      if (memberPath) {
        let session = accounts.requireSession(req);
        if (path === "/api/announcements" && req.method === "GET") {
          res.end(JSON.stringify(announcements.published(session.id)));
          return true;
        }
        const match = /^\/api\/announcements\/([a-f0-9-]{36})\/read$/.exec(
          path,
        );
        if (!match) throw new AuthError("接口不存在", 404);
        if (req.method !== "POST") throw new AuthError("请求方式不支持", 405);
        const body = await readJSON(req);
        session = accounts.requireSession(req);
        res.end(
          JSON.stringify(
            announcements.read(session.id, match[1], body.revision),
          ),
        );
        return true;
      }
      if (path === "/api/control/auth/login") {
        if (req.method !== "POST") throw new AuthError("请求方式不支持", 405);
        const verified = await accounts.verifyAdministrator(
          req,
          await readJSON(req),
        );
        res.end(
          JSON.stringify(
            accounts.issueAdministratorSession(
              verified.account.id,
              verified.credentialHash,
            ),
          ),
        );
        return true;
      }
      if (path === "/api/control/auth/logout") {
        if (req.method !== "POST") throw new AuthError("请求方式不支持", 405);
        const session = accounts.getSession(bearer(req));
        if (session) accounts.revokeSessions(session.id);
        res.end('{"ok":true}');
        return true;
      }
      let actor = requireSession(req);
      if (path === "/api/control/auth/session") {
        if (req.method !== "GET") throw new AuthError("请求方式不支持", 405);
        res.end(JSON.stringify({ account: actor.account }));
        return true;
      }
      if (req.method === "GET") {
        const readersPath = /^\/api\/control\/announcements\/([a-f0-9-]{36})\/readers$/.exec(path);
        if (readersPath) {
          res.end(JSON.stringify(announcements.readers(readersPath[1], url.searchParams)));
          return true;
        }
        if (path === '/api/control/settings/client-update' && clientUpdates)
          res.end(JSON.stringify(clientUpdates.get()));
        else if (path === "/api/control/announcements")
          res.end(JSON.stringify(announcements.list()));
        else if (path === "/api/control/members")
          res.end(JSON.stringify(members(url.searchParams)));
        else if (path === "/api/control/teams")
          res.end(
            JSON.stringify({
              teams: db
                .prepare(
                  "SELECT t.id,t.name,COUNT(m.account_id) AS members FROM teams t LEFT JOIN team_memberships m ON m.team_id=t.id GROUP BY t.id ORDER BY t.created_at,t.id",
                )
                .all(),
            }),
          );
        else {
          const match =
            /^\/api\/control\/members\/([a-zA-Z0-9_-]{1,100})\/audit$/.exec(
              path,
            );
          if (!match) throw new AuthError("接口不存在", 404);
          res.end(JSON.stringify(memberAudit(match[1])));
        }
        return true;
      }
      if (req.method !== "POST") throw new AuthError("请求方式不支持", 405);
      const body = await readJSON(
        req,
        path.startsWith("/api/control/announcements") ? 65536 : 8192,
      );
      // Never trust an authorization check performed before an awaited body/hash.
      actor = requireSession(req);
      if (path === '/api/control/settings/client-update' && clientUpdates) {
        res.end(JSON.stringify(clientUpdates.save(actor.id, body)));
        return true;
      }
      if (path === "/api/control/announcements") {
        res.end(JSON.stringify(announcements.save(actor.id, undefined, body)));
        return true;
      }
      const announcementPath =
        /^\/api\/control\/announcements\/([a-f0-9-]{36})(?:\/(publish|withdraw))?$/.exec(
          path,
        );
      if (announcementPath) {
        res.end(
          JSON.stringify(
            announcementPath[2] === "publish"
              ? announcements.publish(actor.id, announcementPath[1], body)
              : announcementPath[2] === "withdraw"
                ? announcements.withdraw(actor.id, announcementPath[1], body)
                : announcements.save(actor.id, announcementPath[1], body),
          ),
        );
        return true;
      }
      const targetPath =
        /^\/api\/control\/members\/([a-zA-Z0-9_-]{1,100})(?:\/(password|suspension|delete))?$/.exec(
          path,
        );
      if (!targetPath) throw new AuthError("接口不存在", 404);
      const id = targetPath[1],
        operation = targetPath[2];
      let target = targetAccount(id);
      if (operation === "delete") {
        if (target.id === actor.id)
          throw new AuthError("不能删除当前登录的账号", 403);
        if (target.username.toLowerCase() === ADMIN_USERNAME)
          throw new AuthError(`不能删除受保护账号 ${ADMIN_USERNAME}`, 403);
        if (target.role === "admin" && !actor.account.canManageAdmins)
          throw new AuthError(
            `其他管理员的账号仅限 ${ADMIN_USERNAME} 删除`,
            403,
          );
        transaction(() => {
          audit(actor.id, id, {
            event: "account-deleted",
            before: {
              name: target.name,
              teamId: target.teamId ?? null,
              teamName: target.teamName ?? null,
              suspended: !!target.suspended,
              playBlocked: !!target.playBlocked,
            },
          });
          // Keep account_numbers, records, rosters and audit trails so old
          // score sheets and replays retain their stable player identity.
          for (const [table, column] of [
            ["sessions", "id"],
            ["team_memberships", "account_id"],
            ["table_permissions", "account_id"],
            ["account_avatars", "account_id"],
            ["account_suspensions", "account_id"],
            ["announcement_reads", "account_id"],
            ["announcement_requests", "actor_id"],
            ["admin_match_reads", "admin_id"],
            ["table_creations", "session_id"],
          ] as const) {
            if (
              db
                .prepare(
                  "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",
                )
                .get(table)
            )
              db.prepare(`DELETE FROM ${table} WHERE ${column}=?`).run(id);
          }
          const removed = db.prepare("DELETE FROM accounts WHERE id=?").run(id);
          if (!removed.changes) throw new AuthError("账号不存在", 404);
        });
        accounts.revokeSessions(id);
        res.end(JSON.stringify({ ok: true, id }));
        return true;
      }
      mayChange(actor, target, !!operation);
      if (!operation) {
        if (
          [
            "role",
            "username",
            "canManageAdmins",
            "canCreateTables",
            "playBlocked",
            "suspended",
          ].some((key) => key in body)
        )
          throw new AuthError("账号、角色和权限不能在人员资料中更改", 403);
        const name = displayName(body.name),
          teamId = body.teamId;
        if (
          teamId !== null &&
          (typeof teamId !== "string" ||
            !db.prepare("SELECT 1 FROM teams WHERE id=?").get(teamId))
        )
          throw new AuthError("请选择有效战队");
        transaction(() => {
          db.prepare("UPDATE accounts SET name=? WHERE id=?").run(name, id);
          db.prepare("UPDATE sessions SET name=? WHERE id=?").run(name, id);
          db.prepare(
            "INSERT INTO team_memberships VALUES (?,?,?,?,?) ON CONFLICT(account_id) DO UPDATE SET team_id=excluded.team_id,updated_by=excluded.updated_by,updated_at=excluded.updated_at",
          ).run(id, teamId, target.playBlocked ? 1 : 0, actor.id, Date.now());
          audit(actor.id, id, {
            event: "profile-updated",
            before: { name: target.name, teamId: target.teamId ?? null },
            after: { name, teamId },
          });
          if ((target.teamId ?? null) !== teamId)
            audit(actor.id, id, {
              event: "membership-changed",
              teamId,
              playBlocked: !!target.playBlocked,
              before: { teamId: target.teamId ?? null },
              after: { teamId },
            });
        });
      } else if (operation === "password") {
        const secret = password(body.password);
        if (secret !== body.confirmPassword)
          throw new AuthError("两次输入的新密码不一致");
        const beforeHash = db
          .prepare("SELECT password_hash FROM accounts WHERE id=?")
          .get(id)!.password_hash;
        const encoded = await accounts.hashAdministrativePassword(
          actor.id,
          secret,
        );
        actor = requireSession(req);
        target = targetAccount(id);
        mayChange(actor, target, true);
        transaction(() => {
          const changed = db
            .prepare(
              "UPDATE accounts SET password_hash=?,must_change=0 WHERE id=? AND password_hash=?",
            )
            .run(encoded, id, beforeHash);
          if (!changed.changes)
            throw new AuthError("密码已被修改，请重新操作", 409);
          audit(actor.id, id, { event: "password-reset" });
          db.prepare("DELETE FROM sessions WHERE id=?").run(id);
        });
        accounts.revokeSessions(id);
      } else {
        if (typeof body.suspended !== "boolean")
          throw new AuthError("请选择暂停或恢复使用");
        const reason = body.reason === undefined ? "" : body.reason;
        if (
          typeof reason !== "string" ||
          reason.trim().length > 500 ||
          /[\x00-\x1f]/.test(reason)
        )
          throw new AuthError("处理原因最多 500 个字");
        transaction(() => {
          db.prepare(
            "INSERT INTO account_suspensions VALUES (?,?,?,?,?) ON CONFLICT(account_id) DO UPDATE SET suspended=excluded.suspended,reason=excluded.reason,updated_by=excluded.updated_by,updated_at=excluded.updated_at",
          ).run(
            id,
            body.suspended ? 1 : 0,
            reason.trim(),
            actor.id,
            Date.now(),
          );
          audit(actor.id, id, {
            event: body.suspended ? "account-suspended" : "account-restored",
            before: { suspended: !!target.suspended },
            after: { suspended: body.suspended },
            reason: reason.trim(),
          });
          if (body.suspended) {
            db.prepare("DELETE FROM sessions WHERE id=?").run(id);
          }
        });
        if (body.suspended) accounts.revokeSessions(id);
      }
      res.end(JSON.stringify({ account: accounts.notifyAccount(id) }));
    } catch (error) {
      res.statusCode = error instanceof AuthError ? error.status : 500;
      res.end(
        JSON.stringify({
          error:
            error instanceof AuthError
              ? error.message
              : "管理操作未完成，请稍后重试",
        }),
      );
      req.resume();
    }
    return true;
  }
  return { handle, requireSession };
}
