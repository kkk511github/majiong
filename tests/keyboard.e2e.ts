import { test, expect, browserAccount, UI_PASSWORD, type Page, type Locator } from "./browser-fixtures";
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { provisionAdministrator } from "../server/accounts";

const origin = `http://127.0.0.1:${process.env.MAHJONG_E2E_UI_PORT ?? 5178}`;

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

/** Physical hit testing uses an occluder, so visible-in-DOM is insufficient. */
async function coverWithIME(page: Page, top: number) {
  await page.evaluate(top => {
    let cover = document.querySelector<HTMLElement>("[data-test-ime]");
    if (!cover) { cover = document.createElement("div"); cover.dataset.testIme = ""; document.body.append(cover); }
    cover.textContent = "模拟 Android 覆盖式键盘 · 测试账号";
    cover.style.cssText = `position:fixed;left:0;right:0;top:${top}px;bottom:0;z-index:2147483647;background:#d8dce1;color:#4f5964;text-align:center;padding:18px;font:14px sans-serif;pointer-events:auto`;
  }, top);
}

type AndroidIME = "overlay" | "resize";
const fullAndroidViewport = { width: 844, height: 390 };
async function showAndroidIME(page: Page, mode: AndroidIME, available = 120) {
  if (mode === "overlay") await coverWithIME(page, available);
  else await page.setViewportSize({ width: fullAndroidViewport.width, height: available });
}
async function hideAndroidIME(page: Page, mode: AndroidIME, blur = mode === "overlay") {
  await page.evaluate(() => document.querySelector("[data-test-ime]")?.remove());
  if (mode === "resize") await page.setViewportSize(fullAndroidViewport);
  // An overlay keyboard has no resize signal; tapping outside is the explicit
  // dismissal gesture. adjustResize also covers Android Back retaining focus.
  if (blur) await page.mouse.click(10, 10);
}
async function expectAccountRestored(page: Page) {
  await expect(page.getByRole("tab", { name: "账号登录", exact: true })).toBeVisible();
  await expect(page.locator("html")).not.toHaveAttribute("data-keyboard-open", "");
  await expect(page.locator("html")).not.toHaveAttribute("data-account-editing", "");
  await expect.poll(() => page.evaluate(() => {
    const root = document.documentElement;
    const scrolls = [...document.querySelectorAll<HTMLElement>(".account-shell,.account-screen,.account-card,.account-form")].map(node => node.scrollTop);
    return { windowY: scrollY, rootY: document.scrollingElement?.scrollTop ?? 0, scrolled: scrolls.some(value => value !== 0),
      heightOverride: root.style.getPropertyValue("--input-viewport-height"), topOverride: root.style.getPropertyValue("--input-viewport-top") };
  })).toEqual({ windowY: 0, rootY: 0, scrolled: false, heightOverride: "", topOverride: "" });
}
async function togglePasswordWhileIME(page: Page, field: Locator, submit: Locator, available = 120) {
  await expectAboveKeyboard(field, available);
  await expectAboveKeyboard(submit, available);
  await page.getByRole("button", { name: "显示密码", exact: true }).click();
  await expect(field).toBeFocused();
  await expect(field).toHaveAttribute("type", "text");
  await expectAboveKeyboard(field, available);
  await page.getByRole("button", { name: "隐藏密码", exact: true }).click();
  await expect(field).toBeFocused();
  await expect(field).toHaveAttribute("type", "password");
  await expectAboveKeyboard(field, available);
  await expectAboveKeyboard(submit, available);
}
async function signOutThroughUI(page: Page) {
  await page.getByRole("navigation", { name: "主导航" }).getByRole("button", { name: "我的", exact: true }).click();
  await page.getByRole("button", { name: "退出登录", exact: true }).click();
  await page.getByRole("dialog", { name: "退出当前账号？", exact: true }).getByRole("button", { name: "退出登录", exact: true }).click();
  await expect(page.getByRole("button", { name: "登录，开始相聚", exact: true })).toBeVisible();
}
async function accountEvidence(page: Page, path: string) {
  const evidence = await page.evaluate(() => {
    const active = document.activeElement as HTMLElement | null;
    const bounds = (element: Element) => {
      const box = element.getBoundingClientRect();
      const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
      return { top: box.top, bottom: box.bottom, height: box.height, hit: element.contains(hit), hitIsIME: !!hit?.closest("[data-test-ime]") };
    };
    return { viewport: { inner: innerHeight, visual: visualViewport?.height }, activeTag: active?.tagName,
      activeAutocomplete: active?.getAttribute("autocomplete"),
      keyboardOpen: document.documentElement.hasAttribute("data-keyboard-open"),
      accountEditing: document.documentElement.hasAttribute("data-account-editing"), windowY: scrollY,
      fields: [...document.querySelectorAll<HTMLInputElement>(".account-form input")].map(input => ({ autocomplete: input.autocomplete, type: input.type, focused: input === active, ...bounds(input) })),
      submit: document.querySelector(".account-submit") ? bounds(document.querySelector(".account-submit")!) : null,
      formScroll: document.querySelector(".account-form")?.scrollTop,
    };
  });
  await mkdir(dirname(path), { recursive: true }); await writeFile(path, JSON.stringify(evidence, null, 2) + "\n");
}

