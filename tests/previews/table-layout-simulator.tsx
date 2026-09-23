import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CocosTable } from '../../src/CocosTable';
import { busyTableFixture, fullMeldFixture } from './table-full-meld-fixture';
import './table-layout-simulator.css';

const scenes = [
  { id: 'pung', label: '四家满碰', detail: '每家4组碰牌＋余手牌＋摸牌' },
  { id: 'kong', label: '四家满明杠', detail: '每家4组明杠，四张并排' },
  { id: 'busy', label: '忙碌牌河', detail: '每家27张弃牌，检查第11／21张换行' },
] as const;
type Scene = typeof scenes[number]['id'];

function LayoutSimulator() {
  const [scene, setScene] = useState<Scene>('pung');
  const state = useMemo(() => ({
    ...(scene === 'busy' ? busyTableFixture() : fullMeldFixture(scene)),
    key: `native-layout-${scene}`, disabled: true, externalControls: true,
  }), [scene]);
  const selected = scenes.find(item => item.id === scene)!;
  return <main className="layout-simulator">
    <header>
      <div><strong>原尺寸布局检查</strong><small>压力演示，不是实战发牌</small></div>
      <nav aria-label="极限牌桌场景">{scenes.map(item =>
        <button key={item.id} aria-pressed={scene === item.id} onClick={() => setScene(item.id)}>{item.label}</button>,
      )}</nav>
      <p aria-live="polite">{selected.detail}</p>
    </header>
    <section className="layout-simulator-table" aria-label={selected.label}>
      <CocosTable state={state} onCommand={() => {}} />
    </section>
  </main>;
}

document.documentElement.dataset.runtime = 'web';
const root = createRoot(document.getElementById('root')!);
root.render(<LayoutSimulator />);
if (import.meta.hot) import.meta.hot.dispose(() => root.unmount());
