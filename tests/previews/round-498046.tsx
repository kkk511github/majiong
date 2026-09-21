import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { ArrowRight, ChevronLeft, ChevronRight, Eye, History, Maximize, Pause, Play, RotateCcw, Volume2, VolumeX, X } from "lucide-react";
import { ReplayTable } from "../../src/ReplayTable";
import { Tile } from "../../src/Tile";
import { gameAudio } from "../../src/audio";
import { replayEventLabel } from "../../src/replay-events";
import { tileName } from "../../shared/tiles";
import type { RoundRecord, RoundReplay, Seat } from "../../shared/types";
import "../../src/styles.css";
import "../../src/classic.css";
import "../../src/polish.css";
import "../../src/tables.css";
import "../../src/table-redesign.css";
import "./round-498046.css";

// Only a completed local recording is read. There is no GameClient, live service,
// new game creation, random wall or rules action in this page.
type Recording = { record: RoundRecord; replay: RoundReplay };
const DATA = "/output/round-498046-replay/data.json";
const winner: Seat = 1;
const clock = (ms: number) => `${Math.floor(ms / 60000).toString().padStart(2, "0")}:${Math.floor(ms / 1000 % 60).toString().padStart(2, "0")}`;
const wallClock = (ms: number) => new Date(ms).toLocaleTimeString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false });
function Preview() {
  const [recording, setRecording] = useState<Recording | null>(null), [error, setError] = useState("");
  const [step, setStep] = useState(67), [playing, setPlaying] = useState(false), [ready, setReady] = useState(false);
  const [perspective, setPerspective] = useState<Seat>(winner), [reveal, setReveal] = useState(false);
  const [speed, setSpeed] = useState(1), [sound, setSound] = useState(false), [large, setLarge] = useState(false);
  const stage = useRef<HTMLDivElement>(null), run = useRef(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch(DATA, { signal: controller.signal }).then(response => { if (!response.ok) throw Error("本地回放文件未能读取"); return response.json(); }).then((data: Recording) => {
      if (data.replay.code !== "498046" || data.replay.round !== 3 || data.replay.frames.length !== 70 || !data.replay.endedAt || data.replay.frames.at(-1)?.result?.reason !== "hu") throw Error("回放文件与这把已结束记录不一致");
      setRecording(data);
    }).catch(reason => { if (!controller.signal.aborted) setError(String(reason.message ?? reason)); });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.origin !== location.origin || event.source !== stage.current?.querySelector("iframe")?.contentWindow || event.data?.scope !== "jinling-table-v1") return;
      if (event.data.type === "ready") setReady(true);
      if (event.data.type === "error") { setReady(false); setPlaying(false); }
    };
    const hidden = () => { if (document.hidden) setPlaying(false); };
    window.addEventListener("message", receive); document.addEventListener("visibilitychange", hidden);
    return () => { window.removeEventListener("message", receive); document.removeEventListener("visibilitychange", hidden); };
  }, []);
  const replay = recording?.replay, frame = replay?.frames[step], total = replay?.frames.length ?? 0;
  useEffect(() => {
    if (!playing || !ready || !replay) return;
    if (step >= total - 1) { setPlaying(false); return; }
    const delay = Math.min(2500, Math.max(280, replay.frames[step + 1].at - replay.frames[step].at)) / speed;
    const timer = setTimeout(() => setStep(value => Math.min(value + 1, total - 1)), delay);
    return () => clearTimeout(timer);
  }, [playing, ready, replay, step, speed, total]);
  useEffect(() => {
    gameAudio.configure({ music: false, sound: false, voice: sound, chat: false, voiceGender: "male", voiceVolume: .7, musicVolume: 0, soundVolume: 0 }, true);
  }, [sound]);
  useEffect(() => {
    gameAudio.setReplayActive(playing && sound);
    return () => gameAudio.setReplayActive(false);
  }, [playing, sound]);
  useEffect(() => {
    if (!playing || !sound || !frame) return;
    const phrase = frame.type === "discard" ? frame.tile : ({ pung: "碰", kong: "杠", concealedKong: "暗杠", addedKong: "补杠", flower: "补花", finish: "胡了" } as Record<string, string>)[frame.type];
    if (phrase !== undefined) gameAudio.sayTile(`local-498046:${run.current}:${step}`, phrase);
  }, [step, playing, sound, frame]);
  useEffect(() => () => gameAudio.dispose(), []);
  useEffect(() => {
    if (!large) return;
    const previous = document.body.style.overflow; document.body.style.overflow = "hidden";
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setLarge(false); };
    window.addEventListener("keydown", escape);
    return () => { document.body.style.overflow = previous; window.removeEventListener("keydown", escape); };
  }, [large]);
  const seek = (value: number) => { setPlaying(false); setStep(Math.max(0, Math.min(total - 1, value))); };
  const chooseSeat = (seat: Seat) => { setPlaying(false); setPerspective(seat); };
  const play = (fromStart = false) => {
    gameAudio.unlock();
    if (fromStart || step === total - 1) { setStep(0); run.current++; setPlaying(true); }
    else { if (!playing) run.current++; setPlaying(!playing); }
  };
  if (!recording || !frame || !replay) return <main className="r3-loading"><History size={28}/><h1>498046 · 第三局</h1><p>{error || "正在读取已结束的本地回放…"}</p></main>;
  const current = frame.players[winner], ended = !!frame.result, score = recording.record.result.details[winner]!;
  const points = [
    { label: "开局", at: 0 },
    { label: "北风直杠", at: replay.frames.findIndex(f => f.type === "kong" && f.seat === winner && f.tile === 123) },
    { label: "九万碰", at: replay.frames.findIndex(f => f.type === "pung" && f.seat === winner && f.tile === 33) },
    { label: "三筒碰", at: replay.frames.findIndex(f => f.type === "pung" && f.seat === winner && f.tile === 46) },
    { label: "莫愁打八万", at: replay.frames.findIndex(f => f.type === "discard" && f.seat === 3 && f.tile === 30) },
    { label: "秦淮胡牌", at: total - 1 },
  ];
  const activePoint = [...points].reverse().find(point => point.at <= step)?.at;
  const lastTwo = step >= points[4].at;
  const event = replayEventLabel(frame, replay.names, perspective, reveal || ended);
  const receipt = recording.record.result.transfers!.find(entry => entry.scope === "external" && entry.to === winner)!;
  return <main className="round498046-page polished classic">
    <header className="r3-header"><div><p className="r3-eyebrow"><History size={13}/>本地回放 · 真实第3局</p><h1>498046<span>这一把，怎么胡的？</span></h1><p className="r3-subtitle">2026年9月20日 · {wallClock(replay.startedAt)}—{wallClock(replay.endedAt!)} · 比下胡 ×2</p></div><div className="r3-source-tag"><b>已结束的真实记录</b><span>70步原始动作 · 本地查看</span></div></header>
    <nav className="r3-keypoints" aria-label="关键动作">{points.map((point, index) => <button key={point.at} disabled={!ready} aria-current={point.at === activePoint ? "step" : undefined} onClick={() => seek(point.at)}><span>{String(index + 1).padStart(2, "0")}</span>{point.label}</button>)}</nav>
    <div className="r3-main">
      <section className="r3-viewer" aria-label="真实牌桌回放">
        <div className="r3-table-bar"><label>观看视角<select aria-label="观看视角" value={perspective} onChange={event => chooseSeat(Number(event.target.value) as Seat)}>{replay.names.map((name, seat) => <option key={seat} value={seat}>{name}{seat === winner ? " · 胡牌方" : ""}</option>)}</select></label><div><button className="r3-view-button" aria-pressed={perspective === winner} onClick={() => chooseSeat(winner)}>秦淮视角</button><label className="r3-reveal"><Eye size={14}/><input type="checkbox" aria-label="四家明牌" checked={reveal || ended} disabled={ended} onChange={event => { setPlaying(false); setReveal(event.target.checked); }}/>{ended ? "结算已明牌" : "四家明牌"}</label><button className="r3-icon" aria-label="放大牌桌" onClick={() => setLarge(true)}><Maximize size={16}/></button></div></div>
        <div ref={stage} className={`r3-table${large ? " r3-table-large" : ""}`} data-step={step} data-ready={ready}><ReplayTable data={replay} step={step} perspective={perspective} setPerspective={chooseSeat} reveal={reveal} animate={playing}/>{large && <button className="r3-close-large" onClick={() => setLarge(false)} aria-label="退出大图"><X size={18}/></button>}</div>
        <div className="r3-event" role="status" aria-label="当前回放动作"><span className={playing ? "r3-dot playing" : "r3-dot"}/><strong>{event}</strong><time>{wallClock(frame.at)}</time></div>
        <div className="r3-playbar"><div className="r3-player-buttons"><button className="r3-icon" onClick={() => play(true)} disabled={!ready} aria-label="从开局播放"><RotateCcw size={18}/></button><button className="r3-icon" onClick={() => seek(step - 1)} disabled={!ready || step === 0} aria-label="上一步"><ChevronLeft size={20}/></button><button className="r3-play" onClick={() => play()} disabled={!ready} aria-label={playing ? "暂停回放" : "播放回放"}>{playing ? <Pause size={16}/> : <Play size={16}/>}<span>{playing ? "暂停" : ended ? "再看一遍" : "播放"}</span></button><button className="r3-icon" onClick={() => seek(step + 1)} disabled={!ready || ended} aria-label="下一步"><ChevronRight size={20}/></button></div><div className="r3-scrub"><input aria-label="回放进度" type="range" min="0" max={total - 1} value={step} onChange={event => seek(Number(event.target.value))}/><div><span className="r3-frame-count">第 {step + 1} / {total} 步</span><span>{clock(frame.at - replay.startedAt)} / {clock(replay.endedAt! - replay.startedAt)}</span></div></div><select aria-label="播放速度" value={speed} onChange={event => setSpeed(Number(event.target.value))}>{[.5, 1, 2, 4].map(value => <option key={value} value={value}>{value}×</option>)}</select><button className="r3-icon r3-sound" aria-label="报牌声音" aria-pressed={sound} onClick={() => { gameAudio.unlock(); setSound(!sound); }}>{sound ? <Volume2 size={17}/> : <VolumeX size={17}/>}</button></div>
      </section>
      <aside className="r3-facts" aria-label="秦淮当前牌面说明"><div className="r3-facts-heading"><span>胡牌方 · 秦淮</span><h2><b>{current.melds.length}</b> 组真实落地牌</h2></div><ol className="r3-melds">{current.melds.map((meld, index) => <li key={index}><span className="r3-mouth">{index + 1}</span><div><strong>{tileName(meld.tiles[0])}{meld.type === "pung" ? " · 碰" : meld.concealed ? " · 暗杠" : meld.added ? " · 补杠" : " · 直杠"}</strong><small>{meld.concealed ? "自己集齐" : `${replay.names[meld.from]}供牌`} · {meld.tiles.length}张</small></div><span className="r3-meld-kind">{meld.type === "pung" ? "碰" : "杠"}</span></li>)}</ol>{!current.melds.length && <p className="r3-no-meld">此时还没有碰杠。</p>}<div className="r3-hand-card"><div><strong>{ended ? "胡牌前手牌" : "此时手牌"}</strong><span>{current.hand.length}张</span></div><div className="r3-hand-tiles">{current.hand.map(tile => <Tile key={tile} tile={tile}/>)}</div><p className="r3-hand-text">{lastTwo ? "七万 × 2 · 八万 × 2" : current.hand.map(tileName).join("、")}</p>{ended && <div className="r3-winning-tile"><span>另加莫愁点出的</span><Tile tile={recording.record.result.winningTile!} small/><b>八万</b></div>}</div><div className={`r3-explanation${lastTwo ? " decisive" : ""}`}><b>{ended ? "现在直接提示：胡" : lastTwo ? "关键一刻：三组落地，手里仍有四张" : "跟着记录，看三组牌如何形成"}</b><p>{lastTwo ? "头三嘴全部由钟山供牌。本次走快照规则，八万只在计分中作为第四组，桌面没有多做一次碰牌。" : "可以直接点上方关键动作，或从开局播放。牌桌与右侧说明会同步更新。"}</p></div></aside>
    </div>
    <section className="r3-money" aria-label="本把结算说明"><article className="r3-actual"><div><span className="r3-kicker">实际收支 · 桌外</span><h2>{replay.names[receipt.from]}<ArrowRight size={19}/>{replay.names[receipt.to]}</h2><p>头三嘴同一家 · 三口外包 · 本把2倍</p></div><div className="r3-amount"><b>{receipt.amount}</b><span>分</span></div><small>四家本把桌内净变化均为 0；此处100分单独记在桌外。</small></article><article className="r3-reference"><span className="r3-kicker">快照参考牌分 · 与实收分开看</span><h2>{score.total}<small>分</small></h2><p>（成牌10 ＋ 对对胡30 ＋ 快照加分50<br/>＋ 硬花6 ＋ 软花6）× 2 ＝ 204</p><small>这里是快照计分参考；本把实际外包收款为100分。</small></article></section>
    <footer className="r3-footer">本页读取这一把已结束的保存记录 · 使用软件真实牌桌组件 · 仅本地回放</footer>
  </main>;
}
document.documentElement.dataset.runtime = "web";
const root = createRoot(document.getElementById("root")!); root.render(<Preview/>);
if (import.meta.hot) import.meta.hot.dispose(() => root.unmount());
