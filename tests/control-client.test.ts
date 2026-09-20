import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ControlApi,
  ControlApiError,
  CONTROL_SESSION_KEY,
  readControlSession,
  writeControlSession,
} from "../src/control/api";
import {
  announcementCanPublish,
  announcementIsDirty,
  announcementLiveContent,
  memberQuery,
  mayChangeMemberAccess,
  mayEditMember,
} from "../src/control/model";
import { AppPreview } from "../src/control/Preview";
import type { ControlAccount, ControlAnnouncement } from "../src/control/types";

const actor: ControlAccount = {
  id: "admin",
  username: "manager",
  name: "管理员",
  role: "admin",
  canManageAdmins: false,
  canCreateTables: false,
};
const member: ControlAccount = {
  id: "member",
  username: "member",
  name: "成员",
  role: "member",
};

beforeEach(() => {
  vi.restoreAllMocks();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("control credential and request boundaries", () => {
  it("stores this tab's credential without replacing the game's stored token", () => {
    const values = new Map<string, string>();
    vi.stubGlobal("sessionStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    });
    const gameStorage = { setItem: vi.fn(), removeItem: vi.fn() };
    vi.stubGlobal("localStorage", gameStorage);
    writeControlSession("current-server-session");
    expect(readControlSession()).toBe("current-server-session");
    expect([...values.keys()]).toEqual([CONTROL_SESSION_KEY]);
    writeControlSession(null);
    expect(readControlSession()).toBeNull();
    expect(gameStorage.setItem).not.toHaveBeenCalled();
    expect(gameStorage.removeItem).not.toHaveBeenCalled();
  });

  it("uses the explicit bearer credential and sends no browser cookies", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ account: actor }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);
    await new ControlApi(
      "token-from-control-login",
      vi.fn(),
      "/api/control",
    ).get("/auth/session");
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/control/auth/session");
    expect(options.credentials).toBe("omit");
    expect(options.headers.get("Authorization")).toBe(
      "Bearer token-from-control-login",
    );
    expect(options.cache).toBe("no-store");
  });

  it("expires only authenticated 401s and keeps permission/conflict messages actionable", async () => {
    const expired = vi.fn();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "请重新登录" }), { status: 401 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "不能修改此管理员" }), {
          status: 403,
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ error: "版本已改变", code: "DRAFT_MISMATCH" }),
          { status: 409 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "账号或密码错误" }), {
          status: 401,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const api = new ControlApi("session", expired, "/api/control");
    await expect(api.get("/members")).rejects.toThrow("请重新登录");
    await expect(
      api.post("/members/admin", { name: "保留此输入" }),
    ).rejects.toMatchObject({ message: "不能修改此管理员", status: 403 });
    await expect(
      api.post("/announcements/a", { title: "未丢失输入" }),
    ).rejects.toMatchObject({
      status: 409,
      details: { code: "DRAFT_MISMATCH" },
    });
    await expect(
      new ControlApi(null, expired, "/api/control").post("/auth/login", {
        username: "manager",
        password: "wrong",
      }),
    ).rejects.toThrow("账号或密码错误");
    expect(expired).toHaveBeenCalledTimes(1);
  });

  it("does not mistake a successful HTML gateway response for a saved change", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response("<html>gateway</html>", { status: 200 }),
        ),
    );
    await expect(
      new ControlApi("session", vi.fn(), "/api/control").post(
        "/announcements",
        {},
      ),
    ).rejects.toBeInstanceOf(ControlApiError);
  });
});

