import { test, expect, type Page } from "./browser-fixtures";

async function centered(page: Page, left: number, right: number, bottom: number) {
  const nav = page.getByRole("navigation", { name: "主导航" });
  await expect(nav.getByRole("button")).toHaveCount(5);
  await expect.poll(async () => nav.evaluate((element, safe) => {
    const rects = [...element.querySelectorAll("button")].map(button => button.getBoundingClientRect());
    const first = rects[0], last = rects.at(-1)!;
    return {
      centered: Math.abs((first.left + last.right) / 2 - innerWidth / 2) <= 1,
      sameWidth: rects.every(rect => Math.abs(rect.width - first.width) <= 1),
      fits: rects.every(rect => rect.left >= safe.left && rect.right <= innerWidth - safe.right &&
        rect.top >= 0 && rect.bottom <= innerHeight - safe.bottom + 1 && rect.width >= 44 && rect.height >= 44),
    };
  }, { left, right, bottom })).toEqual({ centered: true, sameWidth: true, fits: true });
}

async function fullScreenWorkspace(page: Page, selector: string) {
  const box = await page.locator(selector).evaluate(element => {
    const rect = element.getBoundingClientRect();
    const nav = document.querySelector(".bottom-nav")!.getBoundingClientRect();
    return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom,
      width: innerWidth, navTop: nav.top, radius: getComputedStyle(element).borderTopLeftRadius };
  });
  expect(box.left).toBeCloseTo(0, 0);
  expect(box.top).toBeCloseTo(0, 0);
  expect(box.right).toBeCloseTo(box.width, 0);
  expect(box.bottom).toBeCloseTo(box.navTop, 0);
  expect(box.radius).toBe("0px");
}

for (const [width, height, notch, bottom] of [[568, 320, 0, 0], [874, 402, 62, 21], [932, 430, 59, 21]]) {
  test(`底部导航全页面居中，左右横屏安全区不偏移 ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: { left: notch, right: 0, top: 0, bottom } });
    await page.goto("/");
    await expect(page.getByRole("button", { name: "房间大厅", exact: true })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    for (const side of ["left", "right"] as const) {
      const left = side === "left" ? notch : 0, right = side === "right" ? notch : 0;
      await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: { left, right, top: 0, bottom } });
      for (const title of ["牌桌", "约局", "战绩", "玩法", "我的"]) {
        await page.getByRole("navigation", { name: "主导航" }).getByRole("button", { name: title, exact: true }).click();
        await centered(page, left, right, bottom);
        if (title === "约局") await fullScreenWorkspace(page, ".game-room-directory");
        if (title === "战绩") {
          await expect(page.getByRole("region", { name: "战绩中心" })).toBeVisible();
          await fullScreenWorkspace(page, ".records-workspace");
        }
        if (title === "我的") {
          const account = await page.locator(".profile-account").evaluate(element => {
            const r = element.getBoundingClientRect();
            const parent = element.closest(".profile-personal-info")!.getBoundingClientRect();
            return { height: r.height, line: parseFloat(getComputedStyle(element).lineHeight), bottom: r.bottom, limit: parent.bottom };
          });
          expect(account.height).toBeGreaterThanOrEqual(account.line - 1);
          expect(account.bottom).toBeLessThanOrEqual(account.limit + 1);
        }
      }
      await page.getByRole("navigation", { name: "主导航" }).getByRole("button", { name: "牌桌", exact: true }).click();
      await page.getByRole("button", { name: "亲友房", exact: true }).click();
      await centered(page, left, right, bottom);
      await fullScreenWorkspace(page, ".game-room-directory");
      await page.screenshot({ path: test.info().outputPath(`navigation-${side}.png`) });
    }
  });
}
