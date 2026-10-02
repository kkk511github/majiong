import { test, expect } from './browser-fixtures';

for (const width of [568, 844, 1280]) {
  test(`战绩房间号保持16px防聚焦缩放，查询后释放输入焦点 ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 568 ? 320 : 390 });
    await page.goto('/');
    await page.getByRole('button', { name: '战绩', exact: true }).click();
    const input = page.getByRole('textbox', { name: '战绩房间号', exact: true });
    await expect(input).toBeVisible();
    const before = await page.evaluate(() => ({ width: innerWidth, scale: visualViewport?.scale ?? 1 }));
    // Desktop WebKit does not emulate iOS keyboard auto-zoom. Assert its CSS
    // prevention invariant, without claiming physical iPhone verification.
    expect(await input.evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
    await input.fill('123456');
    await expect(input).toBeFocused();
    await input.press('Enter');
    await expect(input).not.toBeFocused();
    await expect(input).toHaveValue('123456');
    expect(await page.evaluate(() => ({ width: innerWidth, scale: visualViewport?.scale ?? 1 }))).toEqual(before);
    const viewport = await page.locator('meta[name="viewport"]').getAttribute('content');
    expect(viewport).not.toMatch(/user-scalable\s*=\s*no|maximum-scale\s*=\s*1(?:,|$)/);
    await page.getByRole('button', { name: '牌局回放', exact: true }).click();
    const replayInput = page.getByLabel('牌局 ID', { exact: true });
    expect(await replayInput.evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
  });
}
