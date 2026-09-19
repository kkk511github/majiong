import { useCallback, useEffect, useRef, useState } from "react";
import { Capacitor, type PluginListenerHandle } from "@capacitor/core";
import { App as NativeApp } from "@capacitor/app";
import { ArrowUpRight, CheckCircle2, Download, RefreshCw, Smartphone } from "lucide-react";
import { Dialog } from "./Dialog";
import {
  cancelAppUpdate, checkAppUpdate, getAppUpdateProgress, installAppUpdate,
  listenAppUpdate, openAppDistributionPage, type AppUpdateProgress,
} from "./app-update";
import "./app-update.css";

type UpdateCheck = Awaited<ReturnType<typeof checkAppUpdate>>;
const idle: AppUpdateProgress = { status: "idle", received: 0, total: 0, percent: 0 };
const transferActive = (progress: AppUpdateProgress) => ["downloading", "verifying"].includes(progress.status);
const megabytes = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
const progressLabel = (progress: AppUpdateProgress) => ({
  idle: "", downloading: "正在下载安装包", verifying: "正在核对安装包",
  "permission-required": "请允许安装应用，再返回继续",
  "installer-opened": "请在系统安装窗口中确认更新",
  "page-opened": "已打开安装页面，请在页面继续安装",
  error: "更新未完成", cancelled: "下载已取消",
}[progress.status]);

