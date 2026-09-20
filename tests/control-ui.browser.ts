import { expect, test, type Page } from "@playwright/test";
import type {
  ControlAccount,
  ControlAnnouncement,
  ControlRelease,
} from "../src/control/types";

const actor: ControlAccount = {
  id: "test-admin",
  memberId: "100001",
  username: "testadmin",
  name: "测试管理员",
  role: "admin",
  canManageAdmins: true,
  canCreateTables: false,
  createdAt: 1780000000000,
  suspended: false,
};
const makeMember = (index: number): ControlAccount => ({
  id: `test-member-${index}`,
  memberId: String(100100 + index),
  username: `testmember${index}`,
  name: `测试成员${index}`,
  role: "member",
  teamId: null,
  teamName: null,
  createdAt: 1780000000000 + index * 60000,
  suspended: false,
  canManageAdmins: false,
  canCreateTables: false,
});
const release: ControlRelease = {
  id: "test-release",
  platform: "android",
  stage: "published",
  name: "测试安装包",
  packageId: "com.jinling.mahjong",
  version: "1.0.0",
  build: "100",
  size: 1024,
  sha256: "a".repeat(64),
  notes: "浏览器测试更新",
  createdAt: 1780000000000,
  createdBy: actor.username,
  publishedAt: 1780000000000,
  publishedBy: actor.username,
  productUrl: "",
  downloadUrl: "",
  minimumOsVersion: "24",
  distribution: "",
  signingMetadataPresent: true,
  provisioningExpiresAt: null,
  installationNote: "由系统验证安装条件",
  validation: {
    canPublish: true,
    errors: [],
    warnings: [],
    currentBuild: null,
    sameBuild: false,
    requiresSameBuildConfirmation: false,
    installationVerificationRequired: false,
  },
};

