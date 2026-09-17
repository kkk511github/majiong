import { test, expect, UI_PASSWORD } from "./browser-fixtures";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
for (const [width, height] of [
  [568, 320],
  [844, 390],
  [932, 430],
]) {
  test(`战队管理 ${width}：分队、禁赛、管理员权限、战队改名、积分导出`, async ({
    page,
    request,
  }) => {
    await page.setViewportSize({ width, height });
    const username = "club-ui-" + randomUUID().slice(0, 8);
    const reg = await request.post("/api/auth/register", {
      data: { username, password: UI_PASSWORD, name: "新会员" },
    });
    expect(reg.ok()).toBe(true);
    const member = await reg.json();
    await page.goto("/");
    await page.evaluate(async (password) => {
      const { client } = await import("/src/game-client.ts" as string);
      await client.authenticate("login", "guanli@1", password);
    }, UI_PASSWORD);
    await expect(
      page.getByRole("button", { name: "进入牌桌大厅", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("navigation")
      .getByRole("button", { name: "我的", exact: true })
      .click();
    await page.getByRole("button", { name: "战队与会员", exact: true }).click();
    await page.getByLabel("搜索会员", { exact: true }).fill(username);
    await page.getByRole("button", { name: "查询", exact: true }).click();
    const card = page.getByRole("article", { name: `会员 ${username}` });
    await expect(card.getByText("等待分队", { exact: true })).toBeVisible();
    await card
      .getByLabel(`${username} 所属战队`, { exact: true })
      .selectOption("team-1");
    await expect(card.getByText("可参赛", { exact: true })).toBeVisible();
    await card.getByRole("button", { name: "暂停参赛", exact: true }).click();
    await expect(card.getByText("已暂停参赛", { exact: true })).toBeVisible();
    const status = await request.get("/api/auth/session", {
      headers: { Authorization: `Bearer ${member.token}` },
    });
    expect((await status.json()).account).toMatchObject({
      teamId: "team-1",
      playBlocked: true,
      canPlay: false,
    });
    await card.getByRole("button", { name: "恢复参赛", exact: true }).click();
    await expect(card.getByText("可参赛", { exact: true })).toBeVisible();
    await card.getByRole("button", { name: "设为管理员", exact: true }).click();
    await expect(
      card.getByRole("button", { name: "撤销管理员", exact: true }),
    ).toBeVisible();
    await card.getByRole("button", { name: "撤销管理员", exact: true }).click();
    await expect(
      card.getByRole("button", { name: "设为管理员", exact: true }),
    ).toBeVisible();
    mkdirSync("test-results/screenshots", { recursive: true });
    await page.screenshot({
      path: `test-results/screenshots/club-members-${width}.png`,
    });
    await page.getByRole("button", { name: "战队设置", exact: true }).click();
    await page.getByLabel("战队名称", { exact: true }).fill(`测试战队${width}`);
    await page.getByRole("button", { name: "添加战队", exact: true }).click();
    await expect(
      page.getByText(`测试战队${width}`, { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "积分统计", exact: true }).click();
    await expect(
      page.getByText("这个时间范围内还没有已完成的牌局。", { exact: true }),
    ).toBeVisible();
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "导出 CSV", exact: true }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/战队积分_.*\.csv/);
    const csv = readFileSync((await file.path())!, "utf8");
    expect(csv).toContain('"把数","桌数（8局/桌）","积分"');
    expect(csv).not.toContain("完成局数");
    await page.screenshot({
      path: `test-results/screenshots/club-points-${width}.png`,
    });
    // Horizontal phone UI must remain inside its viewport; scrolling vertically is intentional.
    expect(
      await page.locator(".club-dialog").evaluate((el) => {
        const r = el.getBoundingClientRect();
        return (
          r.left >= 0 &&
          r.right <= innerWidth &&
          r.top >= 0 &&
          r.bottom <= innerHeight
        );
      }),
    ).toBe(true);
  });
}

for (const [width, height] of [
  [568, 320],
  [874, 402],
]) {
  test(`管理交互 ${width}：慢网分队不重载、失败恢复、完整积分列表`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    let teamReads = 0,
      memberReads = 0;
    const accounts = Array.from({ length: 20 }, (_, i) => ({
      id: `fixture-${i}`,
      username: `member-${i}`,
      name: `牌友${i}`,
      role: "member",
      mustChangePassword: false,
      teamId: null,
      teamName: null,
      canPlay: false,
      playBlocked: false,
    }));
    await page.route("**/api/admin/teams", (route) => {
      teamReads++;
      return route.fulfill({
        json: {
          teams: [
            { id: "team-1", name: "一生所爱战队", members: 0 },
            { id: "team-2", name: "冰茉莉战队", members: 0 },
          ],
        },
      });
    });
    let finishSave: (() => Promise<void>) | undefined;
    await page.route("**/api/admin/members**", (route) => {
      if (route.request().method() === "GET") {
        memberReads++;
        return route.fulfill({
          json: { accounts, total: 20, page: 1, pageSize: 20 },
        });
      }
      finishSave = () =>
        route.fulfill({ status: 503, json: { error: "网络暂不可用" } });
    });
    await page.route("**/api/admin/points?**", (route) =>
      route.fulfill({
        json: {
          rows: accounts.map((a, i) => ({
            accountId: a.id,
            username: a.username,
            name: a.name,
            teamId: "team-1",
            teamName: "一生所爱战队",
            rounds: 22 + i,
            tables: 3 + i,
            points: i % 2 ? 125 : -95,
          })),
          total: 20,
          page: 1,
          pageSize: 20,
          completedRounds: 30,
          tables: 4,
          playerRounds: 120,
          points: 300,
        },
      }),
    );
    await page.goto("/");
    await page.evaluate(async (password) => {
      const { client } = await import("/src/game-client.ts" as string);
      await client.authenticate("login", "guanli@1", password);
    }, UI_PASSWORD);
    await page
      .getByRole("navigation")
      .getByRole("button", { name: "我的", exact: true })
      .click();
    await page.getByRole("button", { name: "战队与会员", exact: true }).click();
    const member = page.getByRole("article", {
      name: "会员 member-0",
      exact: true,
    });
    await member
      .getByLabel("member-0 所属战队", { exact: true })
      .selectOption("team-1");
    await expect(member.getByText("保存中…")).toBeVisible();
    await expect(
      member.getByLabel("member-0 所属战队", { exact: true }),
    ).toHaveValue("team-1");
    await expect(
      page
        .getByRole("article", { name: "会员 member-1", exact: true })
        .getByRole("button", { name: "暂停参赛" }),
    ).toBeEnabled();
    await expect.poll(() => Boolean(finishSave)).toBe(true);
    await finishSave!();
    await expect(
      member.getByLabel("member-0 所属战队", { exact: true }),
    ).toHaveValue("");
    await expect(page.getByRole("alert")).toContainText("已恢复原设置");
    expect(memberReads).toBe(1);
    expect(teamReads).toBe(1);
    await page.getByRole("button", { name: "积分统计", exact: true }).click();
    await expect(page.locator(".club-stats-scroll tbody tr")).toHaveCount(20);
    await expect(page.getByRole("columnheader", { name: "把数", exact: true })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "桌数（8局/桌）", exact: true })).toBeVisible();
    await expect(page.locator(".club-stats-scroll tbody tr").first().locator("td")).toHaveText([
      "一生所爱战队", "牌友0ID — · member-0", "22", "3", "-95",
    ]);
    const before = (await page.locator(".club-footer").boundingBox())!;
    const area = await page
      .locator(".club-results")
      .evaluate((el) => ({
        height: el.clientHeight,
        width: el.clientWidth,
        scrollWidth: el.scrollWidth,
      }));
    expect(area.height).toBeGreaterThanOrEqual(104);
    expect(area.scrollWidth).toBeLessThanOrEqual(area.width + 1);
    await page.locator(".club-results").evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await expect(page.getByText("牌友19", { exact: true })).toBeVisible();
    expect(await page.locator(".club-footer").boundingBox()).toEqual(before);
    const last = page.locator(".club-stats-scroll tbody tr").last();
    expect(
      await last.evaluate((el) => {
        const r = el.getBoundingClientRect(),
          p = el.closest(".club-results")!.getBoundingClientRect();
        return r.top >= p.top && r.bottom <= p.bottom;
      }),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/screenshots/club-populated-${width}.png`,
    });
  });
}
