import { useEffect, useState } from 'react';
import type { AnnouncementReadPage, AnnouncementReadStats, ControlAnnouncement } from '../../shared/announcements';
import { ControlApi, errorMessage } from './api';
import { displayTime } from './model';
import { Empty, ErrorNotice, Loading, Modal } from './ui';

export function AnnouncementReads({ api, item, close, updated }: {
  api: ControlApi; item: ControlAnnouncement; close: () => void;
  updated: (id: string, stats: AnnouncementReadStats) => void;
}) {
  const [data, setData] = useState<AnnouncementReadPage | null>(null);
  const [status, setStatus] = useState('read'), [q, setQ] = useState(''), [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [reload, setReload] = useState(0);
  const [asOf, setAsOf] = useState(0);
  const revision = item.readStats!.revision;
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError('');
    const query = new URLSearchParams({ revision: String(revision), status, q, page: String(page) });
    api.get<AnnouncementReadPage>(`/announcements/${encodeURIComponent(item.id)}/readers?${query}`, controller.signal)
      .then(result => {
        if (controller.signal.aborted) return;
        setData(result); setAsOf(Date.now()); updated(result.id, result.stats);
      }).catch(e => { if (!controller.signal.aborted) setError(errorMessage(e)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [api, item.id, revision, status, q, page, reload, updated]);
  const stats = data?.stats ?? item.readStats!;
  return <Modal title="公告已读确认" wide onClose={close}>
    <h3 className="control-read-title">{data?.title ?? item.publishedTitle}</h3>
    <p className="control-muted">发布版本 v{revision}{item.status === 'withdrawn' ? ' · 已撤回，以下为最后发布版本的记录' : ''}</p>
    <div className="control-read-stats" aria-label="阅读统计">
      <strong>已读 {stats.readCount} 人</strong><span>未读 {stats.unreadCount} 人</span><span>共 {stats.totalCount} 人</span>
    </div>
    <p className="control-muted">按当前可登录账号统计（含管理员，不含停用、已删除及待设置初始密码的账号）。只统计该发布版本成功回传的已读确认，重复确认不重复计数；不是打开次数。</p>
    <div className="control-read-filters">
      <label className="control-field"><span>阅读状态</span><select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}>
        <option value="read">已读</option><option value="unread">未读</option><option value="all">全部</option>
      </select></label>
      <label className="control-field"><span>搜索牌友</span><input value={q} maxLength={100} placeholder="昵称、账号或玩家ID" onChange={e => { setQ(e.target.value); setPage(1); }} /></label>
      <button className="control-button" disabled={loading} onClick={() => setReload(n => n + 1)}>刷新阅读记录</button>
    </div>
    <ErrorNotice retry={() => setReload(n => n + 1)}>{error}</ErrorNotice>
    {loading ? <Loading>正在加载阅读记录…</Loading> : !error && data && <>
      {!data.readers.length ? <Empty>{q ? '没有符合搜索条件的牌友。' : status === 'read' ? '暂无已读确认。' : status === 'unread' ? '当前没有未读账号。' : '当前没有可统计的账号。'}</Empty> :
        <div className="control-table-scroll"><table className="control-table"><thead><tr><th>玩家ID</th><th>昵称 / 账号</th><th>确认时间</th></tr></thead>
          <tbody>{data.readers.map(person => <tr key={person.id}><td>{person.memberId ?? '—'}</td><td><strong>{person.name}</strong><small className="control-table-sub">{person.username}</small></td><td className="control-table-date">{person.readAt === null ? '未读' : displayTime(person.readAt)}</td></tr>)}</tbody>
        </table></div>}
      <div className="control-read-pagination"><span>筛选结果 {data.total} 人 · 第 {data.page} 页</span>
        <button className="control-button" disabled={page <= 1} onClick={() => setPage(n => n - 1)}>上一页</button>
        <button className="control-button" disabled={page * data.pageSize >= data.total} onClick={() => setPage(n => n + 1)}>下一页</button>
      </div>
      <p className="control-muted">统计时间：{displayTime(asOf)}。公告重新发布后，新版需要重新确认。</p>
    </>}
  </Modal>;
}
