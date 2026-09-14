import { test, expect } from "./browser-fixtures";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
const captures = "test-results/screenshots";
test.beforeAll(() => mkdirSync(captures, { recursive: true }));
for (const [width, height] of [
  [568, 320],
  [844, 390],
  [932, 430],
]) {
  test(`开桌授权 ${width}：管理员授权与收回实时生效，按钮在横屏安全区内`, async ({
    page,
    browser,
  }) => {
    await page.setViewportSize({ width, height });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setSafeAreaInsetsOverride", {
      insets: {
        left: width > 700 ? 59 : 0,
        right: 0,
        bottom: width > 700 ? 21 : 0,
        top: 0,
      },
    });
    const username = "grant-" + randomUUID().slice(0, 8),
      context = await browser.newContext({
        viewport: { width: 844, height: 390 },
      });
    try {
      const registration = await context.request.post(
        "http://127.0.0.1:5178/api/auth/register",
        {
          data: {
            username,
            name: "授权牌友",
            password: "Permission-Test-Password-42",
          },
        },
      );
      expect(registration.ok()).toBe(true);
      const member = await registration.json();
      await context.addInitScript(
        (token) => localStorage.setItem("jinling:token", JSON.stringify(token)),
        member.token,
      );
      const memberPage = await context.newPage();
      await memberPage.goto("http://127.0.0.1:5178");
      await expect(
        memberPage.getByRole("button", { name: "进入牌桌大厅", exact: true }),
      ).toBeVisible();
      await page.goto("/");
      await page
        .getByRole("navigation")
        .getByRole("button", { name: "我的", exact: true })
        .click();
      await page.getByRole("button", { name: "开桌授权", exact: true }).click();
      await page.getByLabel("授权账号").fill(username.toUpperCase());
      await page.getByRole("button", { name: "查找账号", exact: true }).click();
      const grant = page.getByRole("button", {
        name: "授予开桌权限",
        exact: true,
      });
      await expect(grant).toBeVisible();
      const b = (await grant.boundingBox())!;
      expect(b.y + b.height).toBeLessThanOrEqual(
        height - (width > 700 ? 21 : 0),
      );
      await grant.click();
      await expect(page.locator(".permission-feedback [role=status]")).toContainText("已获得开桌权限");
      await expect(
        memberPage.getByRole("button", { name: "开一桌，等朋友", exact: true }),
      ).toBeVisible();
      await page.screenshot({
        path: `${captures}/table-permission-${width}.png`,
      });
      await memberPage
        .getByRole("button", { name: "开一桌，等朋友", exact: true })
        .click();
      await expect(memberPage.getByRole("dialog")).toBeVisible();
      await page
        .getByRole("button", { name: "收回开桌权限", exact: true })
        .click();
      await expect(page.locator(".permission-feedback [role=status]")).toContainText("已收回开桌权限");
      await expect(memberPage.getByRole("dialog")).toHaveCount(0);
      await expect(
        memberPage.getByRole("button", { name: "进入牌桌大厅", exact: true }),
      ).toBeVisible();
      await memberPage
        .getByRole("navigation")
        .getByRole("button", { name: "我的", exact: true })
        .click();
      await expect(
        memberPage.getByRole("button", { name: "开桌授权", exact: true }),
      ).toHaveCount(0);
    } finally {
      await context.close();
    }
  });
}
