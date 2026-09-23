import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TableControls } from '../src/TableControls';
import { fullMeldFixture } from './previews/table-full-meld-fixture';

const states = [
  { phase: 'playing', trustee: false, disabled: false, label: '开启托管', pressed: 'false' },
  { phase: 'playing', trustee: true, disabled: false, label: '取消托管', pressed: 'true' },
  { phase: 'playing', trustee: false, disabled: true, label: '开启托管', pressed: 'false' },
  { phase: 'ended', trustee: false, disabled: true, label: '本局结算', pressed: undefined },
  { phase: 'finished', trustee: true, disabled: true, label: '本局结算', pressed: undefined },
];

describe('single-button table toolbar', () => {
  it.each(states)('$phase / trustee $trustee retains only $label', ({ phase, trustee, disabled, label, pressed }) => {
    const state = fullMeldFixture('pung');
    state.phase = phase; state.trusteeDisabled = disabled; state.players[0].trustee = trustee;
    const html = renderToStaticMarkup(createElement(TableControls, {
      state, onCommand: () => {}, connectionQuality: '网络较慢',
    }));
    const toolbar = html.match(/<nav\b[^>]*aria-label="牌桌工具"[^>]*>[\s\S]*?<\/nav>/)?.[0];
    expect(toolbar).toBeDefined();
    const buttons = [...toolbar!.matchAll(/<button\b[^>]*>/g)].map(match => match[0]);
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toContain(`aria-label="${label}"`);
    if (pressed === undefined) expect(buttons[0]).not.toContain('aria-pressed');
    else expect(buttons[0]).toContain(`aria-pressed="${pressed}"`);
    expect(buttons[0].includes('disabled=""')).toBe(disabled && phase === 'playing');
    for (const removed of ['table-back', 'table-tool-settings', 'aria-label="牌桌设置"', 'aria-label="牌局信息"',
      'aria-label="对局记录"', '>大厅<', 'menu="table"', 'menu="events"'])
      expect(toolbar).not.toContain(removed);
    expect(html).toContain('网络较慢');
    expect(html).toContain('role="status"');
  });
});
