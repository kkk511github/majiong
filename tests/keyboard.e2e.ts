import { test, expect, type Page } from "./browser-fixtures";

async function viewportFixture(page: Page) {
  await page.addInitScript(() => {
    const viewport = window.visualViewport!;
    let height = 390,
      offsetTop = 0,
      scale = 1;
    Object.defineProperties(viewport, {
      height: { get: () => height },
      offsetTop: { get: () => offsetTop },
      scale: { get: () => scale },
    });
    Object.assign(window, {
      keyboardViewport(h: number, top = 0, zoom = 1) {
        height = h;
        offsetTop = top;
        scale = zoom;
        viewport.dispatchEvent(new Event("resize"));
      },
    });
  });
}

test("iOS 可视区域缩小：输入和确认留在键盘上方，收起后恢复，缩放不误判", async ({
  page,
}) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await viewportFixture(page);
  await page.goto("/");
  await page.getByRole("button", { name: "加入好友桌", exact: true }).click();
  const code = page.getByLabel("房间号", { exact: true });
  await code.focus();
  await page.evaluate(() => (window as any).keyboardViewport(160, 18));
  await expect(page.locator("html")).toHaveAttribute("data-keyboard-open", "");
  for (const control of [
    code,
    page.getByRole("button", { name: "加入房间", exact: true }),
    page.getByRole("button", { name: "关闭", exact: true }),
  ]) {
    const bounds = (await control.boundingBox())!;
    expect(bounds.y).toBeGreaterThanOrEqual(18);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(178);
    expect(bounds.height).toBeGreaterThanOrEqual(44);
  }
  expect(
    await code.evaluate((el) => {
      const r = el.getBoundingClientRect(),
        body = el.closest(".modal-body")!.getBoundingClientRect();
      return r.top >= body.top && r.bottom <= body.bottom;
    }),
  ).toBe(true);
  await code.fill("12");
  await page.getByRole("button", { name: "加入房间", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("6 位");
  await expect(code).toHaveValue("12");
  await page.evaluate(() => (window as any).keyboardViewport(390));
  await expect(page.locator("html")).not.toHaveAttribute(
    "data-keyboard-open",
    "",
  );
  await code.focus();
  await page.evaluate(() => (window as any).keyboardViewport(220, 0, 1.5));
  await expect(page.locator("html")).not.toHaveAttribute(
    "data-keyboard-open",
    "",
  );
});

for (const [width, height] of [
  [568, 320],
  [844, 390],
  [874, 402],
])
  for (const registering of [false, true])
    test(`${registering ? "注册" : "登录"}键盘 ${width}：只剩120像素时完整显示全部输入与提交，收起恢复`, async ({
      browser,
    }) => {
      const context = await browser.newContext({
        viewport: { width, height },
      });
      try {
        const page = await context.newPage();
        await viewportFixture(page);
        await page.goto("http://127.0.0.1:5178");
        await expect(
          page.getByRole("tab", { name: "账号登录", exact: true }),
        ).toBeVisible();
        if (registering)
          await page
            .getByRole("tab", { name: "注册账号", exact: true })
            .click();
        const input = page.getByLabel(registering ? "确认密码" : "账号", {
          exact: true,
        });
        await input.focus();
        await page.evaluate(() => (window as any).keyboardViewport(120, 18));
        await expect(page.locator("html")).toHaveAttribute(
          "data-keyboard-open",
          "",
        );
        // Focus a different row then return, as native keyboard's Next control does.
        await page.getByLabel("密码", { exact: true }).focus();
        await input.focus();
        const button = page.getByRole("button", {
          name: registering ? "注册并进入大厅" : "登录，开始相聚",
          exact: true,
        });
        const bounds = (await button.boundingBox())!;
        expect(bounds.y).toBeGreaterThanOrEqual(18);
        expect(bounds.y + bounds.height).toBeLessThanOrEqual(138);
        expect(bounds.height).toBeGreaterThanOrEqual(44);
        for (const field of await page.locator(".account-form input").all()) {
          expect(
            await field.evaluate((el) => {
              const r = el.getBoundingClientRect(),
                form = el.closest("form")!.getBoundingClientRect();
              return (
                r.height >= 44 &&
                r.top >= form.top &&
                r.bottom <= form.bottom &&
                r.top >= 18 &&
                r.bottom <= 138 &&
                el.contains(
                  document.elementFromPoint(
                    r.x + r.width / 2,
                    r.y + r.height / 2,
                  ),
                )
              );
            }),
          ).toBe(true);
        }
        expect(
          await button.evaluate(
            (el) =>
              (el as HTMLButtonElement).form ===
              document.querySelector(".account-form"),
          ),
        ).toBe(true);
        await page.evaluate((h) => (window as any).keyboardViewport(h), height);
        await expect(
          page.getByRole("tab", { name: "账号登录", exact: true }),
        ).toBeVisible();
      } finally {
        await context.close();
      }
    });
