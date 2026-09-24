import { test, expect } from "./browser-fixtures";
import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";

const capture = "test-results/lobby-game";
test.beforeAll(() => mkdirSync(capture, { recursive: true }));

function fixtureRole(role: "member" | "admin", creator = false) {
  const db = new DatabaseSync(resolve(process.env.MAHJONG_E2E_DATABASE ?? "../../work/accounts-e2e.sqlite"));
  try {
    // Change only this test's freshly provisioned account in the isolated fixture DB.
    db.prepare("UPDATE accounts SET role=?, username=? WHERE username='guanli@1'")
      .run(role, creator ? "guanli@1" : `qa-layout-${randomUUID()}`);
  } finally { db.close(); }
}

test("普通成员只有房间大厅，进入后仍可房号加入且没有新建", async ({ page }) => {
  fixtureRole("member");
  await page.setViewportSize({ width: 932, height: 430 });
  await page.goto("/");
  await expect(page.getByRole("region", { name: "联机首页" })).toBeVisible();
  await expect(page.locator(".game-entrances > button")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "亲友房", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /商城|充值|斗地主|福利/ })).toHaveCount(0);
  await page.screenshot({ path: `${capture}/member.png` });
  await page.getByRole("button", { name: "房间大厅", exact: true }).click();
  await expect(page.getByRole("region", { name: "牌桌大厅" })).toBeVisible();
  await expect(page.getByRole("button", { name: "开桌设置", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "房号加入", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "加入好友房间" })).toBeVisible();
});

test("普通管理员有亲友房入口，但不额外获得新建权限", async ({ page }) => {
  fixtureRole("admin");
  await page.setViewportSize({ width: 932, height: 430 });
  await page.goto("/");
  await expect(page.locator(".game-entrances > button")).toHaveCount(2);
  await page.getByRole("button", { name: "亲友房", exact: true }).click();
  await expect(page.getByRole("region", { name: "亲友房", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "新建", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "房号加入", exact: true })).toBeVisible();
});

for (const [width, height, left, right] of [[568, 320, 0, 0], [932, 430, 59, 59]]) {
  test(`管理员亲友房新建保留原参数与草稿，安全区 ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    const session = await page.context().newCDPSession(page);
    await session.send("Emulation.setSafeAreaInsetsOverride", { insets: { left, right, top: 0, bottom: 12 } });
    const sent: any[] = [];
    await page.routeWebSocket("**/ws", socket => {
      const server = socket.connectToServer();
      socket.onMessage(raw => {
        const message = JSON.parse(String(raw));
        if (message.type === "createTables") sent.push(message);
        server.send(raw);
      });
    });
    await page.goto("/");
    await expect(page.locator(".game-entrances > button")).toHaveCount(2);
    await expect.poll(() => page.locator(".game-entry img").evaluateAll(images =>
      images.every(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0),
    )).toBe(true);
    await page.screenshot({ path: `${capture}/admin-${width}.png` });
    await page.getByRole("button", { name: "亲友房", exact: true }).click();
    const create = page.getByRole("button", { name: "新建", exact: true });
    await expect(create).toBeEnabled();
    await create.click();
    const dialog = page.getByRole("dialog", { name: "开桌设置", exact: true });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("玩法名称", { exact: true }).fill(`界面验收${width}`);
    await page.screenshot({ path: `${capture}/setup-rules-${width}.png` });
    await dialog.getByRole("button", { name: "下一步", exact: true }).click();
    await dialog.getByRole("button", { name: "1 桌", exact: true }).click();
    await dialog.getByLabel("整桌超时额度秒数", { exact: true }).fill("45");
    await dialog.getByRole("switch", { name: "播放开局动画", exact: true }).click();
    await page.screenshot({ path: `${capture}/setup-table-${width}.png` });
    await dialog.getByRole("button", { name: "下一步", exact: true }).click();
    const unsafe = await page.locator(".game-room-setup,.game-room-setup .setup-footer button").evaluateAll((elements, safe) =>
      elements.filter(element => {
        const rect = element.getBoundingClientRect();
        return rect.left < safe.left || rect.right > innerWidth - safe.right || rect.top < 0 || rect.bottom > innerHeight - 12;
      }).map(element => element.className), { left, right });
    expect(unsafe).toEqual([]);
    await expect(dialog.locator(".setup-review")).toContainText("累计超时额度 45 秒");
    await dialog.getByRole("button", { name: "创建 1 桌", exact: true }).dblclick();
    await expect(dialog).toHaveCount(0);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ count: 1, settings: { name: `界面验收${width}`, overtimeSeconds: 45, openingAnimation: false }, rules: { id: "nj-garden-b-v3", rounds: 8, turnSeconds: 10 } });
    await expect(page.locator(".table-card").filter({ hasText: `界面验收${width}` })).toHaveCount(1);
    await page.screenshot({ path: `${capture}/rooms-${width}.png` });
    await create.click();
    await expect(dialog.getByLabel("玩法名称", { exact: true })).toHaveValue(`界面验收${width}`);
  });
}
