import { test, expect, legacyRoom } from "./browser-fixtures";
import { mkdirSync } from "node:fs";

const capture = "test-results/game-ui";
test.beforeAll(() => mkdirSync(capture, { recursive: true }));
for (const [width, height] of [[568, 320], [932, 430]]) {
  test(`配套页面风格及可操作性 ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "主导航" });
    await nav.getByRole("button", { name: "我的", exact: true }).click();
    await expect(page.getByRole("region", { name: "个人设置" })).toBeVisible();
    await page.screenshot({ path: `${capture}/profile-${width}.png` });
    await page.getByRole("button", { name: "声音设置", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveClass(/game-dialog/);
    await page.screenshot({ path: `${capture}/audio-${width}.png` });
    await page.getByRole("button", { name: "关闭", exact: true }).click();
    await nav.getByRole("button", { name: "玩法", exact: true }).click();
    await expect(page.getByRole("heading", { name: "本桌怎么玩" })).toBeVisible();
    await page.screenshot({ path: `${capture}/rules-${width}.png` });
    await nav.getByRole("button", { name: "战绩", exact: true }).click();
    await expect(page.getByRole("region", { name: "战绩中心" })).toBeVisible();
    await expect(page.locator(".records-list")).toHaveAttribute("aria-busy", "false");
    await page.screenshot({ path: `${capture}/records-${width}.png` });
    await nav.getByRole("button", { name: "牌桌", exact: true }).click();
    await page.getByRole("button", { name: "设置", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "牌桌设置", exact: true })).toBeVisible();
    await page.screenshot({ path: `${capture}/settings-${width}.png` });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });

  test(`登录注册沿用相同美术且保留输入校验 ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.route("**/api/auth/session", route => route.fulfill({ status: 401, json: { error: "请登录" } }));
    await page.goto("/");
    await expect(page.getByRole("tab", { name: "账号登录" })).toBeVisible();
    await page.screenshot({ path: `${capture}/login-${width}.png` });
    await page.getByRole("tab", { name: "注册账号" }).click();
    await expect(page.getByLabel("确认密码", { exact: true })).toBeVisible();
    await page.screenshot({ path: `${capture}/register-${width}.png` });
    for (const label of ["账号", "牌桌昵称", "确认密码"])
      await expect(page.getByLabel(label, { exact: true })).toHaveAttribute("required", "");
  });
}

test("断线只显示一条状态，快照未到保持原桌且禁用，恢复提示自动消失", async ({ page }) => {
  await page.setViewportSize({ width: 932, height: 430 });
  let hold = false;
  const queued: (() => void)[] = [];
  const commands: string[] = [];
  await page.routeWebSocket("**/ws", ws => {
    const server = ws.connectToServer();
    ws.onMessage(raw => { commands.push(JSON.parse(String(raw)).type); server.send(raw); });
    server.onMessage(raw => {
      if (hold && JSON.parse(String(raw)).type === "state") queued.push(() => ws.send(raw));
      else ws.send(raw);
    });
  });
  await page.goto("/"); await legacyRoom(page);
  const id = await page.evaluate(async () => {
    const { client } = await import("/src/game-client.ts" as string);
    return client.state.view.id;
  });
  hold = true;
  await page.evaluate(async () => {
    const { client } = await import("/src/game-client.ts" as string);
    client.retryNetwork();
  });
  const banner = page.getByRole("status", { name: "网络连接状态" });
  await expect(banner).toContainText("正在恢复牌局");
  await expect(banner).toHaveCount(1);
  await expect(page.locator(".waiting-room")).toBeVisible();
  await expect(page.getByRole("button", { name: "我准备好了", exact: true })).toBeDisabled();
  expect(await page.evaluate(async () => {
    const { client } = await import("/src/game-client.ts" as string);
    return client.state.view.id;
  })).toBe(id);
  await page.screenshot({ path: `${capture}/network-syncing.png` });
  const before = commands.filter(type => type === "ready").length;
  hold = false; queued.forEach(send => send());
  await expect(banner).toContainText("已恢复连接");
  await page.screenshot({ path: `${capture}/network-recovered.png` });
  await expect(banner).toHaveCount(0, { timeout: 4000 });
  expect(commands.filter(type => type === "ready")).toHaveLength(before);
});

test("仅测试浏览器断网：房间不清空，自动恢复后才能继续", async ({ page, context }) => {
  await page.setViewportSize({ width: 932, height: 430 });
  await page.goto("/"); await legacyRoom(page);
  const roomCode = await page.locator(".room-code strong").innerText();
  try {
    await context.setOffline(true);
    const banner = page.getByRole("status", { name: "网络连接状态" });
    await expect(banner).toContainText("网络连接中断");
    await expect(banner).toContainText("牌桌已保留");
    await expect(page.locator(".room-code strong")).toHaveText(roomCode);
    await expect(page.getByRole("button", { name: "我准备好了", exact: true })).toBeDisabled();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.screenshot({ path: `${capture}/network-offline.png` });
    await context.setOffline(false);
    await expect(banner).toContainText("已恢复连接");
    await expect(page.locator(".room-code strong")).toHaveText(roomCode);
    await expect(page.getByRole("button", { name: "我准备好了", exact: true })).toBeEnabled();
  } finally { await context.setOffline(false); }
});

test("慢心跳只提示网络波动，不弹窗、不退出、不屏蔽大厅入口", async ({ page }) => {
  await page.setViewportSize({ width: 932, height: 430 });
  await page.routeWebSocket("**/ws", ws => {
    const server = ws.connectToServer();
    server.onMessage(raw => {
      if (JSON.parse(String(raw)).type === "pong")
        setTimeout(() => { try { ws.send(raw); } catch { /* Test page may already be closed. */ } }, 850);
      else ws.send(raw);
    });
  });
  await page.goto("/");
  const banner = page.getByRole("status", { name: "网络连接状态" });
  await expect(banner).toContainText("网络波动");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "房间大厅", exact: true })).toBeEnabled();
  await page.screenshot({ path: `${capture}/network-unstable.png` });
});
