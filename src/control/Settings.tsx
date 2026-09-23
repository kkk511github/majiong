import { useEffect, useState } from 'react';
import type { ClientUpdateSettings } from '../../shared/client-update';
import { ControlApi, errorMessage } from './api';
import { displayTime } from './model';
import { ErrorNotice, Loading, Modal, Notice } from './ui';

export function Settings({ api }: { api: ControlApi }) {
  const [saved, setSaved] = useState<ClientUpdateSettings | null>(null);
  const [enabled, setEnabled] = useState(false), [version, setVersion] = useState('');
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [error, setError] = useState(''), [success, setSuccess] = useState('');
  const [reload, setReload] = useState(0), [confirm, setConfirm] = useState(false), [verified, setVerified] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    api.get<ClientUpdateSettings>('/settings/client-update', controller.signal).then(value => {
      if (controller.signal.aborted) return;
      setSaved(value); setEnabled(value.enabled); setVersion(value.minimumVersion);
    }).catch(e => { if (!controller.signal.aborted) setError(errorMessage(e)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [api, reload]);
  async function save() {
    if (!saved || busy) return;
    setBusy(true); setError(''); setSuccess('');
    try {
      const value = await api.post<ClientUpdateSettings>('/settings/client-update', {
        enabled, minimumVersion: version.trim(), revision: saved.revision,
      });
      setSaved(value); setEnabled(value.enabled); setVersion(value.minimumVersion); setConfirm(false);
      setSuccess(value.enabled ? '已开启强制更新。进行中的旧桌可打完，新入桌立即检查版本。' : '已关闭强制更新。被拦截的玩家可重新检查或重开应用后进入。');
    } catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  }
  const valid = (!enabled && !version.trim()) || /^(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})$/.test(version.trim());
  return <section className="control-update-settings">
    <div className="control-section-title"><h2>客户端更新设置</h2></div>
    <Notice>旧桌指已经开局、尚未整桌结束的牌桌。允许原玩家打完全部把数，并支持断线重连；等待开局、重新开桌和加入其他桌不在保护范围内。</Notice>
    {loading ? <Loading /> : <>
      <ErrorNotice retry={() => setReload(n => n + 1)}>{error}</ErrorNotice>
      {success && <Notice success>{success}</Notice>}
      {saved && <form onSubmit={event => {
        event.preventDefault(); if (!valid || busy) return;
        if (enabled) { setVerified(false); setConfirm(true); } else void save();
      }}>
        <label className="control-update-switch"><input type="checkbox" role="switch" checked={enabled} disabled={busy} onChange={event => { setEnabled(event.target.checked); setSuccess(''); }} />强制更新</label>
        <p className="control-muted">关闭时兼容旧版；开启后，低于最低版本或未上报版本的客户端不能进入新牌桌。保存立即生效，无需重启服务。</p>
        <label className="control-field"><span>最低允许版本</span><input value={version} disabled={busy} maxLength={20} placeholder="例如 0.7.37" onChange={event => { setVersion(event.target.value); setSuccess(''); }} /><small>请先发布并验证 Android、已签名 iOS 安装包和网页版，再提高最低版本。</small></label>
        <p className="control-muted">当前已保存：{saved.enabled ? `开启 · 最低 ${saved.minimumVersion}` : '关闭'} · 最近修改：{displayTime(saved.updatedAt)}</p>
        <button className="control-button control-primary" type="submit" disabled={!valid || busy}>{busy ? '保存中…' : '保存更新设置'}</button>
      </form>}
    </>}
    {confirm && <Modal title="确认启用强制更新" busy={busy} onClose={() => setConfirm(false)}>
      <p>最低版本将设为 {version.trim()}。未达标的新入桌请求立即被拦截；现有对局保护到整桌结束，结束后必须更新。</p>
      <label className="control-update-switch"><input type="checkbox" checked={verified} disabled={busy} onChange={e => setVerified(e.target.checked)} />我已确认 Android、iOS 和网页新版均已发布且可用</label>
      <ErrorNotice>{error}</ErrorNotice>
      <button className="control-button control-primary" disabled={!verified || busy} onClick={() => void save()}>{busy ? '保存中…' : '确认启用并保存'}</button>
    </Modal>}
  </section>;
}
