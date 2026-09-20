import { useCallback, useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Bell, ChevronRight, Megaphone, RefreshCw } from "lucide-react";
import type { Announcement, AnnouncementsResponse } from "../shared/announcements";
import type { GameClient } from "./game-client";
import { AppUpdate, type AppUpdateActivity } from "./AppUpdate";
import { Dialog } from "./Dialog";
import "./announcements.css";

type Owner = "update" | "announcement" | null;
const idleUpdate: AppUpdateActivity = { open: false, checking: false, checked: false, installing: false };
const keyOf = (announcement: Announcement) => `${announcement.id}:${announcement.revision}`;
const dateLabel = (at: number) => new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
}).format(at);

/** One owner reserves the modal slot synchronously, before either child renders. */
export function NotificationCenter({ client, accountId, lobby, idle, updateRequest, announcementRequest, refreshKey,
  onUnreadChange, notice }: {
  client: GameClient; accountId: string | undefined; lobby: boolean; idle: boolean;
  updateRequest: number; announcementRequest: number; refreshKey: number;
  onUnreadChange: (count: number) => void; notice: (message: string) => void;
}) {
  const ownerRef = useRef<Owner>(null);
  const updateRef = useRef(idleUpdate);
  const [owner, setOwner] = useState<Owner>(null);
  const [update, setUpdate] = useState(idleUpdate);
  const own = useCallback((next: Owner) => { ownerRef.current = next; setOwner(next); }, []);
  const requestUpdate = useCallback(() => {
    updateRef.current = { ...updateRef.current, open: true };
    if (ownerRef.current === null) own("update");
  }, [own]);
  const updateActivity = useCallback((next: AppUpdateActivity) => {
    updateRef.current = next;
    setUpdate(next);
    if (next.open && ownerRef.current === null) own("update");
    else if (!next.open && !next.checking && ownerRef.current === "update") own(null);
  }, [own]);
  const requestAnnouncement = useCallback(() => {
    if (ownerRef.current !== null) return false;
    own("announcement");
    return true;
  }, [own]);
  const closeAnnouncement = useCallback(() => {
    if (ownerRef.current === "announcement") own(updateRef.current.open ? "update" : null);
  }, [own]);
  return <>
    <AppUpdate canPrompt={idle && owner !== "announcement"} request={updateRequest}
      onPromptRequest={requestUpdate} onActivityChange={updateActivity} />
    <MemberAnnouncements client={client} accountId={accountId} lobby={lobby}
      canDisplay={idle && lobby && owner !== "update"}
      canAutoPrompt={idle && lobby && owner === null && (!Capacitor.isNativePlatform() || update.checked) && !update.checking}
      request={announcementRequest} refreshKey={refreshKey} onUnreadChange={onUnreadChange}
      reserve={requestAnnouncement} release={closeAnnouncement} notice={notice} />
  </>;
}

