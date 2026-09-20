import { test, expect, type Page } from "@playwright/test";
import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { createGame, newPlayer, seats } from "../shared/engine";
import { createRecords } from "../server/records";
import { replayedRound } from "./fixtures/replayed-round";
import { gzipSync } from "node:zlib";
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
    const loginError = page.getByRole("alert");
    const loginSubmit = page.getByRole("button", {
      name: "登录，开始相聚",
      exact: true,
    });
    await expect(loginError).toBeVisible();
    for (const element of [loginError, loginSubmit]) {
      const box = (await element.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(left);
      expect(box.x + box.width).toBeLessThanOrEqual(width - right);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height).toBeLessThanOrEqual(
        height - (width > 700 ? 21 : 0),
      );
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
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
  await page
    .getByRole("dialog", { name: "退出当前账号？" })
    .getByRole("button", { name: "退出登录", exact: true })
    .click();
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
  await page.getByRole("button", { name: "账号安全", exact: true }).click();
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
  await page
    .getByRole("dialog", { name: "退出当前账号？" })
    .getByRole("button", { name: "退出登录", exact: true })
    .click();
  await login(page, username, "Changed-Password-2026");
  await expect(page.getByRole("navigation")).toBeVisible();
});
test("普通管理员首次登录更换初始密码后仍不能开桌", async ({ page }) => {
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
  ).toHaveCount(0);
});
test("管理员5桌8局汇总显示5条，四人最终分数减半，支持房号日期查询", async ({
  page,
}) => {
  const db = new DatabaseSync(resolve("../../work/accounts-e2e.sqlite")),
    records = createRecords(db);
  const seed = replayedRound();
  const hash = db
    .prepare("SELECT password_hash FROM accounts WHERE username='guanli@1'")
    .get()!.password_hash;
  const identities = seats.map((s) => ({
    id: randomUUID(),
    username: `record-member-${s}-${randomUUID().slice(0, 8)}`,
    name: ["金陵牌友", "秦淮", "莫愁", "钟山"][s],
  }));
  for (const p of identities)
    db.prepare("INSERT INTO accounts VALUES (?,?,?,?,?,?,?)").run(
      p.id,
      p.username,
      p.name,
      hash,
      "member",
      0,
      Date.now(),
    );
  const memberIds = identities.map((p) =>
    String(
      db
        .prepare("SELECT member_id FROM account_numbers WHERE account_id=?")
        .get(p.id)!.member_id,
    ),
  );
  for (let i = 0; i < 5; i++) {
    const g = createGame(String(881001 + i), randomUUID(), { rounds: 8 });
    g.phase = "finished";
    g.round = 8;
    g.settlementBase = 100;
    g.players = seats.map((s) =>
      newPlayer(identities[s].id, identities[s].name),
    );
    g.players.forEach((p, s) => (p!.score = [0, 0, 100, 260][s]));
    for (let round = 1; round <= 8; round++) {
      g.history.push({
        id: `${g.id}-${round}`,
        at: Date.now(),
        round,
        names: g.players.map((p) => p!.name),
        scores: g.players.map((p) => p!.score),
        initialScore: 90,
        scoreDivisor: 2,
        hands: seed.history[0].hands,
        result: {
          reason: "draw",
          winners: [],
          details: {},
          deltas: [0, 0, 0, 0],
        },
      });
      for (const p of identities)
        db.prepare("INSERT INTO round_rosters VALUES (?,?,?,?,?)").run(
          g.id,
          round,
          p.id,
          "team-1",
          "一生所爱战队",
        );
      const replay = {
        ...seed.replay!,
        id: `${g.id}-${round}`,
        round,
        names: identities.map((p) => p.name),
      };
      db.prepare("INSERT INTO round_replays VALUES (?,?)").run(
        replay.id,
        gzipSync(JSON.stringify(replay)),
      );
    }
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
  await expect(page.locator(".records-results-heading")).toContainText(
    "共 5 桌",
  );
  await expect(page.locator(".records-pagination")).toContainText("1 / 1");
  await page.screenshot({ path: `${captures}/admin-final-five-tables.png` });
  await page.getByRole("button", { name: "查看房间 881001 最终战绩" }).click();
  const board = page.getByRole("dialog");
  await board
    .getByRole("button", { name: "返回整桌明细", exact: true })
    .click();
  await expect(board.locator(".match-details-summary")).toContainText(
    "房间 881001",
  );
  await expect(board.locator(".match-details-summary")).toContainText(
    "8 / 8 把",
  );
  await expect(
    board.locator(".record-detail-total .match-points b"),
  ).toHaveText(["-50", "-50", "0", "+80"]);
  await expect(
    board.locator(".record-detail-total .record-member-id"),
  ).toHaveText(memberIds.map((id) => `ID：${id}`));
  await expect(board.locator(".match-round")).toHaveCount(8);
  await expect(
    board.locator(".record-detail-total .record-team"),
  ).toHaveCount(4);
  const ids = await board.locator(".round-replay-code code").allTextContents();
  expect(new Set(ids).size).toBe(8);
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await board.getByRole("button", { name: "复制第 1 把回放 ID" }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    ids[0],
  );
  await board
    .locator(".match-round")
    .first()
    .getByRole("button", { name: "回放", exact: true })
    .click();
  const replayDialog = page.locator(".replay-dialog");
  await expect(replayDialog.locator(".cocos-loading")).toHaveCount(0, {
    timeout: 45000,
  });
  await expect(replayDialog.locator("iframe")).toBeVisible();
  await replayDialog.getByRole("button", { name: "关闭", exact: true }).click();
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
    const last = board.locator(".match-round").last();
    await last.locator(".round-replay-code").scrollIntoViewIfNeeded();
    await expect(
      last.getByRole("button", { name: "回放", exact: true }),
    ).toBeInViewport();
    expect(
      await board
        .locator(".modal-body")
        .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    ).toBe(true);
    await page.screenshot({
      path: `${captures}/final-settlement-${width}.png`,
    });
  }
  await page.setViewportSize({ width: 932, height: 430 });
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  await page
    .getByLabel("选择战绩日期", { exact: true })
    .fill("2020-01-01");
  await page.getByRole("button", { name: "查询战绩" }).click();
  await expect(page.locator(".record-card")).toHaveCount(0);
  await page.evaluate(() => localStorage.removeItem("jinling:token"));
  await login(page, identities[0].username);
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "战绩", exact: true })
    .click();
  await expect(page.locator(".record-card")).toHaveCount(5);
  await expect(page.locator(".record-card .record-team")).toHaveCount(0);
  await expect(
    page.locator(".record-card").first().locator(".record-member-id"),
  ).toHaveText(memberIds.map((id) => `ID：${id}`));
  await page.locator(".record-card").first().click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "返回整桌明细", exact: true })
    .click();
  await expect(page.locator(".match-round")).toHaveCount(8);
  await expect(page.locator(".match-record-dialog .record-team")).toHaveCount(
    0,
  );
});
