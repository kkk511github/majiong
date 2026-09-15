/** Acceptance check against the running, deployed room service; cleans up every table it creates. */
import { WebSocket } from "ws";
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import assert from "node:assert/strict";
import type { ClientMessage, ServerMessage, View } from "../shared/types";
const base = (process.argv[2] ?? "http://127.0.0.1:8787").replace(/\/$/, "");
const sockets: WebSocket[] = [];
async function peer(name: string, token?: string) {
  const ws = new WebSocket(base.replace(/^http/, "ws") + "/ws", {
    origin: "capacitor://localhost",
  });
  sockets.push(ws);
  const messages: ServerMessage[] = [];
  let latest: View | undefined;
  ws.on("message", (data) => {
    const m = JSON.parse(String(data));
    messages.push(m);
    if (m.type === "state") latest = m.state;
  });
  await new Promise<void>((resolve, reject) => {
    ws.once("open", resolve);
    ws.once("error", reject);
  });
  const send = (m: ClientMessage) => ws.send(JSON.stringify(m));
  async function read<T extends ServerMessage["type"]>(
    type: T,
    predicate: (m: Extract<ServerMessage, { type: T }>) => boolean = () => true,
  ): Promise<Extract<ServerMessage, { type: T }>> {
    const end = Date.now() + 12000;
    while (Date.now() < end) {
      const i = messages.findIndex(
        (m) => m.type === type && predicate(m as never),
      );
      if (i >= 0) return messages.splice(i, 1)[0] as never;
      const error = messages.find((m) => m.type === "error");
      if (error) throw Error(JSON.stringify(error));
      await new Promise((r) => setTimeout(r, 25));
    }
    throw Error(`Timed out: ${type}`);
  }
  send({ type: "hello", name, token });
  const session = await read("session");
  assert.equal(session.tableLobby, true);
  return { ws, send, read, session, latest: () => latest };
}
const checks: string[] = [];
const codes: string[] = [];
let host: Awaited<ReturnType<typeof peer>> | undefined;
const players: Awaited<ReturnType<typeof peer>>[] = [];
try {
  const health = await (await fetch(base + "/api/health")).json();
  assert.equal(health.ok, true);
  host = await peer("大厅验收");
  host.send({
    type: "createTables",
    count: 2,
    creationId: randomUUID(),
    settings: { name: "临时联机验收", autoRenew: true, resultSeconds: 5 },
    rules: { rounds: 4, turnSeconds: 60 },
  });
  codes.push(...(await host.read("tablesCreated")).codes);
  assert.equal(codes.length, 2);
  for (let i = 0; i < 4; i++) players.push(await peer(`验收${i + 1}`));
  players[0].send({ type: "tables" });
  let tables = (await players[0].read("tables")).tables;
  assert(
    codes.every((code) =>
      tables.some((t) => t.code === code && t.seats.every((p) => p === null)),
    ),
  );
  checks.push("批量创建空桌，大厅可见");
  for (let i = 0; i < 4; i++) {
    players[i].send({ type: "join", code: codes[0], seat: i as 0 | 1 | 2 | 3 });
    const { state } = await players[i].read("state");
    assert.equal(state.me, i);
    assert.equal(state.phase, i === 3 ? "playing" : "waiting");
  }
  for (let i = 0; i < 4; i++) {
    const v =
      players[i].latest()?.phase === "playing"
        ? players[i].latest()!
        : (await players[i].read("state", (m) => m.state.phase === "playing"))
            .state;
    assert.equal(v.phase, "playing");
    assert.equal(v.round, 1);
    assert.equal(v.players[i]!.hand.length, i === 0 ? 14 : 13);
    assert(v.players.every((p, j) => i === j || !p!.hand.length));
  }
  checks.push("三人不发牌，第四真人指定座位入座自动开局；手牌保密");
  const firstId = players[0].latest()!.id;
  for (const p of players) p.send({ type: "dissolve", agree: true });
  await players[0].read("state", (m) => m.state.phase === "finished");
  await Promise.all(players.map((p) => p.read("left")));
  host.send({ type: "tables" });
  tables = (
    await host.read("tables", (m) =>
      m.tables.some((t) => t.code === codes[0] && t.phase === "waiting"),
    )
  ).tables;
  assert(
    tables.find((t) => t.code === codes[0])!.seats.every((p) => p === null),
  );
  checks.push("结算展示后同房号续空桌、四人返回大厅");
  const back = await peer("验收1", players[0].session.token);
  const records = (await back.read("records")).records;
  assert(records.some((r) => r.game === firstId));
  checks.push("重新登录可恢复续桌前战绩");
  for (const code of codes) {
    host.send({ type: "closeTable", code, requestId: `close-${code}` });
    await host.read("ack", (m) => m.requestId === `close-${code}`);
  }
  host.send({ type: "tables" });
  assert(
    (
      await host.read(
        "tables",
        (m) => !m.tables.some((t) => codes.includes(t.code)),
      )
    ).tables.every((t) => !codes.includes(t.code)),
  );
  checks.push("创建人收桌，验收桌全部清理");
  const report = {
    at: new Date().toISOString(),
    base,
    version: health.version,
    ok: true,
    checks,
  };
  if (process.argv[3])
    writeFileSync(process.argv[3], JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  for (const p of players) {
    if (
      p.ws.readyState === WebSocket.OPEN &&
      p.latest() &&
      !["waiting", "finished"].includes(p.latest()!.phase)
    )
      p.send({ type: "dissolve", agree: true });
  }
  await new Promise((r) => setTimeout(r, 250));
  for (const code of codes)
    if (host?.ws.readyState === WebSocket.OPEN)
      host.send({ type: "closeTable", code });
  console.error(error);
  process.exitCode = 1;
} finally {
  for (const ws of sockets) ws.close();
}
