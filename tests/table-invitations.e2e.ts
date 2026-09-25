import { test, expect, browserAccount, type Page } from './browser-fixtures';
import { LEGAL_STORAGE_KEY, LEGAL_VERSION } from '../src/legal-copy';
import { mkdirSync } from 'node:fs';

async function connected(page: Page) {
  await page.goto('/');
  await page.waitForFunction(async () => {
    const { client } = await import('/src/game-client.ts' as string);
    return client.state.connected && client.state.tableInvitesAvailable;
  });
}
async function fits(page: Page, name: string) {
  const dialog = page.getByRole('dialog', { name, exact: true });
  const result = await dialog.evaluate(element => {
    const r = element.getBoundingClientRect();
    return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: innerWidth, height: innerHeight,
      buttons: [...element.querySelectorAll('.modal-footer button')].map(button => {
        const b = button.getBoundingClientRect();
        return { visible: button.contains(document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2)), h: b.height };
      }) };
  });
  expect(result.x).toBeGreaterThanOrEqual(0); expect(result.y).toBeGreaterThanOrEqual(0);
  expect(result.right).toBeLessThanOrEqual(result.width); expect(result.bottom).toBeLessThanOrEqual(result.height);
  for (const button of result.buttons) { expect(button.visible).toBe(true); expect(button.h).toBeGreaterThanOrEqual(44); }
}

for (const [width, height] of [[844, 390], [568, 320]]) {
  test(`在线邀请 ${width}：真实双端拒绝与接受入座，横屏按钮可用`, async ({ page, browser }) => {
    await page.setViewportSize({ width, height });
    const contexts = await Promise.all([0, 1].map(() => browser.newContext({ viewport: { width, height } })));
    try {
      const guests: Page[] = [];
      for (const [i, context] of contexts.entries()) {
        await browserAccount(context, i ? '接受演示牌友' : '拒绝演示牌友', false, 'member');
        await context.addInitScript(({ key, version }) => localStorage.setItem(key, JSON.stringify({ version, acceptedAt: '2026-09-23' })), { key: LEGAL_STORAGE_KEY, version: LEGAL_VERSION });
        const guest = await context.newPage(); guests.push(guest); await connected(guest);
      }
      await connected(page);
      await page.evaluate(async () => {
        const { client } = await import('/src/game-client.ts' as string);
        client.createTables('金陵牌友', { name: '邀请功能验证', readyMode: 'manual', autoRenew: false, kickUnready: false }, { rounds: 4 }, 1);
      });
      await expect.poll(() => page.evaluate(async () => (await import('/src/game-client.ts' as string)).client.state.createdTables.length)).toBe(1);
      const code = await page.evaluate(async () => {
        const { client } = await import('/src/game-client.ts' as string), code = client.state.createdTables[0];
        client.joinTable('金陵牌友', code, 0); return code;
      });
      await page.getByRole('button', { name: '邀请在线牌友', exact: true }).click();
      const outgoing = page.getByRole('dialog', { name: '邀请在线牌友', exact: true });
      await expect(outgoing).toContainText(code); await fits(page, '邀请在线牌友');
      await outgoing.getByLabel('搜索在线牌友').fill('拒绝演示牌友');
      await outgoing.getByRole('button', { name: '邀请拒绝演示牌友', exact: true }).click();
      const received = guests[0].getByRole('dialog', { name: '牌桌邀请', exact: true });
      await expect(received).toContainText(code); await fits(guests[0], '牌桌邀请');
      await received.getByRole('button', { name: '拒绝', exact: true }).click();
      await expect(received).toHaveCount(0);
      expect(await guests[0].evaluate(async () => (await import('/src/game-client.ts' as string)).client.state.view)).toBeNull();
      await expect(page.getByRole('status').filter({ hasText: '拒绝演示牌友暂不加入' })).toBeVisible();

      await outgoing.getByLabel('搜索在线牌友').fill('接受演示牌友');
      await outgoing.getByRole('button', { name: '邀请接受演示牌友', exact: true }).click();
      const incoming = guests[1].getByRole('dialog', { name: '牌桌邀请', exact: true });
      await expect(incoming).toContainText('需手动准备后开局'); await fits(guests[1], '牌桌邀请');
      mkdirSync('test-results/screenshots', { recursive: true });
      await page.screenshot({ path: `test-results/screenshots/online-invite-sender-${width}.png` });
      await guests[1].screenshot({ path: `test-results/screenshots/online-invite-recipient-${width}.png` });
      await incoming.getByRole('button', { name: '接受并入座', exact: true }).click();
      await expect(incoming).toHaveCount(0);
      await expect(guests[1].getByRole('button', { name: '我准备好了', exact: true })).toBeVisible();
      const joined = await guests[1].evaluate(async () => (await import('/src/game-client.ts' as string)).client.state.view);
      expect(joined.code).toBe(code); expect(joined.players[joined.me].ready).toBe(false);
      await expect(outgoing).toContainText('已入座 2/4');
    } finally { await Promise.all(contexts.map(context => context.close())); }
  });
}