function MemberAnnouncements({ client, accountId, lobby, canDisplay, canAutoPrompt, request, refreshKey, onUnreadChange,
  reserve, release, notice }: {
  client: GameClient; accountId: string | undefined; lobby: boolean; canDisplay: boolean; canAutoPrompt: boolean;
  request: number; refreshKey: number; onUnreadChange: (count: number) => void;
  reserve: () => boolean; release: () => void; notice: (message: string) => void;
}) {
  const [items, setItems] = useState<Announcement[]>([]);
  const [mode, setMode] = useState<"list" | "detail" | null>(null);
  const [selected, setSelected] = useState<Announcement | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [acknowledging, setAcknowledging] = useState(false);
  const mounted = useRef(false), epoch = useRef(0), lastRequest = useRef(request);
  const automatic = useRef(true), dismissed = useRef(new Set<string>()), latest = useRef("");
  const inFlight = useRef(false), refreshAgain = useRef(false), sequence = useRef(0);
  const callbacks = useRef({ onUnreadChange, release, notice });
  callbacks.current = { onUnreadChange, release, notice };

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; epoch.current++; }; }, []);
  useEffect(() => { callbacks.current.onUnreadChange(items.filter(item => item.unread).length); }, [items]);
  const load = useCallback(async (manual = false) => {
    if (!accountId) return;
    if (inFlight.current) { refreshAgain.current = true; return; }
    const currentEpoch = epoch.current, currentSequence = ++sequence.current;
    inFlight.current = true;
    if (manual) { setLoading(true); setError(""); }
    try {
      const data = await client.api<AnnouncementsResponse>("/api/announcements");
      if (!mounted.current || currentEpoch !== epoch.current || currentSequence !== sequence.current) return;
      const next = data.announcements;
      const newest = next[0] ? keyOf(next[0]) : "";
      if (newest && newest !== latest.current) automatic.current = true;
      latest.current = newest;
      setItems(next); setError("");
    } catch (e) {
      if (mounted.current && currentEpoch === epoch.current && manual)
        setError((e as Error).message || "公告暂时无法加载，请稍后重试。");
    } finally {
      if (mounted.current && currentEpoch === epoch.current) setLoading(false);
      inFlight.current = false;
      if (refreshAgain.current && mounted.current && currentEpoch === epoch.current) {
        refreshAgain.current = false;
        void load(false);
      }
    }
  }, [accountId, client]);
  useEffect(() => {
    if (!lobby || !accountId) return;
    automatic.current = true;
    void load(false);
    const refresh = () => { if (document.visibilityState === "visible") void load(false); };
    const timer = window.setInterval(refresh, 30_000);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("online", refresh);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", refresh); window.removeEventListener("online", refresh); };
  }, [lobby, accountId, load]);
  useEffect(() => { if (lobby && accountId) void load(false); }, [refreshKey, lobby, accountId, load]);
  useEffect(() => {
    if (!mode || !selected || loading) return;
    if (!items.some(item => item.id === selected.id)) {
      setMode(null); setSelected(null); callbacks.current.release();
      callbacks.current.notice("这条公告已撤回。");
    }
  }, [items, selected, mode, loading]);
  useEffect(() => {
    if (!canAutoPrompt || mode || !automatic.current) return;
    const unread = items.find(item => item.unread && !dismissed.current.has(keyOf(item)));
    if (!unread || !reserve()) return;
    automatic.current = false;
    setSelected(unread); setMode("detail");
  }, [canAutoPrompt, items, mode, reserve]);
  useEffect(() => {
    if (!request || request === lastRequest.current || !canDisplay || mode) return;
    if (!reserve()) return;
    lastRequest.current = request;
    automatic.current = false;
    setSelected(null); setMode("list"); void load(true);
  }, [request, canDisplay, mode, reserve, load]);

  const close = () => { setMode(null); setSelected(null); callbacks.current.release(); };
  async function acknowledge(destination: "list" | "close") {
    if (acknowledging) return;
    const item = selected;
    if (!item || !item.unread) {
      if (destination === "list") { setSelected(null); setMode("list"); } else close();
      return;
    }
    dismissed.current.add(keyOf(item));
    setAcknowledging(true);
    const currentEpoch = epoch.current;
    try {
      await client.api(`/api/announcements/${encodeURIComponent(item.id)}/read`, { revision: item.revision });
      if (!mounted.current || currentEpoch !== epoch.current) return;
      // An older list response must not undo the confirmed read receipt.
      sequence.current++;
      setItems(previous => previous.map(value => value.id === item.id && value.revision === item.revision
        ? { ...value, unread: false, readRevision: item.revision } : value));
    } catch {
      if (mounted.current && currentEpoch === epoch.current)
        callbacks.current.notice("阅读状态暂未保存，可稍后从公告入口重新查看。");
    } finally {
      if (mounted.current && currentEpoch === epoch.current) {
        setAcknowledging(false);
        if (destination === "list") { setSelected(null); setMode("list"); } else close();
        void load(false);
      }
    }
  }
  if (!mode || !canDisplay) return null;
  const isDetail = mode === "detail" && selected;
  return <Dialog title={isDetail ? "公告" : "全部公告"} variant="notice-dialog announcement-dialog" dismissOnBackdrop={false}
    close={() => { if (isDetail) void acknowledge("close"); else close(); }}
    headerAside={mode === "list" ? <span className="announcement-list-count">{items.length} 条</span> : undefined}
    footer={isDetail ? <div className="notice-actions">
      <button className="secondary" disabled={acknowledging} onClick={() => void acknowledge("list")}>全部公告</button>
      <button className="primary" disabled={acknowledging} onClick={() => void acknowledge("close")}>{acknowledging ? "正在确认…" : "我知道了"}</button>
    </div> : undefined}>
    {isDetail ? <article className="announcement-reading">
      <span className="announcement-icon" aria-hidden="true"><Megaphone size={36} /></span>
      <div className="announcement-reading-content"><h3>{selected.title}</h3>
        <p className="announcement-date">{dateLabel(selected.publishedAt)} · 管理员发布</p>
        <div className="announcement-body">{selected.body}</div>
        {items.some(item => item.id === selected.id && item.revision !== selected.revision) && <p className="announcement-updated">公告已有新版，关闭后可查看最新内容。</p>}
      </div>
    </article> : <>
      {loading && <p className="announcement-status" role="status"><RefreshCw size={18} />正在加载公告…</p>}
      {error && <div className="announcement-load-error" role="alert"><p>{error}</p><button className="secondary" onClick={() => void load(true)}>重新加载</button></div>}
      {!loading && !error && !items.length && <div className="announcement-empty"><Bell size={32} /><h3>暂无公告</h3><p>发布的新消息会显示在这里。</p></div>}
      <div className="announcement-list">{items.map(item => <button className="announcement-list-item" key={keyOf(item)} onClick={() => { setSelected(item); setMode("detail"); }}>
        <span><strong>{item.unread && <i aria-label="未读" />}{item.title}</strong><small>{dateLabel(item.publishedAt)}</small></span><ChevronRight size={20} />
      </button>)}</div>
    </>}
  </Dialog>;
}