async function setup(page: Page, customActor = actor) {
  const state = {
    announcements: [] as ControlAnnouncement[],
    accounts: Array.from({ length: 24 }, (_, index) =>
      makeMember(index + 1),
    ).reverse(),
    current: [] as ControlRelease[],
    drafts: [] as ControlRelease[],
    posts: [] as { path: string; body: Record<string, unknown> }[],
    memberQueries: [] as Record<string, string>[],
    failAnnouncement: false,
    failMember: false,
    failUpload: false,
  };
  await page.addInitScript(() => {
    sessionStorage.setItem("jinling.control.session.v1", "test-session");
    localStorage.setItem(
      "jinling:token",
      JSON.stringify("existing-game-token"),
    );
  });
  await page.route("**/api/control/**", async (route) => {
    const request = route.request(),
      url = new URL(request.url()),
      path = url.pathname.replace("/api/control", "");
    const send = (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    if (path === "/auth/session") return send({ account: customActor });
    if (path === "/auth/logout") return send({ ok: true });
    if (path === "/announcements" && request.method() === "GET")
      return send({ announcements: state.announcements });
    if (path.startsWith("/announcements") && request.method() === "POST") {
      const body = request.postDataJSON() as Record<string, unknown>;
      state.posts.push({ path, body });
      if (state.failAnnouncement) {
        state.failAnnouncement = false;
        return send({ error: "暂时无法保存，请重试" }, 503);
      }
      const previous = state.announcements.find((item) =>
        path.startsWith(`/announcements/${item.id}`),
      );
      let announcement: ControlAnnouncement;
      if (path.endsWith("/publish") && previous) {
        announcement = {
          ...previous,
          status: "published",
          revision: previous.revision + 1,
          publishedTitle: previous.draftTitle,
          publishedBody: previous.draftBody,
          publishedAt: 1780000000000,
          publishedBy: customActor.username,
        };
      } else if (path.endsWith("/withdraw") && previous) {
        announcement = {
          ...previous,
          status: "withdrawn",
          revision: previous.revision + 1,
          draftVersion: previous.draftVersion + 1,
        };
      } else {
        announcement = {
          id:
            previous?.id ||
            `test-announcement-${state.announcements.length + 1}`,
          status: previous?.status || "draft",
          draftTitle: String(body.title),
          draftBody: String(body.body),
          draftVersion: (previous?.draftVersion || 0) + 1,
          revision: previous?.revision || 0,
          publishedTitle: previous?.publishedTitle || null,
          publishedBody: previous?.publishedBody || null,
          createdAt: 1780000000000,
          updatedAt: 1780000000000,
          publishedAt: previous?.publishedAt || null,
          publishedBy: previous?.publishedBy || null,
        };
      }
      state.announcements = [
        announcement,
        ...state.announcements.filter((item) => item.id !== announcement.id),
      ];
      return send({ announcement });
    }
    if (path === "/teams")
      return send({
        teams: [{ id: "test-team", name: "测试战队", members: 0 }],
      });
    if (path === "/members") {
      const query = Object.fromEntries(url.searchParams);
      state.memberQueries.push(query);
      let accounts = state.accounts;
      if (query.q)
        accounts = accounts.filter((member) =>
          `${member.id} ${member.memberId} ${member.username} ${member.name}`.includes(
            query.q,
          ),
        );
      if (query.team === "unassigned")
        accounts = accounts.filter((member) => !member.teamId);
      else if (query.team)
        accounts = accounts.filter((member) => member.teamId === query.team);
      if (query.status)
        accounts = accounts.filter(
          (member) => !!member.suspended === (query.status === "suspended"),
        );
      const pageNumber = Number(query.page || 1);
      return send({
        accounts: accounts.slice((pageNumber - 1) * 20, pageNumber * 20),
        total: accounts.length,
        page: pageNumber,
        pageSize: 20,
      });
    }
    if (path.endsWith("/audit")) return send({ audit: [] });
    if (path.startsWith("/members/") && request.method() === "POST") {
      const body = request.postDataJSON() as Record<string, unknown>;
      state.posts.push({ path, body });
      if (state.failMember) {
        state.failMember = false;
        return send({ error: "当前无权保存，请稍后重试" }, 403);
      }
      const previous = state.accounts.find(
        (member) => path === `/members/${member.id}`,
      )!;
      const account = {
        ...previous,
        name: String(body.name),
        teamId: body.teamId as string | null,
        teamName: body.teamId === "test-team" ? "测试战队" : null,
      };
      state.accounts = state.accounts.map((member) =>
        member.id === account.id ? account : member,
      );
      return send({ account });
    }
    if (path === "/releases")
      return send({
        current: state.current,
        drafts: state.drafts,
        history: [],
      });
    if (path === "/releases/upload") {
      state.posts.push({ path, body: { multipart: request.postData() } });
      if (state.failUpload) {
        state.failUpload = false;
        return send({ error: "安装包校验暂时失败" }, 400);
      }
      if (state.current.length)
        return send({ release: state.current[0], alreadyPublished: true });
      if (state.drafts.length)
        return send({ draft: state.drafts[0], alreadyStaged: true });
      const draft: ControlRelease = {
        ...release,
        stage: "draft",
        publishedAt: null,
        publishedBy: null,
      };
      state.drafts = [draft];
      return send({ draft }, 201);
    }
    if (path === `/releases/${release.id}/publish`) {
      const body = request.postDataJSON() as Record<string, unknown>;
      state.posts.push({ path, body });
      const draft = state.drafts[0];
      if (draft.validation.sameBuild && body.confirmSameBuild !== true)
        return send(
          {
            error: "需要确认相同Build",
            code: "SAME_BUILD_CONFIRMATION_REQUIRED",
          },
          409,
        );
      state.current = [
        { ...draft, stage: "published", publishedAt: 1780000000000 },
      ];
      state.drafts = [];
      return send({ release: state.current[0] });
    }
    return send({ error: `未定义测试路由 ${path}` }, 404);
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "公告管理", exact: true }),
  ).toBeVisible();
  return state;
}