/** Only ask about an update in the lobby; never interrupt a live table. */
export function AppUpdate({ canPrompt, request }: { canPrompt: boolean; request: number }) {
  const [result, setResult] = useState<UpdateCheck | null>(null);
  const [progress, setProgress] = useState<AppUpdateProgress>(idle);
  const [checking, setChecking] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const mounted = useRef(false), lastRequest = useRef(0), lastCheck = useRef(0);
  const checkTask = useRef<Promise<UpdateCheck> | null>(null);
  const installTask = useRef(false);
  const promptEpoch = useRef(0);
  const allowed = useRef(canPrompt);
  allowed.current = canPrompt;

  const check = useCallback(async (manual: boolean) => {
    if (!manual && checkTask.current) return;
    const epoch = promptEpoch.current;
    if (manual) { setOpen(true); setError(""); setProgress(idle); }
    setChecking(true);
    try {
      const task = checkTask.current ?? checkAppUpdate();
      checkTask.current = task;
      const value = await task;
      if (!mounted.current) return;
      lastCheck.current = Date.now();
      setResult(value);
      if (epoch === promptEpoch.current && (manual || value.available)) setOpen(true);
    } catch (e) {
      if (mounted.current && manual) setError((e as Error).message || "暂时无法检查更新，请稍后重试。");
    } finally {
      checkTask.current = null;
      if (mounted.current) setChecking(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    let disposed = false, removeProgress: (() => void) | undefined;
    let lifecycle: PluginListenerHandle | undefined;
    if (Capacitor.isNativePlatform()) {
      void listenAppUpdate(value => { if (!disposed) setProgress(value); })
        .then(remove => { if (disposed) remove(); else removeProgress = remove; }).catch(() => {});
      void getAppUpdateProgress().then(value => { if (!disposed && value.status !== "idle") setProgress(value); }).catch(() => {});
      void NativeApp.addListener("appStateChange", ({ isActive }) => {
        if (!isActive || disposed) return;
        void getAppUpdateProgress().then(value => { if (!disposed) setProgress(value); }).catch(() => {});
        if (allowed.current && !installTask.current && Date.now() - lastCheck.current > 30 * 60_000) void check(false);
      }).then(handle => { if (disposed) void handle.remove(); else lifecycle = handle; });
    }
    return () => { disposed = true; mounted.current = false; removeProgress?.(); void lifecycle?.remove(); };
  }, [check]);

  useEffect(() => {
    if (!canPrompt || lastCheck.current || !Capacitor.isNativePlatform()) return;
    const timer = setTimeout(() => void check(false), 1200);
    return () => clearTimeout(timer);
  }, [canPrompt, check]);
  useEffect(() => {
    if (!canPrompt || !request || request === lastRequest.current) return;
    lastRequest.current = request;
    void check(true);
  }, [request, canPrompt, check]);

  async function install() {
    if (installTask.current || !result?.latest || !result.installable || !canPrompt) return;
    installTask.current = true; setInstalling(true); setError(""); setProgress(idle);
    try {
      const response = await installAppUpdate(result.latest);
      if (mounted.current) setProgress(value => ({ ...value, status: response.status }));
    } catch (e) {
      if (mounted.current) setError((e as Error).message || "更新未完成，请重试。");
    } finally {
      installTask.current = false;
      if (mounted.current) setInstalling(false);
    }
  }
  async function close() {
    if (transferActive(progress) || installing) {
      try { await cancelAppUpdate(); }
      catch (e) { setError((e as Error).message || "请等待当前操作完成。"); return; }
    }
    promptEpoch.current++;
    setOpen(false);
  }
  const latest = result?.latest;
  const busy = installing || transferActive(progress);
  const transferred = ["installer-opened", "page-opened"].includes(progress.status);
  const web = result?.platform === "web";
  const current = result?.current;
  const title = checking ? "检查更新" : web ? "金陵麻将客户端" : result?.available ? "发现新版本" : "应用更新";
  if (!open || !canPrompt) return null;
  const footer = <>
    {error && <p className="app-update-error" role="alert">{error}</p>}
    {progress.status !== "idle" && <section className="app-update-progress" aria-label="更新进度">
      <div role="status" aria-live="polite">{progressLabel(progress)}</div>
      {transferActive(progress) && <><progress aria-label="安装包下载进度" max={100} value={progress.status === "verifying" ? 100 : progress.percent} /><p>{megabytes(progress.received)} / {megabytes(progress.total || latest?.size || 0)}<span>{Math.round(progress.percent)}%</span></p></>}
      {progress.message && <p>{progress.message}</p>}
    </section>}
    <div className="app-update-actions">
      {busy ? <button className="secondary" onClick={() => void close()}>取消下载</button> : <button className="secondary" onClick={() => void close()}>{result?.available ? "稍后再说" : "关闭"}</button>}
      {!checking && !busy && result?.available && result.installable && <button className="primary" onClick={() => void install()}><Download size={18} />{progress.status === "permission-required" ? "继续安装" : transferred ? "再次打开安装" : result.platform === "android" ? "下载并更新" : "前往安装更新"}</button>}
      {!checking && !busy && (web || result?.available && !result.installable) && <button className="primary" onClick={() => { void openAppDistributionPage().catch(e => setError((e as Error).message)); }}><Smartphone size={18} />打开安装页面<ArrowUpRight size={16} /></button>}
      {!checking && !busy && error && <button className="primary" onClick={() => void check(true)}><RefreshCw size={18} />重新检查</button>}
    </div>
  </>;
  return <Dialog title={title} close={() => void close()} variant="app-update-dialog" footer={footer}>
    <section className="app-update-heading">
      <img src={`${import.meta.env.BASE_URL}brand-icon.png`} alt="金陵麻将图标" />
      <div><h3>金陵麻将</h3><p>{current ? `当前 v${current.version} · Build ${current.build}` : web ? "当前使用网页版" : "正在读取版本信息"}</p></div>
    </section>
    {checking ? <p className="app-update-checking" role="status"><RefreshCw size={20} />正在检查最新版本…</p> : <>
      {web ? <p className="app-update-copy">网页版在刷新后载入已部署版本。也可以下载 iOS 或安卓客户端。</p> : result && !result.available && !error ? <p className="app-update-current" role="status"><CheckCircle2 size={20} />{latest ? "当前已经是最新版本" : "暂未发布新版本"}</p> : null}
      {latest && result?.available && <div className="app-update-release">
        <div><strong>v{latest.version}</strong><span>Build {latest.build} · {megabytes(latest.size)}</span></div>
        {latest.notes && <p>{latest.notes}</p>}
        <small>{result.platform === "android" ? "下载后会打开系统安装窗口，确认后完成更新。" : "前往安装页面后，请按系统提示安装新版。"}</small>
      </div>}
      {result?.reason && <p className="app-update-copy">{result.reason}</p>}
    </>}
  </Dialog>;
}
