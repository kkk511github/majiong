import type { DatabaseSync } from "node:sqlite";
import type { RoundRecord } from "../shared/types";
import type {
  MemberGamePage,
  MemberGameDetail,
  QueriedMember,
} from "../shared/member-game-query";
import { settlementRows } from "../shared/settlement";
import { AuthError } from "./accounts";
import type { createRecords } from "./records";
const DAY = 86400000,
  OFFSET = 8 * 3600000;
export function queryChinaDate(value: string | null) {
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value ?? "");
  if (!match) throw new AuthError("请选择有效日期");
  const date = `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`,
    at = Date.parse(date + "T00:00:00+08:00");
  if (
    !Number.isFinite(at) ||
    new Date(at + OFFSET).toISOString().slice(0, 10) !== date
  )
    throw new AuthError("日期不存在");
  return { date, at };
}
export function createMemberGameQueries(
  db: DatabaseSync,
  records: Pick<ReturnType<typeof createRecords>, "details">,
) {
  db.exec(
    "CREATE INDEX IF NOT EXISTS match_records_game_latest ON match_records(game_id,at DESC,id DESC)",
  );
  function member(value: string | null): QueriedMember {
    const id = (value ?? "").trim();
    if (!/^\d{1,12}$/.test(id)) throw new AuthError("请输入有效会员ID");
    const row = db
      .prepare(
        "SELECT n.account_id,n.member_id,a.name,a.username FROM account_numbers n LEFT JOIN accounts a ON a.id=n.account_id WHERE n.member_id=?",
      )
      .get(Number(id));
    if (!row) throw new AuthError("会员ID不存在", 404);
    return {
      id: String(row.account_id),
      memberId: String(row.member_id),
      name: String(row.name ?? "已删除会员"),
      username: String(row.username ?? ""),
      deleted: row.name === null,
    };
  }
  function list(query: URLSearchParams): MemberGamePage {
    const who = member(query.get("memberId")),
      from = queryChinaDate(query.get("from")),
      to = queryChinaDate(query.get("to"));
    if (to.at < from.at) throw new AuthError("结束日期不能早于开始日期");
    if (to.at - from.at >= 366 * DAY)
      throw new AuthError("一次最多查询366天，请缩小日期范围");
    const page = Number(query.get("page") ?? 1),
      pageSize = 20;
    if (!Number.isSafeInteger(page) || page < 1 || page > 100000)
      throw new AuthError("页码不正确");
    // Use the latest completed snapshot for each game, including legacy duplicates.
    const where = ` FROM match_records r WHERE r.at>=? AND r.at<?
    AND EXISTS(SELECT 1 FROM json_each(r.player_ids) WHERE value=?)
    AND r.rowid=(SELECT last.rowid FROM match_records last WHERE last.game_id=r.game_id ORDER BY last.at DESC,last.id DESC,last.rowid DESC LIMIT 1)`;
    const args = [from.at, to.at + DAY, who.id];
    const totalTables = Number(
      db.prepare("SELECT COUNT(*) AS n" + where).get(...args)!.n,
    );
    const counts = new Map(
      db
        .prepare(
          "SELECT strftime('%Y-%m-%d',r.at/1000,'unixepoch','+8 hours') AS date,COUNT(*) AS n" +
            where +
            " GROUP BY date",
        )
        .all(...args)
        .map((row) => [String(row.date), Number(row.n)]),
    );
    const daily = Array.from(
      { length: Math.round((to.at - from.at) / DAY) + 1 },
      (_, i) => {
        const date = new Date(from.at + i * DAY + OFFSET)
          .toISOString()
          .slice(0, 10);
        return { date, tables: counts.get(date) ?? 0 };
      },
    );
    const rows = db
      .prepare(
        "SELECT r.game_id,r.code,r.at,r.record,r.player_ids" +
          where +
          " ORDER BY r.at DESC,r.game_id DESC LIMIT ? OFFSET ?",
      )
      .all(...args, pageSize, (page - 1) * pageSize);
    const items = rows.map((row) => {
      const record = JSON.parse(String(row.record)) as RoundRecord;
      record.playerIds = JSON.parse(String(row.player_ids));
      const own = settlementRows(record).find((p) => p.id === who.id);
      return {
        gameId: String(row.game_id),
        code: String(row.code),
        finishedAt: Number(row.at),
        tableName: record.tableName ?? "好友桌",
        rounds: record.round,
        reason:
          record.endReason ??
          (record.result.reason === "dissolved" ? "提前解散" : "本桌结束"),
        experience: !!record.experience,
        names: record.names,
        memberRecorded:
          own && Number.isFinite(own.recorded) ? own.recorded : null,
      };
    });
    return {
      member: who,
      from: from.date,
      to: to.date,
      timeZone: "Asia/Shanghai",
      totalTables,
      daily,
      page,
      pageSize,
      items,
    };
  }
  function detail(
    gameId: string,
    memberId: string | null,
    actor: string,
  ): MemberGameDetail {
    const who = member(memberId);
    if (!/^[A-Za-z0-9_-]{1,120}$/.test(gameId))
      throw new AuthError("牌桌ID不正确");
    const belongs = db
      .prepare(
        "SELECT 1 FROM (SELECT player_ids FROM match_records WHERE game_id=? ORDER BY at DESC,id DESC,rowid DESC LIMIT 1) WHERE EXISTS(SELECT 1 FROM json_each(player_ids) WHERE value=?)",
      )
      .get(gameId, who.id);
    if (!belongs) throw new AuthError("该会员没有这桌已结束战绩", 404);
    return { member: who, details: records.details(gameId, actor, true) };
  }
  return { list, detail };
}
