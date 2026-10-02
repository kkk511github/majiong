import { expect, test, UI_PASSWORD } from './browser-fixtures';

test('真实改密：旧Socket已撤销但HTTP新token延迟时仍能完成登录轮换', async ({ page }) => {
  await page.goto('/');
  await expect.poll(() => page.evaluate(async () => {
    const { client } = await import('/src/game-client.ts' as string);
    return client.state.connected && !!client.state.account;
  })).toBe(true);
  await page.getByRole('navigation').getByRole('button', { name: '我的', exact: true }).click();
  await page.getByRole('button', { name: '账号安全', exact: true }).click();
  await page.getByLabel('原密码', { exact: true }).fill(UI_PASSWORD);
  await page.getByLabel('新密码', { exact: true }).fill('Stability-password-test-2026');
  await page.getByLabel('确认新密码', { exact: true }).fill('Stability-password-test-2026');
  let observedRevocation = false;
  await page.route('**/api/auth/password', async route => {
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    await expect.poll(() => page.evaluate(async () => {
      const { client } = await import('/src/game-client.ts' as string);
      return client.state.connected;
    })).toBe(false);
    observedRevocation = true;
    await route.fulfill({ response });
  });
  await page.getByRole('button', { name: '保存新密码', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(observedRevocation).toBe(true);
  await expect.poll(() => page.evaluate(async () => {
    const { client } = await import('/src/game-client.ts' as string);
    return { connected: client.state.connected, busy: client.state.authBusy, error: client.state.authError };
  })).toEqual({ connected: true, busy: false, error: '' });
});
