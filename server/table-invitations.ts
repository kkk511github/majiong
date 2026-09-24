import { randomUUID } from 'node:crypto';
import type { Account, Game, TableSummary } from '../shared/types';
import { TABLE_INVITE_TTL_MS, type InvitePerson, type OnlineInvitePeer, type TableInvitation, type TableInviteStatus } from '../shared/table-invitations';

interface Entry {
  id: string; from: string; to: string; game: string; code: string;
  inviter: InvitePerson; recipient: InvitePerson; table: TableSummary;
  status: TableInviteStatus; expiresAt: number; createdAt: number; finishedAt?: number; reason?: string;
}
interface Dependencies {
  online: () => string[];
  account: (id: string) => Account | undefined;
  room: (id: string) => Game | undefined;
  table: (code: string) => Game | undefined;
  summary: (game: Game, viewer: string) => TableSummary;
  join: (game: Game, recipient: string) => void;
  deliver: (id: string, invitations: TableInvitation[]) => void;
  now?: () => number;
}

/** Ephemeral, server-authoritative invitations. No game/scoring state lives
 * here. Synchronous join persists the seat before any success is emitted. */
export function createTableInvitations(deps: Dependencies) {
  const entries = new Map<string, Entry>();
  const byParticipant = new Map<string, Set<string>>();
  const signatures = new Map<string, string>();
  let joining = false;
  const now = deps.now ?? Date.now;
  const allowed = (a?: Account): a is Account => !!a?.memberId && !!a.canPlay && !a.mustChangePassword && !a.suspended;
  // Administrator accounts may still host/invite voluntarily, but must never
  // be targets. Check the authoritative account again when accepting an invite.
  const inviteable = (a?: Account): a is Account => allowed(a) && a.role !== 'admin';
  const person = (a: Account): InvitePerson => ({ memberId: a.memberId!, name: a.name, avatar: a.avatar });
  const available = (g?: Game): g is Game => !!g?.table && !g.table.closed && g.phase === 'waiting' && g.players.some(p => !p);
  function ownerRoom(id: string, game: string) {
    const g = deps.room(id);
    if (!allowed(deps.account(id))) throw Error('当前没有邀请权限');
    if (!available(g) || g.id !== game) throw Error('请在有空位的等待牌桌邀请牌友');
    return g;
  }
  function finish(e: Entry, status: TableInviteStatus, reason: string) {
    e.status = status; e.reason = reason; e.finishedAt = now();
  }
  function invalid(e: Entry, online = new Set(deps.online())) {
    if (now() >= e.expiresAt) return '邀请已过期';
    const g = deps.table(e.code);
    if (!g?.table || g.id !== e.game || g.table.closed) return '这张牌桌已关闭';
    if (g.phase !== 'waiting') return '这张牌桌已开局';
    if (!g.players.some(p => !p)) return '这张牌桌已满';
    if (deps.room(e.from)?.id !== e.game) return '邀请人已离桌';
    if (deps.account(e.to)?.role === 'admin') return '管理员不能被邀请到对局';
    if (!allowed(deps.account(e.from)) || !allowed(deps.account(e.to))) return '当前无法加入这张牌桌';
    if (!online.has(e.from) || !online.has(e.to)) return '牌友已离线，邀请失效';
    if (deps.room(e.to)) return '牌友已在其他牌桌入座';
    return undefined;
  }
  function list(id: string): TableInvitation[] {
    return [...(byParticipant.get(id) ?? [])].map(key => entries.get(key)!).map(e => {
      const g = deps.table(e.code);
      return {
        id: e.id, direction: e.to === id ? 'incoming' : 'outgoing',
        inviter: e.inviter, recipient: e.recipient,
        table: g?.table && g.id === e.game ? deps.summary(g, id) : e.table,
        expiresAt: e.expiresAt, status: e.status, reason: e.reason,
      };
    });
  }
  function sync(id: string, force = false) {
    const payload = list(id), signature = JSON.stringify(payload);
    if (force || signature !== signatures.get(id)) {
      deps.deliver(id, payload); signatures.set(id, signature);
    }
  }
  function refresh() {
    if (joining) return;
    const online = new Set(deps.online());
    const participants = new Set(byParticipant.keys());
    for (const e of entries.values()) {
      if (e.status === 'pending') {
        const reason = invalid(e, online);
        if (reason) finish(e, now() >= e.expiresAt ? 'expired' : 'unavailable', reason);
      } else if (now() - e.finishedAt! > 120_000) {
        entries.delete(e.id);
        for (const id of [e.from, e.to]) {
          const index = byParticipant.get(id)!;
          index.delete(e.id);
          if (!index.size) byParticipant.delete(id);
        }
      }
    }
    for (const id of signatures.keys()) if (!online.has(id)) signatures.delete(id);
    // Each entry is serialized only for its two participants, never once per
    // online user. Include just-pruned participants to clear their old cards.
    for (const id of participants) if (online.has(id)) sync(id);
  }
  function peers(id: string, game: string): OnlineInvitePeer[] {
    const g = ownerRoom(id, game);
    const pendingByRecipient = new Map([...entries.values()]
      .filter(e => e.game === g.id && e.status === 'pending' && e.expiresAt > now()).map(e => [e.to, e]));
    return deps.online().filter(peer => peer !== id && !g.players.some(p => p?.id === peer)).flatMap(peer => {
      const a = deps.account(peer);
      if (!inviteable(a)) return [];
      const pending = pendingByRecipient.get(peer);
      return [{ ...person(a), status: deps.room(peer) ? 'busy' as const : pending ? 'pending' as const : 'available' as const,
        ...(pending ? { expiresAt: pending.expiresAt } : {}) }];
    }).sort((a, b) => Number(a.status === 'busy') - Number(b.status === 'busy') || a.name.localeCompare(b.name, 'zh-CN'));
  }
  function invite(id: string, game: string, memberId: string) {
    refresh();
    const g = ownerRoom(id, game), sender = deps.account(id)!;
    const to = deps.online().find(peer => deps.account(peer)?.memberId === memberId);
    const recipient = to ? deps.account(to) : undefined;
    if (recipient?.role === 'admin') throw Error('管理员不能被邀请到对局');
    if (!to || to === id || !inviteable(recipient)) throw Error('该牌友暂时不可邀请');
    if (deps.room(to)) throw Error('该牌友已在牌桌中');
    const history = [...entries.values()];
    // Coalesce duplicate invites from everyone already seated at this table.
    if (history.some(e => e.game === game && e.to === to && e.status === 'pending')) return;
    if (history.some(e => e.from === id && e.to === to && now() - (e.finishedAt ?? e.createdAt) < 30_000))
      throw Error('请稍后再邀请这位牌友');
    if (history.some(e => e.from === id && now() - e.createdAt < 1000)) throw Error('邀请太快，请稍后再试');
    if (entries.size >= 2000 || history.filter(e => e.from === id && e.status === 'pending').length >= 5 ||
        history.filter(e => e.to === to && e.status === 'pending').length >= 5) throw Error('待回应邀请较多，请稍后再试');
    const e: Entry = {
      id: randomUUID(), from: id, to, game: g.id, code: g.code,
      inviter: person(sender), recipient: person(recipient), table: deps.summary(g, to),
      status: 'pending', expiresAt: now() + TABLE_INVITE_TTL_MS, createdAt: now(),
    };
    entries.set(e.id, e);
    for (const id of [e.from, e.to]) {
      if (!byParticipant.has(id)) byParticipant.set(id, new Set());
      byParticipant.get(id)!.add(e.id);
    }
    refresh();
  }
  function respond(id: string, invitation: string, accept: boolean) {
    const e = entries.get(invitation);
    if (!e || e.to !== id) throw Error('这条邀请不存在或不属于你');
    if (e.status !== 'pending') {
      sync(id, true);
      if (accept && e.status !== 'accepted') throw Error(e.reason ?? '邀请已失效');
      return;
    }
    const reason = invalid(e);
    if (reason) {
      finish(e, now() >= e.expiresAt ? 'expired' : 'unavailable', reason); refresh();
      throw Error(reason);
    }
    if (!accept) { finish(e, 'declined', '暂不加入'); refresh(); return; }
    // Reserve only through the existing synchronous durable join. Marking the
    // entry accepted beforehand would report success even on a storage error.
    try { joining = true; deps.join(deps.table(e.code)!, id); }
    finally { joining = false; }
    finish(e, 'accepted', '已入座'); refresh();
  }
  return { peers, invite, respond, refresh, sync };
}