test("announcement drafts keep the online version unchanged until explicit publication", async ({
  page,
}) => {
  const state = await setup(page);
  state.failAnnouncement = true;
  await page.getByLabel(/^公告标题/).fill("测试发布标题");
  await page.getByLabel(/^公告正文/).fill("第一段\n第二段");
  await page.getByRole("button", { name: "保存草稿", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("暂时无法保存");
  await expect(page.getByLabel(/^公告正文/)).toHaveValue("第一段\n第二段");
  await page.getByRole("button", { name: "保存草稿", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("草稿已保存");
  expect(state.posts[0].body.requestId).toBe(state.posts[1].body.requestId);
  expect(state.announcements[0].revision).toBe(0);
  expect(state.announcements[0].publishedBody).toBeNull();
  await page.getByRole("button", { name: "发布公告", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "确认发布公告" }),
  ).toBeVisible();
  expect(state.posts).toHaveLength(2);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "取消", exact: true })
    .click();
  expect(state.announcements[0].status).toBe("draft");
  await page.getByRole("button", { name: "发布公告", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "确认发布", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("公告已发布");
  expect(state.posts[2].body).toMatchObject({
    expectedRevision: 0,
    expectedDraftVersion: 1,
  });
  expect(state.posts[2].body.requestId).not.toBe(state.posts[1].body.requestId);
  await page.getByLabel(/^公告正文/).fill("新版正文");
  await page.getByRole("button", { name: "保存草稿", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("草稿已保存");
  expect(state.announcements[0].publishedBody).toBe("第一段\n第二段");
  expect(state.announcements[0].revision).toBe(1);
  expect(state.announcements[0].draftBody).toBe("新版正文");
  await page
    .getByRole("row")
    .filter({ hasText: "测试发布标题" })
    .getByRole("button", { name: "预览", exact: true })
    .click();
  await expect(
    page.getByRole("dialog").locator(".control-app-dialog-body"),
  ).toHaveText("第一段\n第二段");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "关闭", exact: true })
    .click();
  await page.getByRole("button", { name: "发布新版", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "确认发布", exact: true })
    .click();
  await expect.poll(() => state.announcements[0]?.revision).toBe(2);
  expect(state.announcements[0].publishedBody).toBe("新版正文");
  expect(await page.evaluate(() => localStorage.getItem("jinling:token"))).toBe(
    JSON.stringify("existing-game-token"),
  );
});

test("member paging resets for search and never interprets playBlocked as suspended", async ({
  page,
}) => {
  const state = await setup(page, { ...actor, canManageAdmins: false });
  state.accounts.unshift({
    ...makeMember(30),
    username: "oldplayblocked",
    playBlocked: true,
  });
  state.accounts.push({
    ...actor,
    id: "other-admin",
    username: "otheradmin",
    canManageAdmins: false,
  });
  await page.getByRole("button", { name: "人员管理", exact: true }).click();
  await page.getByRole("button", { name: "下一页" }).click();
  await expect.poll(() => state.memberQueries.at(-1)?.page).toBe("2");
  await page
    .getByRole("textbox", { name: "搜索账号、用户 ID 或昵称" })
    .fill("oldplayblocked");
  await page.getByRole("button", { name: "搜索", exact: true }).click();
  await expect
    .poll(() => state.memberQueries.at(-1))
    .toEqual({ q: "oldplayblocked", page: "1" });
  await expect(
    page.getByRole("row").filter({ hasText: "oldplayblocked" }),
  ).toContainText("正常");
  await page
    .getByRole("combobox", { name: "状态筛选" })
    .selectOption("suspended");
  await expect(
    page.getByText("没有符合条件的成员。可以调整筛选条件。"),
  ).toBeVisible();
  await page.getByRole("button", { name: "重置筛选" }).click();
  await page
    .getByRole("textbox", { name: "搜索账号、用户 ID 或昵称" })
    .fill("otheradmin");
  await page.getByRole("button", { name: "搜索", exact: true }).click();
  await page
    .getByRole("row")
    .filter({ hasText: "otheradmin" })
    .getByRole("button", { name: "查看" })
    .click();
  const drawer = page.getByRole("dialog");
  await expect(drawer.getByLabel(/^昵称/)).toBeDisabled();
  await expect(drawer.getByRole("button", { name: "保存修改" })).toHaveCount(0);
  await expect(drawer.getByRole("button", { name: "重置密码" })).toBeDisabled();
  await expect(drawer.locator(".control-permissions")).toContainText(
    "开桌权限无",
  );
});

test("member saves keep inputs on permission failure and show the server's final team", async ({
  page,
}) => {
  const state = await setup(page);
  state.failMember = true;
  await page.getByRole("button", { name: "人员管理", exact: true }).click();
  await page
    .getByRole("row")
    .filter({ hasText: "testmember24" })
    .getByRole("button", { name: "编辑" })
    .click();
  const drawer = page.getByRole("dialog");
  await drawer.getByLabel(/^昵称/).fill("改名测试");
  await drawer
    .getByRole("combobox", { name: "所属战队", exact: true })
    .selectOption("test-team");
  await expect(drawer).toContainText("未分配 → 测试战队");
  await drawer.getByRole("button", { name: "保存修改" }).click();
  await expect(drawer.getByRole("alert")).toContainText("当前无权保存");
  await expect(drawer.getByLabel(/^昵称/)).toHaveValue("改名测试");
  await drawer.getByRole("button", { name: "保存修改" }).click();
  await expect(drawer.getByRole("status")).toContainText("人员资料已更新");
  expect(state.posts.at(-1)?.body).toEqual({
    name: "改名测试",
    teamId: "test-team",
  });
  await drawer.getByRole("button", { name: "关闭", exact: true }).click();
  await expect(
    page.getByRole("row").filter({ hasText: "testmember24" }),
  ).toContainText("测试战队");
});

test("package upload stages only and publishes the exact package after confirmation", async ({
  page,
}) => {
  const state = await setup(page);
  state.failUpload = true;
  await page.getByRole("button", { name: "版本管理", exact: true }).click();
  const android = page.locator(".control-platform-card").first();
  await android.locator('input[type="file"]').setInputFiles({
    name: "browser-fixture.apk",
    mimeType: "application/vnd.android.package-archive",
    buffer: Buffer.from("isolated browser test fixture"),
  });
  await android
    .getByRole("textbox", { name: "Android 更新说明" })
    .fill("浏览器测试更新");
  await android.getByRole("button", { name: "上传并校验" }).click();
  await expect(android.getByRole("alert")).toContainText("安装包校验暂时失败");
  await expect(
    android.getByRole("textbox", { name: "Android 更新说明" }),
  ).toHaveValue("浏览器测试更新");
  await expect(android.getByText("browser-fixture.apk")).toBeVisible();
  await android.getByRole("button", { name: "上传并校验" }).click();
  await expect(android.locator(".control-release-draft")).toContainText(
    "Build 100",
  );
  expect(state.current).toHaveLength(0);
  expect(state.drafts).toHaveLength(1);
  await android.getByRole("button", { name: "发布更新", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "确认发布更新" }),
  ).toBeVisible();
  await expect(page.getByRole("dialog").getByRole("checkbox")).toHaveCount(0);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "取消", exact: true })
    .click();
  expect(state.current).toHaveLength(0);
  await android.getByRole("button", { name: "发布更新", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "确认发布", exact: true })
    .click();
  await expect(android.locator(".control-platform-heading")).toContainText(
    "v1.0.0 · Build 100",
  );
  expect(state.posts.at(-1)).toEqual({
    path: "/releases/test-release/publish",
    body: { sha256: release.sha256, build: "100" },
  });
  expect(state.drafts).toHaveLength(0);
  await android.getByText("查看包信息与校验结果").click();
  await expect(android).toContainText("最低 Android API24");
});

