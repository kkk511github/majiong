import { browserAccount, legacyRoom, openTableMenu } from "./browser-fixtures";
import { expect, test, type Page } from "./browser-fixtures";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
const captures = resolve("test-results/screenshots");
test.beforeAll(() => mkdirSync(captures, { recursive: true }));
test("整套42种牌面和牌背可加载，放大预览正常", async ({ page }) => {
  await page.setViewportSize({ width: 1160, height: 1100 });
  await page.goto("/tile-catalog.html");
  await expect(page.locator(".swatch .sculpted-tile")).toHaveCount(43);
  await page.locator(".swatch .sculpted-tile").evaluateAll(async (tiles) => {
    const urls = [
      ...new Set(
        tiles.map((tile) =>
          getComputedStyle(tile).backgroundImage.slice(5, -2),
        ),
      ),
    ];
    await Promise.all(
      urls.map(async (url) => {
        const image = new Image();
        image.src = url;
        await image.decode();
        if (image.naturalWidth !== 1024 || image.naturalHeight !== 1536)
          throw new Error("Unexpected atlas size");
      }),
    );
  });
  await page.screenshot({
    path: captures + "/tile-catalog.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "放大八条", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.locator("dialog .sculpted-tile")).toHaveCSS(
    "background-image",
    /bamboo-eight\.png/,
  );
  await page.screenshot({ path: captures + "/tile-detail.png" });
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
});
for (const [width, height] of [
  [568, 320],
  [667, 375],
  [740, 360],
  [844, 390],
  [852, 393],
  [874, 402],
  [932, 430],
]) {
  test(`手机适配 ${width}×${height}：入口同屏，手牌选中后可再次点击且无遮挡`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    for (const name of ["单人练习，快速开始", "开一桌，等朋友", "加入好友桌"]) {
      const button = page.getByRole("button", { name, exact: true });
      const box = (await button.boundingBox())!;
      expect(box.y).toBeGreaterThan(0);
      expect(box.y + box.height).toBeLessThanOrEqual(height);
      expect(
        await button.evaluate((el) => {
          const b = el.getBoundingClientRect();
          return el.contains(
            document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2),
          );
        }),
      ).toBe(true);
    }
    await noOverflow(page);
    await page.getByRole("button", { name: /单人练习/ }).click();
    const hand = page.getByLabel("我的手牌");
    await expect(hand.locator(".tile")).toHaveCount(14);
    const checks = await hand.locator(".tile").evaluateAll((tiles) =>
      tiles.map((tile) => {
        const b = tile.getBoundingClientRect();
        return (
          b.x >= 0 &&
          b.right <= innerWidth &&
          b.y >= 0 &&
          b.bottom <= innerHeight &&
          tile.contains(
            document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2),
          )
        );
      }),
    );
    expect(checks.every(Boolean)).toBe(true);
    expect(
      await page
        .getByRole("button", { name: "托管", exact: true })
        .evaluate((el) => {
          const b = el.getBoundingClientRect();
          return (
            b.bottom <= innerHeight &&
            el.contains(
              document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2),
            )
          );
        }),
    ).toBe(true);
    await hand.getByRole("button").last().click();
    await expect(page.locator(".hand > .tile.selected")).toBeEnabled();
    await expect(page.locator(".discard-button")).toHaveCount(0);
    expect(
      await page.locator(".hand > .tile.selected").evaluate((el) => {
        const b = el.getBoundingClientRect();
        return el.contains(
          document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2),
        );
      }),
    ).toBe(true);
    await noOverflow(page);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollHeight <= innerHeight + 1,
      ),
    ).toBe(true);
    if (width === 568 || width === 874)
      await page.screenshot({ path: `${captures}/small-phone-${width}.png` });
  });
}
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
}
for (const [width, height] of [
  [568, 320],
  [844, 390],
]) {
  test(`好友房间横屏 ${width}×${height}：表单和准备按钮同屏可用`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    const inScreen = async (selector: string) => {
      expect(
        await page.locator(selector).evaluateAll((elements) =>
          elements.every((el) => {
            const b = el.getBoundingClientRect();
            return (
              b.x >= 0 &&
              b.y >= 0 &&
              b.right <= innerWidth &&
              b.bottom <= innerHeight &&
              el.contains(
                document.elementFromPoint(
                  b.x + b.width / 2,
                  b.y + b.height / 2,
                ),
              )
            );
          }),
        ),
      ).toBe(true);
    };
    await page.getByRole("button", { name: "加入好友桌", exact: true }).click();
    await inScreen(".room-dialog input, .room-dialog .primary");
    await page.getByRole("button", { name: "关闭", exact: true }).click();
    await page
      .getByRole("button", { name: "开一桌，等朋友", exact: true })
      .click();
    await expect(page.getByRole("dialog", { name: "开桌设置" })).toBeVisible();
    await inScreen(".setup-footer button");
    await page.screenshot({ path: `${captures}/create-room-${width}.png` });
    await page.getByRole("button", { name: "关闭", exact: true }).click();
    await legacyRoom(page);
    await expect(page.locator(".room-code strong")).toHaveText(/^\d{6}$/);
    await inScreen(
      ".waiting-actions .primary, .waiting-actions .secondary, .waiting-seat",
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollHeight <= innerHeight + 1,
      ),
    ).toBe(true);
    await noOverflow(page);
    await page.screenshot({ path: `${captures}/waiting-${width}.png` });
    await page.getByRole("button", { name: "返回大厅", exact: true }).click();
  });
}
test("手机大厅、练习出牌、暂停恢复和战绩导航", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "南京麻将" })).toBeVisible();
  await noOverflow(page);
  await page.screenshot({
    path: `${captures}/home-mobile.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: /单人练习/ }).click();
  await expect(page.getByLabel("我的手牌")).toBeVisible();
  await expect(page.locator(".discard-button")).toHaveCount(0);
  await page.getByLabel("我的手牌").getByRole("button").first().click();
  await expect(page.locator(".hand > .tile.selected")).toBeEnabled();
  await expect(page.locator(".discard-button")).toHaveCount(0);
  await page.screenshot({
    path: `${captures}/table-mobile.png`,
    fullPage: true,
  });
  await page.locator(".hand > .tile.selected").click();
  await openTableMenu(page, 'events');
  await expect(page.getByRole("dialog")).toContainText("打出");
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  await noOverflow(page);
  await openTableMenu(page, 'leave');
  await expect(page.getByRole("dialog")).toContainText("练习进度会保存");
  await page.getByRole("button", { name: "返回大厅", exact: true }).click();
  await page.getByRole("button", { name: /继续打/ }).click();
  await expect(page.getByLabel("我的手牌")).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("jinling:practice")!).players[0]
          .discards.length,
    ),
  ).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});
test("桌面布局、玩法与个人设置", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.goto("/");
  await page.screenshot({
    path: `${captures}/home-desktop.png`,
    fullPage: true,
  });
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "玩法" })
    .click();
  await expect(page.getByRole("heading", { name: "本桌怎么玩" })).toBeVisible();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "我的", exact: true })
    .click();
  await page.getByLabel("牌桌昵称").fill("南京老友");
  await page.getByRole("button", { name: "保存昵称", exact: true }).click();
  await expect(page.locator("#profile-name-status")).toContainText(
    "昵称已保存",
  );
  await page.reload();
  await expect(page.getByRole("navigation")).toBeVisible();
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem("jinling:name")!),
    ),
  ).toBe("南京老友");
  await page.getByRole("button", { name: /单人练习/ }).click();
  await page.screenshot({
    path: `${captures}/table-desktop.png`,
    fullPage: true,
  });
  await noOverflow(page);
});
test("房主转交后界面权限保持一致，补空位的人不能添加电脑", async ({
  browser,
}) => {
  const contexts = await Promise.all(
    Array.from({ length: 3 }, () =>
      browser.newContext({ viewport: { width: 844, height: 390 } }),
    ),
  );
  const pages = await Promise.all(contexts.map((c) => c.newPage()));
  await Promise.all(contexts.map((c) => browserAccount(c)));
  try {
    await Promise.all(pages.map((p) => p.goto("http://127.0.0.1:5178")));
    await legacyRoom(pages[0], "甲");
    await expect(pages[0].locator(".room-code strong")).toHaveText(/^\d{6}$/);
    const code = await pages[0].locator(".room-code strong").innerText();
    for (let i = 1; i < 3; i++) {
      await pages[i].getByRole("button", { name: /加入好友桌/ }).click();
      await pages[i].getByLabel("牌桌昵称").fill(i === 1 ? "乙" : "丙");
      await pages[i].getByLabel("房间号", { exact: true }).fill(code);
      await pages[i]
        .getByRole("button", { name: "加入房间", exact: true })
        .click();
      await expect(pages[i].locator(".room-code strong")).toHaveText(code);
      if (i === 1) {
        await expect(
          pages[i].getByRole("button", { name: "添加电脑陪练" }),
        ).toHaveCount(0);
        await pages[0]
          .getByRole("button", { name: "返回大厅", exact: true })
          .click();
        await expect(
          pages[i].getByRole("button", { name: "添加电脑陪练" }),
        ).toBeVisible();
      }
    }
    await expect(pages[2].locator(".waiting-seat").nth(0)).toContainText("丙");
    await expect(
      pages[2].getByRole("button", { name: "添加电脑陪练" }),
    ).toHaveCount(0);
    await pages[1].reload();
    await expect(
      pages[1].getByRole("button", { name: "添加电脑陪练" }),
    ).toBeVisible();
    await expect(pages[1].locator(".waiting-seat").nth(1)).toContainText(
      "房主",
    );
    await pages[1].getByRole("button", { name: "添加电脑陪练" }).click();
    await expect(pages[2].locator(".waiting-seat").nth(2)).toContainText(
      "钟山",
    );
    await noOverflow(pages[1]);
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
  }
});
test("四个独立客户端创建、加入、开局、同步与刷新重连", async ({ browser }) => {
  const contexts = await Promise.all(
    Array.from({ length: 4 }, () =>
      browser.newContext({ viewport: { width: 844, height: 390 } }),
    ),
  );
  const pages = await Promise.all(contexts.map((c) => c.newPage()));
  await Promise.all(contexts.map((c) => browserAccount(c)));
  try {
    await Promise.all(pages.map((p) => p.goto("http://127.0.0.1:5178")));
    await legacyRoom(pages[0], "房主");
    await expect(pages[0].locator(".room-code strong")).toHaveText(/^\d{6}$/);
    const code = await pages[0].locator(".room-code strong").innerText();
    for (let i = 1; i < 4; i++) {
      await pages[i].getByRole("button", { name: /加入好友桌/ }).click();
      await pages[i].getByLabel("牌桌昵称").fill(`牌友${i}`);
      await pages[i].getByLabel("房间号", { exact: true }).fill(code);
      await pages[i]
        .getByRole("button", { name: "加入房间", exact: true })
        .click();
      await expect(pages[i].locator(".room-code strong")).toHaveText(code);
    }
    await pages[0].screenshot({
      path: `${captures}/room-mobile.png`,
      fullPage: true,
    });
    for (const page of pages)
      await page.getByRole("button", { name: "我准备好了" }).click();
    await Promise.all(
      pages.map((p) => expect(p.getByLabel("我的手牌")).toBeVisible()),
    );
    expect(await pages[0].getByLabel("我的手牌").locator(".tile").count()).toBe(
      14,
    );
    expect(await pages[1].getByLabel("我的手牌").locator(".tile").count()).toBe(
      13,
    );
    expect(await pages[1].locator(".opponent-hand .tile").count()).toBe(0);
    await pages[0].getByLabel("我的手牌").getByRole("button").first().click();
    await pages[0].locator(".hand > .tile.selected").click();
    await openTableMenu(pages[1], 'events');
    await expect(pages[1].getByRole("dialog")).toContainText("房主 打出");
    await pages[1].getByRole("button", { name: "关闭", exact: true }).click();
    await pages[1].reload();
    await expect(pages[1].getByLabel("我的手牌")).toBeVisible();
    await expect(pages[1].locator(".game-topbar")).toContainText(code);
    await openTableMenu(pages[1], 'leave');
    await pages[1]
      .getByRole("button", { name: "申请解散", exact: true })
      .click();
    for (const i of [0, 2, 3])
      await pages[i]
        .getByRole("button", { name: "同意解散", exact: true })
        .click();
    await Promise.all(
      pages.map((p) =>
        expect(
          p.getByRole("heading", { name: "牌桌已解散", exact: true }),
        ).toBeVisible(),
      ),
    );
    await pages[0]
      .getByRole("button", { name: "返回大厅", exact: true })
      .click();
    await pages[0]
      .getByRole("navigation")
      .getByRole("button", { name: "战绩" })
      .click();
    await expect(pages[0].locator(".records-list")).toContainText(code);
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
  }
});

test("同一张牌再次点击即可打出，横屏手牌单排且牌桌无需滚动", async ({
  page,
}) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto("/");
  for (const name of ["单人练习，快速开始", "开一桌，等朋友", "加入好友桌"]) {
    const box = await page
      .getByRole("button", { name, exact: true })
      .boundingBox();
    expect(box!.y + box!.height).toBeLessThan(390 - 50);
  }
  await page.getByRole("button", { name: /单人练习/ }).click();
  const hand = page.getByLabel("我的手牌");
  const first = hand.getByRole("button").first();
  const second = hand.getByRole("button").nth(1);
  const restTop = (await first.boundingBox())!.y;
  await first.click();
  await expect(first).toHaveAttribute("aria-pressed", "true");
  await expect
    .poll(async () => (await first.boundingBox())!.y)
    .toBeLessThan(restTop - 4);
  await second.click();
  await expect(first).toHaveAttribute("aria-pressed", "false");
  await expect(second).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".discards-0 .tile")).toHaveCount(0);
  await expect(page.locator(".discard-button")).toHaveCount(0);
  await second.click();
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("jinling:practice")!).players[0]
          .discards.length,
    ),
  ).toBe(1);
  await expect(hand.locator('[aria-pressed="true"]')).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollHeight <= innerHeight + 1,
    ),
  ).toBe(true);
  await page.screenshot({ path: `${captures}/classic-table-phone.png` });
  await page.setViewportSize({ width: 844, height: 390 });
  const boxes = await hand.locator(".tile").evaluateAll((tiles) =>
    tiles.map((tile) => {
      const b = tile.getBoundingClientRect();
      return { top: b.top, width: b.width, bottom: b.bottom };
    }),
  );
  expect(new Set(boxes.map((b) => Math.round(b.top))).size).toBe(1);
  expect(Math.min(...boxes.map((b) => b.width))).toBeGreaterThanOrEqual(44);
  expect(Math.max(...boxes.map((b) => b.bottom))).toBeLessThan(390);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollHeight <= innerHeight + 1,
    ),
  ).toBe(true);
  await noOverflow(page);
  await page.screenshot({ path: `${captures}/classic-table-landscape.png` });
});

test("手机竖屏只显示旋转提示，横回后仍在原牌局", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "横屏，开始这一局" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /单人练习/ })).toBeHidden();
  await page.setViewportSize({ width: 844, height: 390 });
  await page.getByRole("button", { name: /单人练习/ }).click();
  const id = await page.evaluate(
    () => JSON.parse(localStorage.getItem("jinling:practice")!).id,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByLabel("我的手牌")).toBeHidden();
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(page.getByLabel("我的手牌")).toBeVisible();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("jinling:practice")!).id,
    ),
  ).toBe(id);
});
