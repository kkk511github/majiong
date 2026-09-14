import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { DatabaseSync } from "node:sqlite";
import {
  ADMIN_USERNAME,
  AuthError,
  readJSON,
  type createAccounts,
} from "./accounts";
import type { createRecords } from "./records";

export function createClub(
  db: DatabaseSync,
  accounts: ReturnType<typeof createAccounts>,
  records: ReturnType<typeof createRecords>,
) {
  function audit(actorId: string, targetId: string, event: object) {
    db.prepare("INSERT INTO account_audit VALUES (?,?,?,?)").run(
      randomUUID(),
      targetId,
      JSON.stringify({ ...event, actorId }),
      Date.now(),
    );
  }
  function transaction(fn: () => void) {
    db.exec("BEGIN");
    try {
      fn();
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
  async function handle(req: IncomingMessage, res: ServerResponse, url: URL) {
    if (
      ![
        "/api/admin/teams",
        "/api/admin/members",
        "/api/admin/administrators",
        "/api/admin/points",
        "/api/admin/points/export",
      ].includes(url.pathname)
    )
      return false;
    res.setHeader("Cache-Control", "no-store");
    try {
      let actor = accounts.requireSession(req, true);
      const path = url.pathname;
      if (req.method === "GET") {
        if (path === "/api/admin/teams") {
          res.end(
            JSON.stringify({
              teams: db
                .prepare(
                  "SELECT t.id,t.name,COUNT(m.account_id) AS members FROM teams t LEFT JOIN team_memberships m ON m.team_id=t.id GROUP BY t.id ORDER BY t.created_at,t.id",
                )
                .all(),
            }),
          );
        } else if (path === "/api/admin/members") {
          const page = Number(url.searchParams.get("page") ?? 1),
            pageSize = 20;
          if (!Number.isInteger(page) || page < 1 || page > 100000)
            throw new AuthError("页码不正确");
          const q = (url.searchParams.get("q") ?? "").trim(),
            team = url.searchParams.get("team") ?? "";
          if (q.length > 100 || team.length > 100)
            throw new AuthError("筛选内容过长");
          const where = ["1=1"],
            args: (string | number)[] = [];
          if (q) {
            where.push(
              "(instr(lower(a.username),lower(?))>0 OR instr(a.name,?)>0 OR EXISTS(SELECT 1 FROM account_numbers n WHERE n.account_id=a.id AND CAST(n.member_id AS TEXT)=?))",
            );
            args.push(q, q, q);
          }
          if (team === "unassigned") where.push("m.team_id IS NULL");
          else if (team) {
            where.push("m.team_id=?");
            args.push(team);
          }
          if (url.searchParams.get("blocked") === "true")
            where.push("m.blocked=1");
          const from =
            " FROM accounts a LEFT JOIN team_memberships m ON m.account_id=a.id WHERE " +
            where.join(" AND ");
          const total = Number(
            db.prepare("SELECT COUNT(*) AS n" + from).get(...args)!.n,
          );
          const ids = db
            .prepare(
              "SELECT a.id" + from + " ORDER BY a.username LIMIT ? OFFSET ?",
            )
            .all(...args, pageSize, (page - 1) * pageSize);
          res.end(
            JSON.stringify({
              accounts: ids.map((r) => accounts.getAccount(String(r.id))),
              total,
              page,
              pageSize,
            }),
          );
        } else if (
          path === "/api/admin/points" ||
          path === "/api/admin/points/export"
        ) {
          res.end(
            JSON.stringify(
              path.endsWith("/export")
                ? { csv: records.exportPoints(url.searchParams) }
                : records.points(url.searchParams),
            ),
          );
        } else throw new AuthError("请求方式不支持", 405);
        return true;
      }
      if (req.method !== "POST" || path.includes("/points"))
        throw new AuthError("请求方式不支持", 405);
      const body = await readJSON(req);
      // Re-read authorization after the awaited request body. Revocations take effect immediately.
      actor = accounts.requireSession(req, true);
      if (path === "/api/admin/teams") {
        const name = typeof body.name === "string" ? body.name.trim() : "";
        if (!name || name.length > 24 || /[\x00-\x1f]/.test(name))
          throw new AuthError("战队名称需要 1–24 个字");
        if (
          body.id !== undefined &&
          (typeof body.id !== "string" || body.id.length > 100)
        )
          throw new AuthError("战队编号无效");
        const id = body.id as string | undefined;
        if (id && !db.prepare("SELECT 1 FROM teams WHERE id=?").get(id))
          throw new AuthError("战队不存在", 404);
        if (
          db
            .prepare("SELECT 1 FROM teams WHERE name=? AND id<>?")
            .get(name, id ?? "")
        )
          throw new AuthError("战队名称已存在");
        const teamId = id ?? randomUUID();
        transaction(() => {
          if (id)
            db.prepare("UPDATE teams SET name=? WHERE id=?").run(name, id);
          else
            db.prepare("INSERT INTO teams VALUES (?,?,?)").run(
              teamId,
              name,
              Date.now(),
            );
          audit(actor.id, teamId, {
            event: id ? "team-renamed" : "team-created",
            name,
          });
        });
        for (const member of db
          .prepare("SELECT account_id FROM team_memberships WHERE team_id=?")
          .all(teamId))
          accounts.notifyAccount(String(member.account_id));
        res.end(JSON.stringify({ id: teamId, name }));
      } else {
        if (typeof body.accountId !== "string" || body.accountId.length > 100)
          throw new AuthError("请选择会员账号");
        const target = accounts.getAccount(body.accountId);
        if (!target) throw new AuthError("账号不存在，请让会员先注册", 404);
        if (path === "/api/admin/administrators") {
          if (!actor.account.canManageAdmins)
            throw new AuthError("仅 guanli@1 可以添加或撤销管理员", 403);
          if (target.username.toLowerCase() === ADMIN_USERNAME)
            throw new AuthError("不能修改 guanli@1 的管理员权限", 403);
          if (typeof body.admin !== "boolean")
            throw new AuthError("请指定管理员权限");
          transaction(() => {
            db.prepare("UPDATE accounts SET role=? WHERE id=?").run(
              body.admin ? "admin" : "member",
              target.id,
            );
            // Revoking administrator access must not leave a stale earlier table grant behind.
            if (!body.admin)
              db.prepare(
                "DELETE FROM table_permissions WHERE account_id=?",
              ).run(target.id);
            audit(actor.id, target.id, {
              event: "administrator-changed",
              admin: body.admin,
            });
          });
        } else {
          if (target.role === "admin" && !actor.account.canManageAdmins)
            throw new AuthError("管理员账号的参赛设置由 guanli@1 管理", 403);
          if (
            body.teamId !== undefined &&
            body.teamId !== null &&
            (typeof body.teamId !== "string" ||
              !db.prepare("SELECT 1 FROM teams WHERE id=?").get(body.teamId))
          )
            throw new AuthError("请选择有效战队");
          if (
            body.playBlocked !== undefined &&
            typeof body.playBlocked !== "boolean"
          )
            throw new AuthError("参赛状态无效");
          if (body.teamId === undefined && body.playBlocked === undefined)
            throw new AuthError("请选择战队或参赛状态");
          const teamId =
            body.teamId === undefined ? target.teamId : body.teamId;
          const blocked =
            body.playBlocked === undefined
              ? target.playBlocked
              : body.playBlocked;
          transaction(() => {
            db.prepare(
              "INSERT INTO team_memberships VALUES (?,?,?,?,?) ON CONFLICT(account_id) DO UPDATE SET team_id=excluded.team_id,blocked=excluded.blocked,updated_by=excluded.updated_by,updated_at=excluded.updated_at",
            ).run(
              target.id,
              teamId ?? null,
              blocked ? 1 : 0,
              actor.id,
              Date.now(),
            );
            audit(actor.id, target.id, {
              event: "membership-changed",
              teamId,
              playBlocked: blocked,
            });
          });
        }
        res.end(JSON.stringify({ account: accounts.notifyAccount(target.id) }));
      }
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
    }
    return true;
  }
  return { handle };
}
