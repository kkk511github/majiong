import { test, expect, type Page } from "@playwright/test";
import type { Announcement } from "../shared/announcements";

const updateApi = "https://212.189.31.46/api/products/jinling-mahjong";
const announcement = (title = "成员公告", revision = 1): Announcement => ({
  id: "fixture-announcement",
  title,
  body: "正文文本",
  revision,
  publishedAt: 1789920000000 + revision,
  readRevision: null,
  unread: true,
});
const dialog = (page: Page) => page.locator("dialog.announcement-dialog");
const update = (page: Page) => page.locator("dialog.app-update-dialog");
const action = (page: Page, name: string, value?: unknown) =>
  page.evaluate(
    ({ name, value }) => (window as any).__notificationFixture[name](value),
    { name, value },
  );

async function setup(page: Page, native = false) {
  const state = {
    items: { "member-a": [announcement()], "member-b": [] } as Record<
      string,
      Announcement[]
    >,
    listCalls: 0,
    readCalls: 0,
    updates: 0,
    failRead: false,
    failLists: false,
    hold: null as null | { resolve: () => void; promise: Promise<void> },
    held: false,
  };
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route(/^https?:\/\//, (route) =>
    new URL(route.request().url()).origin === "http://127.0.0.1:5196"
      ? route.continue()
      : route.abort(),
  );
  await page.route(updateApi, (route) => {
    state.updates++;
    const id = "a".repeat(24);
    return route.fulfill({
      headers: { "Access-Control-Allow-Origin": "*" },
      json: {
        variants: [
          {
            id,
            name: "金陵麻将",
            platform: "android",
            package: "com.jinling.mahjong",
            version: "0.7.25",
            version_code: "62",
            size: 1234,
            sha256: "c".repeat(64),
            download_url: `https://212.189.31.46/download/${id}.apk`,
            notes: "更新内容",
          },
        ],
      },
    });
  });
  await page.route("**/notification-fixture/**", async (route) => {
    const account = new URL(route.request().url()).pathname.split("/")[2];
    if (route.request().method() === "POST") {
      state.readCalls++;
      if (state.failRead)
        return route.fulfill({
          status: 503,
          json: { error: "已读服务暂不可用" },
        });
      const { revision } = route.request().postDataJSON();
      const item = state.items[account]?.find(
        (value) => value.revision === revision,
      );
      if (!item)
        return route.fulfill({
          status: 409,
          json: { error: "公告已更新或撤回" },
        });
      item.unread = false;
      item.readRevision = revision;
      return route.fulfill({
        json: { id: item.id, revision, readAt: Date.now() },
      });
    }
    state.listCalls++;
    const snapshot = structuredClone(state.items[account] ?? []);
    const hold = state.hold;
    if (hold) {
      state.hold = null;
      state.held = true;
      await hold.promise;
    } else if (state.failLists)
      return route.fulfill({
        status: 503,
        json: { error: "列表服务暂不可用" },
      });
    return route.fulfill({
      json: {
        announcements: snapshot,
        unreadCount: snapshot.filter((value) => value.unread).length,
      },
    });
  });
  await page.addInitScript((native) => {
    const win = window as any,
      listeners = new Map<
        string,
        { plugin: string; callback: (value: unknown) => void }
      >();
    let next = 0;
    const state: any = (win.__notificationNative = {
      progress: { status: "idle", received: 0, total: 0, percent: 0 },
      installs: 0,
      cancels: 0,
      mode: "installer",
      pending: null,
      emit: (progress: unknown) => {
        state.progress = progress;
        for (const value of listeners.values())
          if (value.plugin === "AppUpdate") value.callback(progress);
      },
      resume: () => {
        for (const value of listeners.values())
          if (value.plugin === "App") value.callback({ isActive: true });
      },
    });
    if (!native) return;
    win.CapacitorCustomPlatform = { name: "android" };
    win.Capacitor = {
      PluginHeaders: [
        {
          name: "AppUpdate",
          methods: [
            ...[
              "getInfo",
              "getProgress",
              "install",
              "cancel",
              "openInstallPage",
              "removeListener",
            ].map((name) => ({ name, rtype: "promise" })),
            { name: "addListener", rtype: "callback" },
          ],
        },
        {
          name: "App",
          methods: [
            { name: "addListener", rtype: "callback" },
            { name: "removeListener", rtype: "promise" },
          ],
        },
      ],
      nativeCallback(
        plugin: string,
        _method: string,
        _options: unknown,
        callback: (value: unknown) => void,
      ) {
        const id = String(++next);
        listeners.set(id, { plugin, callback });
        return id;
      },
      async nativePromise(plugin: string, method: string, options: any) {
        if (method === "removeListener") {
          listeners.delete(options.callbackId);
          return;
        }
        if (plugin !== "AppUpdate") return;
        if (method === "getInfo")
          return {
            version: "0.7.24",
            build: "61",
            packageName: "com.jinling.mahjong",
            osVersion: "18.0",
          };
        if (method === "getProgress") return state.progress;
        if (method === "install") {
          state.installs++;
          if (state.mode === "pending")
            return new Promise((resolve) => {
              state.pending = resolve;
            });
          if (state.mode === "permission") {
            state.progress = {
              ...state.progress,
              status: "permission-required",
            };
            return { status: "permission-required" };
          }
          state.progress = { ...state.progress, status: "installer-opened" };
          return { status: "installer-opened" };
        }
        if (method === "cancel") {
          state.cancels++;
          return;
        }
        if (method === "openInstallPage") return { status: "page-opened" };
        throw new Error(`Unexpected native method ${method}`);
      },
    };
  }, native);
  const holdNextList = () => {
    let resolve!: () => void;
    const promise = new Promise<void>((done) => {
      resolve = done;
    });
    state.hold = { resolve, promise };
    state.held = false;
    return resolve;
  };
  return {
    state,
    errors,
    holdNextList,
    goto: async (inGame = false) => {
      await page.goto(
        `/tests/previews/notification-center.html${inGame ? "?inGame=1" : ""}`,
      );
      await page.waitForFunction(() => !!(window as any).__notificationFixture);
    },
  };
}

