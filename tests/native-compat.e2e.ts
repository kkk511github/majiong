import { expect, test } from "@playwright/test";

test("the built client opens a playable table without newer WebView APIs", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    Object.defineProperty(crypto, "randomUUID", { configurable: true, value: undefined });
    Object.defineProperty(Array.prototype, "at", { configurable: true, value: undefined });
    Object.defineProperty(globalThis, "structuredClone", { configurable: true, value: undefined });
  });
  await page.goto("/");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "同意并进入", exact: true }).click();
  await page.getByRole("button", { name: /先去单人练习/ }).click();
  await expect(page.locator(".cocos-loading")).toHaveCount(0, { timeout: 45000 });
  await expect(page.locator("#cocos-table-board")).toBeVisible();
  await expect(page.frameLocator('iframe[title="金陵麻将牌桌"]').locator("canvas")).toBeVisible();
  await expect(page.locator(".recovery")).toHaveCount(0);
  expect(errors).toEqual([]);
});