describe("control UI permission and content rules", () => {
  it("does not let ordinary administrators edit administrators, including themselves", () => {
    expect(mayEditMember(actor, member)).toBe(true);
    expect(mayEditMember(actor, actor)).toBe(false);
    expect(mayEditMember(actor, { ...actor, id: "other" })).toBe(false);
    expect(mayEditMember(member, member)).toBe(false);
  });

  it("blocks password/suspension changes for self and the protected account", () => {
    const owner = {
      ...actor,
      id: "owner",
      username: "guanli@1",
      canManageAdmins: true,
    };
    expect(mayEditMember(owner, owner)).toBe(true);
    expect(mayChangeMemberAccess(owner, owner)).toBe(false);
    expect(mayChangeMemberAccess({ ...owner, id: "other-owner" }, owner)).toBe(
      false,
    );
    expect(mayChangeMemberAccess(owner, actor)).toBe(true);
    expect(mayChangeMemberAccess(actor, { ...member, name: "guanli@1" })).toBe(
      true,
    );
  });

  it("encodes member filters and pagination while keeping old playBlocked separate", () => {
    const url = new URL(
      memberQuery({
        q: "  A&B 姓名  ",
        team: "unassigned",
        status: "suspended",
        page: 2,
      }),
      "https://control.test",
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      q: "A&B 姓名",
      team: "unassigned",
      status: "suspended",
      page: "2",
    });
    expect(memberQuery({ q: "", team: "", status: "active", page: 0 })).toBe(
      "/members?status=active&page=1",
    );
    expect(url.searchParams.has("playBlocked")).toBe(false);
  });

  it("requires announcement contents and detects edits without mutating the published object", () => {
    const published: ControlAnnouncement = {
      id: "announcement",
      draftTitle: "草稿标题",
      draftBody: "草稿正文",
      draftVersion: 2,
      publishedTitle: "线上标题",
      publishedBody: "线上正文",
      status: "published",
      revision: 1,
      createdAt: 1,
      updatedAt: 1,
      publishedAt: 1,
      publishedBy: "admin",
    };
    expect(announcementIsDirty(published, "编辑标题", "编辑正文")).toBe(true);
    expect(announcementLiveContent(published)).toEqual({
      title: "线上标题",
      body: "线上正文",
      publishedAt: 1,
    });
    expect(
      announcementIsDirty(published, published.draftTitle, published.draftBody),
    ).toBe(false);
    expect(announcementCanPublish(" ", "内容")).toBe(false);
    expect(announcementCanPublish("标题", " ")).toBe(false);
    expect(announcementCanPublish("标".repeat(81), "内容")).toBe(false);
    expect(announcementCanPublish("标题", "分段一\n分段二")).toBe(true);
  });

  it("renders announcements as escaped text, including scripts and event handlers", () => {
    const markup = renderToStaticMarkup(
      createElement(AppPreview, {
        content: {
          kind: "announcement",
          title: "<script>alert(1)</script>",
          body: '<img src="x" onerror="alert(1)">\n正文',
        },
      }),
    );
    expect(markup).toContain("&lt;script&gt;");
    expect(markup).toContain("&lt;img");
    expect(markup).not.toContain("<script>");
    expect(markup).not.toContain('<img src="x"');
  });
});

describe("release upload transport", () => {
  it("reports upload progress, sends file+notes, and cancels the underlying request", async () => {
    class UploadRequest {
      static latest: UploadRequest;
      upload: {
        onprogress?: (event: {
          lengthComputable: boolean;
          loaded: number;
          total: number;
        }) => void;
      } = {};
      headers: Record<string, string> = {};
      method = "";
      url = "";
      form?: FormData;
      onload?: () => void;
      onerror?: () => void;
      onabort?: () => void;
      constructor() {
        UploadRequest.latest = this;
      }
      open(method: string, url: string) {
        this.method = method;
        this.url = url;
      }
      setRequestHeader(key: string, value: string) {
        this.headers[key] = value;
      }
      send(form: FormData) {
        this.form = form;
      }
      abort() {
        this.onabort?.();
      }
    }
    vi.stubGlobal("XMLHttpRequest", UploadRequest);
    const controller = new AbortController();
    const progress = vi.fn();
    const upload = new ControlApi("session", vi.fn(), "/api/control").upload(
      "/releases/upload?platform=android",
      new File(["test"], "release.apk"),
      "更新说明",
      progress,
      controller.signal,
    );
    const request = UploadRequest.latest;
    expect(request.url).toBe("/api/control/releases/upload?platform=android");
    expect(request.headers.Authorization).toBe("Bearer session");
    expect(request.form?.get("notes")).toBe("更新说明");
    expect((request.form?.get("file") as File).name).toBe("release.apk");
    request.upload.onprogress?.({
      lengthComputable: true,
      loaded: 40,
      total: 100,
    });
    expect(progress).toHaveBeenLastCalledWith(40);
    controller.abort();
    await expect(upload).rejects.toMatchObject({ name: "AbortError" });
  });
});
