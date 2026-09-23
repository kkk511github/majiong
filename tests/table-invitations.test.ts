import { describe, expect, it } from 'vitest';
import { createTableInvitations } from '../server/table-invitations';
import { createGame, newPlayer } from '../shared/engine';
import { normalizeTableSettings, tableSummary } from '../shared/table-settings';
import type { Account, Game } from '../shared/types';
import type { TableInvitation } from '../shared/table-invitations';

function fixture(auto = false) {
  let clock = 1_000_000;
  const users = new Map<string, Account>(['host', 'alice', 'bob', 'blocked', 'busy'].map((id, i) => [id, {
    id, memberId: String(100001 + i), username: id, name: id, role: 'member',
    mustChangePassword: false, canPlay: id !== 'blocked',
  }]));
  const online = new Set(users.keys());
  const game = createGame('123456', 'invite-test');
  game.table = { creatorId: 'host', groupId: 'group', number: 1, createdAt: clock,
    settings: normalizeTableSettings({ readyMode: auto ? 'auto' : 'manual' }) };
  game.players[0] = newPlayer('host', 'host');
  const rooms = new Map<string, Game>([['host', game], ['busy', createGame('654321', 'busy')]]);
  const delivered = new Map<string, TableInvitation[]>();
  let joinCount = 0, failJoin = false;
  const manager = createTableInvitations({
    now: () => clock, online: () => [...online], account: id => users.get(id),
    room: id => rooms.get(id), table: code => code === game.code ? game : undefined,
    summary: (g, id) => tableSummary(g, id),
    deliver: (id, invitations) => delivered.set(id, invitations),
    join: (g, id) => {
      if (failJoin) throw Error('模拟存储错误');
      if (rooms.has(id)) throw Error('已入座');
      const index = g.players.findIndex(p => !p);
      if (index < 0) throw Error('满桌');
      g.players[index] = newPlayer(id, id); g.players[index]!.ready = auto;
      rooms.set(id, g); joinCount++; manager.refresh();
    },
  });
  const send = (who = 'alice') => {
    manager.invite('host', game.id, users.get(who)!.memberId!);
    return delivered.get(who)!.find(i => i.status === 'pending')!;
  };
  return { manager, game, users, online, rooms, delivered, send,
    advance: (ms: number) => { clock += ms; manager.refresh(); },
    joins: () => joinCount, fail: () => { failJoin = true; } };
}

describe('online table invitations', () => {
  it('lists only admitted online peers, excludes self and current seats, marks occupied peers busy', () => {
    const f = fixture(); f.online.delete('bob');
    expect(f.manager.peers('host', f.game.id).map(p => [p.name, p.status])).toEqual([['alice', 'available'], ['busy', 'busy']]);
    expect(() => f.manager.peers('alice', f.game.id)).toThrow();
  });
  it('coalesces duplicate sends and delivers only to the two participants', () => {
    const f = fixture(), invitation = f.send(); f.send();
    expect(f.delivered.get('alice')).toHaveLength(1);
    expect(f.delivered.get('host')![0].id).toBe(invitation.id);
    expect(f.delivered.has('bob')).toBe(false);
    expect(JSON.stringify(invitation)).not.toMatch(/"hand"|"wall"|"token"/);
  });
  it.each([false, true])('accepts exactly once without changing readyMode=%s', auto => {
    const f = fixture(auto), invitation = f.send();
    f.manager.respond('alice', invitation.id, true); f.manager.respond('alice', invitation.id, true);
    expect(f.joins()).toBe(1); expect(f.game.players[1]?.ready).toBe(auto);
    expect(f.delivered.get('host')![0].status).toBe('accepted');
  });
  it('refusal never joins and rejects rapid reinvitation', () => {
    const f = fixture(), invitation = f.send(); f.manager.respond('alice', invitation.id, false);
    expect(f.joins()).toBe(0); expect(f.delivered.get('host')![0].status).toBe('declined');
    expect(() => f.send()).toThrow(/稍后/);
  });
  it('expired or forged invitations cannot assign a seat', () => {
    const f = fixture(), invitation = f.send();
    expect(() => f.manager.respond('bob', invitation.id, true)).toThrow(/不属于/);
    f.advance(60_000); expect(() => f.manager.respond('alice', invitation.id, true)).toThrow('邀请已过期');
    expect(f.joins()).toBe(0); expect(f.delivered.get('alice')![0].status).toBe('expired');
  });
  it('two accepts racing for the last seat result in only one join', () => {
    const f = fixture(); f.game.players[1] = newPlayer('one', 'one'); f.game.players[2] = newPlayer('two', 'two');
    const alice = f.send(); f.advance(1000); const bob = f.send('bob');
    f.manager.respond('alice', alice.id, true); expect(() => f.manager.respond('bob', bob.id, true)).toThrow('这张牌桌已满');
    expect(f.joins()).toBe(1); expect(f.game.players[3]?.id).toBe('alice');
    expect(f.delivered.get('bob')![0]).toMatchObject({ status: 'unavailable', reason: '这张牌桌已满' });
  });
  it.each(['leave', 'start', 'closed', 'offline', 'permission', 'occupied'] as const)('invalidates %s without moving any player', reason => {
    const f = fixture(), invitation = f.send();
    if (reason === 'leave') f.rooms.delete('host');
    if (reason === 'start') f.game.phase = 'playing';
    if (reason === 'closed') f.game.table!.closed = true;
    if (reason === 'offline') f.online.delete('alice');
    if (reason === 'permission') f.users.get('alice')!.canPlay = false;
    if (reason === 'occupied') f.rooms.set('alice', createGame('987654', 'other'));
    expect(() => f.manager.respond('alice', invitation.id, true)).toThrow();
    expect(f.joins()).toBe(0); expect(f.delivered.get('host')![0].status).toBe('unavailable');
  });
  it('failed persistence never reports acceptance or consumes the invitation', () => {
    const f = fixture(), invitation = f.send(); f.fail();
    expect(() => f.manager.respond('alice', invitation.id, true)).toThrow(/存储/);
    expect(f.joins()).toBe(0); expect(f.delivered.get('host')![0].status).toBe('pending');
  });
  it('requires a real seat and never permits self, busy or blocked recipients', () => {
    const f = fixture();
    for (const who of ['host', 'busy', 'blocked']) expect(() => f.send(who)).toThrow();
    expect(() => f.manager.invite('alice', f.game.id, f.users.get('bob')!.memberId!)).toThrow();
  });
  it('rejects legacy rooms without table metadata before serializing a summary', () => {
    const f = fixture(); delete f.game.table;
    expect(() => f.manager.peers('host', f.game.id)).toThrow('请在有空位的等待牌桌邀请牌友');
    expect(() => f.send()).toThrow('请在有空位的等待牌桌邀请牌友');
    expect(f.delivered.size).toBe(0);
  });
  it('clears both participant indexes after expiry and retention without touching unrelated users', () => {
    const f = fixture(); f.send();
    for (let i = 0; i < 2000; i++) f.online.add(`unrelated-${i}`);
    f.delivered.clear(); f.advance(60_000);
    expect([...f.delivered.keys()].sort()).toEqual(['alice', 'host']);
    expect(f.delivered.get('alice')![0].status).toBe('expired');
    f.delivered.clear(); f.advance(120_001);
    expect([...f.delivered.keys()].sort()).toEqual(['alice', 'host']);
    expect(f.delivered.get('alice')).toEqual([]);
    expect(f.delivered.get('host')).toEqual([]);
    f.delivered.clear(); f.advance(1000); expect(f.delivered.size).toBe(0);
    expect(f.send().status).toBe('pending');
  });
});
