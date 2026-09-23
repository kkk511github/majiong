import { test, expect } from './browser-fixtures';

// Requires the gated server from playwright.client-version.config.ts; keep
// this out of the default *.e2e.ts suite whose server allows older clients.

test('server-required update cannot be dismissed or bypassed by reconnecting', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  let connections = 0;
  page.on('websocket', socket => { if (new URL(socket.url()).pathname === '/ws') connections++; });
  await page.goto('/');
  const dialog = page.getByRole('dialog', { name: '请更新后继续', exact: true });
  await expect(dialog).toContainText('9.0.0');
  await expect(dialog.getByRole('button', { name: '关闭', exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape'); await expect(dialog).toBeVisible();
  const button = dialog.getByRole('button', { name: '刷新到最新版' });
  const visible = await button.evaluate(el => {
    const b = el.getBoundingClientRect();
    return b.bottom <= innerHeight && el.contains(document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2));
  });
  expect(visible).toBe(true);
  await page.evaluate(async () => {
    const { client } = await import('/src/game-client.ts' as string);
    client.browseTables('测试'); client.retryNetwork();
  });
  await page.waitForTimeout(1800);
  expect(connections).toBe(1);
  expect(await page.evaluate(async () => {
    const { client } = await import('/src/game-client.ts' as string);
    return { connected: client.state.connected, view: client.state.view };
  })).toEqual({ connected: false, view: null });
  await button.click();
  await expect(page.getByRole('dialog', { name: '请更新后继续', exact: true })).toContainText('9.0.0');
});
