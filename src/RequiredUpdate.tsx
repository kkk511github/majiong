import { useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Dialog } from './Dialog';
import { openAppDistributionPage } from './app-update';
import type { ClientState } from './game-client';
import './app-update.css';

export function RequiredUpdate({ policy, retry }: { policy: NonNullable<ClientState['updateRequired']>; retry: () => void }) {
  const [error, setError] = useState('');
  const native = Capacitor.isNativePlatform();
  return <Dialog title="请更新后继续" variant="app-update-dialog" close={() => {}} hideClose dismissOnBackdrop={false}
    footer={<div className="app-update-actions"><button className="secondary" onClick={retry}>重新检查</button><button className="primary" onClick={() => {
      if (!native) { window.location.reload(); return; }
      void openAppDistributionPage().catch(e => setError((e as Error).message || '无法打开安装页面，请联系管理员。'));
    }}>{native ? '前往更新' : '刷新到最新版'}</button></div>}>
    <p>{policy.message}</p>
    <p>{native ? '更新完成后重新打开应用。打开安装页面不代表已完成更新，未更新前无法进入牌桌。' : '请刷新页面载入新版本；如果仍出现此提示，请联系管理员确认网页版本已经部署。'}</p>
    {error && <p role="alert">{error}</p>}
  </Dialog>;
}
