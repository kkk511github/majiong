import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({
  native: true, platform: "android", info: { version: "0.7.24", build: "61", packageName: "com.jinling.mahjong", osVersion: "18.0" },
  install: vi.fn(), open: vi.fn(), fetch: vi.fn(),
}));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => mock.native, getPlatform: () => mock.platform }, registerPlugin: () => ({ getInfo: async () => mock.info, install: mock.install, openInstallPage: mock.open }) }));
import { checkAppUpdate, compareAppBuild, installAppUpdate, parseAppRelease } from "../src/app-update";
const id = "247db54dd42a67ad48643ed5";
const metadata = (platform = "android") => ({ id, platform, package: "com.jinling.mahjong", name: "金陵麻将", version: "0.7.25", version_code: "62", size: 1234, sha256: "a".repeat(64), download_url: `https://212.189.31.46/download/${id}.${platform === "ios" ? "ipa" : "apk"}`, install_url: platform === "ios" ? `itms-services://?action=download-manifest&url=${encodeURIComponent(`https://212.189.31.46/manifest/${id}.plist`)}` : "", notes: "更新说明", installation_note: "系统仍需验证签名", minimum_os_version: "15.0" });
beforeEach(() => { vi.clearAllMocks(); mock.native = true; mock.platform = "android"; mock.info.build = "61"; mock.info.osVersion = "18.0"; vi.stubGlobal("fetch", mock.fetch); mock.fetch.mockResolvedValue({ ok: true, json: async () => ({ variants: [metadata()] }) }); mock.install.mockResolvedValue({ status: "installer-opened" }); mock.open.mockResolvedValue({ status: "page-opened" }); });
describe("app update contract", () => {
  it.each([["10", "9", 1], ["61", "061.0", 0], ["1.11", "1.2", 1], ["90071992547409930", "90071992547409929", 1], ["62", "63", -1]])("compares numeric build %s / %s", (a, b, expected) => expect(compareAppBuild(a as string, b as string)).toBe(expected));
  it("rejects non-numeric builds and untrusted package URLs", () => {
    expect(() => compareAppBuild("62beta", "61")).toThrow();
    expect(parseAppRelease({ ...metadata(), download_url: "http://212.189.31.46/download/a.apk" })).toBeNull();
    expect(parseAppRelease({ ...metadata(), package: "other.app" })).toBeNull();
    expect(parseAppRelease({ ...metadata(), size: -1 })).toBeNull();
    expect(parseAppRelease({ ...metadata(), sha256: "" })).toBeNull();
  });
  it("web checks never call native APIs or fetch a native package", async () => { mock.native = false; expect((await checkAppUpdate()).platform).toBe("web"); expect(mock.fetch).not.toHaveBeenCalled(); expect(mock.install).not.toHaveBeenCalled(); });
  it("checking a published build does not download until explicitly installed", async () => {
    const check = await checkAppUpdate(); expect(check.available).toBe(true); expect(check.installable).toBe(true); expect(mock.install).not.toHaveBeenCalled();
    await installAppUpdate(check.latest!); expect(mock.install).toHaveBeenCalledExactlyOnceWith({ url: metadata().download_url, sha256: "a".repeat(64), size: 1234, build: "62" });
    expect(mock.fetch.mock.calls[0][1].credentials).toBe("omit");
  });
  it("does not downgrade or install a package replaced after the check", async () => {
    const release = parseAppRelease(metadata())!; mock.info.build = "63"; await expect(installAppUpdate(release)).rejects.toThrow("最新版本");
    mock.info.build = "61"; mock.fetch.mockResolvedValue({ ok: true, json: async () => ({ variants: [{ ...metadata(), sha256: "b".repeat(64) }] }) });
    await expect(installAppUpdate(release)).rejects.toThrow("已经更新"); expect(mock.install).not.toHaveBeenCalled();
  });
  it("keeps unavailable iOS signatures and minimum OS failures non-installable", async () => {
    mock.platform = "ios"; mock.fetch.mockResolvedValue({ ok: true, json: async () => ({ variants: [{ ...metadata("ios"), install_url: "", installation_note: "签名已过期" }] }) });
    expect((await checkAppUpdate()).reason).toBe("签名已过期");
    mock.fetch.mockResolvedValue({ ok: true, json: async () => ({ variants: [metadata("ios")] }) }); mock.info.osVersion = "14.8";
    expect((await checkAppUpdate()).installable).toBe(false); expect((await checkAppUpdate()).reason).toContain("iOS 15.0");
  });
  it("iOS opens only its fixed installation page, without claiming completion", async () => {
    mock.platform = "ios"; mock.fetch.mockResolvedValue({ ok: true, json: async () => ({ variants: [metadata("ios")] }) });
    expect(await installAppUpdate(parseAppRelease(metadata("ios"))!)).toEqual({ status: "page-opened" }); expect(mock.open).toHaveBeenCalledOnce(); expect(mock.install).not.toHaveBeenCalled();
  });
});
