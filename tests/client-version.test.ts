import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { clientVersionPolicy } from '../server/client-version';
import { makeServer } from '../server/service';
import { seedTestAdmin, registerTestPort, peerCredential } from './account-fixtures';
import type { ClientMessage, ServerMessage, Seat } from '../shared/types';

describe('minimum client version policy', () => {
  it('is opt-in and compares numeric versions, not lexicographic strings', () => {
    expect(clientVersionPolicy().accepts(undefined)).toBe(true);
    const policy = clientVersionPolicy('0.7.37');
    for (const value of ['0.7.37', '0.7.100', '0.8.0', '1.0.0']) expect(policy.accepts(value)).toBe(true);
    for (const value of [undefined, null, 737, {}, '0.7.36', '0.6.999', '', 'garbage', '0.7.37-beta', '9999999.0.0']) expect(policy.accepts(value)).toBe(false);
    expect(() => clientVersionPolicy('latest')).toThrow('MIN_CLIENT_VERSION');
  });
});

let server: ReturnType<typeof makeServer> | undefined, directory = '';
const sockets: WebSocket[] = [];
afterEach(async () => {
  sockets.splice(0).forEach(ws => ws.close());
  await server?.close();
  if (directory) rmSync(directory, { recursive: true, force: true });
});
async function boot(minimumClientVersion = '0.7.37') {
  directory = mkdtempSync(join(tmpdir(), 'mahjong-version-policy-'));
  const database = join(directory, 'test.sqlite');
  await seedTestAdmin(database);
  server = makeServer({ database, port: 0, host: '127.0.0.1', tickMs: 25, minimumClientVersion });
  let port = await server.listen(); registerTestPort(port);
  const token = await peerCredential(port, '版本验证管理员');
  const tokens = new Map([['版本验证管理员', token]]);
  async function connect(clientVersion?: string, name = '版本验证管理员') {
    if (!tokens.has(name)) tokens.set(name, await peerCredential(port, name));
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`); sockets.push(ws);
    const messages: ServerMessage[] = [];
    ws.on('message', raw => messages.push(JSON.parse(String(raw))));
    const closed = new Promise<number>(resolve => ws.on('close', code => resolve(code)));
    await new Promise<void>(resolve => ws.on('open', resolve));
    const send = (message: ClientMessage) => ws.send(JSON.stringify(message));
    send({ type: 'hello', token: tokens.get(name), name, clientVersion });
    async function read<T extends ServerMessage['type']>(type: T, match: (m: Extract<ServerMessage, { type: T }>) => boolean = () => true) {
      const until = Date.now() + 3000;
      while (Date.now() < until) {
        const index = messages.findIndex(m => m.type === type && match(m as never));
        if (index >= 0) return messages.splice(index, 1)[0] as Extract<ServerMessage, { type: T }>;
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      throw Error(`Missing ${type}`);
    }
    return { ws, send, read, messages, closed };
  }
  return Object.assign(connect, {
    async settings(body?: unknown) {
      const response = await fetch(`http://127.0.0.1:${port}/api/control/settings/client-update`, {
        method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      expect(response.status).toBe(200); return response.json();
    },
    async restart() {
      await server!.close();
      server = makeServer({ database, port: 0, host: '127.0.0.1', tickMs: 25, minimumClientVersion: '9.0.0' });
      port = await server.listen(); registerTestPort(port);
    },
  });
}
it.each([undefined, '0.7.36'])('rejects legacy version=%s before seating or evicting an accepted connection', async version => {
  const connect = await boot();
  const current = await connect('0.7.37'); await current.read('session');
  current.send({ type: 'createTables', creationId: 'version-table', count: 1, settings: { readyMode: 'manual', autoRenew: false, kickUnready: false } });
  const { codes } = await current.read('tablesCreated');
  current.send({ type: 'join', code: codes[0], seat: 0 }); await current.read('state');
  const before = structuredClone(server!.games.get(codes[0]));
  const old = await connect(version);
  // Pipelining a new hello / join behind a rejected one cannot recover the socket.
  old.send({ type: 'hello', token: 'fake', name: '旧客户端', clientVersion: '0.7.37' });
  old.send({ type: 'join', code: codes[0], seat: 1 });
  expect(await old.read('error')).toMatchObject({ code: 'UPDATE_REQUIRED', minimumVersion: '0.7.37' });
  expect(await old.closed).toBe(4006);
  expect(old.messages.some(m => m.type === 'session' || m.type === 'state')).toBe(false);
  expect(server!.games.get(codes[0])).toEqual(before);
  expect(current.ws.readyState).toBe(WebSocket.OPEN);
  current.send({ type: 'tables' }); await current.read('tables');
});

async function activeTable() {
  const connect = await boot('');
  const players = [];
  for (const name of ['版本验证管理员', '保护玩家一', '保护玩家二', '保护玩家三']) {
    const p = await connect(undefined, name); await p.read('session'); players.push(p);
  }
  const host = players[0];
  host.send({ type: 'createTables', creationId: 'protected-table', count: 2,
    settings: { readyMode: 'auto', continuousRounds: false, openingAnimation: false, autoRenew: false, kickUnready: false, kickOffline: false },
    rules: { rounds: 4, turnSeconds: 120, twoBankrupt: false } });
  const { codes } = await host.read('tablesCreated');
  for (let seat = 0; seat < 4; seat++) {
    players[seat].send({ type: 'join', code: codes[0], seat: seat as Seat }); await players[seat].read('state');
  }
  await host.read('state', m => m.state.phase === 'playing');
  return { connect, host, players, codes };
}

