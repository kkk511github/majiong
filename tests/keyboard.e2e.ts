import { test, expect, browserAccount, type Page, type Locator } from "./browser-fixtures";

const androidAgent = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36";

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

async function expectAboveKeyboard(control: Locator, availableHeight: number) {
  await expect.poll(() => control.evaluate((element, height) => {
    const rect = element.getBoundingClientRect();
    const form = element.closest("form")?.getBoundingClientRect();
    const visible = rect.height >= 44 && rect.top >= 0 && rect.bottom <= height;
    return visible && (!form || rect.top >= form.top && rect.bottom <= form.bottom) &&
      element.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
  }, availableHeight)).toBe(true);
}

test("Android实际调整布局：密码和确认密码切换保持可见，收起键盘恢复整页", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 568, height: 320 } });
  try {
    const page = await context.newPage();
    await page.goto("http://127.0.0.1:5178");
    await page.getByRole("tab", { name: "注册账号", exact: true }).click();
    const password = page.getByLabel("密码", { exact: true });
    const confirm = page.getByLabel("确认密码", { exact: true });
    await password.focus();
    // This changes the actual CSS layout viewport, unlike redefining innerHeight.
    await page.setViewportSize({ width: 568, height: 100 });
    await expect(page.locator("html")).toHaveAttribute("data-keyboard-open", "");
    await expectAboveKeyboard(password, 100);
    await password.fill("keyboard-regression");
    await page.getByRole("button", { name: "显示密码", exact: true }).click();
    await expect(password).toBeFocused();
    await expect(password).toHaveAttribute("type", "text");
    await expectAboveKeyboard(password, 100);
    await confirm.focus();
    await confirm.fill("keyboard-regression");
    await expectAboveKeyboard(confirm, 100);
    await expectAboveKeyboard(page.getByRole("button", { name: "注册并进入大厅", exact: true }), 100);
    await page.setViewportSize({ width: 568, height: 320 });
    await expect(page.locator("html")).not.toHaveAttribute("data-keyboard-open", "");
    await expect(page.getByRole("tab", { name: "账号登录", exact: true })).toBeVisible();
    await expect(confirm).toHaveValue("keyboard-regression");
    expect(await page.locator("html").evaluate(element => element.style.getPropertyValue("--input-viewport-height"))).toBe("");
  } finally {
    await context.close();
  }
});

for (const registering of [false, true])
test(`Android覆盖式键盘${registering ? "注册" : "登录"}：视口不缩小时密码输入仍在顶部且可切换显隐`, async ({ browser }, testInfo) => {
  const context = await browser.newContext({ viewport: { width: 844, height: 390 }, userAgent: androidAgent, hasTouch: true });
  try {
    const page = await context.newPage();
    await page.goto("http://127.0.0.1:5178");
    if (registering) await page.getByRole("tab", { name: "注册账号", exact: true }).click();
    const password = page.getByLabel("密码", { exact: true });
    await password.focus();
    await expect(page.locator("html")).toHaveAttribute("data-account-editing", "");
    expect(await page.evaluate(() => ({ inner: innerHeight, visual: visualViewport!.height }))).toEqual({ inner: 390, visual: 390 });
    await expectAboveKeyboard(password, 120);
    await password.fill("overlay-keyboard-test");
    await page.getByRole("button", { name: "显示密码", exact: true }).click();
    await expect(password).toBeFocused();
    await expect(password).toHaveAttribute("type", "text");
    await expectAboveKeyboard(password, 120);
    await page.getByRole("button", { name: "隐藏密码", exact: true }).click();
    await expect(password).toBeFocused();
    await expect(password).toHaveAttribute("type", "password");
    if (registering) {
      const confirm = page.getByLabel("确认密码", { exact: true });
      await confirm.focus();
      await confirm.fill("overlay-keyboard-test");
      await expectAboveKeyboard(confirm, 120);
    }
    await expectAboveKeyboard(page.getByRole("button", { name: registering ? "注册并进入大厅" : "登录，开始相聚", exact: true }), 120);
    await page.screenshot({ path: testInfo.outputPath("android-overlay-password.png") });
    await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
    await expect(page.locator("html")).not.toHaveAttribute("data-account-editing", "");
    await expect(page.getByRole("tab", { name: "账号登录", exact: true })).toBeVisible();
    await expect(password).toHaveValue("overlay-keyboard-test");
  } finally {
    await context.close();
  }
});

test("Android个人资料修改密码：覆盖式键盘下确认新密码与保存按钮可见", async ({ browser }, testInfo) => {
  const context = await browser.newContext({ viewport: { width: 844, height: 390 }, userAgent: androidAgent, hasTouch: true });
  try {
    await browserAccount(context);
    const page = await context.newPage();
    await page.goto("http://127.0.0.1:5178");
    await page.getByRole("button", { name: "我的", exact: true }).click();
    await page.getByRole("button", { name: "账号安全", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "修改密码", exact: true });
    for (const name of ["原密码", "新密码", "确认新密码"]) {
      const field = dialog.getByLabel(name, { exact: true });
      await field.focus();
      await expect(page.locator("html")).toHaveAttribute("data-account-editing", "");
      await expectAboveKeyboard(field, 120);
    }
    await expectAboveKeyboard(dialog.getByRole("button", { name: "保存新密码", exact: true }), 120);
    await expectAboveKeyboard(dialog.getByRole("button", { name: "关闭", exact: true }), 120);
    await page.screenshot({ path: testInfo.outputPath("android-overlay-password-dialog.png") });
    await dialog.getByRole("button", { name: "关闭", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.locator("html")).not.toHaveAttribute("data-account-editing", "");
    await expect(page.getByRole("heading", { name: "我的", exact: true })).toBeVisible();
  } finally {
    await context.close();
  }
});

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

for (const android of [false, true])
  test(`${android ? "Android adjustResize" : "iOS 平移"}：90像素键盘区内确认密码跟随焦点且显示密码不丢焦点`, async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width: 568, height: 320 },
    });
    try {
      const page = await context.newPage();
      await viewportFixture(page);
      await page.goto("http://127.0.0.1:5178");
      await page.getByRole("tab", { name: "注册账号", exact: true }).click();
      const password = page.getByLabel("密码", { exact: true }),
        confirm = page.getByLabel("确认密码", { exact: true });
      await password.focus();
      await page.evaluate((android) => {
        if (android)
          Object.defineProperty(window, "innerHeight", {
            configurable: true,
            get: () => 90,
          });
        (window as any).keyboardViewport(90, android ? 0 : 18);
        window.dispatchEvent(new Event("resize"));
      }, android);
      await expect(page.locator("html")).toHaveAttribute(
        "data-keyboard-open",
        "",
      );
      await password.fill("input-test");
      await page.getByRole("button", { name: "显示密码", exact: true }).click();
      await expect(password).toBeFocused();
      await expect(password).toHaveAttribute("type", "text");
      await confirm.focus();
      await confirm.fill("input-test");
      await expect
        .poll(() =>
          confirm.evaluate((el) => {
            const r = el.getBoundingClientRect(),
              f = el.closest("form")!.getBoundingClientRect();
            return (
              r.top >= f.top &&
              r.bottom <= f.bottom &&
              r.bottom <= visualViewport!.offsetTop + visualViewport!.height
            );
          }),
        )
        .toBe(true);
      await page.screenshot({
        path: `test-results/screenshots/password-keyboard-${android ? "android" : "ios"}.png`,
      });
    } finally {
      await context.close();
    }
  });
