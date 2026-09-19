import { test, expect, type Page } from "./browser-fixtures";
import type { AppUpdateProgress } from "../src/app-update";

const server = "https://212.189.31.46";
const productURL = `${server}/app/jinling-mahjong`;
const apiURL = `${server}/api/products/jinling-mahjong`;
const releases = ["android", "ios"].map((platform, i) => {
  const id = (i ? "b" : "a").repeat(24);
  return {
    id, name: "金陵麻将", platform, package: "com.jinling.mahjong",
    version: "0.7.25", version_code: "62", size: 10 * 1024 * 1024,
    sha256: "c".repeat(64), published: 1, created: 1789821000,
    download_url: `${server}/download/${id}.${i ? "ipa" : "apk"}`,
    install_url: i ? `itms-services://?action=download-manifest&url=${encodeURIComponent(`${server}/manifest/${id}.plist`)}` : undefined,
    minimum_os_version: i ? "15.0" : undefined,
    installation_note: i ? "请在 Safari 中安装有效企业签名版本。" : "",
    notes: "优化摸牌与出牌动画\n完善碰杠补花提示",
  };
});
type NativeMode = "android" | "ios" | "web";

/** Exercise the real Capacitor proxy and React UI, replacing only the OS bridge. */
async function updaterFixture(page: Page, platform: NativeMode, build = "61") {
  const issues: string[] = [];
  page.on("pageerror", error => issues.push(error.message));
  const external: string[] = [];
  let requests = 0, responseStatus = 200;
  let currentReleases = releases;
  let responseDelay: Promise<void> | undefined;
  await page.context().route(/^https?:\/\//, route => {
    if (new URL(route.request().url()).origin === "http://127.0.0.1:5178") return route.continue();
    external.push(route.request().url());
    return route.abort();
  });
  await page.route(apiURL, async route => {
    requests++;
    await responseDelay;
    return route.fulfill({
      status: responseStatus,
      headers: { "access-control-allow-origin": "http://127.0.0.1:5178" },
      json: responseStatus === 200 ? { name: "金陵麻将", variants: currentReleases } : { error: "版本服务暂时不可用" },
    });
  });
  await page.addInitScript(({ platform, build }) => {
    const win = window as any;
    const callbacks = new Map<string, { plugin: string; event: string; callback: (value: unknown) => void }>();
    const state: any = win.__appUpdateAudit = {
      calls: [], opened: [], mode: "pending", failCancel: false,
      progress: { status: "idle", received: 0, total: 0, percent: 0 },
      pending: null,
    };
    const emit = (progress: unknown) => {
      state.progress = progress;
      for (const entry of callbacks.values())
        if (entry.plugin === "AppUpdate" && entry.event === "progress") entry.callback(progress);
    };
    state.emit = emit;
    state.finish = (status: string) => {
      if (!state.pending) throw new Error("No native installation is pending");
      const pending = state.pending;
      state.pending = null;
      emit({ ...state.progress, status });
      pending.resolve({ status });
    };
    state.resume = () => {
      for (const entry of callbacks.values())
        if (entry.plugin === "App" && entry.event === "appStateChange") entry.callback({ isActive: true });
    };
    window.open = ((url: string) => { state.opened.push(String(url)); return null; }) as typeof window.open;
    if (platform === "web") return;
    win.CapacitorCustomPlatform = { name: platform };
    let nextId = 0;
    win.Capacitor = {
      PluginHeaders: [
        { name: "AppUpdate", methods: [
          ...["getInfo", "getProgress", "install", "cancel", "openInstallPage", "removeListener"].map(name => ({ name, rtype: "promise" })),
          { name: "addListener", rtype: "callback" },
        ] },
        { name: "App", methods: [{ name: "addListener", rtype: "callback" }, { name: "removeListener", rtype: "promise" }] },
      ],
      nativeCallback(plugin: string, method: string, options: any, callback: (value: unknown) => void) {
        const id = String(++nextId);
        state.calls.push({ plugin, method, options });
        callbacks.set(id, { plugin, event: options.eventName, callback });
        return id;
      },
      async nativePromise(plugin: string, method: string, options: any) {
        state.calls.push({ plugin, method, options: options ?? null });
        if (method === "removeListener") { callbacks.delete(options.callbackId); return; }
        if (plugin !== "AppUpdate") return;
        if (method === "getInfo") return { version: "0.7.24", build, packageName: "com.jinling.mahjong", osVersion: "18.0" };
        if (method === "getProgress") return state.progress;
        if (method === "openInstallPage") return { status: "page-opened" };
        if (method === "cancel") {
          if (state.failCancel) throw new Error("取消失败，请重试");
          emit({ ...state.progress, status: "cancelled" });
          const pending = state.pending;
          state.pending = null;
          pending?.reject(new Error("下载已取消"));
          return;
        }
        if (method === "install") {
          if (state.mode === "permission") {
            emit({ ...state.progress, status: "permission-required", message: "请允许金陵麻将安装应用" });
            return { status: "permission-required" };
          }
          if (state.mode === "installer") return { status: "installer-opened" };
          return new Promise((resolve, reject) => { state.pending = { resolve, reject }; });
        }
        throw new Error(`Unexpected mock method: ${plugin}.${method}`);
      },
    };
  }, { platform, build });
  return {
    issues, external,
    get requests() { return requests; },
    set responseStatus(value: number) { responseStatus = value; },
    replacePackage(sha256: string) { currentReleases = releases.map(release => ({ ...release, sha256 })); },
    holdResponses() { let release!: () => void; responseDelay = new Promise(resolve => { release = resolve; }); return release; },
    calls: () => page.evaluate(() => (window as any).__appUpdateAudit.calls as { plugin: string; method: string; options: any }[]),
  };
}

