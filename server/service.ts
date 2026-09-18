import { readVoice } from "./room-voice";
import { createClub } from "./club";
import { createServer } from "node:http";
import { randomInt, randomUUID } from "node:crypto";
import { newGameRules } from "../shared/nanjing-rules";
import {
  createReadStream,
  existsSync,
  mkdirSync,
  statSync,
  readFileSync,
} from "node:fs";
import { dirname, extname, resolve, sep } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { WebSocketServer, WebSocket } from "ws";
import {
  act,
  botAction,
  trusteeAction,
  createGame,
  dissolveGame,
  newPlayer,
  seats,
  startRound,
  viewFor as baseViewFor,
} from "../shared/engine";
import {
  normalizeTableSettings,
  playerPreparation,
  resultWait,
  tableSummary,
} from "../shared/table-settings";
import type {
  Action,
  ClientMessage,
  Game,
  Seat,
  ServerMessage,
} from "../shared/types";

import { createAccounts, AuthError, type AuthSession } from "./accounts";
import { createRecords } from "./records";
import { mayCreateTables } from "../shared/permissions";
const APP_VERSION = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
).version as string;
import {
  overtimeExpired,
  refreshReadyDeadline,
  unreadyExpired,
  chargeOvertime,
  setTrustee,
} from "../shared/timing";
class StorageError extends Error {
  constructor(cause: unknown) {
    super("牌局暂时无法保存，本次操作未生效，请稍后重试", { cause });
  }
}
export function makeServer(
  options: {
    database?: string;
    port?: number;
    host?: string;
    tickMs?: number;
  } = {},
) {
  const file = options.database ?? "data/mahjong.sqlite";
  if (file !== ":memory:") mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(
    "PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, id TEXT UNIQUE, name TEXT, last_seen INTEGER); CREATE TABLE IF NOT EXISTS rooms (id TEXT PRIMARY KEY, state TEXT NOT NULL, updated_at INTEGER); CREATE TABLE IF NOT EXISTS feedback (id TEXT PRIMARY KEY, user_id TEXT, message TEXT, at INTEGER);",
  );
  db.exec(
    "CREATE TABLE IF NOT EXISTS table_creations (session_id TEXT, creation_id TEXT, codes TEXT NOT NULL, PRIMARY KEY(session_id, creation_id)); CREATE TABLE IF NOT EXISTS table_archives (id TEXT PRIMARY KEY, state TEXT NOT NULL, at INTEGER NOT NULL);",
  );
  const games = new Map<string, Game>(),
    clients = new Map<string, WebSocket>(),
    lastAuto = new Map<string, number>();
  const accounts = createAccounts(
    db,
    (id) => {
      clients.get(id)?.close(4003, "登录状态已更新");
    },
    (account) => {
      const ws = clients.get(account.id);
      if (ws) send(ws, { type: "accountUpdated", account });
      for (const current of games.values()) {
        if (!current.players.some((p) => p?.id === account.id)) continue;
        const changed = structuredClone(current);
        changed.revision++;
        publish(changed);
      }
      if (!account.canCreateTables) {
        for (const current of games.values()) {
          if (
            current.table?.creatorId !== account.id ||
            !current.table.settings.autoRenew
          )
            continue;
          const changed = structuredClone(current);
          changed.table!.settings.autoRenew = false;
          changed.revision++;
          publish(changed);
        }
      }
    },
  );
  const records = createRecords(db);
  const club = createClub(db, accounts, records);
  const lobbySubscribers = new Set<string>(),
    lobbySent = new Map<string, string>();
  const save = db.prepare(
    "INSERT INTO rooms VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET state=excluded.state, updated_at=excluded.updated_at",
  );
  function freshTableCode() {
    let code: string;
    do {
      code = String(randomInt(100000, 1000000));
    } while (
      games.has(code) ||
      db.prepare("SELECT 1 FROM match_records WHERE code=? LIMIT 1").get(code)
    );
    return code;
  }
  function reserveTableNumber(used: Set<number>) {
    let number = 1;
    while (used.has(number)) number++;
    used.add(number);
    return number;
  }
  for (const row of db
    .prepare(
      "SELECT state FROM rooms WHERE updated_at > ? OR CASE WHEN json_valid(state) THEN json_type(state, '$.table') = 'object' ELSE 0 END",
    )
    .all(Date.now() - 86400000)) {
    try {
      const g = JSON.parse(String(row.state)) as Game;
      if (g.version !== 1) continue;
      if (g.table?.closed || (!g.table && !g.players.some((p) => p && !p.bot)))
        continue;
      if (g.table) {
        const saved = g.table.settings;
        g.table.settings = normalizeTableSettings(saved);
        // Keep saved limits and consumed time while upgrading all tables to a
        // personal cumulative overtime balance (including legacy per-turn tables).
        g.table.settings.overtimeSeconds = saved.overtimeSeconds ?? 0;
        g.table.settings.scoreMultiplier = saved.scoreMultiplier ?? 0.5;
        if (!accounts.canOpenTables(g.table.creatorId))
          g.table.settings.autoRenew = false;
      }
      // Migrate existing 0.1 rooms once; later joins cannot take ownership.
      if (!g.table && !g.players.some((p) => p && !p.bot && p.id === g.ownerId))
        g.ownerId = g.players.find((p) => p && !p.bot)!.id;
      g.players.forEach((p) => {
        if (p) {
          p.online = p.bot;
          if (!p.bot) p.disconnectedAt = Date.now();
        }
      });
      if (g.deadline && !g.table?.settings.overtimeSeconds)
        g.deadline = Date.now() + g.rules.turnSeconds * 1000;
      if (g.dissolve) g.dissolve.expires = Date.now() + 60000;
      games.set(g.code, g);
    } catch {
      /* Keep corrupt records for diagnosis, never start a partial game. */
    }
  }
  // Retire reused codes on empty tables renewed by older server versions.
  for (const [oldCode, g] of games) {
    if (
      !g.table || g.phase !== "waiting" || g.round !== 0 ||
      g.history.length || g.players.some(Boolean) ||
      !db.prepare("SELECT 1 FROM match_records WHERE code=? LIMIT 1").get(oldCode)
    ) continue;
    const renewed = structuredClone(g);
    renewed.code = freshTableCode();
    renewed.table!.createdAt = Date.now();
    renewed.revision++;
    save.run(renewed.id, JSON.stringify(renewed), Date.now());
    games.delete(oldCode);
    games.set(renewed.code, renewed);
  }
  // Older batches each started at 1. Reserve every existing distinct number
  // before repairing duplicates, so a repair never displaces another table.
  const numberedTables = [...games.values()]
    .filter((g) => g.table)
    .sort((a, b) => a.table!.createdAt - b.table!.createdAt || a.id.localeCompare(b.id));
  const usedTableNumbers = new Set(numberedTables.map((g) => g.table!.number)
    .filter((number) => Number.isSafeInteger(number) && number > 0));
  const seenTableNumbers = new Set<number>();
  const repairedTables: Game[] = [];
  for (const g of numberedTables) {
    const number = g.table!.number;
    if (Number.isSafeInteger(number) && number > 0 && !seenTableNumbers.has(number)) {
      seenTableNumbers.add(number);
      continue;
    }
    const repaired = structuredClone(g);
    repaired.table!.number = reserveTableNumber(usedTableNumbers);
    repaired.revision++;
    repairedTables.push(repaired);
  }
  if (repairedTables.length) {
    try {
      db.exec("BEGIN");
      for (const g of repairedTables) save.run(g.id, JSON.stringify(g), Date.now());
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw new StorageError(error);
    }
    for (const g of repairedTables) games.set(g.code, g);
  }
  const send = (ws: WebSocket, message: ServerMessage) => {
    if (ws.readyState === WebSocket.OPEN)
      ws.send(JSON.stringify({ ...message, serverNow: Date.now() }));
  };
  function viewFor(g: Game, seat: Seat) {
    const view = baseViewFor(g, seat);
    view.players = view.players.map((p) =>
      p ? { ...p, avatar: p.bot ? undefined : accounts.getAvatar(p.id) } : null,
    );
    if (
      ["waiting", "ended"].includes(g.phase) &&
      g.players.some((p) => p && !p.bot && !accounts.getAccount(p.id)?.canPlay)
    )
      view.admissionMessage =
        "有会员暂未获得参赛权限，请管理员检查战队或参赛状态后继续";
    if (g.table?.settings.privacy === "all") {
      view.players = view.players.map((p, i) =>
        p && i !== seat ? { ...p, name: `牌友${i + 1}`, avatar: undefined } : p,
      );
      view.history = view.history.map((r) => ({
        ...r,
        names: r.names.map((name, i) => (i === seat ? name : `牌友${i + 1}`)),
      }));
      view.events = [];
    }
    return view;
  }
  function sendTables(id: string, force = false) {
    const ws = clients.get(id);
    if (!ws || !lobbySubscribers.has(id)) return;
    const admin = db
      .prepare(
        "SELECT 1 FROM accounts WHERE id=? AND role='admin' AND must_change=0",
      )
      .get(id);
    const tables = [...games.values()]
      .filter(
        (g) =>
          g.table &&
          !g.table.closed &&
          (admin ||
            g.table.settings.visibility === "public" ||
            g.table.creatorId === id),
      )
      .sort(
        (a, b) =>
          Number(b.table!.creatorId === id) -
            Number(a.table!.creatorId === id) ||
          a.table!.number - b.table!.number ||
          a.table!.createdAt - b.table!.createdAt,
      )
      .map((g) => tableSummary(g, id));
    const signature = JSON.stringify(tables);
    if (force || lobbySent.get(id) !== signature) {
      send(ws, { type: "tables", tables });
      lobbySent.set(id, signature);
    }
  }
  function broadcastTables() {
    for (const id of lobbySubscribers) sendTables(id);
  }
  function sendLeft(g: Game, message: string) {
    for (const p of g.players) {
      const ws = p && clients.get(p.id);
      if (ws) send(ws, { type: "left", lobby: true, message });
    }
  }
  function persist(g: Game) {
    const hasHumans = g.players.some((p) => p && !p.bot);
    const keep =
      hasHumans ||
      (g.table &&
        !g.table.closed &&
        (g.phase !== "finished" || g.table.settings.autoRenew));
    try {
      db.exec("BEGIN");
      records.capture(g);
      if (keep) save.run(g.id, JSON.stringify(g), Date.now());
      else db.prepare("DELETE FROM rooms WHERE id = ?").run(g.id);
      if (g.table && g.phase === "finished" && g.players.every(Boolean))
        db.prepare("INSERT OR IGNORE INTO table_archives VALUES (?,?,?)").run(
          g.id,
          JSON.stringify(g),
          Date.now(),
        );
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw new StorageError(error);
    }
    // The map and every client only advance after the durable write succeeds.
    if (keep) games.set(g.code, g);
    else {
      games.delete(g.code);
      lastAuto.delete(g.id);
    }
  }
  function broadcast(g: Game) {
    for (const seat of seats) {
      const p = g.players[seat],
        ws = p && clients.get(p.id);
      if (ws) send(ws, { type: "state", state: viewFor(g, seat) });
    }
  }
  function publish(g: Game) {
    refreshReadyDeadline(g, Date.now());
    if (
      g.table &&
      ["ended", "finished"].includes(g.phase) &&
      g.table.settledRound !== g.round
    ) {
      g.table.settledRound = g.round;
      for (const p of g.players)
        if (p && !p.bot) {
          p.joinedAt = Date.now() + g.table.settings.resultSeconds * 1000;
          p.trusteeRounds = p.trustee ? (p.trusteeRounds ?? 0) + 1 : 0;
          if (g.table.settings.trusteeMode === "round" && p.trustee) {
            p.trustee = false;
            p.awaitingReady = true;
            p.ready = false;
          }
          if (
            g.table.settings.trusteeMode === "afterRounds" &&
            p.trusteeRounds >= g.table.settings.trusteeRounds
          ) {
            g.phase = "finished";
            g.table.endReason = `连续托管 ${g.table.settings.trusteeRounds} 局，本桌结束`;
          }
        }
    }
    if (g.table && g.phase === "finished" && g.table.finishedAt === undefined)
      g.table.finishedAt = Date.now();
    persist(g);
    broadcast(g);
    broadcastTables();
  }
  function startIfReady(g: Game): Game {
    if (
      !["waiting", "ended"].includes(g.phase) ||
      (g.phase === "ended" &&
        resultWait(g, Date.now()) > 0 &&
        !(
          g.table?.settings.continuousRounds &&
          g.players.every((p) => p && (p.bot || p.ready))
        ))
    )
      return g;
    if (
      g.players.some((p) => p && !p.bot && !accounts.getAccount(p.id)?.canPlay)
    )
      return g;
    const settings = g.table?.settings;
    if (g.phase === "ended" && settings?.continuousRounds) {
      if (
        !g.players.every(
          (p) => p && (p.bot || p.online || settings.offlineStart),
        )
      )
        return g;
      for (const p of g.players) {
        p!.ready = true;
        p!.awaitingReady = false;
      }
    }
    if (!g.players.every((p) => playerPreparation(p, settings).canStart))
      return g;
    for (const p of g.players) {
      p!.ready = true;
      if (!p!.online) p!.trustee = true;
    }
    return startRound(g, Date.now(), { index: (limit) => randomInt(limit) });
  }
  const findRoom = (id: string) => {
    const g = [...games.values()].find((g) =>
      g.players.some((p) => p?.id === id),
    );
    return g ? structuredClone(g) : undefined;
  };
  const seatFor = (g: Game, id: string) =>
    g.players.findIndex((p) => p?.id === id) as Seat;
  const voiceUploads = new Map<string, { at: number; busy: boolean }>();
  const api = createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Frame-Options", "DENY");
    const origin = req.headers.origin;
    const allowedOrigins = new Set([
      "capacitor://localhost",
      "http://localhost",
      "https://localhost",
      "http://localhost:5173",
      "http://127.0.0.1:5173",
      "http://127.0.0.1:5178",
    ]);
    if (origin && allowedOrigins.has(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Authorization, Content-Type",
      );
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    }
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }
    let url: URL;
    try {
      url = new URL(req.url ?? "/", "http://localhost");
    } catch {
      res.writeHead(400);
      res.end('{"error":"请求地址不正确"}');
      return;
    }
    if (req.method === "POST" && url.pathname.startsWith("/api/voice/")) {
      res.setHeader("Cache-Control", "no-store");
      let upload: { at: number; busy: boolean } | undefined;
      try {
        const session = accounts.requireSession(req);
        accounts.requirePlay(session.id);
        const gameId = decodeURIComponent(
          url.pathname.slice("/api/voice/".length),
        );
        const room = findRoom(session.id);
        if (
          !room ||
          room.id !== gameId ||
          clients.get(session.id)?.readyState !== WebSocket.OPEN
        )
          throw new AuthError("请先进入联机牌桌", 403);
        const previous = voiceUploads.get(session.id);
        if (previous && (previous.busy || Date.now() - previous.at < 2000))
          throw new AuthError("说得太快了，请稍候再发", 429);
        if (voiceUploads.size > 1000)
          for (const [id, v] of voiceUploads)
            if (!v.busy && Date.now() - v.at > 60000) voiceUploads.delete(id);
        upload = { at: Date.now(), busy: true };
        voiceUploads.set(session.id, upload);
        const { bytes, duration } = await readVoice(req);
        // Recheck membership and session after upload; never deliver to a new room.
        accounts.requireSession(req);
        accounts.requirePlay(session.id);
        const current = findRoom(session.id);
        if (
          !current ||
          current.id !== gameId ||
          clients.get(session.id)?.readyState !== WebSocket.OPEN
        )
          throw new AuthError("已经离开这张牌桌，语音未发送", 409);
        const seat = seatFor(current, session.id);
        const message = {
          id: randomUUID(),
          game: gameId,
          sender: session.id,
          name: current.players[seat]!.name,
          seat,
          at: Date.now(),
          duration,
          audio: bytes.toString("base64"),
        };
        for (const player of current.players) {
          const ws = player && !player.bot && clients.get(player.id);
          if (
            ws &&
            ws.readyState === WebSocket.OPEN &&
            ws.bufferedAmount < 1000000
          )
            send(ws, { type: "voice", message });
        }
        res.end(JSON.stringify({ id: message.id }));
      } catch (error) {
        res.statusCode = error instanceof AuthError ? error.status : 400;
        res.end(
          JSON.stringify({
            error:
              error instanceof AuthError
                ? error.message
                : "语音发送失败，请重试",
          }),
        );
        req.resume();
      } finally {
        if (upload) {
          upload.busy = false;
          upload.at = Date.now();
        }
      }
      return;
    }
    if (await accounts.handle(req, res, url.pathname)) return;
    if (await club.handle(req, res, url)) return;
    if (
      req.method === "POST" &&
      url.pathname.startsWith("/api/admin/match-reads/")
    ) {
      res.setHeader("Cache-Control", "no-store");
      try {
        const session = accounts.requireSession(req, true);
        const game = decodeURIComponent(
          url.pathname.slice("/api/admin/match-reads/".length),
        );
        res.end(JSON.stringify(records.markRead(game, session.id)));
      } catch (error) {
        res.statusCode = error instanceof AuthError ? error.status : 500;
        res.end(
          JSON.stringify({
            error:
              error instanceof AuthError
                ? error.message
                : "已读状态保存失败，请重试",
          }),
        );
      }
      req.resume();
      return;
    }
    if (req.method === "GET" && url.pathname.startsWith("/api/matches/")) {
      res.setHeader("Cache-Control", "no-store");
      try {
        const session = accounts.requireSession(req);
        res.end(
          JSON.stringify(
            records.details(
              decodeURIComponent(url.pathname.slice("/api/matches/".length)),
              session.id,
              session.account.role === "admin",
            ),
          ),
        );
      } catch (error) {
        res.statusCode = error instanceof AuthError ? error.status : 500;
        res.end(
          JSON.stringify({
            error:
              error instanceof AuthError
                ? error.message
                : "牌桌明细暂时无法读取，请稍后重试",
          }),
        );
      }
      return;
    }
    if (req.method === "GET" && url.pathname.startsWith("/api/replays/")) {
      res.setHeader("Cache-Control", "no-store");
      try {
        accounts.requireSession(req);
        res.end(
          JSON.stringify(
            records.replay(
              decodeURIComponent(url.pathname.slice("/api/replays/".length)),
            ),
          ),
        );
      } catch (error) {
        res.statusCode = error instanceof AuthError ? error.status : 500;
        res.end(
          JSON.stringify({
            error:
              error instanceof AuthError
                ? error.message
                : "回放暂时无法读取，请稍后重试",
          }),
        );
      }
      return;
    }
    if (
      ["/api/records", "/api/admin/records"].includes(url.pathname) &&
      req.method === "GET"
    ) {
      res.setHeader("Cache-Control", "no-store");
      try {
        const admin = url.pathname === "/api/admin/records";
        const session = accounts.requireSession(req, admin);
        res.end(
          JSON.stringify(
            records.list(
              url.searchParams,
              session.id,
              admin,
              session.account.role === "admin",
            ),
          ),
        );
      } catch (error) {
        res.statusCode = error instanceof AuthError ? error.status : 500;
        res.end(
          JSON.stringify({
            error:
              error instanceof AuthError
                ? error.message
                : "战绩暂时无法读取，请稍后重试",
          }),
        );
      }
      return;
    }
    if (req.method === "GET" && req.url === "/api/health") {
      res.end(
        JSON.stringify({
          ok: true,
          service: "jinling-mahjong",
          version: APP_VERSION,
        }),
      );
      return;
    }
    if (req.method === "POST" && req.url === "/api/feedback") {
      let session: AuthSession;
      try {
        session = accounts.requireSession(req);
      } catch (error) {
        res.writeHead(error instanceof AuthError ? error.status : 401);
        res.end(JSON.stringify({ error: "请登录账号后发送反馈" }));
        return;
      }
      let body = "";
      try {
        for await (const data of req) {
          body += data;
          if (body.length > 4096) throw Error("内容过长");
        }
        const { message } = JSON.parse(body);
        if (
          typeof message !== "string" ||
          message.trim().length < 3 ||
          message.length > 1000
        )
          throw Error("请填写 3–1000 字反馈");
        db.prepare("INSERT INTO feedback VALUES (?, ?, ?, ?)").run(
          randomUUID(),
          String(session.id),
          message.trim(),
          Date.now(),
        );
        res.end('{"ok":true}');
      } catch {
        res.writeHead(400);
        res.end('{"error":"反馈格式不正确"}');
      }
      return;
    }
    if (req.method === "GET" && !req.url?.startsWith("/api/")) {
      const root = resolve("dist");
      let filePath: string;
      try {
        filePath = resolve(
          root,
          "." +
            decodeURIComponent(
              new URL(req.url ?? "/", "http://localhost").pathname,
            ),
        );
      } catch {
        res.writeHead(400);
        res.end("{}");
        return;
      }
      if (filePath !== root && !filePath.startsWith(root + sep)) {
        res.writeHead(403);
        res.end("{}");
        return;
      }
      const publicExtensions = new Set([
        ".html",
        ".js",
        ".css",
        ".svg",
        ".png",
        ".jpg",
        ".jpeg",
        ".webp",
        ".ico",
        ".json",
        ".wav",
        ".mp3",
        ".m4a",
        ".woff",
        ".woff2",
      ]);
      const extension = extname(filePath).toLowerCase();
      if (
        filePath
          .slice(root.length)
          .split(sep)
          .some((part) => part.startsWith(".")) ||
        (extension && !publicExtensions.has(extension))
      ) {
        res.writeHead(404);
        res.end('{"error":"Not found"}');
        return;
      }
      if (!existsSync(filePath) || !statSync(filePath).isFile())
        filePath = resolve(root, "index.html");
      if (existsSync(filePath)) {
        const mime: Record<string, string> = {
          ".html": "text/html; charset=utf-8",
          ".js": "text/javascript; charset=utf-8",
          ".css": "text/css; charset=utf-8",
          ".svg": "image/svg+xml",
          ".png": "image/png",
          ".json": "application/json",
          ".wav": "audio/wav",
          ".mp3": "audio/mpeg",
          ".m4a": "audio/mp4",
          ".webp": "image/webp",
          ".jpg": "image/jpeg",
          ".jpeg": "image/jpeg",
          ".ico": "image/x-icon",
          ".woff": "font/woff",
          ".woff2": "font/woff2",
        };
        res.setHeader(
          "Content-Type",
          mime[extname(filePath)] ?? "application/octet-stream",
        );
        res.setHeader(
          "Cache-Control",
          filePath.includes("/assets/")
            ? "public, max-age=31536000, immutable"
            : "no-cache",
        );
        createReadStream(filePath).pipe(res);
        return;
      }
    }
    res.writeHead(404);
    res.end('{"error":"Not found"}');
  });
  const wss = new WebSocketServer({
    server: api,
    path: "/ws",
    maxPayload: 8192,
    perMessageDeflate: false,
  });
  wss.on("connection", (ws) => {
    let session: AuthSession | undefined,
      connectionToken = "",
      rateAt = Date.now(),
      requests = 0,
      alive = true;
    const helloTimeout = setTimeout(() => {
      if (!session) ws.close(1008, "Login required");
    }, 10000);
    const heartbeat = setInterval(() => {
      if (!alive) {
        ws.terminate();
        return;
      }
      alive = false;
      ws.ping();
    }, 30000);
    ws.on("pong", () => {
      alive = true;
    });
    ws.on("error", () => {
      /* close handler restores authoritative connection state */
    });
    ws.on("message", (raw) => {
      let requestId: string | undefined;
      try {
        if (Date.now() - rateAt > 1000) {
          requests = 0;
          rateAt = Date.now();
        }
        if (++requests > 30) throw Error("操作太快，请稍后再试");
        const msg = JSON.parse(raw.toString()) as ClientMessage;
        if (!msg || typeof msg !== "object" || typeof msg.type !== "string")
          throw Error("消息格式不正确");
        if (
          typeof msg.requestId === "string" &&
          /^[a-zA-Z0-9-]{1,64}$/.test(msg.requestId)
        )
          requestId = msg.requestId;
        if (msg.type === "hello") {
          if (session) throw Error("已经登录");
          const token = typeof msg.token === "string" ? msg.token : "";
          const nextSession = accounts.getSession(token);
          if (!nextSession || nextSession.account.mustChangePassword) {
            send(ws, {
              type: "error",
              code: "AUTH_REQUIRED",
              message: nextSession
                ? "请先设置你的新密码"
                : "请登录账号后进入牌桌",
            });
            ws.close(4003, "Authentication required");
            return;
          }
          connectionToken = token;
          db.prepare("UPDATE sessions SET last_seen=? WHERE id=?").run(
            Date.now(),
            nextSession.id,
          );
          let room = findRoom(nextSession.id);
          if (room) {
            const p = room.players[seatFor(room, nextSession.id)]!;
            p.online = true;
            p.disconnectedAt = undefined;
            p.name = nextSession.name;
            room.revision++;
            room = startIfReady(room);
            persist(room);
          }
          session = nextSession;
          const previous = clients.get(session.id);
          clients.set(session.id, ws);
          if (previous && previous !== ws)
            previous.close(4001, "已在另一处打开");
          clearTimeout(helloTimeout);
          send(ws, {
            type: "session",
            token,
            id: session.id,
            name: session.name,
            roomCode: room?.code,
            commandAck: true,
            tableLobby: true,
            timeSync: true,
            serverVersion: APP_VERSION,
            account: session.account,
          });
          const personal = records.list(
            new URLSearchParams({ scope: "rounds" }),
            session.id,
          );
          if (personal.records.length)
            send(ws, { type: "records", records: personal.records });
          if (room) broadcast(room);
          broadcastTables();
          return;
        }
        const current = accounts.getSession(connectionToken);
        if (
          !session ||
          !current ||
          current.account.mustChangePassword ||
          clients.get(session.id) !== ws
        ) {
          send(ws, {
            type: "error",
            code: "AUTH_REQUIRED",
            message: "登录已失效，请重新登录",
          });
          ws.close(4003, "Authentication required");
          return;
        }
        session = current;
        if (
          ["create", "createTables", "closeTable"].includes(msg.type) &&
          !mayCreateTables(session.account)
        )
          throw Error("需要管理员授予开桌权限，请选择已有牌桌入座");
        if (msg.type === "ping") {
          // A foreground refresh is read-only and returns only this account's
          // private view. It must not reconnect, replay an action or advance play.
          const room = msg.sync === true ? findRoom(session.id) : undefined;
          if (room)
            send(ws, {
              type: "state",
              state: viewFor(room, seatFor(room, session.id)),
            });
          send(ws, {
            type: "pong",
            ...(Number.isFinite(msg.sentAt) ? { sentAt: msg.sentAt } : {}),
            ...(msg.sync === true
              ? { synced: true, roomCode: room?.code }
              : {}),
          });
          return;
        }
        let g = findRoom(session.id);
        if (msg.type === "tables") {
          lobbySubscribers.add(session.id);
          sendTables(session.id, true);
          return;
        }
        if (msg.type === "createTables") {
          if (g) throw Error("请先离开当前牌桌");
          if (
            typeof msg.creationId !== "string" ||
            !/^[a-zA-Z0-9-]{1,64}$/.test(msg.creationId)
          )
            throw Error("创建标识无效，请重新开桌");
          const existing = db
            .prepare(
              "SELECT codes FROM table_creations WHERE session_id=? AND creation_id=?",
            )
            .get(session.id, msg.creationId);
          if (existing) {
            lobbySubscribers.add(session.id);
            send(ws, {
              type: "tablesCreated",
              codes: JSON.parse(String(existing.codes)),
            });
            sendTables(session.id, true);
            if (requestId) send(ws, { type: "ack", requestId });
            return;
          }
          if (!Number.isInteger(msg.count) || msg.count < 1 || msg.count > 5)
            throw Error("一次可开 1–5 桌");
          if (
            [...games.values()].filter(
              (r) => r.table?.creatorId === session!.id,
            ).length +
              msg.count >
            5
          )
            throw Error("你最多同时管理 5 桌，请先收起空桌");
          if (games.size + msg.count > 1000)
            throw Error("大厅暂时已满，请稍后开桌");
          if (
            !msg.settings ||
            typeof msg.settings !== "object" ||
            Array.isArray(msg.settings)
          )
            throw Error("请检查牌桌设置");
          const settings = normalizeTableSettings(msg.settings),
            groupId = randomUUID(),
            now = Date.now();
          const created: Game[] = [];
          const usedNumbers = new Set([...games.values()]
            .filter((g) => g.table)
            .map((g) => g.table!.number));
          for (let i = 0; i < msg.count; i++) {
            let code: string;
            do {
              code = String(randomInt(100000, 1000000));
            } while (games.has(code) || created.some((r) => r.code === code));
            const room = createGame(code, randomUUID(), {
              ...newGameRules(msg.rules),
              ...(settings.trusteeMode === "disabled"
                ? { turnSeconds: 0 }
                : {}),
            });
            room.settlementBase = 100;
            room.scoreDivisor = 1 / (settings.scoreMultiplier ?? 0.5);
            room.ownerId = session.id;
            room.table = {
              creatorId: session.id,
              groupId,
              number: reserveTableNumber(usedNumbers),
              createdAt: now,
              settings,
            };
            created.push(room);
          }
          try {
            db.exec("BEGIN");
            for (const room of created)
              save.run(room.id, JSON.stringify(room), now);
            db.prepare("INSERT INTO table_creations VALUES (?,?,?)").run(
              session.id,
              msg.creationId,
              JSON.stringify(created.map((r) => r.code)),
            );
            db.exec("COMMIT");
          } catch (error) {
            db.exec("ROLLBACK");
            throw new StorageError(error);
          }
          for (const room of created) games.set(room.code, room);
          lobbySubscribers.add(session.id);
          send(ws, {
            type: "tablesCreated",
            codes: created.map((r) => r.code),
          });
          broadcastTables();
          if (requestId) send(ws, { type: "ack", requestId });
          return;
        }
        if (msg.type === "closeTable") {
          const source = games.get(msg.code);
          if (!source?.table) throw Error("这张牌桌不存在");
          if (
            session.account.role !== "admin" &&
            source.table.creatorId !== session.id
          )
            throw Error("只能收起自己开的桌子");
          if (!["waiting", "finished"].includes(source.phase))
            throw Error("牌局进行中，请通过牌桌内协商解散");
          const closing = structuredClone(source);
          closing.table!.closed = true;
          closing.players = [null, null, null, null];
          closing.revision++;
          persist(closing);
          sendLeft(source, "开桌人已收起这张桌子");
          broadcastTables();
          if (requestId) send(ws, { type: "ack", requestId });
          return;
        }
        if (msg.type === "create" || msg.type === "join") {
          accounts.requirePlay(session.id);
          if (g) throw Error("请先离开当前牌桌");
          if (msg.type === "create") {
            const hosted = [...games.values()].filter(
              (r) => r.phase !== "finished",
            ).length;
            if (hosted >= 1000) throw Error("牌桌暂时已满");
            let code: string;
            do {
              code = String(randomInt(100000, 1000000));
            } while (games.has(code));
            g = createGame(
              code,
              randomUUID(),
              newGameRules(
                msg.rules && typeof msg.rules === "object" ? msg.rules : {},
              ),
            );
            g.settlementBase = 100;
            g.players[0] = newPlayer(
              session.id,
              session.name,
              false,
              g.initialScore ?? 0,
            );
            g.ownerId = session.id;
          } else {
            if (typeof msg.code !== "string" || !/^\d{6}$/.test(msg.code))
              throw Error("请输入 6 位房间号");
            g = games.get(msg.code);
            if (!g || g.phase !== "waiting")
              throw Error("房间不存在，或已经开局");
            g = structuredClone(g);
            if (
              msg.seat !== undefined &&
              (!Number.isInteger(msg.seat) || msg.seat < 0 || msg.seat > 3)
            )
              throw Error("座位无效");
            const empty = msg.seat ?? g.players.findIndex((p) => !p);
            if (empty < 0) throw Error("这桌已经坐满了");
            if (g.players[empty])
              throw Error("这个座位刚有人入座，请选一个空位");
            g.players[empty] = newPlayer(
              session.id,
              session.name,
              false,
              g.initialScore ?? 0,
            );
            g.players[empty]!.joinedAt = Date.now();
            if (g.table?.settings.readyMode === "auto")
              g.players[empty]!.ready = true;
          }
          g.revision++;
          g = startIfReady(g);
          publish(g);
          if (requestId) send(ws, { type: "ack", requestId });
          return;
        }
        if (!g) throw Error("请先创建或加入牌桌");
        const seat = seatFor(g, session.id),
          p = g.players[seat]!;
        switch (msg.type) {
          case "ready":
            accounts.requirePlay(session.id);
            if (!["waiting", "ended"].includes(g.phase))
              throw Error("当前不能准备");
            p.ready = true;
            p.awaitingReady = false;
            g.revision++;
            g = startIfReady(g);
            break;
          case "addBot": {
            if (g.table) throw Error("大厅牌桌需要四位真人入座");
            if (g.phase !== "waiting" || g.ownerId !== session.id)
              throw Error("只有房主可以在开局前添加陪练");
            const empty = g.players.findIndex((p) => !p);
            if (empty < 0) throw Error("牌桌已满");
            g.players[empty] = newPlayer(
              randomUUID(),
              ["莫愁", "秦淮", "钟山", "玄武"][empty],
              true,
              g.initialScore ?? 0,
            );
            g.revision++;
            g = startIfReady(g);
            break;
          }
          case "action":
            if (
              !msg.action ||
              typeof msg.action !== "object" ||
              typeof msg.action.type !== "string"
            )
              throw Error("操作格式不正确");
            if (
              !Number.isInteger(msg.revision) ||
              (msg.revision !== g.revision &&
                !(
                  g.phase === "claiming" &&
                  g.pending &&
                  msg.revision >= (g.pending.openedAtRevision ?? g.revision) &&
                  msg.revision < g.revision
                ))
            ) {
              send(ws, { type: "state", state: viewFor(g, seat) });
              throw Error("牌局已更新，请再操作一次");
            }
            if (
              overtimeExpired(g, seat, Date.now()) &&
              g.table?.settings.overtimeSeconds
            )
              throw Error("本次操作已超时，正在进入托管");
            g = act(g, seat, msg.action as Action);
            break;
          case "trustee":
            if (typeof msg.enabled !== "boolean") throw Error("设置格式不正确");
            setTrustee(g, seat, msg.enabled, Date.now());
            lastAuto.set(g.id, Date.now());
            g.revision++;
            break;
          case "leave":
            if (!["waiting", "finished"].includes(g.phase))
              throw Error("牌局进行中，请先申请解散");
            g.players[seat] = null;
            if (!g.table && g.ownerId === session.id)
              g.ownerId = g.players.find((p) => p && !p.bot)?.id ?? null;
            g.revision++;
            break;
          case "dissolve": {
            if (g.table && !g.table.settings.allowDissolve)
              throw Error("本桌未开启协商解散");
            if (typeof msg.agree !== "boolean") throw Error("投票格式不正确");
            if (!["playing", "claiming", "ended"].includes(g.phase))
              throw Error("当前无需解散");
            if (!msg.agree) g.dissolve = undefined;
            else {
              if (!g.dissolve)
                g.dissolve = {
                  proposer: seat,
                  yes: g.players.flatMap((p, i) =>
                    p?.bot ||
                    (p &&
                      !p.online &&
                      (p.disconnectedAt ?? Date.now()) < Date.now() - 60000)
                      ? [i as Seat]
                      : [],
                  ),
                  expires: Date.now() + 60000,
                };
              if (!g.dissolve.yes.includes(seat)) g.dissolve.yes.push(seat);
              if (g.dissolve.yes.length === 4) g = dissolveGame(g);
            }
            g.revision++;
            break;
          }
          default:
            throw Error("未知操作");
        }
        publish(g);
        if (msg.type === "leave")
          send(ws, { type: "left", ...(g.table ? { lobby: true } : {}) });
        if (requestId) send(ws, { type: "ack", requestId });
      } catch (error) {
        send(ws, {
          type: "error",
          message: error instanceof Error ? error.message : "操作失败，请重试",
          requestId,
        });
      }
    });
    ws.on("close", () => {
      clearTimeout(helloTimeout);
      clearInterval(heartbeat);
      if (session && clients.get(session.id) === ws) {
        clients.delete(session.id);
        lobbySubscribers.delete(session.id);
        lobbySent.delete(session.id);
        const g = findRoom(session.id);
        if (g) {
          g.players[seatFor(g, session.id)]!.online = false;
          g.players[seatFor(g, session.id)]!.disconnectedAt = Date.now();
          g.revision++;
          try {
            publish(g);
          } catch (error) {
            // The next tick retries presence; a storage outage must not kill the server.
            console.error("Room disconnect save failed", g.id, error);
          }
        }
      }
    });
  });
  function automaticAction(g: Game, seat: Seat): Action | null {
    const p = g.players[seat]!;
    return p.bot ? botAction(g, seat) : trusteeAction(g, seat);
  }
  const tick = setInterval(() => {
    for (const source of games.values()) {
      let g = structuredClone(source);
      const now = Date.now();
      try {
        let presenceChanged = false;
        for (const p of g.players) {
          if (!p || p.bot) continue;
          const online = clients.get(p.id)?.readyState === WebSocket.OPEN;
          if (p.online !== online) {
            p.online = online;
            p.disconnectedAt = online ? undefined : now;
            presenceChanged = true;
          }
        }
        if (presenceChanged) {
          g.revision++;
          publish(g);
          g = structuredClone(g);
        }
        if (refreshReadyDeadline(g, now)) {
          g.revision++;
          publish(g);
          g = structuredClone(g);
        }
        if (g.table && g.phase === "waiting") {
          const settings = g.table.settings;
          const kicked: string[] = [];
          for (const seat of seats) {
            const p = g.players[seat];
            if (!p || p.bot) continue;
            if (
              (!p.online &&
                settings.kickOffline &&
                now - (p.disconnectedAt ?? now) >=
                  settings.kickAfterSeconds * 1000) ||
              unreadyExpired(g, seat, now)
            ) {
              kicked.push(p.id);
              g.players[seat] = null;
            }
          }
          if (kicked.length) {
            g.revision++;
            publish(g);
            g = structuredClone(g);
            for (const id of kicked) {
              const ws = clients.get(id);
              if (ws)
                send(ws, {
                  type: "left",
                  lobby: true,
                  message: "开局前等待超时，已为你返回大厅",
                });
            }
          }
        }
        if (
          g.table &&
          g.phase === "finished" &&
          resultWait(g, now) === 0 &&
          g.table.settings.autoRenew &&
          accounts.canOpenTables(g.table.creatorId)
        ) {
          const renewed = createGame(freshTableCode(), randomUUID(), g.rules);
          renewed.settlementBase = 100;
          renewed.scoreDivisor = 1 / (g.table.settings.scoreMultiplier ?? 0.5);
          renewed.ownerId = g.table.creatorId;
          renewed.table = {
            ...g.table,
            createdAt: now,
            settledRound: undefined,
            readyDeadline: undefined,
            endReason: undefined,
            finishedAt: undefined,
          };
          try {
            db.exec("BEGIN");
            records.capture(g);
            db.prepare(
              "INSERT OR IGNORE INTO table_archives VALUES (?,?,?)",
            ).run(g.id, JSON.stringify(g), now);
            db.prepare("DELETE FROM rooms WHERE id=?").run(g.id);
            save.run(renewed.id, JSON.stringify(renewed), now);
            db.exec("COMMIT");
          } catch (error) {
            db.exec("ROLLBACK");
            throw new StorageError(error);
          }
          games.delete(g.code);
          games.set(renewed.code, renewed);
          lastAuto.delete(g.id);
          sendLeft(g, `本桌结束，已按原设置新开空桌 ${renewed.code}`);
          broadcastTables();
          continue;
        }
        // Repair ready rooms persisted by older versions; never deal while a human is offline.
        const started = startIfReady(g);
        if (started !== g) {
          g = started;
          publish(g);
        }
        if (g.dissolve) {
          const previousVotes = g.dissolve.yes.length;
          for (const seat of seats) {
            const p = g.players[seat]!;
            if (
              !p.online &&
              (p.disconnectedAt ?? now) < now - 60000 &&
              !g.dissolve.yes.includes(seat)
            )
              g.dissolve.yes.push(seat);
          }
          if (g.dissolve.yes.length === 4) {
            g = dissolveGame(g, now);
            g.revision++;
            publish(g);
          } else if (g.dissolve.expires <= now) {
            g.dissolve = undefined;
            g.revision++;
            publish(g);
          } else if (g.dissolve.yes.length !== previousVotes) {
            g.revision++;
            publish(g);
          }
          g = structuredClone(g);
        }
        if (
          !["playing", "claiming"].includes(g.phase) ||
          now - (lastAuto.get(g.id) ?? 0) < 850
        )
          continue;
        if (g.phase === "claiming") {
          for (const seat of seats) {
            const p = g.players[seat]!;
            if (
              !g.pending?.offers[seat] ||
              g.pending.replies[seat] !== undefined
            )
              continue;
            if (p.bot || p.trustee || overtimeExpired(g, seat, now)) {
              if (!p.bot && !p.trustee && g.table?.settings.overtimeSeconds) {
                chargeOvertime(g, seat, now);
                if (g.table.settings.trusteeMode === "dissolve") {
                  g = dissolveGame(g, now);
                  g.table!.endReason = "累计超时用完，按设置结束本桌";
                  publish(g);
                  break;
                }
                p.trustee = true;
                p.trusteeLocked = false;
              }
              const action =
                p.bot || p.trustee
                  ? automaticAction(g, seat)
                  : { type: "pass" as const };
              if (action) {
                g = act(g, seat, action, now);
                publish(g);
                lastAuto.set(g.id, now);
                break;
              }
            }
          }
        } else {
          const p = g.players[g.turn]!;
          if (p.bot || p.trustee || overtimeExpired(g, g.turn, now)) {
            if (!p.bot && !p.trustee && overtimeExpired(g, g.turn, now)) {
              chargeOvertime(g, g.turn, now);
              if (g.table?.settings.trusteeMode === "dissolve") {
                g = dissolveGame(g, now);
                g.table!.endReason = "出牌超时，按设置结束本桌";
                publish(g);
                continue;
              }
              p.trustee = true;
              p.trusteeLocked = false;
            }
            const action = automaticAction(g, g.turn);
            if (action) {
              g = act(g, g.turn, action, now);
              publish(g);
              lastAuto.set(g.id, now);
            }
          }
        }
      } catch (error) {
        console.error("Room tick failed", g.id, error);
      }
    }
  }, options.tickMs ?? 250);
  return {
    api,
    games,
    listen: () =>
      new Promise<number>((resolve) =>
        api.listen(options.port ?? 8787, options.host ?? "0.0.0.0", () =>
          resolve((api.address() as { port: number }).port),
        ),
      ),
    close: async () => {
      clearInterval(tick);
      for (const ws of wss.clients) ws.close();
      await new Promise<void>((resolve) => wss.close(() => resolve()));
      await new Promise<void>((resolve) => api.close(() => resolve()));
      db.close();
    },
  };
}
