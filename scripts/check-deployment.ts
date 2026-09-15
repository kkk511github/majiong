import assert from "node:assert/strict";
import { WebSocket } from "ws";
import type { ClientMessage, ServerMessage, View } from "../shared/types";

const base = process.argv[2]?.replace(/\/$/, "");
if (!base || !/^https:\/\//.test(base)) throw new Error("Usage: tsx scripts/check-deployment.ts https://host/path [--pause-for-restart]");
const endpoint = base.replace(/^https:/, "wss:") + "/ws";
const pauseForRestart = process.argv.includes("--pause-for-restart");
const readyBeforeBots = process.argv.includes("--ready-before-bots");
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function until(check: () => boolean, description: string, timeout = 15000) {
  const end = Date.now() + timeout;
  while (!check()) {
    if (Date.now() > end) throw new Error("Timed out: " + description);
    await delay(50);
  }
}
class Peer {
  socket?: WebSocket;
  session?: Extract<ServerMessage, {type: "session"}>;
  view?: View;
  left = false;
  errors: string[] = [];
  constructor(readonly name: string) {}
  async connect(token?: string) {
    this.session = undefined;
    this.view = undefined;
    const socket = new WebSocket(endpoint, {origin: "capacitor://localhost", handshakeTimeout: 15000});
    this.socket = socket;
    socket.on("error", error => this.errors.push(error.message));
    socket.on("message", data => {
      const message = JSON.parse(String(data)) as ServerMessage;
      if (message.type === "session") this.session = message;
      if (message.type === "state") this.view = message.state;
      if (message.type === "left") this.left = true;
      if (message.type === "error") this.errors.push(message.message);
    });
    await until(() => socket.readyState === WebSocket.OPEN, this.name + " socket opens");
    this.send({type: "hello", name: this.name, token});
    await until(() => !!this.session, this.name + " receives session");
  }
  send(message: ClientMessage) { this.socket!.send(JSON.stringify(message)); }
}
const stable = (view: View) => ({
  id: view.id, code: view.code, phase: view.phase, round: view.round, turn: view.turn,
  remaining: view.remaining, me: view.me, ownerId: view.ownerId,
  players: view.players.map(p => p && ({id: p.id, hand: p.hand, handCount: p.handCount, melds: p.melds, flowers: p.flowers, discards: p.discards, score: p.score})),
  pending: view.pending && {tile: view.pending.tile, from: view.pending.from, kind: view.pending.kind},
});

const peers = Array.from({length: readyBeforeBots ? 2 : 4}, (_, i) => new Peer("部署验收" + (i + 1)));
const started = Date.now();
try {
  const health = await fetch(base + "/api/health");
  assert.equal(health.status, 200);
  assert.equal((await health.json()).service, "jinling-mahjong");
  await Promise.all(peers.map(p => p.connect()));
  peers[0].send({type: "create", rules: {rounds: 4, turnSeconds: 60}});
  await until(() => !!peers[0].view, "room created");
  const code = peers[0].view!.code;
  for (const peer of peers.slice(1)) {
    peer.send({type: "join", code});
    await until(() => !!peer.view, peer.name + " joined");
  }
  for (const peer of peers) peer.send({type: "ready"});
  if (readyBeforeBots) {
    await until(() => peers.every(p => p.view?.players[p.view.me]?.ready === true), "humans ready before bots");
    peers[0].send({type: "addBot"});
    await until(() => peers[0].view!.players.filter(Boolean).length === 3, "first bot seated");
    assert.equal(peers[0].view!.phase, "waiting");
    peers[0].send({type: "addBot"});
  }
  await until(() => peers.every(p => p.view?.phase === "playing"), "four players start");
  for (const peer of peers) {
    const view = peer.view!;
    assert.equal(view.players[view.me]!.hand.length, view.me === view.dealer ? 14 : 13);
    assert(view.players.every((p, seat) => seat === view.me || p!.hand.length === 0));
  }
  const dealer = peers.find(p => p.view!.canDiscard)!;
  const before = dealer.view!.revision;
  const tile = dealer.view!.players[dealer.view!.me]!.hand[0];
  dealer.send({type: "action", revision: before, action: {type: "discard", tile}});
  await until(() => peers.every(p => p.view!.revision > before), "discard synchronized to four players");
  assert(peers.every(p => p.view!.lastDiscard?.tile === tile));

  const reconnect = peers[peers.length - 1];
  const reconnectToken = reconnect.session!.token;
  const reconnectState = stable(reconnect.view!);
  reconnect.socket!.close();
  await until(() => reconnect.socket!.readyState === WebSocket.CLOSED, "client disconnected");
  await reconnect.connect(reconnectToken);
  await until(() => !!reconnect.view, "client restores room");
  assert.deepEqual(stable(reconnect.view!), reconnectState);

  if (pauseForRestart) {
    const expected = peers.map(p => stable(p.view!));
    const tokens = peers.map(p => p.session!.token);
    console.log(JSON.stringify({event: "ready_for_server_restart", room: code, clients: 4}));
    await until(() => peers.every(p => p.socket!.readyState === WebSocket.CLOSED), "server restart closes connections", 90000);
    // The orchestrator restarts the named deployment after seeing the event.
    const deadline = Date.now() + 30000;
    while (true) {
      try { if ((await fetch(base + "/api/health")).ok) break; } catch {}
      if (Date.now() > deadline) throw new Error("Server did not become healthy after restart");
      await delay(500);
    }
    await Promise.all(peers.map((p, i) => p.connect(tokens[i])));
    await until(() => peers.every(p => !!p.view), "four rooms restore after server restart");
    peers.forEach((p, i) => assert.deepEqual(stable(p.view!), expected[i]));
  }

  peers[0].send({type: "dissolve", agree: true});
  await until(() => peers.every(p => !!p.view?.dissolve), "dissolution vote opens");
  for (const peer of peers.slice(1)) peer.send({type: "dissolve", agree: true});
  await until(() => peers.every(p => p.view?.phase === "finished"), "test room dissolved");
  for (const peer of peers) peer.send({type: "leave"});
  await until(() => peers.every(p => p.left), "test players leave");
  assert.deepEqual(peers.flatMap(p => p.errors), []);
  console.log(JSON.stringify({at: new Date().toISOString(), endpoint: base, https: true, clients: peers.length, tests: ["native-origin WSS", "create/join/ready", ...(readyBeforeBots ? ["humans ready then last bot starts game"] : []), "private hands", "discard broadcast", "same-session reconnect", ...(pauseForRestart ? ["container restart with SQLite recovery"] : []), "dissolve and leave"], elapsedSeconds: Math.round((Date.now() - started)/1000), passed: true}, null, 2));
} finally {
  for (const peer of peers) peer.socket?.close();
}