test("注册提交时覆盖式IME尚未收起：焦点离开输入框也不能让密码落到键盘下面", async ({ browser }, info) => {
  const context = await browser.newContext({ viewport: { width: 844, height: 390 }, userAgent: androidAgent, hasTouch: true });
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  try {
    const page = await context.newPage();
    await page.route("**/api/auth/register", async route => {
      await held;
      await route.fulfill({ status: 409, json: { error: "本地键盘回归：请切回登录重试" } }).catch(() => {});
    });
    await page.goto(origin);
    await page.getByRole("tab", { name: "注册账号", exact: true }).click();
    await page.getByLabel("账号", { exact: true }).fill("keyboard-local-only");
    await page.getByLabel("牌桌昵称", { exact: true }).fill("键盘测试");
    await page.getByLabel("密码", { exact: true }).fill("Keyboard-local-password");
    await page.getByLabel("确认密码", { exact: true }).fill("Keyboard-local-password");
    await coverWithIME(page, 120);
    const submit = page.locator(".account-submit");
    await expectAboveKeyboard(submit, 120);
    const request = page.waitForRequest(request => request.url().endsWith("/api/auth/register") && request.method() === "POST");
    await submit.click(); await request;
    await page.waitForTimeout(100);
    const evidence = await page.evaluate(() => {
      const measure = (selector: string) => {
        const element = document.querySelector<HTMLElement>(selector)!;
        const rect = element.getBoundingClientRect(), hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
        return { top: rect.top, bottom: rect.bottom, hit: element.contains(hit), hitIsIME: !!hit?.closest("[data-test-ime]") };
      };
      return { viewport: { inner: innerHeight, visual: visualViewport?.height }, activeTag: document.activeElement?.tagName,
        password: measure('input[autocomplete="new-password"]'), submit: measure(".account-submit"),
        keyboardOpen: document.documentElement.hasAttribute("data-keyboard-open"), accountEditing: document.documentElement.hasAttribute("data-account-editing") };
    });
    await info.attach("registration-submit-IME-bounds", { body: JSON.stringify(evidence, null, 2), contentType: "application/json" });
    await page.screenshot({ path: info.outputPath("registration-submit-ime.png") });
    await expectAboveKeyboard(page.getByLabel("密码", { exact: true }), 120);
    await expectAboveKeyboard(submit, 120);
  } finally { release(); await context.close(); }
});