test("same-build replacement requires its own explicit acknowledgment", async ({
  page,
}) => {
  const state = await setup(page);
  state.drafts = [
    {
      ...release,
      stage: "draft",
      publishedAt: null,
      validation: {
        ...release.validation,
        sameBuild: true,
        requiresSameBuildConfirmation: true,
      },
    },
  ];
  await page.getByRole("button", { name: "版本管理", exact: true }).click();
  await page.getByRole("button", { name: "发布更新", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "确认发布更新" });
  await expect(
    dialog.getByRole("button", { name: "确认发布", exact: true }),
  ).toBeDisabled();
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "确认发布", exact: true }).click();
  await expect.poll(() => state.current.length).toBe(1);
  expect(state.posts.at(-1)?.body).toEqual({
    sha256: release.sha256,
    build: "100",
    confirmSameBuild: true,
  });
});

test("mobile management fits the viewport and previews escaped announcement text", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page);
  await page.getByLabel(/^公告标题/).fill("手机预览测试");
  await page.getByLabel(/^公告正文/).fill("<b>保持文本</b>\n第二段");
  await page.getByRole("button", { name: "预览", exact: true }).first().click();
  const dialog = page.getByRole("dialog", { name: "公告预览", exact: true });
  await expect(dialog.locator(".control-app-dialog-body")).toHaveText(
    "<b>保持文本</b>\n第二段",
  );
  await expect(dialog.locator(".control-app-dialog-body b")).toHaveCount(0);
  await dialog.getByRole("button", { name: "关闭", exact: true }).click();
  await page.getByRole("button", { name: "人员管理", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "人员管理", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("withdrawal keeps unsaved inputs without allowing an unnoticed overwrite of a newer draft", async ({
  page,
}) => {
  const state = await setup(page);
  state.announcements = [
    {
      id: "concurrent-announcement",
      status: "published",
      draftTitle: "并发编辑测试",
      draftBody: "原正文",
      draftVersion: 1,
      revision: 1,
      publishedTitle: "并发编辑测试",
      publishedBody: "原正文",
      createdAt: 1780000000000,
      updatedAt: 1780000000000,
      publishedAt: 1780000000000,
      publishedBy: actor.username,
    },
  ];
  await page.getByRole("button", { name: "刷新公告列表" }).click();
  await page
    .getByRole("row")
    .filter({ hasText: "并发编辑测试" })
    .getByRole("button", { name: "编辑", exact: true })
    .click();
  await page.getByLabel(/^公告正文/).fill("尚未保存的本地修改");
  state.announcements[0] = {
    ...state.announcements[0],
    draftBody: "另一管理员已保存的草稿",
    draftVersion: 2,
  };
  await page
    .getByRole("row")
    .filter({ hasText: "并发编辑测试" })
    .getByRole("button", { name: "撤回", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "确认撤回" })
    .click();
  await expect(page.getByLabel(/^公告正文/)).toHaveValue("尚未保存的本地修改");
  await expect(
    page.getByRole("button", { name: "保存草稿", exact: true }),
  ).toBeDisabled();
  await expect(page.getByRole("alert")).toContainText("重新载入最新草稿");
  expect(state.announcements[0].draftBody).toBe("另一管理员已保存的草稿");
});
