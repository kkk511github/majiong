import type { DatabaseSync } from "node:sqlite";
import type {
  Game,
  MatchDetails,
  RecordsPage,
  RoundRecord,
  StoredRound,
} from "../shared/types";
import { membership } from "./teams";
import type { PointSummary, PointSummaryPage } from "../shared/types";
import { AuthError } from "./accounts";
import { roundNet, settlementRows } from "../shared/settlement";
import { gzipSync, gunzipSync } from "node:zlib";
import {completedTableWindow} from './completed-table-window';
import type { RoundReplay } from "../shared/types";

export function createRecords(
  db: DatabaseSync,
  avatarFor: (id: string) => string | undefined = () => undefined,
) {
  db.exec(`CREATE TABLE IF NOT EXISTS round_replays (
    id TEXT PRIMARY KEY, payload BLOB NOT NULL);`);
  db.exec(`CREATE TABLE IF NOT EXISTS round_records (
    id TEXT PRIMARY KEY, game_id TEXT NOT NULL, code TEXT NOT NULL,
    at INTEGER NOT NULL, player_ids TEXT NOT NULL, private_names INTEGER NOT NULL,
    record TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS round_records_time ON round_records(at DESC, id DESC);
    CREATE INDEX IF NOT EXISTS round_records_code ON round_records(code, at DESC);
    CREATE INDEX IF NOT EXISTS round_records_game ON round_records(game_id);`);
  db.exec(`CREATE TABLE IF NOT EXISTS match_records (
    id TEXT PRIMARY KEY, game_id TEXT NOT NULL, code TEXT NOT NULL,
    at INTEGER NOT NULL, player_ids TEXT NOT NULL, private_names INTEGER NOT NULL,
    record TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS match_records_time ON match_records(at DESC, id DESC);
    CREATE INDEX IF NOT EXISTS match_records_code ON match_records(code, at DESC);`);
  db.exec('CREATE INDEX IF NOT EXISTS match_records_game_latest ON match_records(game_id,at DESC,id DESC)');
  db.exec(`CREATE TABLE IF NOT EXISTS round_rosters (
    game_id TEXT NOT NULL, round INTEGER NOT NULL, account_id TEXT NOT NULL,
    team_id TEXT NOT NULL, team_name TEXT NOT NULL, PRIMARY KEY(game_id,round,account_id));
    CREATE TABLE IF NOT EXISTS point_records (
    record_id TEXT NOT NULL, game_id TEXT NOT NULL, at INTEGER NOT NULL,
    account_id TEXT NOT NULL, name TEXT NOT NULL, team_id TEXT NOT NULL,
    team_name TEXT NOT NULL, points REAL NOT NULL, PRIMARY KEY(record_id,account_id));
    CREATE INDEX IF NOT EXISTS point_records_filter ON point_records(at,team_id,account_id);
    CREATE INDEX IF NOT EXISTS point_records_table_member ON point_records(game_id,account_id,at,record_id);`);
  db.exec(`CREATE TABLE IF NOT EXISTS admin_match_reads (
    game_id TEXT NOT NULL, admin_id TEXT NOT NULL, read_at INTEGER NOT NULL,
    PRIMARY KEY(game_id, admin_id));`);
  function markRead(game: string, viewer: string) {
    // Check the persisted role here too; callers cannot grant themselves access.
    if (
      db.prepare("SELECT role FROM accounts WHERE id=?").get(viewer)?.role !==
      "admin"
    )
      throw new AuthError("仅管理员可标记战绩已读", 403);
    details(game, viewer, true);
    db.prepare("INSERT OR IGNORE INTO admin_match_reads VALUES (?,?,?)").run(
      game,
      viewer,
      Date.now(),
    );
    return {
      readAt: Number(
        db
          .prepare(
            "SELECT read_at FROM admin_match_reads WHERE game_id=? AND admin_id=?",
          )
          .get(game, viewer)!.read_at,
      ),
    };
  }
  const save = db.prepare(
    "INSERT OR IGNORE INTO round_records VALUES (?,?,?,?,?,?,?)",
  );
  function capture(g: Game, live = true) {
    if (live && ["playing", "claiming"].includes(g.phase)) {
      for (const p of g.players) {
        if (!p || p.bot) continue;
        const m = membership(db, p.id);
        db.prepare(
          "INSERT OR IGNORE INTO round_rosters VALUES (?,?,?,?,?)",
        ).run(g.id, g.round, p.id, m.teamId ?? "", m.teamName ?? "历史未归队");
      }
    }
    for (const original of g.history) {
      const record: RoundRecord = {
        ...original,
        experience: original.experience || !!g.table?.experience,
        initialScore: original.initialScore ?? g.initialScore ?? 0,
        settlementBase: original.settlementBase ?? g.settlementBase,
        scoreDivisor: original.scoreDivisor ?? g.scoreDivisor ?? 1,
        playerIds: original.playerIds ?? g.players.map((p) => p?.id ?? ""),
        totalRounds: original.totalRounds ?? g.rules.rounds,
        tableName: original.tableName ?? g.table?.settings.name ?? "南京好友桌",
      };
      save.run(
        record.id,
        g.id,
        g.code,
        record.at,
        JSON.stringify(record.playerIds),
        g.table?.settings.privacy === "all" ? 1 : 0,
        JSON.stringify(record),
      );
      // Only completed online hands count; practice remains viewable history.
      if (
        g.code !== "练习桌" &&
        !record.experience &&
        record.result.reason !== "dissolved"
      ) {
        record.playerIds!.forEach((id, seat) => {
          if (!id || !db.prepare("SELECT 1 FROM accounts WHERE id=?").get(id))
            return;
          const delta = roundNet(record.result, seat);
          if (
            !Number.isFinite(record.result.deltas[seat]) ||
            !Number.isFinite(delta)
          )
            return;
          const roster = db
            .prepare(
              "SELECT team_id,team_name FROM round_rosters WHERE game_id=? AND round=? AND account_id=?",
            )
            .get(g.id, record.round, id);
          db.prepare(
            "INSERT OR IGNORE INTO point_records VALUES (?,?,?,?,?,?,?,?)",
          ).run(
            record.id,
            g.id,
            record.at,
            id,
            record.names[seat] ?? "牌友",
            String(roster?.team_id ?? ""),
            String(roster?.team_name ?? "历史未归队"),
            delta,
          );
        });
      }
    }
    if (
      g.replay?.endedAt &&
      g.history.some((r) => r.id === g.replay!.id) &&
      !db.prepare("SELECT 1 FROM round_replays WHERE id=?").get(g.replay.id)
    ) {
      db.prepare("INSERT OR IGNORE INTO round_replays VALUES (?,?)").run(
        g.replay.id,
        gzipSync(JSON.stringify(g.replay)),
      );
    }
    if (
      g.phase === "finished" &&
      g.history.length &&
      g.players.every(Boolean)
    ) {
      const last = g.history.at(-1)!;
      const final: RoundRecord = {
        ...last,
        id: `${g.id}-final`,
        at: g.table?.finishedAt ?? last.at,
        names: g.players.map((p) => p!.name),
        scores: g.players.map((p) => p!.score),
        externalScores: g.players.map((p) => p!.externalScore ?? 0),
        playerIds: g.players.map((p) => p!.id),
        initialScore: g.initialScore ?? 0,
        settlementBase: g.settlementBase ?? last.settlementBase,
        scoreDivisor: g.scoreDivisor ?? 1,
        totalRounds: g.rules.rounds,
        tableName: g.table?.settings.name ?? "南京好友桌",
        matchFinished: true,
        endReason:
          g.table?.endReason ??
          (g.result?.reason === "dissolved" ? "提前解散" : "本桌完成"),
      };
      db.prepare(
        "INSERT OR IGNORE INTO match_records VALUES (?,?,?,?,?,?,?)",
      ).run(
        g.id,
        g.id,
        g.code,
        final.at,
        JSON.stringify(final.playerIds),
        g.table?.settings.privacy === "all" ? 1 : 0,
        JSON.stringify(final),
      );
    }
  }
  // Existing completed rounds become queryable without rewriting a live game.
  db.exec("BEGIN");
  try {
    for (const row of db
      .prepare(
        "SELECT state FROM table_archives UNION ALL SELECT state FROM rooms",
      )
      .iterate()) {
      try {
        const game = JSON.parse(String(row.state)) as Game;
        if (
          game.version === 1 &&
          Array.isArray(game.history) &&
          Array.isArray(game.players)
        )
          capture(game, false);
      } catch {
        /* Keep malformed legacy room data intact for diagnosis. */
      }
    }
    // Some legacy rooms were removed after completion. Their durable round
    // records still contribute, with an explicit unknown historical team.
    for (const row of db
      .prepare("SELECT id,game_id,code,at,record,player_ids FROM round_records")
      .iterate()) {
      if (row.code === "练习桌") continue;
      let record: RoundRecord, ids: string[];
      try {
        record = JSON.parse(String(row.record)) as RoundRecord;
        ids = JSON.parse(String(row.player_ids)) as string[];
        if (
          !Array.isArray(ids) ||
          !Array.isArray(record.names) ||
          !Array.isArray(record.result?.deltas)
        )
          continue;
      } catch {
        continue;
      }
      if (record.experience || record.result.reason === "dissolved") continue;
      ids.forEach((id, seat) => {
        const delta = roundNet(record.result, seat);
        if (
          !id ||
          !Number.isFinite(record.result.deltas[seat]) ||
          !Number.isFinite(delta) ||
          !db.prepare("SELECT 1 FROM accounts WHERE id=?").get(id)
        )
          return;
        db.prepare(
          "INSERT OR IGNORE INTO point_records VALUES (?,?,?,?,?,?,?,?)",
        ).run(
          String(row.id),
          String(row.game_id),
          Number(row.at),
          id,
          record.names[seat] ?? "牌友",
          "",
          "历史未归队",
          delta,
        );
      });
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  function list(
    query: URLSearchParams,
    viewer: string,
    admin = false,
    showTeams = admin,
  ): RecordsPage {
    const page = Number(query.get("page") ?? 1),
      pageSize = 20;
    if (!Number.isInteger(page) || page < 1 || page > 100000)
      throw new AuthError("页码不正确");
    const code = query.get("code")?.trim() ?? "";
    if (code && !/^\d{1,6}$/.test(code))
      throw new AuthError("请输入 1–6 位房间号");
    const member = query.get("member")?.trim() ?? "";
    if (member && !admin)
      throw new AuthError("仅管理员可以按成员查询总战绩", 403);
    if (member && !/^\d{1,12}$/.test(member))
      throw new AuthError("请输入有效会员 ID");
    const source =
      query.get("scope") === "rounds" ? "round_records" : "match_records";
    const read = query.get("read") ?? "all";
    if (!["all", "read", "unread"].includes(read))
      throw new AuthError("阅读状态不正确");
    if (read !== "all" && !admin)
      throw new AuthError("仅管理员可以筛选阅读状态", 403);
    const where: string[] = [],
      args: (string | number)[] = [];
    if (!admin) {
      where.push("EXISTS(SELECT 1 FROM json_each(player_ids) WHERE value=?)");
      args.push(viewer);
    }
    if (code) {
      where.push("code LIKE ?");
      args.push(code + "%");
    }
    if (member) {
      where.push(
        `EXISTS(SELECT 1 FROM json_each(${source}.player_ids) AS player JOIN account_numbers AS numbers ON numbers.account_id=player.value WHERE numbers.member_id=?)`,
      );
      args.push(Number(member));
    }
    if (read !== "all") {
      where.push(
        `${read === "unread" ? "NOT " : ""}EXISTS(SELECT 1 FROM admin_match_reads AS reads WHERE reads.game_id=${source}.game_id AND reads.admin_id=?)`,
      );
      args.push(viewer);
    }
    const dateClause = where.length ? " WHERE " + where.join(" AND ") : "";
    const dateArgs = [...args];
    for (const [key, operator] of [
      ["from", ">="],
      ["to", "<"],
    ] as const) {
      if (query.has(key)) {
        const at = Number(query.get(key));
        if (!Number.isSafeInteger(at) || at < 0 || at > 8640000000000000)
          throw new AuthError("日期不正确");
        where.push(`at ${operator} ?`);
        args.push(at);
      }
    }
    const clause = where.length ? " WHERE " + where.join(" AND ") : "";
    const dates =
      query.get("calendar") === "0"
        ? undefined
        : db
            .prepare(
              "SELECT strftime('%Y-%m-%d', at / 1000, 'unixepoch', '+8 hours') AS date, COUNT(*) AS count FROM " +
                source +
                dateClause +
                " GROUP BY date ORDER BY date DESC LIMIT 180",
            )
            .all(...dateArgs)
            .map((row) => ({
              date: String(row.date),
              count: Number(row.count),
            }));
    const dateTotal =
      query.get("calendar") === "0"
        ? undefined
        : Number(
            db
              .prepare("SELECT COUNT(*) AS total FROM " + source + dateClause)
              .get(...dateArgs)!.total,
          );
    const total = Number(
      db
        .prepare("SELECT COUNT(*) AS total FROM " + source + clause)
        .get(...args)!.total,
    );
    const rows = db
      .prepare(
        "SELECT * FROM " +
          source +
          clause +
          " ORDER BY at DESC, id DESC LIMIT ? OFFSET ?",
      )
      .all(...args, pageSize, (page - 1) * pageSize);
    const totals = new Map<
      string,
      {
        id: string;
        name: string;
        memberId?: string;
        points: number;
        rounds: number;
      }
    >();
    // Only calculate a day-level total for a bounded date query. Using the
    // complete filtered set keeps the figure correct beyond the first page.
    if (query.has("from") && query.has("to")) {
      const scoreRows = db
        .prepare("SELECT record, player_ids FROM " + source + clause)
        .all(...args);
      for (const row of scoreRows) {
        const record = JSON.parse(String(row.record)) as RoundRecord;
        record.playerIds = JSON.parse(String(row.player_ids)) as string[];
        for (const player of settlementRows(record)) {
          const id = player.id;
          if (!id || (!admin && id !== viewer)) continue;
          const current = totals.get(id);
          if (current) {
            current.points += player.recorded;
            current.rounds += 1;
          } else {
            const number = db
              .prepare(
                "SELECT member_id FROM account_numbers WHERE account_id=?",
              )
              .get(id);
            totals.set(id, {
              id,
              name: player.name,
              memberId: number ? String(number.member_id) : undefined,
              points: player.recorded,
              rounds: 1,
            });
          }
        }
      }
    }
    return {
      total,
      page,
      pageSize,
      dates,
      dateTotal,
      scoreTotals: [...totals.values()].sort(
        (a, b) => b.points - a.points || a.name.localeCompare(b.name),
      ),
      records: rows.map((row) => present(row, viewer, showTeams)),
    };
  }
  function present(
    row: Record<string, unknown>,
    viewer: string,
    admin: boolean,
  ): StoredRound {
    const original = JSON.parse(String(row.record)) as RoundRecord;
    // Never trust cached team fields: permission is enforced at every read.
    const {
      teamNames: _teams,
      memberIds: _numbers,
      avatars: _avatars,
      ...clean
    } = original;
    const record: RoundRecord = clean;
    const ids =
      record.playerIds ?? (JSON.parse(String(row.player_ids)) as string[]);
    const me = ids.indexOf(viewer);
    record.playerIds = ids;
    record.avatars = ids.map((id) => (id ? avatarFor(id) : undefined));
    record.memberIds = ids.map((id) => {
      const number = db
        .prepare("SELECT member_id FROM account_numbers WHERE account_id=?")
        .get(id);
      return number ? String(number.member_id) : "";
    });
    if (admin)
      record.teamNames = ids.map((id) => {
        const roster = db
          .prepare(
            "SELECT team_name FROM round_rosters WHERE game_id=? AND account_id=? AND round<=? ORDER BY round DESC LIMIT 1",
          )
          .get(String(row.game_id), id, record.round);
        return String(roster?.team_name ?? "历史未记录");
      });
    if (!admin && row.private_names) {
      record.names = record.names.map((name, i) =>
        i === me ? name : `牌友${i + 1}`,
      );
      record.playerIds = ids.map((id, i) => (i === me ? id : ""));
      record.memberIds = record.memberIds.map((id, i) => (i === me ? id : ""));
      record.avatars = record.avatars.map((avatar, i) =>
        i === me ? avatar : undefined,
      );
    }
    return {
      game: String(row.game_id),
      code: String(row.code),
      me,
      practice: false,
      ...(admin
        ? {
            adminReadAt:
              Number(
                db
                  .prepare(
                    "SELECT read_at FROM admin_match_reads WHERE game_id=? AND admin_id=?",
                  )
                  .get(String(row.game_id), viewer)?.read_at,
              ) || null,
          }
        : {}),
      record,
    };
  }
  function details(game: string, viewer: string, admin = false): MatchDetails {
    if (!/^[A-Za-z0-9_-]{1,120}$/.test(game))
      throw new AuthError("牌桌 ID 不正确");
    const row = db
      .prepare("SELECT * FROM match_records WHERE game_id=? ORDER BY at DESC,id DESC,rowid DESC LIMIT 1")
      .get(game);
    // Do not expose existence or membership of an unrelated table to a member.
    if (
      !row ||
      (!admin &&
        !(JSON.parse(String(row.player_ids)) as string[]).includes(viewer))
    )
      throw new AuthError("未找到可查看的已结束牌桌", 404);
    return {
      match: present(row, viewer, admin),
      rounds: db
        .prepare(
          "SELECT * FROM round_records WHERE game_id=? ORDER BY json_extract(record,'$.round'),at,id",
        )
        .all(game)
        .map((r) => present(r, viewer, admin)),
    };
  }
  function pointFilter(query: URLSearchParams) {
    // Keep unmatched legacy ledger rows, but exclude identified practice and
    // dissolved hands even when an older import already wrote their points.
    const where: string[] = [
        "COALESCE(r.code,'')<>'练习桌'",
        "COALESCE(json_extract(r.record,'$.experience'),0)=0",
        "COALESCE(json_extract(r.record,'$.result.reason'),'')<>'dissolved'",
      ],
      args: (string | number)[] = [];
    const from = query.has("from") ? Number(query.get("from")) : 0;
    const to = query.has("to") ? Number(query.get("to")) : 8640000000000000;
    if (
      ![from, to].every(
        (n) => Number.isSafeInteger(n) && n >= 0 && n <= 8640000000000000,
      ) ||
      from >= to
    )
      throw new AuthError("请选择正确的起止日期");
    where.push(completedTableWindow);
    args.push(from, to);
    for (const [key, column] of [
      ["team", "p.team_id"],
      ["member", "p.account_id"],
    ] as const) {
      const value = query.get(key);
      if (value && value.length > 100) throw new AuthError("筛选条件不正确");
      if (value) {
        where.push(column + "=?");
        args.push(value === "unassigned" && key === "team" ? "" : value);
      }
    }
    const q = query.get("q")?.trim();
    if (q && q.length > 100) throw new AuthError("搜索内容过长");
    if (q) {
      where.push(
        "(instr(lower(a.username),lower(?))>0 OR instr(COALESCE(a.name,p.name),?)>0 OR EXISTS(SELECT 1 FROM account_numbers n WHERE n.account_id=a.id AND CAST(n.member_id AS TEXT)=?))",
      );
      args.push(q, q, q);
    }
    return {
      from:
        " FROM point_records p LEFT JOIN round_records r ON r.id=p.record_id LEFT JOIN accounts a ON a.id=p.account_id LEFT JOIN teams t ON t.id=p.team_id WHERE " +
        where.join(" AND "),
      args,
    };
  }
  function points(query: URLSearchParams, all = false): PointSummaryPage {
    const page = Number(query.get("page") ?? 1),
      pageSize = 20;
    if (!Number.isInteger(page) || page < 1 || page > 100000)
      throw new AuthError("页码不正确");
    const filter = pointFilter(query);
    // Keep the raw hand ledger immutable. Charge the table fee on each member's
    // first completed hand, before date/team filters. Dates select whole tables
    // by their final snapshot, never split a table at midnight.
    // Historical team filters retain their existing per-hand attribution,
    // and a mid-table team change never charges that member twice.
    // Legacy records retain their saved baseline and multiplier (or 0 fee / 1x).
    const initial = "COALESCE(json_extract(r.record,'$.initialScore'),0)";
    const baseline = `COALESCE(json_extract(r.record,'$.settlementBase'),${initial})`;
    const divisor =
      "COALESCE(NULLIF(json_extract(r.record,'$.scoreDivisor'),0),1)";
    const feeNotPreviouslyCleared = db
      .prepare(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='record_clear_fee_carryover'",
      )
      .get()
      ? "AND NOT EXISTS (SELECT 1 FROM record_clear_fee_carryover carry WHERE carry.game_id=p.game_id AND carry.account_id=p.account_id)"
      : "";
    const recorded = `(p.points + CASE WHEN p.record_id=(
      SELECT first.record_id FROM point_records first
      LEFT JOIN round_records original ON original.id=first.record_id
      WHERE first.game_id=p.game_id AND first.account_id=p.account_id
        AND COALESCE(original.code,'')<>'练习桌'
        AND COALESCE(json_extract(original.record,'$.experience'),0)=0
        AND COALESCE(json_extract(original.record,'$.result.reason'),'')<>'dissolved'
      ORDER BY first.at,first.record_id LIMIT 1
    ) ${feeNotPreviouslyCleared} THEN ${initial}-${baseline} ELSE 0 END) / (1.0 * ${divisor})`;
    const grouped =
      `SELECT p.account_id AS accountId,(SELECT CAST(n.member_id AS TEXT) FROM account_numbers n WHERE n.account_id=p.account_id) AS memberId,COALESCE(a.username,p.account_id) AS username,COALESCE(a.name,MAX(p.name)) AS name,p.team_id AS teamId,COALESCE(t.name,MAX(p.team_name)) AS teamName,COUNT(*) AS rounds,COUNT(DISTINCT p.game_id) AS tables,0.0+ROUND(SUM(${recorded}),6) AS points` +
      filter.from +
      " GROUP BY p.account_id,p.team_id";
    const total = Number(
      db
        .prepare("SELECT COUNT(*) AS n FROM (" + grouped + ")")
        .get(...filter.args)!.n,
    );
    const totals = db
      .prepare(
        `SELECT COUNT(DISTINCT p.record_id) AS completedRounds,COUNT(DISTINCT p.game_id) AS tables,COUNT(*) AS playerRounds,COALESCE(0.0+ROUND(SUM(${recorded}),6),0) AS points` +
          filter.from,
      )
      .get(...filter.args)!;
    const rows = db
      .prepare(
        grouped +
          " ORDER BY teamName,username,accountId" +
          (all ? "" : " LIMIT ? OFFSET ?"),
      )
      .all(
        ...filter.args,
        ...(all ? [] : [pageSize, (page - 1) * pageSize]),
      ) as unknown as PointSummary[];
    return {
      rows,
      total,
      page,
      pageSize,
      completedRounds: Number(totals.completedRounds),
      tables: Number(totals.tables),
      playerRounds: Number(totals.playerRounds),
      points: Number(totals.points),
    };
  }
  function exportPoints(query: URLSearchParams) {
    const result = points(query, true);
    const cell = (v: string | number) => {
      let value = String(v);
      // Keep names/accounts as text in spreadsheet applications, even if they start with a formula.
      if (typeof v === "string" && /^[\s]*[=+@\-]/.test(value))
        value = "'" + value;
      return '"' + value.replaceAll('"', '""') + '"';
    };
    const date = (key: string) =>
      query.has(key)
        ? new Date(Number(query.get(key))).toLocaleString("zh-CN", {
            timeZone: "Asia/Shanghai",
            hour12: false,
          })
        : "不限";
    const rows: (string | number)[][] = [
      [
        "统计开始（整桌结束时间，北京时间，含）",
        date("from"),
        "统计结束（北京时间，不含）",
        date("to"),
      ],
      ["战队", "会员账号", "昵称", "会员ID", "桌数（8局/桌）", "积分"],
    ];
    for (const row of result.rows)
      rows.push([
        row.teamName,
        row.username,
        row.name,
        row.memberId ?? row.accountId,
        row.tables,
        row.points,
      ]);
    return (
      "\uFEFF" +
      rows.map((row) => row.map(cell).join(",")).join("\r\n") +
      "\r\n"
    );
  }
  function replay(id: string): RoundReplay {
    if (!/^[A-Za-z0-9_-]{1,120}$/.test(id))
      throw new AuthError("请输入正确的牌局 ID");
    // Lookup deliberately has no participant/admin restriction. Only completed
    // round_records qualify; live engine snapshots never leave this endpoint.
    const row = db
      .prepare(
        "SELECT record,code,private_names,player_ids FROM round_records WHERE id=?",
      )
      .get(id);
    if (!row)
      throw new AuthError("未找到已结束的牌局，请检查 ID 或等待本局结束", 404);
    const record = JSON.parse(String(row.record)) as RoundRecord;
    const stored = db
      .prepare("SELECT payload FROM round_replays WHERE id=?")
      .get(id);
    const data: RoundReplay = stored
      ? JSON.parse(
          gunzipSync(stored.payload as Uint8Array, {
            maxOutputLength: 16 * 1024 * 1024,
          }).toString(),
        )
      : {
          rules: record.rules,
          multiplier: record.multiplier,
          version: 1,
          id,
          code: String(row.code),
          round: record.round,
          startedAt: record.at,
          endedAt: record.at,
          names: record.names,
          summaryOnly: true,
          frames: [
            {
              at: record.at,
              type: "finish",
              turn: 0,
              remaining: 0,
              players: record.names.map((_, seat) => ({
                hand: record.hands?.[seat]?.hand ?? [],
                melds: record.hands?.[seat]?.melds ?? [],
                flowers: record.hands?.[seat]?.flowers ?? [],
                discards: [],
                score: record.scores[seat],
                externalScore: record.externalScores?.[seat] ?? 0,
              })),
              result: record.result,
            },
          ],
        };
    if (!data.endedAt || data.id !== id)
      throw new AuthError("该牌局回放暂不可用", 404);
    // Resolve current photos from the persisted seat owners, never from cached
    // replay URLs. Public replay links keep private-name tables anonymous.
    delete data.avatars;
    if (row.private_names) {
      data.names = data.names.map((_, seat) => `牌友${seat + 1}`);
    } else {
      const ids =
        record.playerIds ?? (JSON.parse(String(row.player_ids)) as string[]);
      const avatars = data.names.map((_, seat) =>
        ids[seat] ? avatarFor(ids[seat]) : undefined,
      );
      if (avatars.some(Boolean)) data.avatars = avatars;
    }
    return data;
  }
  return { capture, list, details, markRead, points, exportPoints, replay };
}