test("同时有OTA和公告时先显示更新，关闭后仅显示一层公告", async ({ page }) => {
  const f = await setup(page, true);
  await f.goto();
  await expect(update(page)).toBeVisible();
  await expect(dialog(page)).toHaveCount(0);
  await update(page)
    .getByRole("button", { name: "稍后再说", exact: true })
    .click();
  await expect(dialog(page)).toBeVisible();
  await expect(page.locator("dialog[open]")).toHaveCount(1);
  expect(f.errors).toEqual([]);
});

test("牌局期间不检查或弹出，回到大厅按OTA再公告继续", async ({ page }) => {
  const f = await setup(page, true);
  await f.goto(true);
  await page.waitForTimeout(1400);
  expect(f.state.updates).toBe(0);
  expect(f.state.listCalls).toBe(0);
  await expect(page.locator("dialog")).toHaveCount(0);
  await action(page, "inGame", false);
  await expect(update(page)).toBeVisible();
  await update(page)
    .getByRole("button", { name: "稍后再说", exact: true })
    .click();
  await expect(dialog(page)).toBeVisible();
  expect(f.errors).toEqual([]);
});

test("撤回关闭当前公告，新版可提示；已读失败不清红点且不反复自动弹出", async ({
  page,
}) => {
  const f = await setup(page);
  await f.goto();
  await expect(dialog(page)).toContainText("成员公告");
  f.state.items["member-a"] = [];
  await action(page, "refresh");
  await expect(dialog(page)).toHaveCount(0);
  await expect(page.getByTestId("notice")).toContainText("已撤回");
  f.state.items["member-a"] = [announcement("新版公告", 2)];
  await action(page, "refresh");
  await expect(dialog(page)).toContainText("新版公告");
  f.state.failRead = true;
  await dialog(page)
    .getByRole("button", { name: "我知道了", exact: true })
    .click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(page.getByTestId("unread")).toHaveText("1");
  await expect(page.getByTestId("notice")).toContainText("暂未保存");
  await action(page, "refresh");
  await page.waitForTimeout(100);
  await expect(dialog(page)).toHaveCount(0);
  await action(page, "openAnnouncements");
  await dialog(page)
    .getByRole("button", { name: /新版公告/ })
    .click();
  f.state.failRead = false;
  await dialog(page)
    .getByRole("button", { name: "我知道了", exact: true })
    .click();
  await expect(page.getByTestId("unread")).toHaveText("0");
  expect(f.errors).toEqual([]);
});

