import { test, expect, browserAccount, type Page } from "./browser-fixtures";
import { LEGAL_STORAGE_KEY, LEGAL_VERSION } from "../src/legal-copy";
import { mkdirSync } from "node:fs";

const captures = "test-results/features-adaptation";
test.beforeAll(() => mkdirSync(captures, { recursive: true }));
async function invitationRoom(page: Page) {
  await page.goto("/");
  await page.waitForFunction(async () => (await import("/src/game-client.ts" as string)).client.state.tableInvitesAvailable);
  await page.evaluate(async () => {
    const { client } = await import("/src/game-client.ts" as string);
    client.createTables("金陵牌友", { name: "邀请状态验收", readyMode: "manual", autoRenew: false, kickUnready: false }, {}, 1);
  });
  await expect.poll(() => page.evaluate(async () => (await import("/src/game-client.ts" as string)).client.state.createdTables.length)).toBe(1);
  await page.evaluate(async () => {
    const { client } = await import("/src/game-client.ts" as string);
    client.joinTable("金陵牌友", client.state.createdTables[0], 0);
  });
  await page.getByRole("button", { name: "邀请在线牌友", exact: true }).click();
}

for (const [width, height] of [[568, 320], [932, 430]]) {
  test(`邀请列表加载、空、搜索、失败、发送中、忙碌和等待回应 ${width}`, async ({ page, context }) => {
    await page.setViewportSize({ width, height });
    let mode: "loading" | "empty" | "error" | "peers" | "pending" = "loading";
    let releaseList: (() => void) | undefined;
    let releaseSend: (() => void) | undefined;
    let sends = 0;
    await page.routeWebSocket("**/ws", ws => {
      const server = ws.connectToServer();
      ws.onMessage(raw => {
        const message = JSON.parse(String(raw));
        if (message.type === "invitePeers") {
          const reply = () => ws.send(JSON.stringify(mode === "error"
            ? { type: "error", requestId: message.requestId, message: "在线牌友暂时获取失败" }
            : { type: "invitationResult", requestId: message.requestId, peers: mode === "empty" ? [] : [
              { memberId: "100123", name: "秦淮牌友", status: mode === "pending" ? "pending" : "available", ...(mode === "pending" ? { expiresAt: Date.now() + 60000 } : {}) },
              { memberId: "100124", name: "钟山牌友", status: "busy" },
            ] }));
          if (mode === "loading") releaseList = reply; else reply();
        } else if (message.type === "invitePlayer") {
          sends++;
          releaseSend = () => { mode = "pending"; ws.send(JSON.stringify({ type: "invitationResult", requestId: message.requestId })); };
        } else server.send(raw);
      });
    });
    await invitationRoom(page);
    const dialog = page.getByRole("dialog", { name: "邀请在线牌友", exact: true });
    await expect(dialog).toContainText("正在获取在线牌友");
    await page.screenshot({ path: `${captures}/invite-loading-${width}.png` });
    mode = "empty"; releaseList!();
    await expect(dialog).toContainText("暂无可邀请的在线牌友");
    mode = "error";
    await dialog.getByRole("button", { name: "刷新在线牌友" }).click();
    await expect(dialog.getByRole("alert")).toContainText("在线牌友暂时获取失败");
    await expect(dialog).not.toContainText("暂无可邀请的在线牌友");
    mode = "peers";
    await dialog.getByRole("button", { name: "刷新在线牌友" }).click();
    await expect(dialog.getByRole("alert")).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: "邀请钟山牌友" })).toBeDisabled();
    await dialog.getByLabel("搜索在线牌友").fill("没有这个人");
    await expect(dialog).toContainText("未找到这位在线牌友");
    await dialog.getByLabel("搜索在线牌友").fill("");
    const invite = dialog.getByRole("button", { name: "邀请秦淮牌友" });
    await invite.dblclick();
    await expect(invite).toHaveText("发送中…");
    expect(sends).toBe(1);
    releaseSend!();
    await expect(invite).toContainText("等待回应");
    await expect(invite).toBeDisabled();
    const seconds = Number((await invite.innerText()).match(/\d+/)?.[0]);
    expect(seconds).toBeLessThanOrEqual(60);
    await page.screenshot({ path: `${captures}/invite-pending-${width}.png` });
    try {
      await context.setOffline(true);
      await expect(dialog).toContainText("连接已断开");
      await expect(dialog.getByRole("button", { name: "邀请秦淮牌友" })).toHaveCount(0);
      await expect(dialog.getByRole("button", { name: "复制房号" })).toBeEnabled();
      await page.screenshot({ path: `${captures}/invite-offline-${width}.png` });
    } finally { await context.setOffline(false); }
  });
}

test("受邀过期后接受禁用，保留原因与知道了，不触发入座", async ({ page, browser }) => {
  await page.setViewportSize({ width: 568, height: 320 });
  const guestContext = await browser.newContext({ viewport: { width: 568, height: 320 } });
  try {
    await browserAccount(guestContext, "过期邀请牌友");
    await guestContext.addInitScript(({ key, version }) => localStorage.setItem(key, JSON.stringify({ version, acceptedAt: "2026-09-24" })), { key: LEGAL_STORAGE_KEY, version: LEGAL_VERSION });
    const guest = await guestContext.newPage();
    const responses: unknown[] = [];
    await guest.routeWebSocket("**/ws", ws => {
      const server = ws.connectToServer();
      ws.onMessage(raw => { const message = JSON.parse(String(raw)); if (message.type === "respondInvite") responses.push(message); server.send(raw); });
    });
    await guest.goto("http://127.0.0.1:5178/");
    await guest.waitForFunction(async () => (await import("/src/game-client.ts" as string)).client.state.tableInvitesAvailable);
    await invitationRoom(page);
    const outgoing = page.getByRole("dialog", { name: "邀请在线牌友", exact: true });
    await outgoing.getByLabel("搜索在线牌友").fill("过期邀请牌友");
    await outgoing.getByRole("button", { name: "邀请过期邀请牌友", exact: true }).click();
    const dialog = guest.getByRole("dialog", { name: "牌桌邀请", exact: true });
    await expect(dialog).toBeVisible();
    // Advance only this browser's presentation clock. Server expiry is covered
    // by table-invitations-server.test.ts; no real 60-second sleep is needed.
    await guest.evaluate(async () => {
      const { client } = await import("/src/game-client.ts" as string);
      const expired = client.now() + 61_000;
      client.now = () => expired;
    });
    await expect(dialog.getByRole("timer")).toHaveText("邀请已过期");
    await expect(dialog.getByRole("button", { name: "接受并入座" })).toBeDisabled();
    await guest.screenshot({ path: `${captures}/invite-expired.png` });
    await dialog.getByRole("button", { name: "知道了", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect(responses).toEqual([]);
  } finally { await guestContext.close(); }
});
