import { afterEach, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { makeServer } from '../server/service';
import { seedTestAdmin, registerTestPort, peerCredential } from './account-fixtures';
import type { ClientMessage, ServerMessage } from '../shared/types';

let service: ReturnType<typeof makeServer> | undefined, directory = '';
const sockets: WebSocket[] = [];
afterEach(async () => { sockets.splice(0).forEach(socket => socket.close()); await service?.close(); if (directory) rmSync(directory, { recursive: true, force: true }); });

async function fixture() {
  directory = mkdtempSync(join(tmpdir(), 'jinling-invites-'));
  const database = join(directory, 'test.sqlite'); await seedTestAdmin(database);
  service = makeServer({ database, port: 0, host: '127.0.0.1', tickMs: 25 });
  const port = await service.listen(); registerTestPort(port);
  async function peer(name: string) {
    const token = await peerCredential(port, name), socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    sockets.push(socket); const messages: ServerMessage[] = [];
    socket.on('message', raw => messages.push(JSON.parse(String(raw))));
    await new Promise<void>(resolve => socket.on('open', resolve));
    const send = (message: ClientMessage) => socket.send(JSON.stringify(message));
    async function read<T extends ServerMessage['type']>(type: T, predicate: (message: Extract<ServerMessage, { type: T }>) => boolean = () => true) {
      const deadline = Date.now() + 4000;
      while (Date.now() < deadline) {
        const index = messages.findIndex(message => message.type === type && predicate(message as never));
        if (index >= 0) return messages.splice(index, 1)[0] as Extract<ServerMessage, { type: T }>;
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      throw Error(`No ${type}: ${messages.map(m => m.type).join(',')}`);
    }
    send({ type: 'hello', name, token }); const session = await read('session');
    return { send, read, session, socket, messages };
  }
  const host = await peer('邀请发起人'), guest = await peer('待邀请牌友'), other = await peer('另一位在线牌友');
  host.send({ type: 'createTables', count: 1, creationId: 'invite-create', settings: { readyMode: 'manual', openingAnimation: true, autoRenew: false, kickUnready: false }, rules: { turnSeconds: 30 } });
  const { codes } = await host.read('tablesCreated');
  host.send({ type: 'join', code: codes[0], seat: 0 });
  const { state } = await host.read('state');
  return { host, guest, other, state };
}

it('real websocket invite lists online users, refuses without moving, accepts once with the existing join rules', async () => {
  const { host, guest, other, state } = await fixture();
  expect(host.session.tableInvites).toBe(true);
  host.send({ type: 'invitePeers', game: state.id, requestId: 'list-1' });
  const peers = (await host.read('invitationResult', m => m.requestId === 'list-1')).peers!;
  expect(peers.map(p => p.memberId)).toContain(guest.session.account!.memberId);
  expect(peers.map(p => p.memberId)).not.toContain(host.session.account!.memberId);
  host.send({ type: 'invitePlayer', game: state.id, memberId: guest.session.account!.memberId!, requestId: 'send-1' });
  await host.read('invitationResult', m => m.requestId === 'send-1');
  const invitation = (await guest.read('tableInvitations', m => m.invitations.some(i => i.status === 'pending'))).invitations[0];
  expect(invitation.table.code).toBe(state.code);
  guest.send({ type: 'respondInvite', invitation: invitation.id, accept: false, requestId: 'decline-1' });
  await guest.read('invitationResult', m => m.requestId === 'decline-1');
  expect((await host.read('tableInvitations', m => m.invitations.some(i => i.status === 'declined'))).invitations[0].status).toBe('declined');
  expect(service!.games.get(state.code)!.players.filter(Boolean)).toHaveLength(1);

  // Another admitted seated member may invite; no creator-only privilege.
  other.send({ type: 'join', code: state.code, seat: 1 }); await other.read('state');
  other.send({ type: 'invitePlayer', game: state.id, memberId: guest.session.account!.memberId!, requestId: 'send-2' });
  await other.read('invitationResult', m => m.requestId === 'send-2');
  const second = (await guest.read('tableInvitations', m => m.invitations.some(i => i.status === 'pending'))).invitations.find(i => i.status === 'pending')!;
  host.send({ type: 'respondInvite', invitation: second.id, accept: true, requestId: 'forged' });
  expect((await host.read('error', m => m.requestId === 'forged')).message).toContain('不属于');
  guest.send({ type: 'respondInvite', invitation: second.id, accept: true, requestId: 'accept-1' });
  const joined = (await guest.read('state')).state;
  await guest.read('invitationResult', m => m.requestId === 'accept-1');
  expect(joined.id).toBe(state.id); expect(joined.me).toBe(2); expect(joined.players[2]!.ready).toBe(false);
  guest.send({ type: 'respondInvite', invitation: second.id, accept: true, requestId: 'accept-repeat' });
  await guest.read('invitationResult', m => m.requestId === 'accept-repeat');
  expect(service!.games.get(state.code)!.players.filter(p => p?.id === guest.session.id)).toHaveLength(1);
});

it('ordinary join fills the last seat before invite acceptance and leaves the recipient outside', async () => {
  const { host, guest, other, state } = await fixture();
  const g = service!.games.get(state.code)!;
  g.players[1] = { ...g.players[0]!, id: 'fixture-a', name: '甲', bot: true };
  g.players[2] = { ...g.players[0]!, id: 'fixture-b', name: '乙', bot: true };
  host.send({ type: 'invitePlayer', game: state.id, memberId: guest.session.account!.memberId!, requestId: 'send' });
  const invitation = (await guest.read('tableInvitations', m => m.invitations.some(i => i.status === 'pending'))).invitations[0];
  other.send({ type: 'join', code: state.code, seat: 3 }); await other.read('state');
  const unavailable = await guest.read('tableInvitations', m => m.invitations.some(i => i.status === 'unavailable'));
  expect(unavailable.invitations[0].reason).toBe('这张牌桌已满');
  guest.send({ type: 'respondInvite', invitation: invitation.id, accept: true, requestId: 'too-late' });
  expect((await guest.read('error', m => m.requestId === 'too-late')).message).toBe('这张牌桌已满');
  expect(service!.games.get(state.code)!.players.some(p => p?.id === guest.session.id)).toBe(false);
});

it('websocket lists exclude online admins and direct invitations to them are rejected', async () => {
  const {host,guest,other,state}=await fixture();
  expect(host.session.account!.role).toBe('admin');
  guest.send({type:'join',code:state.code,seat:1}); await guest.read('state');
  host.send({type:'leave'}); await host.read('left');
  guest.send({type:'invitePeers',game:state.id,requestId:'exclude-admin'});
  const peers=(await guest.read('invitationResult',m=>m.requestId==='exclude-admin')).peers!;
  expect(peers.map(p=>p.memberId)).not.toContain(host.session.account!.memberId);
  expect(peers.map(p=>p.memberId)).toContain(other.session.account!.memberId);
  guest.send({type:'invitePlayer',game:state.id,memberId:host.session.account!.memberId!,requestId:'admin-direct'});
  expect((await guest.read('error',m=>m.requestId==='admin-direct')).message).toBe('管理员不能被邀请到对局');
  expect(service!.games.get(state.code)!.players.some(p=>p?.id===host.session.id)).toBe(false);
  expect(host.messages.filter(m=>m.type==='tableInvitations').flatMap(m=>m.type==='tableInvitations'?m.invitations:[]).some(i=>i.status==='pending')).toBe(false);
});
