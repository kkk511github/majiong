import { test, expect } from '@playwright/test';
import { LEGAL_STORAGE_KEY, LEGAL_VERSION } from '../src/legal-copy';
import { act, viewFor } from '../shared/engine';
import { anchorGame, claimFourth, discardAnchor, advanceToAnchorDraw, WAIT_WAN } from './fixtures/global-anchor-game';

test('安装包最终资源能显示黄色架牌，换听同步去黄', async ({ page }) => {
  const errors: string[] = [], missing: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('response', r => { if (r.status() >= 400) missing.push(r.url()); });
  const g = discardAnchor(claimFourth(anchorGame('change'), 'change'));
  const account = { id: g.players[0]!.id, username: 'anchor-release', name: '架牌验收', role: 'member', mustChangePassword: false, canCreateTables: false, canPlay: true };
  await page.addInitScript(({ key, version }) => {
    localStorage.setItem('jinling:token', JSON.stringify('release-fixture-token'));
    localStorage.setItem(key, JSON.stringify({ version, acceptedAt: '2026-09-19' }));
  }, { key: LEGAL_STORAGE_KEY, version: LEGAL_VERSION });
  // The exact native build points at production; intercept all network APIs.
  await page.route('**/api/**', route => route.fulfill({ status: 200, json: { account } }));
  let socket: Parameters<Parameters<typeof page.routeWebSocket>[1]>[0];
  await page.routeWebSocket('**/ws', ws => {
    socket = ws;
    ws.onMessage(raw => {
      if (JSON.parse(String(raw)).type === 'hello') {
        ws.send(JSON.stringify({ type: 'session', id: account.id, name: account.name, account, token: 'release-fixture-token', tableLobby: true, roomCode: g.code }));
        ws.send(JSON.stringify({ type: 'state', state: viewFor(g, 0) }));
      }
    });
  });
  await page.goto('/');
  await expect(page.locator('#cocos-table-board')).toBeVisible();
  await expect(page.locator('.cocos-loading')).toHaveCount(0, { timeout: 45000 });
  const yellow = async () => {
    const frame = page.frames().find(f => f.url().includes('/cocos-table/index.html'));
    return frame?.evaluate(async () => {
      const cc = await (window as any).System.import('cc');
      const c = cc.director.getScene()?.getChildByName('Canvas')?.getComponent('TableScene');
      if (!c) return [];
      return ((window as any).__JINLING_TABLE_LAYOUT__ ?? []).filter((t: any) => t.globalAnchor)
        .map((t: any) => ({ tile: t.tile, color: c.nodes.get(t.id).getComponent(cc.Sprite).color.toHEX('#rrggbb') }));
    });
  };
  await expect.poll(yellow).toEqual([{ tile: 92, color: 'ffe16a' }]);
  const changed = act(advanceToAnchorDraw(g), 0, { type: 'discard', tile: WAIT_WAN });
  socket!.send(JSON.stringify({ type: 'state', state: viewFor(changed, 0) }));
  await expect.poll(yellow).toEqual([]);
  expect(missing).toEqual([]);
  expect(errors).toEqual([]);
});
