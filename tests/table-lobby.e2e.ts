import { browserAccount, openTableMenu } from "./browser-fixtures";
import { expect, test, type Page } from "./browser-fixtures";
import { mkdirSync } from "node:fs";
const captures = "test-results/screenshots";
test.beforeAll(() => mkdirSync(captures, { recursive: true }));
async function lobby(page: Page, name: string) {
  await page.addInitScript(
    (n) => localStorage.setItem("jinling:name", JSON.stringify(n)),
    name,
  );
  await page.goto("/");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "约局", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "开桌设置", exact: true }),
  ).toBeEnabled();
}
async function setup(page: Page, name: string, count = 1) {
  await page.getByRole("button", { name: "开桌设置", exact: true }).click();
  await page.getByRole("textbox", { name: "玩法名称", exact: true }).fill(name);
  await page.getByRole("button", { name: "下一步", exact: true }).click();
  await page
    .getByRole("group", { name: "创建桌数", exact: true })
    .getByRole("button", { name: `${count} 桌`, exact: true })
    .click();
}
async function finishSetup(page: Page, count = 1) {
  await page.getByRole("button", { name: "下一步", exact: true }).click();
  await page
    .getByRole("button", { name: `创建 ${count} 桌`, exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.locator(".table-card")).toHaveCount(count);
}
async function closeTables(page: Page) {
  while (await page.locator(".table-card .table-close").count()) {
    await page.locator(".table-card .table-close").first().click();
    await page.getByRole("button", { name: "确认收桌", exact: true }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
  }
}
for (const [width, height, left, right] of [
  [568, 320, 0, 0],
  [844, 390, 59, 0],
  [874, 402, 0, 62],
  [932, 430, 62, 62],
]) {
  test(`建桌设置 ${width}：横屏安全区、底部固定按钮、配置保存`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    const cdp = await page.context().newCDPSession(page);
    const safe = { left, right, bottom: width > 700 ? 21 : 0, top: 0 };
    await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: safe });
    await lobby(page, `横屏${width}`);
    await setup(page, `好友相聚${width}`, 2);
    await page.screenshot({ path: `${captures}/table-setup-${width}.png` });
    await page
      .getByRole("group", { name: "准备方式", exact: true })
      .getByRole("button", { name: "手动准备", exact: true })
      .click();
    await page.getByRole("switch", { name: "自动续桌", exact: true }).click();
    await page
      .getByRole("group", { name: "超时托管", exact: true })
      .getByRole("button", { name: "关闭托管", exact: true })
      .click();
    await page
      .getByRole("switch", { name: "允许全桌同意后解散", exact: true })
      .click();
    await page
      .getByRole("group", { name: "牌友信息", exact: true })
      .getByRole("button", { name: "大厅隐藏昵称", exact: true })
      .click();
    const unsafe = await page
      .locator(".modal,.setup-footer button")
      .evaluateAll(
        (els, a) =>
          els.flatMap((el) => {
            const r = el.getBoundingClientRect();
            return r.left < a.left ||
              r.right > innerWidth - a.right ||
              r.bottom > innerHeight - a.bottom ||
              r.top < 0
              ? [el.className]
              : [];
          }),
        safe,
      );
    expect(unsafe).toEqual([]);
    await finishSetup(page, 2);
    await page
      .getByRole("button", { name: "关闭大厅提示", exact: true })
      .click();
    await page.screenshot({ path: `${captures}/table-lobby-${width}.png` });
    const first = page.locator(".table-card").first();
    await first.getByRole("button", { name: /东位入座/ }).click();
    await expect(page.locator(".waiting-room")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "添加电脑陪练" }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "本桌规则", exact: true }).click();
    await expect(
      page.getByRole("dialog").getByText("不限时 · 关闭托管", { exact: true }),
    ).toBeVisible();
    await expect(
      page
        .getByRole("dialog")
        .getByText("输赢 × 0.5 · 展示 10 秒 · 不续桌", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "关闭", exact: true }).click();
    await page.getByRole("button", { name: "返回大厅", exact: true }).click();
    await expect(page.getByRole("region", { name: "牌桌大厅" })).toBeVisible();
    await page.getByRole("button", { name: "我开的桌", exact: true }).click();
    await closeTables(page);
  });
}
test("四个独立客户端：开桌、大厅实时空位、指定座位、满四真人手动准备开局", async ({
  browser,
}) => {
  const contexts = await Promise.all(
    [0, 1, 2, 3].map(() =>
      browser.newContext({ viewport: { width: 874, height: 402 } }),
    ),
  );
  const pages = await Promise.all(contexts.map((c) => c.newPage()));
  await Promise.all(contexts.map((c) => browserAccount(c)));
  await Promise.all(
    contexts.map((context, i) =>
      context.addInitScript((hours) => {
        const realNow = Date.now.bind(Date);
        Date.now = () => realNow() + hours * 3600_000;
      }, [-6, 6, -12, 12][i]),
    ),
  );
  try {
    for (let i = 0; i < 4; i++)
      await lobby(pages[i], ["紫金", "秦淮", "莫愁", "玄武"][i]);
    await setup(pages[0], "金陵四人验收");
    await finishSetup(pages[0]);
    const code = (
      await pages[0].locator(".table-room-code").innerText()
    ).trim();
    for (let i = 0; i < 4; i++) {
      const page = pages[i];
      await page
        .getByRole("textbox", { name: "查找牌桌", exact: true })
        .fill(code);
      await expect(page.locator(".table-card")).toHaveCount(1);
      await page
        .getByRole("button", {
          name: `${code} ${["东", "南", "西", "北"][i]}位入座`,
          exact: true,
        })
        .click();
      await expect(page.locator(".waiting-room")).toBeVisible();
      if (i === 3) {
        await expect(page.getByRole("timer")).toHaveAttribute(
          "aria-label",
          /准备剩余 (?:[6-9]|10) 秒/,
        );
      }
      await page
        .getByRole("button", { name: "我准备好了", exact: true })
        .click();
      if (i < 3) {
        await expect(page.locator(".waiting-room")).toBeVisible();
        await expect(page.getByLabel("我的手牌")).toHaveCount(0);
      }
    }
    for (const page of pages) {
      await expect(page.getByLabel("我的手牌")).toBeVisible();
      await expect(page.locator(".game-topbar")).toContainText("第 1 / 8 局");
      await expect(page.locator(".table-center strong")).toHaveText(
        /^(?:0[6-9]|10)$/,
      );
    }
    await pages[0].screenshot({
      path: `${captures}/table-lobby-four-start.png`,
    });
    await openTableMenu(pages[0], 'leave');
    await pages[0]
      .getByRole("button", { name: "申请解散", exact: true })
      .click();
    for (const page of pages.slice(1))
      await page.getByRole("button", { name: "同意解散", exact: true }).click();
    for (const page of pages) {
      await expect(
        page.getByRole("dialog", { name: "牌桌已解散" }),
      ).toBeVisible();
      await page.getByRole("button", { name: "返回大厅", exact: true }).click();
    }
    await pages[0]
      .getByRole("button", { name: "我开的桌", exact: true })
      .click();
    await closeTables(pages[0]);
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
  }
});