const updateDialog = (page: Page) => page.locator("dialog.app-update-dialog");
async function emitProgress(page: Page, status: AppUpdateProgress["status"], percent = 50) {
  await page.evaluate(({ status, percent }) => (window as any).__appUpdateAudit.emit({
    status, received: percent * 1024 * 1024 / 10, total: 10 * 1024 * 1024, percent,
  }), { status, percent });
}
async function openManual(page: Page) {
  await page.getByRole("button", { name: "我的", exact: true }).click();
  await page.getByRole("button", { name: "检查更新", exact: true }).click();
  await expect(updateDialog(page)).toBeVisible();
}

test("Android 发现新版只提醒，未点击前不下载或打开安装器", async ({ page }, info) => {
  const audit = await updaterFixture(page, "android");
  await page.goto("/");
  const dialog = updateDialog(page);
  await expect(dialog.getByRole("heading", { name: "发现新版本", exact: true })).toBeVisible();
  await expect(dialog).toContainText("当前 v0.7.24 · Build 61");
  await expect(dialog).toContainText("v0.7.25");
  await expect(dialog.getByRole("button", { name: "下载并更新", exact: true })).toBeEnabled();
  await expect(dialog.getByRole("button", { name: "下载并更新", exact: true })).toBeInViewport({ ratio: 1 });
  expect((await audit.calls()).filter(call => ["install", "openInstallPage"].includes(call.method))).toEqual([]);
  expect(audit.external).toEqual([]); expect(audit.issues).toEqual([]);
  await page.screenshot({ path: info.outputPath("android-update-discovered.png") });
});

test("Android 下载进度真实反映桥接事件，打开系统安装器不能显示安装成功", async ({ page }, info) => {
  const audit = await updaterFixture(page, "android");
  await page.goto("/");
  const dialog = updateDialog(page);
  await dialog.getByRole("button", { name: "下载并更新", exact: true }).click();
  await expect.poll(async () => (await audit.calls()).filter(call => call.method === "install").length).toBe(1);
  expect((await audit.calls()).find(call => call.method === "install")?.options).toEqual({
    url: releases[0].download_url, sha256: releases[0].sha256, size: releases[0].size, build: releases[0].version_code,
  });
  await emitProgress(page, "downloading");
  await expect(dialog.getByRole("progressbar", { name: "安装包下载进度" })).toHaveAttribute("value", "50");
  await expect(dialog.getByRole("progressbar", { name: "安装包下载进度" })).toBeInViewport({ ratio: 1 });
  await expect(dialog.getByLabel("更新进度")).toContainText("5.0 MB / 10.0 MB");
  await page.screenshot({ path: info.outputPath("android-update-progress.png") });
  await page.evaluate(() => (window as any).__appUpdateAudit.finish("installer-opened"));
  await expect(dialog.getByLabel("更新进度")).toContainText("请在系统安装窗口中确认更新");
  await expect(dialog.getByRole("button", { name: "再次打开安装", exact: true })).toBeVisible();
  await expect(dialog).not.toContainText(/安装成功|更新成功/);
  expect(audit.external).toEqual([]); expect(audit.issues).toEqual([]);
});