for (const firstMode of ["overlay", "resize"] as const)
test(`Android注册填写后回登录：${firstMode}与adjustResize交替，多次键盘及显隐不遮挡`, async ({ browser }, info) => {
  const context = await browser.newContext({ viewport: fullAndroidViewport, userAgent: androidAgent, hasTouch: true });
  try {
    const page = await context.newPage();
    await page.goto(origin);
    await page.getByRole("tab", { name: "注册账号", exact: true }).click();
    await page.getByLabel("账号", { exact: true }).fill("keyboard-switch-local");
    await page.getByLabel("牌桌昵称", { exact: true }).fill("切换测试");
    await page.getByLabel("密码", { exact: true }).fill(UI_PASSWORD);
    const confirm = page.getByLabel("确认密码", { exact: true });
    await confirm.fill(UI_PASSWORD);
    await showAndroidIME(page, firstMode, 100);
    await page.waitForTimeout(100);
    await accountEvidence(page, info.outputPath("registration-small-overlay-bounds.json"));
    await expectAboveKeyboard(confirm, 100);
    await expectAboveKeyboard(page.locator(".account-submit"), 100);
    await hideAndroidIME(page, firstMode);
    await expectAccountRestored(page);
    await page.getByRole("tab", { name: "账号登录", exact: true }).click();
    await expect(page.getByLabel("确认密码", { exact: true })).toHaveCount(0);
    await expect(page.getByLabel("账号", { exact: true })).toHaveValue("keyboard-switch-local");
    const password = page.getByLabel("密码", { exact: true });
    for (const mode of ["overlay", "resize", "overlay"] as const) {
      await password.tap();
      await showAndroidIME(page, mode);
      await togglePasswordWhileIME(page, password, page.locator(".account-submit"));
      await hideAndroidIME(page, mode);
      await expectAccountRestored(page);
      await expect(password).toHaveValue(UI_PASSWORD);
    }
    await page.screenshot({ path: info.outputPath(`login-after-registration-${firstMode}.png`) });
  } finally { await context.close(); }
});

for (const mode of ["overlay", "resize"] as const)
test(`Android真实本地注册成功后退出重登：${mode}下密码与登录按钮始终可点`, async ({ browser }, info) => {
  const context = await browser.newContext({ viewport: fullAndroidViewport, userAgent: androidAgent, hasTouch: true });
  try {
    const page = await context.newPage(), username = `ime-register-${randomUUID().slice(0, 8)}`;
    await page.goto(origin);
    await page.getByRole("tab", { name: "注册账号", exact: true }).click();
    await page.getByLabel("账号", { exact: true }).fill(username);
    await page.getByLabel("牌桌昵称", { exact: true }).fill("本地键盘回归");
    await page.getByLabel("密码", { exact: true }).fill(UI_PASSWORD);
    await page.getByLabel("确认密码", { exact: true }).fill(UI_PASSWORD);
    await showAndroidIME(page, mode);
    await expectAboveKeyboard(page.getByLabel("确认密码", { exact: true }), 120);
    await expectAboveKeyboard(page.locator(".account-submit"), 120);
    const registered = page.waitForResponse(response => response.url().endsWith("/api/auth/register") && response.request().method() === "POST");
    await page.locator(".account-submit").click();
    expect((await registered).ok()).toBe(true);
    await expect(page.locator(".account-screen")).toHaveCount(0);
    expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe("INPUT");
    await hideAndroidIME(page, mode, false);
    await expect(page.locator("html")).not.toHaveAttribute("data-account-editing", "");
    await signOutThroughUI(page);
    await expectAccountRestored(page);
    await page.getByLabel("账号", { exact: true }).fill(username);
    const password = page.getByLabel("密码", { exact: true });
    await password.fill(UI_PASSWORD);
    for (let i = 0; i < 3; i++) {
      await password.tap(); await showAndroidIME(page, mode);
      await togglePasswordWhileIME(page, password, page.locator(".account-submit"));
      if (i < 2) { await hideAndroidIME(page, mode); await expectAccountRestored(page); }
    }
    await page.screenshot({ path: info.outputPath(`registered-logout-login-${mode}.png`) });
    const loggedIn = page.waitForResponse(response => response.url().endsWith("/api/auth/login") && response.request().method() === "POST");
    await page.locator(".account-submit").click();
    expect((await loggedIn).ok()).toBe(true);
    await expect(page.locator(".account-screen")).toHaveCount(0);
    await hideAndroidIME(page, mode, false);
    await expect(page.getByRole("navigation", { name: "主导航" })).toBeVisible();
  } finally { await context.close(); }
});

