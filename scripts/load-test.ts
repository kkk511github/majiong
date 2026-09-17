import assert from "node:assert/strict";
import { fork, execFile } from "node:child_process";
import { promisify } from "node:util";
import { DatabaseSync } from "node:sqlite";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { hashPassword } from "../server/accounts";
import { once } from "node:events";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { WebSocket } from "ws";
import type { ClientMessage, ServerMessage, View } from "../shared/types";

// This runner owns its local child server and temporary SQLite database.
// It never sends test traffic to the user's live room service.
const directory = mkdtempSync(join(tmpdir(), "jinling-load-"));
const clients: Peer[] = [];
const latency: number[] = [];
let stateMessages = 0;
let serverErrors = 0;
let unexpectedDisconnects = 0;
let closing = false;
const residentMemoryMB: number[] = [];
const runFile = promisify(execFile);
let fatal: (error: Error) => void;
const failure = new Promise<never>((_, reject) => {
  fatal = reject;
});
const child = fork(
  fileURLToPath(new URL("../server/index.ts", import.meta.url)),
  {
    execArgv: ["--import", "tsx"],
    env: {
      ...process.env,
      PORT: "0",
      DATABASE_PATH: join(directory, "load.sqlite"),
    },
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  },
);
let serverLog = "";
const memorySampler = setInterval(() => {
  if (!child.pid || closing) return;
  void runFile("ps", ["-o", "rss=", "-p", String(child.pid)])
    .then(({ stdout }) => { const kb = Number(stdout.trim()); if (Number.isFinite(kb) && kb > 0) residentMemoryMB.push(kb / 1024); })
    .catch(() => {});
}, 1000);
child.stderr!.on("data", (data) => {
  serverLog += data.toString();
});
const portPromise = new Promise<number>((resolve, reject) => {
  child.stdout!.on("data", (data) => {
    const match = String(data).match(/127\.0\.0\.1:(\d+)/);
    if (match) resolve(Number(match[1]));
  });
  child.once("error", reject);
  child.once("exit", (code) => reject(Error(`Server exited: ${code}`)));
});

class Peer {
  socket: WebSocket;
  view?: View;
  session?: Extract<ServerMessage, { type: "session" }>;
  private listeners = new Set<() => void>();
  constructor(port: number, name: string, token: string) {
    this.socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    this.socket.once("open", () => this.send({ type: "hello", name, token }));
    this.socket.on("close", () => { if (!closing) { unexpectedDisconnects++; fatal(Error("Unexpected socket close")); } });
    this.socket.on("error", (error) => fatal(error));
    this.socket.on("message", (data) => {
      try {
        const message = JSON.parse(String(data)) as ServerMessage;
        if (message.type === "error") {
          serverErrors++;
          throw Error(message.message);
        }
        if (message.type === "session") this.session = message;
        if (message.type === "state") {
          const v = message.state;
          stateMessages++;
          assert(!("wall" in v), "Private wall leaked");
          assert(v.ownerId, "Missing room owner");
          if (this.view?.id === v.id)
            assert(v.revision >= this.view.revision, "Revision regressed");
          if (v.phase === "playing" || v.phase === "claiming")
            v.players.forEach((p, i) => {
              if (i !== v.me) assert.equal(p!.hand.length, 0);
            });
          if (v.result)
            assert.equal(
              v.result.deltas.reduce((a, b) => a + b, 0),
              0,
            );
          this.view = v;
        }
        this.listeners.forEach((f) => f());
      } catch (error) {
        fatal(error as Error);
      }
    });
  }
  send(message: ClientMessage) {
    this.socket.send(JSON.stringify(message));
  }
  wait(check: () => boolean): Promise<void> {
    if (check()) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.listeners.delete(tick);
        reject(Error(`Client stalled in ${this.view?.phase ?? "login"}`));
      }, 15000);
      const tick = () => {
        if (!check()) return;
        clearTimeout(timeout);
        this.listeners.delete(tick);
        resolve();
      };
      this.listeners.add(tick);
    });
  }
  async play() {
    for (;;) {
      await this.wait(() => {
        const v = this.view;
        return (
          !!v &&
          (v.phase === "finished" ||
            v.canDiscard ||
            v.actions.length > 0 ||
            (["waiting", "ended"].includes(v.phase) && !v.players[v.me]!.ready))
        );
      });
      await delay(100);
      const v = this.view!;
      if (v.phase === "finished") return v;
      let message: ClientMessage;
      let acknowledged: (next: View) => boolean;
      if (["waiting", "ended"].includes(v.phase) && !v.players[v.me]!.ready) {
        message = { type: "ready" };
        acknowledged = (n) => n.players[n.me]!.ready || n.round > v.round;
      } else if (v.actions.includes("hu")) {
        message = {
          type: "action",
          revision: v.revision,
          action: { type: "hu" },
        };
        acknowledged = (n) =>
          ["ended", "finished"].includes(n.phase) || !!n.pending?.answered;
      } else if (v.actions.includes("pass")) {
        message = {
          type: "action",
          revision: v.revision,
          action: { type: "pass" },
        };
        acknowledged = (n) =>
          !n.pending ||
          n.pending.tile !== v.pending!.tile ||
          !!n.pending.answered;
      } else if (v.canDiscard) {
        const hand = v.players[v.me]!.hand;
        const tile = hand[Math.floor(Math.random() * hand.length)];
        message = {
          type: "action",
          revision: v.revision,
          action: { type: "discard", tile },
        };
        acknowledged = (n) => !n.players[n.me]!.hand.includes(tile);
      } else continue;
      const started = performance.now();
      this.send(message);
      await this.wait(
        () =>
          !!this.view &&
          this.view.revision > v.revision &&
          acknowledged(this.view),
      );
      latency.push(performance.now() - started);
    }
  }
}

