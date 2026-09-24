import { useEffect, useRef, useState } from 'react';
import { Copy, RefreshCw, Search, UserRound, Users, WifiOff, Clock3 } from 'lucide-react';
import { Dialog } from './Dialog';
import { client, avatarURL, type ClientState } from './game-client';
import { copyText } from './clipboard';
import { ruleDisplayName } from '../shared/nanjing-rules';
import { TABLE_INVITE_TTL_MS, type OnlineInvitePeer } from '../shared/table-invitations';
import './table-invitations.css';

function InviteAvatar({ name, avatar }: { name: string; avatar?: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [avatar]);
  return <span className="invite-avatar">{avatar && !failed
    ? <img src={avatarURL(avatar)} alt={`${name}的头像`} onError={() => setFailed(true)} />
    : <UserRound size={25} aria-hidden="true" />}</span>;
}

export function TableInvitations({ state, open, close, notice }: {
  state: ClientState; open: boolean; close: () => void; notice: (text: string) => void;
}) {
  const [peers, setPeers] = useState<OnlineInvitePeer[]>([]), [query, setQuery] = useState('');
  const [error, setError] = useState(''), [busy, setBusy] = useState(''), [loading, setLoading] = useState(false);
  const [listError, setListError] = useState(''), [sendAfter, setSendAfter] = useState(0);
  const [now, setNow] = useState(client.now()), [refresh, setRefresh] = useState(0);
  const [incomingId, setIncomingId] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const seen = useRef(new Set<string>());
  const view = state.view;
  const canInvite = !!view?.table && view.phase === 'waiting' && view.players.some(player => !player);
  const invitations = state.tableInvitations;
  const incoming = invitations.find(item => item.id === incomingId);

  useEffect(() => { const timer = setInterval(() => setNow(client.now()), 500); return () => clearInterval(timer); }, []);
  useEffect(() => { if (open) { setPeers([]); setQuery(''); setError(''); setListError(''); } }, [open, view?.id]);
  useEffect(() => {
    if (!open) return;
    if (!canInvite) { close(); return; }
    if (!state.connected || !state.tableInvitesAvailable) return;
    let active = true, inFlight = false;
    const load = async () => {
      if (inFlight) return;
      inFlight = true; setLoading(true);
      try { const next = await client.onlineInvitePeers(view!.id); if (active) { setPeers(next); setListError(''); } }
      catch (e) { if (active) setListError((e as Error).message); }
      finally { inFlight = false; if (active) setLoading(false); }
    };
    void load(); const timer = setInterval(load, 3000);
    return () => { active = false; clearInterval(timer); };
  }, [open, view?.id, canInvite, state.connected, state.tableInvitesAvailable, refresh]);

  useEffect(() => {
    for (const item of invitations) {
      const key = `${item.id}:${item.status}`;
      if (seen.current.has(key)) continue;
      seen.current.add(key);
      if (item.direction === 'outgoing' && item.status !== 'pending')
        notice(item.status === 'accepted' ? `${item.recipient.name}已入座` : item.status === 'declined'
          ? `${item.recipient.name}暂不加入` : `${item.recipient.name}：${item.reason ?? '邀请已失效'}`);
    }
    if (incomingId) {
      const current = invitations.find(item => item.id === incomingId);
      if (!current || current.status === 'accepted' || current.status === 'declined') setIncomingId(null);
    } else if (state.connected && !state.view) {
      const next = invitations.find(item => item.direction === 'incoming' && item.status === 'pending' && !dismissed.includes(item.id));
      if (next) { setError(''); setIncomingId(next.id); }
    }
  }, [invitations, state.connected, state.view, incomingId, dismissed]);
  useEffect(() => { setIncomingId(null); setDismissed([]); seen.current.clear(); }, [state.account?.id]);

  // The half-second render tick may predate a newly received invite. Clamp only
  // the label; the invitation's server expiry and response protocol are unchanged.
  const seconds = (expires: number) => Math.min(TABLE_INVITE_TTL_MS / 1000, Math.max(0, Math.ceil((expires - now) / 1000)));
  async function invite(peer: OnlineInvitePeer) {
    if (!view || busy) return;
    setBusy(peer.memberId); setError('');
    try { await client.invitePlayer(view.id, peer.memberId); setSendAfter(client.now() + 1000); notice(`已邀请${peer.name}，等待回应`); setRefresh(value => value + 1); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(''); }
  }
  async function respond(accept: boolean) {
    if (!incoming || busy) return;
    setBusy(incoming.id); setError('');
    try { await client.respondInvite(incoming.id, accept); setDismissed(value => [...value, incoming.id]); setIncomingId(null); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(''); }
  }
  const filtered = peers.filter(peer => `${peer.name} ${peer.memberId}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));

  if (open && canInvite) return <Dialog title="邀请在线牌友" variant="table-invite-dialog" close={close} footer={<>
    <button className="invite-copy" onClick={async () => { try { await copyText(view!.code); notice('房号已复制'); } catch { setError(`复制失败，房间号：${view!.code}`); } }}><Copy size={17} />复制房号</button>
    <small>邀请60秒内有效 · 接受后入座</small>
  </>}>
    <p className="invite-room-meta"><Users size={18} aria-hidden="true" /><span>房间 <strong>{view!.code}</strong> · 已入座 {view!.players.filter(Boolean).length}/4 · 还差 {view!.players.filter(player => !player).length} 位</span></p>
    {!state.connected ? <div className="invite-state" role="status"><WifiOff size={28} aria-hidden="true" /><strong>连接已断开</strong><p>恢复后自动刷新在线牌友，可先复制房号。</p></div> : !state.tableInvitesAvailable ? <div className="invite-state" role="status"><Users size={28} aria-hidden="true" /><strong>在线邀请服务暂不可用</strong><p>可先复制房号，邀请朋友通过房号加入。</p></div> : <>
      <div className="invite-search"><Search size={18} /><input aria-label="搜索在线牌友" placeholder="搜索昵称 / ID" value={query} onChange={e => setQuery(e.target.value)} maxLength={64} /><button aria-label="刷新在线牌友" disabled={loading} onClick={() => setRefresh(value => value + 1)}><RefreshCw size={17} /></button></div>
      <ul className="invite-peers" aria-label="在线牌友" aria-busy={loading}>{filtered.map(peer => {
        const pending = invitations.find(item => item.direction === 'outgoing' && item.table.code === view!.code && item.recipient.memberId === peer.memberId && item.status === 'pending');
        const expires = pending?.expiresAt ?? peer.expiresAt;
        const waiting = !!expires && seconds(expires) > 0;
        return <li key={peer.memberId} data-status={waiting ? 'pending' : peer.status}>
          <InviteAvatar name={peer.name} avatar={peer.avatar} />
          <div className="invite-peer-info"><strong title={peer.name}>{peer.name}</strong><small><i className={peer.status === 'busy' ? 'is-busy' : ''} />{peer.status === 'busy' ? '已在牌桌中' : '在线 · 空闲'}<span>ID {peer.memberId}</span></small></div>
          <button className="invite-send" aria-label={`邀请${peer.name}`} disabled={!!busy || now < sendAfter || waiting || peer.status !== 'available'} onClick={() => void invite(peer)}>{busy === peer.memberId ? '发送中…' : waiting ? `等待回应 ${seconds(expires!)}s` : peer.status === 'busy' ? '不可邀请' : peer.status === 'pending' ? '刷新中…' : '邀请'}</button>
        </li>;
      })}</ul>
      {!filtered.length && !listError && <div className="invite-state invite-empty" role="status">
        {loading ? <RefreshCw size={28} className="invite-loading-icon" aria-hidden="true" /> : <Users size={28} aria-hidden="true" />}
        <strong>{loading ? '正在获取在线牌友…' : query ? '未找到这位在线牌友' : '暂无可邀请的在线牌友'}</strong>
        {!loading && <p>{query ? '试试其他昵称或 ID' : '牌友在线后会自动出现在这里，也可以复制房号邀请。'}</p>}
      </div>}
    </>}
    {(error || listError) && <p className="invite-error" role="alert">{error || listError}</p>}
  </Dialog>;

  if (!incoming) return null;
  const valid = incoming.status === 'pending' && seconds(incoming.expiresAt) > 0 && !state.view;
  const otherInvites = invitations.filter(item => item.direction === 'incoming' && item.id !== incoming.id && item.status === 'pending' && seconds(item.expiresAt) > 0).length;
  const dismiss = () => {
    if (busy) return;
    if (valid && state.connected) void respond(false);
    else { setDismissed(value => [...value, incoming.id]); setIncomingId(null); }
  };
  return <Dialog title="牌桌邀请" variant="table-invite-dialog incoming-table-invite" close={dismiss} dismissOnBackdrop={false} footer={<>
    <button className="invite-decline" disabled={!!busy} onClick={dismiss}>{valid ? '拒绝' : '知道了'}</button>
    <button className="invite-accept" disabled={!valid || !state.connected || !!busy} onClick={() => void respond(true)}>{busy ? '正在处理…' : '接受并入座'}</button>
  </>}>
    <p className="invite-expiry" role="timer" data-expired={!valid || undefined}><Clock3 size={15} aria-hidden="true" />{valid ? `${seconds(incoming.expiresAt)} 秒后失效` : incoming.reason ?? '邀请已过期'}</p>
    {otherInvites > 0 && <p className="invite-prepare-note">另有 {otherInvites} 条邀请等待处理</p>}
    <div className="inviter-heading"><InviteAvatar name={incoming.inviter.name} avatar={incoming.inviter.avatar} /><div><h3>{incoming.inviter.name} 邀请你来一桌</h3><p>{incoming.table.name}</p></div></div>
    <dl className="invitation-summary"><div><dt>房间号</dt><dd>{incoming.table.code}</dd></div><div><dt>本桌玩法</dt><dd>{ruleDisplayName(incoming.table.rules)} · {incoming.table.rules.rounds} 把</dd></div><div><dt>当前人数</dt><dd>{incoming.table.seats.filter(Boolean).length}/4 人</dd></div></dl>
    <p className="invite-prepare-note">接受后自动入座，{incoming.table.settings.readyMode === 'auto' ? '按本桌规则自动准备' : '需手动准备后开局'}</p>
    <div className="invite-seat-preview">{incoming.table.seats.map((seat, index) => <div key={index}><InviteAvatar name={seat?.name ?? '空位'} avatar={seat?.avatar} /><small>{seat?.name ?? '等待加入'}</small></div>)}</div>
    {!state.connected && <p className="invite-error" role="status">正在恢复连接，请稍后回应。</p>}
    {error && <p className="invite-error" role="alert">{error}</p>}
  </Dialog>;
}
