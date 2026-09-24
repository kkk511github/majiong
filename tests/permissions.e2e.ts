import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { browserAccount, UI_PASSWORD } from "./browser-fixtures";

async function installToken(context: BrowserContext, token: string) {
  await context.addInitScript(
    (value) => localStorage.setItem("jinling:token", JSON.stringify(value)),
    token,
  );
}

async function expectNoCreateActions(page: Page) {
  await expect(page.getByRole("button", { name: "新建", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "开桌设置", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /创建.*桌|去开一桌|体验|练习/ })).toHaveCount(0);
}

for (const [width, height] of [[568, 320], [844, 390], [932, 430]]) {
  test(`开桌权限 ${width}：仅指定账号可开桌，其他管理员保留管理权限且不能转授权`, async ({
    page, context, browser, baseURL,
  }, testInfo) => {
    await page.setViewportSize({ width, height });
    const safeBottom = width > 700 ? 21 : 0;
    const safeInsets = { left: width > 700 ? 59 : 0, right: 0, bottom: safeBottom, top: 0 };
    const cdp = await context.newCDPSession(page);
    await cdp.send("Emulation.setSafeAreaInsetsOverride", {
      insets: safeInsets,
    });
    // Start with a fresh creator. Earlier invite scenarios may leave their
    // creator seated, which would correctly restore a room instead of home.
    await browserAccount(context, "开桌权限验收", true);
    const login = await context.request.post("/api/auth/login", {
      data: { username: "guanli@1", password: UI_PASSWORD },
    });
    expect(login.ok()).toBe(true);
    const owner = await login.json();
    expect(owner.account.canCreateTables).toBe(true);
    await installToken(context, owner.token);

    const otherContext = await browser.newContext({
      baseURL,
      viewport: { width, height },
      storageState: await context.storageState(),
    });
    const memberContext = await browser.newContext({
      baseURL,
      viewport: { width, height },
      storageState: await context.storageState(),
    });
    try {
      const otherAdmin = await browserAccount(otherContext, "其他管理员");
      const registration = await memberContext.request.post("/api/auth/register", {
        data: {
          username: "member-" + randomUUID().slice(0, 8),
          name: "普通牌友",
          password: UI_PASSWORD,
        },
      });
      expect(registration.ok()).toBe(true);
      const member = await registration.json();
      await installToken(memberContext, member.token);
      const otherPage = await otherContext.newPage();
      const memberPage = await memberContext.newPage();
      const otherCdp = await otherContext.newCDPSession(otherPage);
      await otherCdp.send("Emulation.setSafeAreaInsetsOverride", { insets: safeInsets });

      await page.goto("/");
      await page.getByRole("button", { name: "亲友房", exact: true }).click();
      await page.getByRole("button", { name: "新建", exact: true }).click();
      const tableName = `权限验收${width}`;
      await page.getByRole("textbox", { name: "玩法名称", exact: true }).fill(tableName);
      await page.getByRole("button", { name: "下一步", exact: true }).click();
      await page.getByRole("group", { name: "创建桌数", exact: true }).getByRole("button", { name: "1 桌", exact: true }).click();
      await page.getByRole("button", { name: "下一步", exact: true }).click();
      await page.getByRole("button", { name: "创建 1 桌", exact: true }).click();
      await expect(page.locator(".table-card").filter({ hasText: tableName })).toBeVisible();

      await otherPage.goto("/");
      await expect(otherPage.getByRole("button", { name: "房间大厅", exact: true })).toBeVisible();
      await expectNoCreateActions(otherPage);
      await otherPage.getByRole("button", { name: "房间大厅", exact: true }).click();
      await expectNoCreateActions(otherPage);
      const card = otherPage.locator(".table-card").filter({ hasText: tableName });
      await card.getByRole("button", { name: "收桌", exact: true }).click();
      await expect(otherPage.getByRole("dialog", { name: "收起这张桌子？", exact: true })).toBeVisible();
      await otherPage.getByRole("button", { name: "确认收桌", exact: true }).click();
      await expect(card).toHaveCount(0);
      await expect(otherPage.getByRole("dialog")).toHaveCount(0);
      await otherPage.getByRole("navigation").getByRole("button", { name: "我的", exact: true }).click();
      await expect(otherPage.getByRole("button", { name: "战队与会员", exact: true })).toBeVisible();
      await expect(otherPage.getByRole("button", { name: "开桌授权", exact: true })).toHaveCount(0);
      await otherPage.getByRole("button", { name: "开桌权限", exact: true }).click();
      await expect(otherPage.getByText("仅 guanli@1 可开桌", { exact: true })).toBeVisible();
      await expect(otherPage.getByRole("button", { name: /授予|收回/ })).toHaveCount(0);
      await expect(otherPage.locator(".permission-account")).toHaveCount(1);
      await expect(otherPage.locator(".permission-account")).toContainText("guanli@1");
      await otherPage.getByLabel("查询账号").fill(otherAdmin.account.username);
      await otherPage.getByRole("button", { name: "查找账号", exact: true }).click();
      await expect(otherPage.locator(".permission-badge")).toHaveText("不可开桌");
      const searchButton = (await otherPage.getByRole("button", { name: "查找账号", exact: true }).boundingBox())!;
      expect(searchButton.x).toBeGreaterThanOrEqual(safeInsets.left);
      expect(searchButton.y + searchButton.height).toBeLessThanOrEqual(height - safeBottom);
      await otherPage.screenshot({ path: testInfo.outputPath(`readonly-permissions-${width}.png`) });

      await page.getByRole("navigation").getByRole("button", { name: "我的", exact: true }).click();
      await page.getByRole("button", { name: "开桌权限", exact: true }).click();
      await expect(page.getByRole("button", { name: /授予|收回/ })).toHaveCount(0);
      await page.getByLabel("查询账号").fill(member.account.username);
      await page.getByRole("button", { name: "查找账号", exact: true }).click();
      await expect(page.locator(".permission-badge")).toHaveText("不可开桌");

      await memberPage.goto("/");
      await expect(memberPage.getByRole("button", { name: "房间大厅", exact: true })).toBeVisible();
      await expectNoCreateActions(memberPage);
      await memberPage.getByRole("button", { name: "房间大厅", exact: true }).click();
      await expectNoCreateActions(memberPage);
      await memberPage.getByRole("navigation").getByRole("button", { name: "我的", exact: true }).click();
      await expect(memberPage.getByLabel("管理入口", { exact: true })).toHaveCount(0);
    } finally {
      await otherContext.close();
      await memberContext.close();
    }
  });
}
