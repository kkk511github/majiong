import { test, expect, type Page } from "@playwright/test";
import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { createGame, newPlayer, seats } from "../shared/engine";
import { createRecords } from "../server/records";
const password = "Browser-fixture-password-2026",
  captures = "test-results/screenshots";
test.beforeAll(() => mkdirSync(captures, { recursive: true }));
async function login(page: Page, username = "guanli@1", secret = password) {
  await page.goto("/");
  await page.getByLabel("账号", { exact: true }).fill(username);
  await page.getByLabel("密码", { exact: true }).fill(secret);
  await page
    .getByRole("button", { name: "登录，开始相聚", exact: true })
    .click();
}
for (const [width, height, left, right] of [
  [568, 320, 0, 0],
  [844, 390, 59, 0],
  [874, 402, 0, 62],
  [932, 430, 62, 62],
]) {
  test(`账号登录注册横屏 ${width}：安全区内可用、表单无横向溢出`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setSafeAreaInsetsOverride", {
      insets: { left, right, bottom: width > 700 ? 21 : 0, top: 0 },
    });
    await page.goto("/");
    await expect(
      page.getByRole("button", { name: "登录，开始相聚" }),
    ).toBeVisible();
    for (const label of ["账号", "密码"]) {
      const box = (await page
        .getByLabel(label, { exact: true })
        .boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(left);
      expect(box.x + box.width).toBeLessThanOrEqual(width - right);
    }
    await page.screenshot({ path: `${captures}/account-login-${width}.png` });
    await page.route("**/api/auth/login", (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          error: "暂时连接不上账号服务，请检查网络后重试",
        }),
      }),
    );
    await page.getByLabel("账号", { exact: true }).fill("offline-fixture");
    await page.getByLabel("密码", { exact: true }).fill(password);
    await page.getByRole("button", { name: "登录，开始相聚" }).click();
    await expect(page.getByRole("alert")).toBeVisible();
    const practiceBox = (await page
      .getByRole("button", { name: "先去单人练习 →" })
      .boundingBox())!;
    expect(practiceBox.y + practiceBox.height).toBeLessThanOrEqual(
      height - (width > 700 ? 21 : 0),
    );
    await page.screenshot({
      path: `${captures}/account-login-error-${width}.png`,
    });
    await page.getByRole("tab", { name: "注册账号" }).click();
    const submit = page.getByRole("button", { name: "注册并进入大厅" });
    await submit.scrollIntoViewIfNeeded();
    expect(
      await submit.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return (
          r.bottom <= innerHeight &&
          el.contains(
            document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2),
          )
        );
      }),
    ).toBe(true);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `${captures}/account-register-${width}.png`,
    });
  });
}
test("真实注册、会员权限、退出和密码登录、修改密码", async ({ page }) => {
  await page.setViewportSize({ width: 932, height: 430 });
  await page.goto("/");
  await page.getByRole("tab", { name: "注册账号" }).click();
  const username = "phone-" + randomUUID().slice(0, 8);
  await page.getByLabel("账号", { exact: true }).fill(username);
  await page.getByLabel("牌桌昵称", { exact: true }).fill("秦淮牌友");
  await page.getByLabel("密码", { exact: true }).fill(password);
  await page.getByLabel("确认密码", { exact: true }).fill(password);
  await page.getByRole("button", { name: "注册并进入大厅" }).click();
  await expect(
    page.getByRole("button", { name: "进入牌桌大厅", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "开一桌，等朋友" }),
  ).toHaveCount(0);
  await expect(page.locator(".home-create")).toHaveCount(0);
  await page.screenshot({ path: `${captures}/online-home-member.png` });
  await page.getByRole("button", { name: "进入牌桌大厅", exact: true }).click();
  await expect(page.getByRole("heading", { name: /牌桌大厅/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "开桌设置" })).toHaveCount(0);
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "我的", exact: true })
    .click();
  await page.getByRole("button", { name: "退出登录", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "登录，开始相聚" }),
  ).toBeVisible();
  await login(page, username, "Wrong-password-00");
  await expect(page.getByRole("alert")).toContainText("账号或密码不正确");
  await page.getByLabel("密码", { exact: true }).fill(password);
  await page.getByRole("button", { name: "登录，开始相聚" }).click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "我的", exact: true })
    .click();
  await page.getByRole("button", { name: "修改密码", exact: true }).click();
  await page.getByLabel("原密码", { exact: true }).fill(password);
  await page
    .getByLabel("新密码", { exact: true })
    .fill("Changed-Password-2026");
  await page
    .getByLabel("确认新密码", { exact: true })
    .fill("Changed-Password-2026");
  await page.getByRole("button", { name: "保存新密码" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "退出登录", exact: true }).click();
  await login(page, username, "Changed-Password-2026");
  await expect(page.getByRole("navigation")).toBeVisible();
});
test("管理员首次登录更换初始密码后才能开桌", async ({ page }) => {
  await page.setViewportSize({ width: 874, height: 402 });
  await login(page, "initial-admin");
  await expect(
    page.getByRole("heading", { name: "设置你的新密码" }),
  ).toBeVisible();
  await page
    .getByLabel("新密码", { exact: true })
    .fill("Initial-admin-new-password");
  await page
    .getByLabel("确认密码", { exact: true })
    .fill("Initial-admin-new-password");
  await page.getByRole("button", { name: "保存密码，进入大厅" }).click();
  await expect(
    page.getByRole("button", { name: "开一桌，等朋友" }),
  ).toBeVisible();
});
test("管理员5桌8局汇总显示5条，四人最终分数减半，支持房号日期查询", async ({
  page,
}) => {
  const db = new DatabaseSync(resolve("../../work/accounts-e2e.sqlite")),
    records = createRecords(db);
  for (let i = 0; i < 5; i++) {
    const g = createGame(String(881001 + i), randomUUID(), { rounds: 8 });
    g.phase = "finished";
    g.round = 8;
    g.settlementBase = 100;
    g.players = seats.map((s) =>
      newPlayer(randomUUID(), ["金陵牌友", "秦淮", "莫愁", "钟山"][s]),
    );
    g.players.forEach((p, s) => (p!.score = [0, 0, 100, 260][s]));
    for (let round = 1; round <= 8; round++)
      g.history.push({
        id: `${g.id}-${round}`,
        at: Date.now(),
        round,
        names: g.players.map((p) => p!.name),
        scores: g.players.map((p) => p!.score),
        initialScore: 90,
        scoreDivisor: 2,
        result: {
          reason: "draw",
          winners: [],
          details: {},
          deltas: [0, 0, 0, 0],
        },
      });
    records.capture(g);
  }
  db.close();
  await page.setViewportSize({ width: 932, height: 430 });
  await login(page);
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "战绩", exact: true })
    .click();
  await page.getByLabel("战绩房间号", { exact: true }).fill("881");
  await page.getByRole("button", { name: "查询战绩" }).click();
  await expect(page.locator(".record-card")).toHaveCount(5);
  await expect(page.locator(".records-pagination")).toContainText("共 5 桌");
  await page.screenshot({ path: `${captures}/admin-final-five-tables.png` });
  await page.getByRole("button", { name: "查看房间 881001 最终战绩" }).click();
  const board = page.getByRole("dialog");
  await expect(board.locator(".settlement-meta")).toContainText(
    "房间号 881001",
  );
  await expect(board.locator(".settlement-meta")).toContainText("把数 8 / 8");
  await expect(board.locator(".settlement-recorded")).toHaveText([
    "+80",
    "0",
    "-50",
    "-50",
  ]);
  await expect(board.locator(".settlement-balance")).toHaveText([
    "260",
    "100",
    "0",
    "0",
  ]);
  await expect(board.locator(".settlement-caption")).toContainText("本金 100");
  await expect(board.locator(".settlement-caption")).toContainText(
    "桌费 10/人",
  );
  await expect(board.locator(".settlement-table tbody tr")).toHaveCount(4);
  await expect(
    board.locator(".settlement-table tbody tr").last(),
  ).toBeInViewport();
  const finalCdp = await page.context().newCDPSession(page);
  for (const [width, height] of [
    [932, 430],
    [844, 390],
    [874, 402],
    [568, 320],
  ]) {
    await page.setViewportSize({ width, height });
    await finalCdp.send("Emulation.setSafeAreaInsetsOverride", {
      insets: {
        left: width > 700 ? 62 : 0,
        right: width > 700 ? 62 : 0,
        bottom: width > 700 ? 21 : 0,
        top: 0,
      },
    });
    const within = await page
      .locator(".settlement-caption button")
      .evaluate((el) => {
        const a = el.getBoundingClientRect(),
          b = el.closest(".modal-body")!.getBoundingClientRect();
        return a.top >= b.top && a.bottom <= b.bottom;
      });
    expect(within, `${width}x${height} copy control fits`).toBe(true);
    await page.screenshot({
      path: `${captures}/final-settlement-${width}.png`,
    });
  }
  await page.setViewportSize({ width: 932, height: 430 });
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  await page.getByLabel("结束日期", { exact: true }).fill("2020-01-01");
  await page.getByRole("button", { name: "查询战绩" }).click();
  await expect(page.locator(".record-card")).toHaveCount(0);
});