test("Android 取消下载调用原生cancel并关闭提示，不启动安装", async ({ page }) => {
  const audit = await updaterFixture(page, "android");
  await page.goto("/");
  const dialog = updateDialog(page);
  await dialog.getByRole("button", { name: "下载并更新", exact: true }).click();
  await expect.poll(async () => (await audit.calls()).filter(call => call.method === "install").length).toBe(1);
  await emitProgress(page, "downloading", 23);
  await dialog.getByRole("button", { name: "取消下载", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect((await audit.calls()).filter(call => call.method === "cancel")).toHaveLength(1);
  expect((await audit.calls()).filter(call => call.method === "openInstallPage")).toHaveLength(0);
  expect(await page.evaluate(() => (window as any).__appUpdateAudit.pending)).toBeNull();
  expect(audit.external).toEqual([]); expect(audit.issues).toEqual([]);
});

test("Android 授权返回后显示继续安装，确认前不声称更新完成", async ({ page }, info) => {
  const audit = await updaterFixture(page, "android");
  await page.goto("/");
  await page.evaluate(() => { (window as any).__appUpdateAudit.mode = "permission"; });
  const dialog = updateDialog(page);
  await dialog.getByRole("button", { name: "下载并更新", exact: true }).click();
  await expect(dialog.getByLabel("更新进度")).toContainText("请允许安装应用，再返回继续");
  await expect(dialog.getByRole("button", { name: "继续安装", exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath("android-update-permission.png") });
  await page.evaluate(() => { const state = (window as any).__appUpdateAudit; state.mode = "installer"; state.resume(); });
  await dialog.getByRole("button", { name: "继续安装", exact: true }).click();
  await expect(dialog.getByLabel("更新进度")).toContainText("请在系统安装窗口中确认更新");
  expect((await audit.calls()).filter(call => call.method === "install")).toHaveLength(2);
  await expect(dialog).not.toContainText(/安装成功|更新成功/);
  expect(audit.external).toEqual([]); expect(audit.issues).toEqual([]);
});

test("iOS 更新只调用安装页面桥接，绝不使用Android下载或安装接口", async ({ page }, info) => {
  const audit = await updaterFixture(page, "ios");
  await page.goto("/");
  const dialog = updateDialog(page);
  await dialog.getByRole("button", { name: "前往安装更新", exact: true }).click();
  await expect(dialog.getByLabel("更新进度")).toContainText("已打开安装页面，请在页面继续安装");
  expect((await audit.calls()).filter(call => call.method === "openInstallPage")).toHaveLength(1);
  expect((await audit.calls()).filter(call => call.method === "install")).toHaveLength(0);
  await expect(dialog).not.toContainText(/安装成功|更新成功/);
  await page.screenshot({ path: info.outputPath("ios-update-page-opened.png") });
  expect(audit.external).toEqual([]); expect(audit.issues).toEqual([]);
});

test("最新版本可从我的顶栏手动检查，设置入口同样可用", async ({ page }) => {
  const audit = await updaterFixture(page, "android", "62");
  await page.goto("/");
  await openManual(page);
  const dialog = updateDialog(page);
  await expect(dialog).toContainText("当前已经是最新版本");
  expect((await audit.calls()).filter(call => call.method === "install")).toHaveLength(0);
  await dialog.getByRole("button", { name: "关闭", exact: true }).last().click();
  await page.getByRole("button", { name: "牌桌", exact: true }).click();
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await page.getByRole("button", { name: "检查应用更新", exact: true }).click();
  await expect(dialog).toContainText("当前已经是最新版本");
  expect(audit.external).toEqual([]); expect(audit.issues).toEqual([]);
});

test("网页版只提供客户端安装链接，不查询OTA或调用原生安装", async ({ page }) => {
  const audit = await updaterFixture(page, "web");
  await page.goto("/");
  await openManual(page);
  const dialog = updateDialog(page);
  await expect(dialog).toContainText("当前使用网页版");
  await dialog.getByRole("button", { name: "打开安装页面", exact: true }).click();
  expect(await page.evaluate(() => (window as any).__appUpdateAudit.opened)).toEqual([productURL]);
  expect(audit.requests).toBe(0); expect(await audit.calls()).toEqual([]);
  expect(audit.external).toEqual([]); expect(audit.issues).toEqual([]);
});

test("检查失败可重试，重试成功后仍等用户点击才下载", async ({ page }) => {
  const audit = await updaterFixture(page, "android");
  audit.responseStatus = 503;
  await page.goto("/");
  await openManual(page);
  const dialog = updateDialog(page);
  await expect(dialog.getByRole("alert")).toContainText("版本服务暂时不可用");
  audit.responseStatus = 200;
  await dialog.getByRole("button", { name: "重新检查", exact: true }).click();
  await expect(dialog.getByRole("heading", { name: "发现新版本", exact: true })).toBeVisible();
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  expect((await audit.calls()).filter(call => call.method === "install")).toHaveLength(0);
  expect(audit.external).toEqual([]); expect(audit.issues).toEqual([]);
});

test("取消失败时保留更新窗口和错误提示，Esc不能绕过取消结果", async ({ page }) => {
  const audit = await updaterFixture(page, "android");
  await page.goto("/");
  const dialog = updateDialog(page);
  await dialog.getByRole("button", { name: "下载并更新", exact: true }).click();
  await expect.poll(async () => (await audit.calls()).filter(call => call.method === "install").length).toBe(1);
  await emitProgress(page, "downloading", 21);
  await page.evaluate(() => { (window as any).__appUpdateAudit.failCancel = true; });
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("alert")).toContainText("取消失败，请重试");
  expect((await audit.calls()).filter(call => call.method === "cancel")).toHaveLength(1);
  expect(audit.external).toEqual([]); expect(audit.issues).toEqual([]);
});

test("后台换包后可重新检查版本，不能反复拿旧校验值重试", async ({ page }) => {
  const audit = await updaterFixture(page, "android");
  await page.goto("/");
  const dialog = updateDialog(page);
  await expect(dialog.getByRole("heading", { name: "发现新版本", exact: true })).toBeVisible();
  audit.replacePackage("d".repeat(64));
  await dialog.getByRole("button", { name: "下载并更新", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("安装包已经更新，请重新检查版本");
  expect((await audit.calls()).filter(call => call.method === "install")).toHaveLength(0);
  await dialog.getByRole("button", { name: /重新检查|重试/ }).click();
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  await dialog.getByRole("button", { name: "下载并更新", exact: true }).click();
  await expect.poll(async () => (await audit.calls()).filter(call => call.method === "install").length).toBe(1);
  expect((await audit.calls()).find(call => call.method === "install")?.options.sha256).toBe("d".repeat(64));
  await dialog.getByRole("button", { name: "取消下载", exact: true }).click();
  expect(audit.external).toEqual([]); expect(audit.issues).toEqual([]);
});

test("手动检查慢响应期间关闭窗口，检查完成后不会再次弹出", async ({ page }) => {
  const audit = await updaterFixture(page, "android");
  const release = audit.holdResponses();
  try {
    await page.goto("/");
    await openManual(page);
    const dialog = updateDialog(page);
    await expect(dialog).toContainText("正在检查最新版本");
    await dialog.getByRole("button", { name: "关闭", exact: true }).last().click();
    await expect(dialog).toHaveCount(0);
    // The auto-check timer also fires while this manual response is pending.
    await page.waitForTimeout(1400);
    const finished = page.waitForResponse(apiURL);
    release();
    await finished;
    await page.waitForTimeout(300);
    await expect(dialog).toHaveCount(0);
    expect(audit.requests).toBe(1);
    expect(audit.external).toEqual([]); expect(audit.issues).toEqual([]);
  } finally { release(); }
});
