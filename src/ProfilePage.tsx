import { useState, type ComponentType } from "react";
import { BookOpen, Camera, ChevronRight, Copy, FileText, LayoutGrid, LogOut, MessageSquare, Pencil, ShieldCheck, Users, Volume2 } from "lucide-react";
import type { Account } from "../shared/types";
import type { AudioPreferences } from "./audio";
import { version } from "../package.json";
import { avatarURL, client } from "./game-client";
import { AvatarEditor } from "./AvatarEditor";
import { AudioSettings } from "./AudioSettings";
import { Dialog } from "./Dialog";

type Panel = "avatar" | "nickname" | "audio" | "feedback" | "logout" | null;
export function ProfilePage({ account, name, audio, changeAudio, password, legal, rules, club, permissions, notice }: {
  account: Account | null; name: string; audio: AudioPreferences;
  changeAudio: (patch: Partial<AudioPreferences>) => void;
  password: () => void; legal: () => void; rules: () => void;
  club: () => void; permissions: () => void; notice: (text: string) => void;
}) {
  const [panel, setPanel] = useState<Panel>(null);
  const [nickname, setNickname] = useState(name);
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const admin = account?.role === "admin";
  function open(next: Panel) { setError(""); setPanel(next); if (next === "nickname") setNickname(name); }
  const close = () => { if (!busy) setPanel(null); };
  async function saveName() {
    if (busy) return;
    const value = nickname.trim();
    if (!value || value.length > 12) { setError("请填写 1–12 个字的昵称"); return; }
    setBusy(true); setError("");
    try { await client.updateProfile(value); setPanel(null); notice("昵称已保存，下次入桌使用新昵称。"); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function sendFeedback() {
    if (busy) return;
    if (feedback.trim().length < 3) { setError("请至少填写 3 个字，描述遇到的问题"); return; }
    setBusy(true); setError("");
    try { await client.api("/api/feedback", { message: feedback.trim() }); setPanel(null); setFeedback(""); notice("反馈已提交，谢谢你的建议。"); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function copyId() {
    if (!account?.memberId) return;
    try { await navigator.clipboard.writeText(account.memberId); notice("会员 ID 已复制"); }
    catch { notice(`会员 ID：${account.memberId}，可长按编号复制。`); }
  }
  const entries: { title: string; detail: string; icon: ComponentType<{size?: number}>; run: () => void }[] = [
    { title: "声音设置", detail: `${audio.voiceGender === "female" ? "女声" : "男声"}报牌 · 音乐与音效`, icon: Volume2, run: () => open("audio") },
    { title: "账号安全", detail: "修改登录密码", icon: ShieldCheck, run: password },
    { title: "帮助与反馈", detail: "遇到问题，告诉我们", icon: MessageSquare, run: () => open("feedback") },
    { title: "用户协议与隐私", detail: "仅供娱乐 · 禁止赌博", icon: FileText, run: legal },
  ];
  return <>
    <div className={`profile-workspace${admin ? " profile-is-admin" : ""}`}>
      <section className="profile-personal profile-paper" aria-label="我的账号名片">
        <div className="profile-personal-info">
          <button className="profile-portrait" aria-label="更换个人头像" disabled={!account} onClick={() => open("avatar")}>
            <span className="profile-portrait-default" />
            {avatarURL(account?.avatar) && <img key={account?.avatar} src={avatarURL(account?.avatar)} alt="当前头像" onError={e => {e.currentTarget.style.visibility = "hidden";}} />}
          </button>
          <div className="profile-labels">
            <h2 title={name}>{name}</h2>
            <span className="profile-role">{admin && <ShieldCheck size={13} />}{admin ? "管理员" : "牌友"}</span>
          </div>
          <div className="profile-number"><span>ID</span><strong>{account?.memberId ?? "—"}</strong><button aria-label="复制会员 ID" onClick={() => void copyId()} disabled={!account?.memberId}><Copy size={18} /></button></div>
          <p className="profile-account" title={account?.username}>账号：{account?.username ?? "单人练习"}</p>
        </div>
        <div className="profile-edit-actions">
          <button onClick={() => open("avatar")} disabled={!account}><Camera size={20} />更换头像</button>
          <button onClick={() => open("nickname")} disabled={!account}><Pencil size={20} />修改昵称</button>
        </div>
        <button className="profile-signout" onClick={() => open("logout")} disabled={!account}><LogOut size={20} />退出登录</button>
      </section>
      <div className="profile-services">
        <section className="profile-options profile-paper" aria-label="个人设置">
          {entries.map(({title,detail,icon:Icon,run}) => <button className="profile-option" onClick={run} key={title} aria-label={title}>
            <span className="profile-option-icon"><Icon size={27} /></span>
            <span className="profile-option-copy"><strong>{title}</strong><small>{detail}</small></span>
            <ChevronRight className="profile-chevron" size={23} />
          </button>)}
        </section>
        {admin && <section className="profile-admin profile-paper" aria-label="管理入口">
          <h2>管理入口</h2>
          <div><button onClick={club}><Users size={25} /><span>战队与会员</span><ChevronRight size={20} /></button><button onClick={permissions}><LayoutGrid size={25} /><span>开桌授权</span><ChevronRight size={20} /></button></div>
        </section>}
      </div>
    </div>
    {panel === "avatar" && <Dialog title="更换头像" close={close} variant="profile-dialog profile-avatar-dialog"><AvatarEditor avatar={account?.avatar} /></Dialog>}
    {panel === "nickname" && <Dialog title="修改昵称" close={close} variant="profile-dialog profile-name-dialog">
      <form onSubmit={e => {e.preventDefault(); void saveName();}} className="profile-form">
        <label htmlFor="profile-nickname">牌桌昵称 <small>{nickname.length} / 12</small></label>
        <input id="profile-nickname" value={nickname} maxLength={12} required autoComplete="nickname" onChange={e => {setNickname(e.target.value);setError("");}} aria-invalid={!!error} />
        <p>保存后，朋友可以在牌桌上认出你。</p>
        {error && <p role="alert">{error}</p>}
        <button className="primary" disabled={busy || nickname.trim() === name}>{busy ? "正在保存…" : "保存昵称"}</button>
      </form>
    </Dialog>}
    {panel === "audio" && <Dialog title="声音设置" close={close} variant="profile-dialog profile-audio-dialog"><AudioSettings value={audio} change={changeAudio} /><p className="profile-dialog-note">声音设置自动保存到当前设备。</p></Dialog>}
    {panel === "feedback" && <Dialog title="帮助与反馈" close={close} variant="profile-dialog profile-feedback-dialog">
      <button className="profile-help-link" onClick={() => {setPanel(null);rules();}}><BookOpen size={21} />查看玩法说明<ChevronRight size={20} /></button>
      <form className="profile-form" onSubmit={e => {e.preventDefault(); void sendFeedback();}}>
        <label htmlFor="profile-feedback">问题或建议 <small>{feedback.length} / 1000</small></label>
        <textarea id="profile-feedback" value={feedback} maxLength={1000} required placeholder="请描述遇到的问题；牌局相关问题可以附上回放 ID。" onChange={e => {setFeedback(e.target.value);setError("");}} />
        {error && <p role="alert">{error}</p>}
        <button className="primary" disabled={busy}>{busy ? "正在提交…" : "提交反馈"}</button>
      </form><p className="profile-dialog-note">金陵麻将 {version} · 仅供娱乐</p>
    </Dialog>}
    {panel === "logout" && <Dialog title="退出当前账号？" close={close} variant="profile-dialog profile-logout-dialog">
      <p>头像、账号与联机战绩会保留，下次登录可以继续使用。</p>
      {error && <p role="alert">{error}</p>}
      <div className="dialog-actions"><button className="secondary" disabled={busy} onClick={close}>取消</button><button className="primary" disabled={busy} onClick={async () => {setBusy(true); await client.logout(); setBusy(false); if (client.state.account) setError(client.state.authError || "退出失败，请重试");}}>{busy ? "正在退出…" : "退出登录"}</button></div>
    </Dialog>}
  </>;
}
