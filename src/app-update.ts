import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";

export const APP_DISTRIBUTION_URL = "https://212.189.31.46/app/jinling-mahjong";
const UPDATE_API = "https://212.189.31.46/api/products/jinling-mahjong";
const PACKAGE_NAME = "com.jinling.mahjong";
export type AppUpdateProgress = {
  status: "idle" | "downloading" | "verifying" | "permission-required" | "installer-opened" | "page-opened" | "error" | "cancelled";
  received: number; total: number; percent: number; message?: string;
};
export interface AppRelease {
  id: string; platform: "android" | "ios"; name: string; version: string; build: string;
  packageName: string; size: number; sha256: string; downloadUrl: string; installUrl?: string;
  installationNote: string; notes: string; created: number; minimumOsVersion?: string;
}
export interface AppUpdateCheck {
  platform: "android" | "ios" | "web"; current: { version: string; build: string } | null;
  latest: AppRelease | null; available: boolean; installable: boolean; reason?: string;
}
interface UpdateNative {
  getInfo(): Promise<{ version: string; build: string; packageName: string; osVersion: string }>;
  install(options: { url: string; sha256: string; size: number; build: string }): Promise<{ status: "permission-required" | "installer-opened" }>;
  openInstallPage(): Promise<{ status: "page-opened" }>;
  getProgress(): Promise<AppUpdateProgress>;
  cancel(): Promise<void>;
  addListener(event: "progress", listener: (progress: AppUpdateProgress) => void): Promise<PluginListenerHandle>;
}
const updater = registerPlugin<UpdateNative>("AppUpdate");
const idle: AppUpdateProgress = { status: "idle", received: 0, total: 0, percent: 0 };

/** Numeric build components, without overflowing JS integers or sorting 10 below 9. */
export function compareAppBuild(left: string, right: string): number {
  const parts = (value: string) => /^\d+(?:\.\d+)*$/.test(value.trim()) ? value.trim().split(".").map(v => v.replace(/^0+(?=\d)/, "")) : null;
  const a = parts(left), b = parts(right);
  if (!a || !b) throw new Error("版本构建号格式无效");
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? "0", y = b[i] ?? "0";
    if (x.length !== y.length) return x.length > y.length ? 1 : -1;
    if (x !== y) return x > y ? 1 : -1;
  }
  return 0;
}
export function parseAppRelease(value: unknown): AppRelease | null {
  if (!value || typeof value !== "object") return null;
  const r = value as Record<string, unknown>, platform = r.platform;
  if (platform !== "android" && platform !== "ios" || r.package !== PACKAGE_NAME || typeof r.id !== "string" || !/^[a-f0-9]{24}$/.test(r.id)) return null;
  const build = String(r.version_code ?? ""), size = Number(r.size), sha = String(r.sha256 ?? "").toLowerCase();
  if (!/^\d+(?:\.\d+)*$/.test(build) || !Number.isSafeInteger(size) || size <= 0 || size > 1024 ** 3 || !/^[a-f0-9]{64}$/.test(sha)) return null;
  const download = `https://212.189.31.46/download/${r.id}.${platform === "android" ? "apk" : "ipa"}`;
  if (r.download_url !== download || typeof r.version !== "string" || !r.version) return null;
  let installUrl: string | undefined;
  const expected = `itms-services://?action=download-manifest&url=${encodeURIComponent(`https://212.189.31.46/manifest/${r.id}.plist`)}`;
  if (r.install_url === expected) installUrl = expected;
  return { id: r.id, platform, packageName: PACKAGE_NAME, name: String(r.name || "金陵麻将"), version: r.version, build, size, sha256: sha, downloadUrl: download, installUrl,
    installationNote: String(r.installation_note || ""), notes: String(r.notes || ""), created: Number(r.created || 0), minimumOsVersion: String(r.minimum_os_version || "") };
}
export async function checkAppUpdate(): Promise<AppUpdateCheck> {
  const platform = Capacitor.isNativePlatform() ? Capacitor.getPlatform() : "web";
  if (platform !== "android" && platform !== "ios") return { platform: "web", current: null, latest: null, available: false, installable: false, reason: "网页版无需安装更新" };
  const info = await updater.getInfo();
  if (info.packageName !== PACKAGE_NAME) throw new Error("当前应用标识不匹配");
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(UPDATE_API, { method: "GET", credentials: "omit", cache: "no-store", signal: controller.signal });
    if (!response.ok) throw new Error(response.status === 404 ? "暂未发布安装包" : "版本服务暂时不可用，请稍后重试");
    const body = await response.json();
    const variants: AppRelease[] = Array.isArray(body?.variants) ? body.variants.map(parseAppRelease).filter((r: AppRelease | null): r is AppRelease => !!r && r.platform === platform) : [];
    variants.sort((a, b) => compareAppBuild(b.build, a.build));
    const latest = variants[0] ?? null, current = { version: info.version, build: info.build };
    if (!latest) return { platform, current, latest, available: false, installable: false, reason: "该平台暂未发布有效安装包" };
    const available = compareAppBuild(latest.build, info.build) > 0;
    let reason: string | undefined;
    if (platform === "ios" && !latest.installUrl) reason = latest.installationNote || "苹果安装包当前不可安装，请联系管理员检查签名";
    if (platform === "ios" && latest.minimumOsVersion) {
      try { if (compareAppBuild(info.osVersion, latest.minimumOsVersion) < 0) reason = `此版本需要 iOS ${latest.minimumOsVersion} 或更新系统`; } catch { reason = "无法确认系统版本是否满足安装要求"; }
    }
    return { platform, current, latest, available, installable: available && !reason, reason };
  } finally { clearTimeout(timer); }
}
export async function installAppUpdate(release: AppRelease): Promise<{ status: "permission-required" | "installer-opened" | "page-opened" }> {
  if (!Capacitor.isNativePlatform()) throw new Error("请在安装的应用中更新");
  const check = await checkAppUpdate();
  if (!check.installable || !check.latest) throw new Error(check.reason || "当前已是最新版本");
  if (release.id !== check.latest.id || release.sha256 !== check.latest.sha256) throw new Error("安装包已经更新，请重新检查版本");
  if (check.platform === "ios") return updater.openInstallPage();
  return updater.install({ url: check.latest.downloadUrl, sha256: check.latest.sha256, size: check.latest.size, build: check.latest.build });
}
export async function listenAppUpdate(listener: (event: AppUpdateProgress) => void): Promise<() => void> {
  if (!Capacitor.isNativePlatform()) return () => {};
  const subscription = await updater.addListener("progress", listener);
  return () => { void subscription.remove(); };
}
export async function getAppUpdateProgress(): Promise<AppUpdateProgress> { return Capacitor.isNativePlatform() ? updater.getProgress() : { ...idle }; }
export async function cancelAppUpdate(): Promise<void> { if (Capacitor.isNativePlatform()) await updater.cancel(); }
export async function openAppDistributionPage(): Promise<void> {
  if (Capacitor.isNativePlatform()) await updater.openInstallPage();
  else window.open(APP_DISTRIBUTION_URL, "_blank", "noopener,noreferrer");
}