for (const mode of ["overlay", "resize"] as const)
test(`Android首次设置初始密码后退出重登：${mode}不继承旧焦点或滚动`, async ({ browser }, info) => {
  const username = `ime-initial-${randomUUID().slice(0, 8)}`, changedPassword = "Local-initial-password-changed";
  const db = new DatabaseSync(resolve(process.env.MAHJONG_E2E_DATABASE ?? "../../work/accounts-e2e.sqlite"));
  try { await provisionAdministrator(db, { username, password: UI_PASSWORD, mustChangePassword: true }); }
  finally { db.close(); }
  const context = await browser.newContext({ viewport: fullAndroidViewport, userAgent: androidAgent, hasTouch: true });
  try {
    const page = await context.newPage(); await page.goto(origin);
    await page.getByLabel("账号", { exact: true }).fill(username);
    await page.getByLabel("密码", { exact: true }).fill(UI_PASSWORD);
    await showAndroidIME(page, mode);
    await expectAboveKeyboard(page.locator(".account-submit"), 120);
    await page.locator(".account-submit").click();
    await expect(page.getByLabel("新密码", { exact: true })).toBeVisible();
    await hideAndroidIME(page, mode, false);
    await page.waitForTimeout(100);
    await accountEvidence(page, info.outputPath("forced-transition-bounds.json"));
    await expect(page.getByRole("heading", { name: "设置你的新密码", exact: true })).toBeVisible();
    await page.getByLabel("初始密码", { exact: true }).fill(UI_PASSWORD);
    await page.getByLabel("新密码", { exact: true }).fill(changedPassword);
    const confirm = page.getByLabel("确认密码", { exact: true }); await confirm.fill(changedPassword);
    await showAndroidIME(page, mode, 100);
    await expectAboveKeyboard(confirm, 100); await expectAboveKeyboard(page.locator(".account-submit"), 100);
    await page.locator(".account-submit").click();
    await expect(page.locator(".account-screen")).toHaveCount(0);
    await hideAndroidIME(page, mode, false);
    await signOutThroughUI(page); await expectAccountRestored(page);
    await page.getByLabel("账号", { exact: true }).fill(username);
    const password = page.getByLabel("密码", { exact: true }); await password.fill(changedPassword);
    for (let i = 0; i < 2; i++) {
      await password.tap(); await showAndroidIME(page, mode);
      await togglePasswordWhileIME(page, password, page.locator(".account-submit"));
      if (i === 0) { await hideAndroidIME(page, mode); await expectAccountRestored(page); }
    }
    await page.screenshot({ path: info.outputPath(`forced-password-logout-login-${mode}.png`) });
    await page.locator(".account-submit").click();
    await expect(page.locator(".account-screen")).toHaveCount(0);
    await hideAndroidIME(page, mode, false);
    await expect(page.getByRole("navigation", { name: "主导航" })).toBeVisible();
  } finally { await context.close(); }
});

test("Android实际调整布局：密码和确认密码切换保持可见，收起键盘恢复整页", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 568, height: 320 } });
  try {
    const page = await context.newPage();
    await page.goto(origin);
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
    await page.goto(origin);
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
    await page.goto(origin);
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
        await page.goto(origin);
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
      await page.goto(origin);
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