test("切账号不重放上个账号的手动公告请求", async ({ page }) => {
  const f = await setup(page);
  f.state.items["member-a"] = [];
  await f.goto();
  await action(page, "checkUpdates");
  await expect(update(page)).toBeVisible();
  await update(page).getByRole("button", { name: "关闭", exact: true }).last().click();
  await action(page, "openAnnouncements");
  await expect(dialog(page)).toBeVisible();
  await dialog(page).getByRole("button", { name: "关闭", exact: true }).click();
  await action(page, "setAccount", "member-b");
  await expect(page.getByTestId("account")).toHaveText("member-b");
  await expect(dialog(page)).toHaveCount(0);
  await expect(update(page)).toHaveCount(0);
});

test("已读成功后晚到的旧列表不能恢复未读，即使后续刷新失败", async ({
  page,
}) => {
  const f = await setup(page);
  await f.goto();
  await expect(dialog(page)).toBeVisible();
  await page.waitForTimeout(100);
  const release = f.holdNextList();
  try {
    await action(page, "refresh");
    await expect.poll(() => f.state.held).toBe(true);
    await dialog(page)
      .getByRole("button", { name: "我知道了", exact: true })
      .click();
    await expect(page.getByTestId("unread")).toHaveText("0");
    f.state.failLists = true;
    release();
    await page.waitForTimeout(100);
    await expect(page.getByTestId("unread")).toHaveText("0");
  } finally {
    release();
  }
});

test("切账号后迟到的旧公告结果不会覆盖新账号", async ({ page }) => {
  const f = await setup(page),
    release = f.holdNextList();
  f.state.items["member-b"] = [announcement("新账号公告", 5)];
  try {
    await f.goto();
    await expect.poll(() => f.state.held).toBe(true);
    await action(page, "setAccount", "member-b");
    await expect(dialog(page)).toContainText("新账号公告");
    release();
    await page.waitForTimeout(100);
    await expect(dialog(page)).not.toContainText("成员公告");
  } finally {
    release();
  }
});

test("从系统安装界面返回后释放更新队列，继续展示待确认公告", async ({
  page,
}) => {
  const f = await setup(page, true);
  await f.goto();
  await expect(update(page)).toBeVisible();
  await update(page)
    .getByRole("button", { name: "下载并更新", exact: true })
    .click();
  await expect(update(page)).toContainText("请在系统安装窗口中确认更新");
  await page.evaluate(() => (window as any).__notificationNative.resume());
  await expect(update(page)).toHaveCount(0);
  await expect(dialog(page)).toBeVisible();
});

test("系统权限设置返回仍保留继续安装，不能当作已打开安装器释放队列", async ({
  page,
}) => {
  const f = await setup(page, true);
  await f.goto();
  await expect(update(page)).toBeVisible();
  await page.evaluate(() => {
    (window as any).__notificationNative.mode = "permission";
  });
  await update(page)
    .getByRole("button", { name: "下载并更新", exact: true })
    .click();
  await expect(
    update(page).getByRole("button", { name: "继续安装", exact: true }),
  ).toBeVisible();
  await page.evaluate(() => (window as any).__notificationNative.resume());
  await expect(update(page)).toBeVisible();
  await expect(dialog(page)).toHaveCount(0);
});

test("系统返回发生在安装promise完成前时等待其完成，且不调用取消下载", async ({
  page,
}) => {
  const f = await setup(page, true);
  await f.goto();
  await expect(update(page)).toBeVisible();
  await page.evaluate(() => {
    (window as any).__notificationNative.mode = "pending";
  });
  await update(page)
    .getByRole("button", { name: "下载并更新", exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(() => !!(window as any).__notificationNative.pending),
    )
    .toBe(true);
  await page.evaluate(() => {
    const native = (window as any).__notificationNative;
    native.emit({ ...native.progress, status: "installer-opened" });
    native.resume();
  });
  await expect(update(page)).toBeVisible();
  await expect(dialog(page)).toHaveCount(0);
  await page.evaluate(() => {
    const native = (window as any).__notificationNative;
    native.pending({ status: "installer-opened" });
    native.pending = null;
  });
  await expect(update(page)).toHaveCount(0);
  await expect(dialog(page)).toBeVisible();
  expect(
    await page.evaluate(() => (window as any).__notificationNative.cancels),
  ).toBe(0);
});