const started = performance.now();
const timeout = setTimeout(
  () => fatal(Error("Load run exceeded 180 seconds")),
  180000,
);
try {
  const run = async () => {
    const port = await portPromise;
    // Provision only the owned temporary database; this measures gameplay,
    // not registration/password hashing throughput or authentication rate limits.
    const hash = await hashPassword("Local-load-fixture-only-2026");
    const db = new DatabaseSync(join(directory, "load.sqlite"));
    const credentials: string[] = [];
    try {
      db.exec("BEGIN");
      for (let i = 0; i < 100; i++) {
        const id = randomUUID(), token = randomBytes(32).toString("hex"), name = `试打${i + 1}`;
        db.prepare("INSERT INTO accounts VALUES (?,?,?,?,?,?,?)").run(id, `load-${i}`, name, hash, "member", 0, Date.now());
        db.prepare("INSERT INTO team_memberships VALUES (?,?,?,?,?)").run(id, "team-1", 0, "load-fixture", Date.now());
        if (i % 4 === 0) db.prepare("INSERT INTO table_permissions VALUES (?,?,?,?)").run(id, 1, "load-fixture", Date.now());
        db.prepare("INSERT INTO sessions VALUES (?,?,?,?)").run(createHash("sha256").update(token).digest("hex"), id, name, Date.now());
        credentials.push(token);
      }
      db.exec("COMMIT");
    } finally { db.close(); }
    for (let i = 0; i < 100; i++) clients.push(new Peer(port, `试打${i + 1}`, credentials[i]));
    await Promise.all(clients.map((p) => p.wait(() => !!p.session)));
    const tables = Array.from({ length: 25 }, (_, i) =>
      clients.slice(i * 4, i * 4 + 4),
    );
    await Promise.all(
      tables.map(async (table) => {
        table[0].send({
          type: "create",
          rules: { rounds: 4, turnSeconds: 60 },
        });
        await table[0].wait(() => !!table[0].view);
        for (const p of table.slice(1)) {
          p.send({ type: "join", code: table[0].view!.code });
          await p.wait(() => !!p.view);
        }
      }),
    );
    assert.equal(new Set(tables.map((t) => t[0].view!.code)).size, 25);
    const finished = await Promise.all(clients.map((p) => p.play()));
    for (const v of finished) assert.equal(v.history.length, 4);
    latency.sort((a, b) => a - b);
    const quantile = (q: number) =>
      Math.round(latency[Math.floor((latency.length - 1) * q)] * 100) / 100;
    return {
      at: new Date().toISOString(),
      environment:
        "Single local server process; separate Node WebSocket client process; temporary on-disk SQLite WAL",
      concurrentClients: 100,
      rooms: 25,
      completedRounds: 100,
      acceptedOperations: latency.length,
      receivedStates: stateMessages,
      serverErrors,
      unexpectedDisconnects,
      targets: { completedRooms: 25, serverErrors: 0, unexpectedDisconnects: 0, localStateConfirmationP95Ms: 500 },
      targetMet: serverErrors === 0 && unexpectedDisconnects === 0 && quantile(0.95) <= 500,
      serverResidentMemoryMB: { samples: residentMemoryMB.length, peak: residentMemoryMB.length ? Math.round(Math.max(...residentMemoryMB) * 10) / 10 : null, last: residentMemoryMB.at(-1) ?? null },
      elapsedSeconds: Math.round((performance.now() - started) / 10) / 100,
      stateConfirmationMs: {
        p50: quantile(0.5),
        p95: quantile(0.95),
        p99: quantile(0.99),
        max: latency.at(-1),
      },
      limitations:
        "Local loopback, pre-provisioned authenticated members, 100ms think time, four rounds per room. Latency ends at matching game state, not ACK. RSS is sampled server memory, not client/GPU memory. Does not establish WAN, recovery, registration or long-duration production capacity.",
    };
  };
  const report = await Promise.race([run(), failure]);
  console.log(JSON.stringify(report, null, 2));
  if (process.env.LOAD_REPORT_PATH)
    writeFileSync(
      process.env.LOAD_REPORT_PATH,
      JSON.stringify(report, null, 2) + "\n",
    );
  assert(report.targetMet, "Local gameplay load targets were not met; inspect the saved report");
} catch (error) {
  console.error(error, serverLog);
  process.exitCode = 1;
} finally {
  clearTimeout(timeout);
  closing = true;
  clearInterval(memorySampler);
  clients.forEach((p) => p.socket.close());
  const exited = !child.pid || child.exitCode !== null || child.signalCode !== null
    ? Promise.resolve()
    : once(child, "exit");
  child.kill("SIGTERM");
  const force = setTimeout(() => child.kill("SIGKILL"), 5000);
  await exited;
  clearTimeout(force);
  rmSync(directory, { recursive: true, force: true });
}