it.each(['win', 'dissolve'])('live enforcement preserves reconnect/rounds until terminal %s', async ending => {
  const { connect, host, players, codes } = await activeTable();
  const lobby = await connect(undefined, '未入座旧版'); await lobby.read('session');
  const before = structuredClone(server!.games.get(codes[0]));
  const setting = await connect.settings({ enabled: true, minimumVersion: '0.7.37', revision: 0 });
  expect(setting).toMatchObject({ enabled: true, revision: 1 });
  expect(await lobby.read('error')).toMatchObject({ code: 'UPDATE_REQUIRED' }); expect(await lobby.closed).toBe(4006);
  expect(server!.games.get(codes[0])).toEqual(before);
  expect(players.every(p => p.ws.readyState === WebSocket.OPEN)).toBe(true);
  host.send({ type: 'join', code: codes[1], requestId: 'new-table' });
  expect(await host.read('error', m => m.requestId === 'new-table')).toMatchObject({ message: expect.stringContaining('仅允许完成原有牌桌') });
  expect(host.ws.readyState).toBe(WebSocket.OPEN);
  for (const command of [{ type: 'create' }, { type: 'respondInvite', invitation: 'other-table', accept: true }] as ClientMessage[]) {
    host.send({ ...command, requestId: 'protected-new-entry' });
    expect(await host.read('error', m => m.requestId === 'protected-new-entry')).toMatchObject({ message: expect.stringContaining('仅允许完成原有牌桌') });
    expect(host.ws.readyState).toBe(WebSocket.OPEN);
  }

  // Ordinary end-of-round, not end-of-match: a real winning action and next
  // round preparation still use the unchanged engine and scoring code.
  const game = server!.games.get(codes[0])!;
  game.canSelfWin = true; game.turn = 0;
  if (game.ruleState) { game.ruleState.heavenlyEligible = false; game.ruleState.heavenlyWaits = {}; }
  game.players[0]!.hand = [0, 4, 8, 36, 40, 44, 72, 76, 80, 108, 109, 110, 112, 113];
  game.players[0]!.melds = []; game.lastDraw = 113;
  host.send({ type: 'action', revision: game.revision, action: { type: 'hu' }, requestId: 'round-win' });
  await host.read('state', m => m.state.phase === 'ended'); await host.read('ack', m => m.requestId === 'round-win');
  expect(host.ws.readyState).toBe(WebSocket.OPEN);
  // Expire only the fixture's results display timer.
  server!.games.get(codes[0])!.history.at(-1)!.at = Date.now() - 120_000;
  for (const p of players) p.send({ type: 'ready' });
  await host.read('state', m => m.state.phase === 'playing' && m.state.round === 2);

  await connect.restart();
  expect(await connect.settings()).toMatchObject({ enabled: true, minimumVersion: '0.7.37' });
  const resumed = await connect(); await resumed.read('session');
  await resumed.read('state', m => m.state.id === game.id && m.state.round === 2);
  const outsider = await connect(undefined, '未入座旧版');
  expect(await outsider.read('error')).toMatchObject({ code: 'UPDATE_REQUIRED' }); expect(await outsider.closed).toBe(4006);

  if (ending === 'dissolve') resumed.send({ type: 'dissolve', agree: true });
  else {
    const final = server!.games.get(codes[0])!;
    final.rules.rounds = final.round; final.phase = 'playing'; final.turn = 0; final.canSelfWin = true; final.pending = undefined;
    if (final.ruleState) { final.ruleState.heavenlyEligible = false; final.ruleState.heavenlyWaits = {}; }
    final.players[0]!.hand = [0, 4, 8, 36, 40, 44, 72, 76, 80, 108, 109, 110, 112, 113];
    final.players[0]!.melds = []; final.lastDraw = 113;
    resumed.send({ type: 'action', revision: final.revision, action: { type: 'hu' } });
  }
  await resumed.read('state', m => m.state.phase === 'finished');
  expect(await resumed.read('error')).toMatchObject({ code: 'UPDATE_REQUIRED' }); expect(await resumed.closed).toBe(4006);
  const again = await connect(); expect(await again.read('error')).toMatchObject({ code: 'UPDATE_REQUIRED' });
  expect(await again.closed).toBe(4006);
});

it('blocks already-connected lobby/waiting players immediately and restores admission when disabled without restart', async () => {
  const connect = await boot('');
  const old = await connect(); await old.read('session');
  old.send({ type: 'createTables', creationId: 'waiting-version', count: 1, settings: { readyMode: 'manual', autoRenew: false } });
  const { codes } = await old.read('tablesCreated');
  old.send({ type: 'join', code: codes[0], seat: 0 }); await old.read('state');
  await connect.settings({ enabled: true, minimumVersion: '0.7.37', revision: 0 });
  expect(await old.read('error')).toMatchObject({ code: 'UPDATE_REQUIRED' }); expect(await old.closed).toBe(4006);
  expect(server!.games.get(codes[0])!.phase).toBe('waiting');
  await connect.settings({ enabled: false, minimumVersion: '0.7.37', revision: 1 });
  const returned = await connect(); await returned.read('session');
  await returned.read('state', m => m.state.phase === 'waiting');
  await connect.restart(); expect(await connect.settings()).toMatchObject({ enabled: false });
  const restored = await connect(); await restored.read('session');
});
