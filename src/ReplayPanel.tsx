import { copyText } from "./clipboard";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Copy,
  Pause,
  Play,
  Search,
  SkipBack,
  SkipForward,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import type { ReplayFrame, RoundReplay, Seat } from "../shared/types";
import { isReplayKeyEvent, replayEventLabel } from "./replay-events";
import { client } from "./game-client";
import { Dialog } from "./Dialog";
import { gameAudio } from "./audio";
import { ReplayTable } from "./ReplayTable";
import "./replay.css";
import { signedScore } from "../shared/settlement";

export function ReplayPanel({
  initialId = "",
  initialTransfer,
  close,
}: {
  initialId?: string;
  initialTransfer?: number;
  close: () => void;
}) {
  const playbackRun = useRef(0);
  const [perspective, setPerspective] = useState<Seat>(0);
  const [reveal, setReveal] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [input, setInput] = useState(initialId);
  const [query, setQuery] = useState({ id: initialId, attempt: 0 });
  const [data, setData] = useState<RoundReplay | null>(null);
  const [tableReadiness, setTableReadiness] = useState<{ data: RoundReplay; ready: boolean } | null>(null);
  const tableReady = !!data && tableReadiness?.data === data && tableReadiness.ready;
  const onTableBusyChange = useCallback((busy: boolean) => {
    if (data) setTableReadiness({ data, ready: !busy });
  }, [data]);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [step, setStep] = useState(0),
    [playing, setPlaying] = useState(false);
  const running = playing && tableReady && !busy;
  const [speed, setSpeed] = useState(1),
    [copied, setCopied] = useState(false);
  const [controlsVisible,setControlsVisible]=useState(true);
  const [activity,setActivity]=useState(0);
  const [choosing,setChoosing]=useState(false);
  const wakeControls=()=>{setControlsVisible(true);setActivity(n=>n+1);};
  useEffect(()=>{setControlsVisible(true);setChoosing(false);},[playing,query,tableReady]);
  useEffect(()=>{
    if(!running||!controlsVisible||choosing||searchOpen||busy||error)return;
    const timer=setTimeout(()=>setControlsVisible(false),3000);
    return ()=>clearTimeout(timer);
  },[running,controlsVisible,choosing,activity,searchOpen,busy,error]);
  useEffect(() => {
    if (!query.id) return;
    let active = true;
    setBusy(true);
    setError("");
    setPlaying(false);
    setData(null);
    setStep(0);
    setCopied(false);
    client
      .loadReplay(query.id)
      .then((next) => {
        if (active) {
          setData(next);
          if(initialTransfer!==undefined&&query.id===initialId){
            const at=next.frames.findIndex(f=>f.transferCount!==undefined&&f.transferCount>initialTransfer);
            setStep(Math.max(0,at));
          }
          setSearchOpen(false);
        }
      })
      .catch((e) => {
        if (active) setError((e as Error).message);
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [query]);
  const total = data?.frames.length ?? 0;
  useEffect(() => {
    if (!running || !total) return;
    if (step >= total - 1) {
      setPlaying(false);
      return;
    }
    const timer = setTimeout(
      () => setStep((s) => Math.min(s + 1, total - 1)),
      Math.min(
        3000,
        Math.max(450, data!.frames[step + 1].at - data!.frames[step].at),
      ) / speed,
    );
    return () => clearTimeout(timer);
  }, [running, step, total, speed, data]);
  const seek = (index: number) => {
    setPlaying(false);
    setStep(Math.max(0, Math.min(index, total - 1)));
  };
  useEffect(() => {
    const pause = () => {
      if (document.hidden) setPlaying(false);
    };
    document.addEventListener("visibilitychange", pause);
    return () => document.removeEventListener("visibilitychange", pause);
  }, []);
  const frame = data?.frames[step];
  useEffect(() => {
    gameAudio.setReplayActive(running);
    return () => gameAudio.setReplayActive(false);
  }, [running]);
  useEffect(() => {
    if (!running || !frame) return;
    // Confirmed action calls are synchronized to the renderer's impact point.
    if(['pung','kong','concealedKong','addedKong'].includes(frame.type)||frame.type==='finish'&&frame.result?.winners.length)return;
    const voice =
      frame.type === "discard"
        ? frame.tile
        : (
            {
              pung: "碰",
              kong: "杠",
              concealedKong: "暗杠",
              addedKong: "补杠",
              zhaozhi: "报照直",
              flower: "补花",
              finish: frame.result?.winners.length
                ? frame.result.from === undefined
                  ? "自摸"
                  : "胡了"
                : "流局",
            } as Partial<Record<ReplayFrame["type"], string>>
          )[frame.type];
    if (voice !== undefined)
      gameAudio.sayTile(
        `replay:${data!.id}:${playbackRun.current}:${step}`,
        voice,
      );
  }, [running, frame, data, step]);
  const event = frame
    ? replayEventLabel(frame, data!.names, perspective, reveal)
    : "";
  const keySteps =
    data?.frames.flatMap((f, index) => (isReplayKeyEvent(f) ? [index] : [])) ??
    [];
  return (
    <Dialog
      title="牌局回放"
      variant={`replay-dialog${data?" replay-loaded":""}${data&&!controlsVisible&&!searchOpen?" replay-controls-hidden":""}`}
      close={close}
      headerAside={
        data && (
          <div className="replay-header-info">
            <span
              className="replay-table-event"
              role="status"
              title={`房间 ${data.code} · 第 ${data.round} 局`}
            >
              {event}
            </span>
            <button
              onClick={() => {
                setPlaying(false);
                setSearchOpen((s) => !s);
              }}
            >
              <Search size={14} />
              查找牌局
            </button>
            <button
              onClick={async () => {
                try {
                  await copyText(data.id);
                  setCopied(true);
                } catch {
                  setSearchOpen(true);
                  setError("复制失败，请长按牌局 ID 复制");
                }
              }}
            >
              <Copy size={14} />
              {copied ? "已复制" : "复制 ID"}
            </button>
          </div>
        )
      }
    >
      {initialTransfer!==undefined&&data&&query.id===initialId&&!data.frames.some(f=>f.transferCount!==undefined&&f.transferCount>initialTransfer)&&<p className="score-note">该旧回放未保存逐笔定位信息，已从开头打开，不猜测对应操作。</p>}
      <section className="replay-panel">
        {data&&<button className="replay-keyboard-controls sr-only" onFocus={wakeControls} onClick={wakeControls}>显示回放控制</button>}
        {(!data || searchOpen) && (
          <form
            className="replay-search"
            onSubmit={(e) => {
              e.preventDefault();
              setQuery((q) => ({ id: input.trim(), attempt: q.attempt + 1 }));
            }}
          >
            <label htmlFor="replay-id">牌局 ID</label>
            <input
              id="replay-id"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              maxLength={120}
              placeholder="粘贴牌局 ID，查看回放"
              autoCapitalize="none"
              autoCorrect="off"
            />
            <button type="submit" disabled={busy || !input.trim()}>
              <Search size={16} />
              {busy ? "读取中" : "查看回放"}
            </button>
          </form>
        )}
        {error && (
          <p role="alert" className="replay-message">
            {error}
          </p>
        )}
        {!busy && !data && !error && (
          <p className="replay-message">
            所有会员均可通过 ID 查看已结束的联机牌局。
          </p>
        )}
        {busy && (
          <p className="replay-message" role="status">
            正在读取牌局过程…
          </p>
        )}
        {data && frame && (
          <>
            {data.summaryOnly && (
              <p className="replay-legacy">
                这局只保存了结算牌面，没有历史出牌过程。
              </p>
            )}
            <ReplayTable
              key={`${query.id}:${query.attempt}`}
              data={data}
              step={step}
              perspective={perspective}
              setPerspective={setPerspective}
              reveal={reveal}
              animate={running}
              speed={speed}
              onEntryBusyChange={onTableBusyChange}
              onSurfaceInteraction={()=>{setControlsVisible(v=>!v);setActivity(n=>n+1);setChoosing(false);}}
            />
            <div className="replay-bottom" onPointerDownCapture={wakeControls} onKeyDownCapture={wakeControls} onFocusCapture={e=>{if(e.target instanceof HTMLSelectElement)setChoosing(true);}} onBlurCapture={()=>setChoosing(false)}>
            {frame.players.some((p) => p.externalScore) && (
              <div className="replay-external" aria-label="回放桌外累计记分">
                <b>桌外累计</b>
                {frame.players.map((p, seat) => (
                  <span key={seat}>
                    {data.names[seat]}{" "}
                    <strong>{signedScore(p.externalScore ?? 0)}</strong>
                  </span>
                ))}
              </div>
            )}
            {!data.summaryOnly && (
              <div className="replay-controls">
                <span className="replay-current-event" aria-hidden="true">{event}</span>
                <div className="replay-timeline">
                  <select
                    aria-label="跳到关键动作"
                    disabled={!tableReady}
                    value={keySteps.includes(step) ? String(step) : ""}
                    onChange={(e) => {
                      if (e.target.value !== "") seek(Number(e.target.value));
                    }}
                  >
                    <option value="">跳到碰杠胡</option>
                    {keySteps.map((index) => (
                      <option key={index} value={index}>
                        {index + 1}步 ·{" "}
                        {replayEventLabel(
                          data.frames[index],
                          data.names,
                          perspective,
                          reveal,
                        )}
                      </option>
                    ))}
                  </select>
                  <input
                    type="range"
                    aria-label="回放进度"
                    disabled={!tableReady}
                    min={0}
                    max={total - 1}
                    value={step}
                    onChange={(e) => seek(Number(e.target.value))}
                  />
                </div>
                <div>
                  <span className="replay-step-label">
                    {step + 1} / {total} 步
                  </span>
                  <button
                    aria-label="回到开局"
                    disabled={!tableReady || step === 0}
                    onClick={() => seek(0)}
                  >
                    <SkipBack size={18} />
                  </button>
                  <button
                    aria-label="上一步"
                    disabled={!tableReady || step === 0}
                    onClick={() => seek(step - 1)}
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <button
                    className="replay-play"
                    aria-label={playing ? "暂停回放" : "播放回放"}
                    disabled={!tableReady}
                    onClick={() => {
                      gameAudio.unlock();
                      playbackRun.current++;
                      if (step >= total - 1) setStep(0);
                      setPlaying((p) => !p);
                    }}
                  >
                    {playing ? <Pause size={18} /> : <Play size={18} />}
                    {!tableReady ? "加载画面…" : playing ? "暂停" : "播放"}
                  </button>
                  <button
                    aria-label="下一步"
                    disabled={!tableReady || step >= total - 1}
                    onClick={() => seek(step + 1)}
                  >
                    <ChevronRight size={18} />
                  </button>
                  <button
                    aria-label="查看结算"
                    disabled={!tableReady || step >= total - 1}
                    onClick={() => seek(total - 1)}
                  >
                    <SkipForward size={18} />
                  </button>
                  <select
                    aria-label="回放速度"
                    disabled={!tableReady}
                    value={speed}
                    onChange={(e) => {setSpeed(Number(e.target.value));setChoosing(false);e.target.blur();wakeControls();}}
                  >
                    <option value={1}>1 倍速</option>
                    <option value={2}>2 倍速</option>
                    <option value={4}>4 倍速</option>
                  </select>
                  <button
                    className="replay-reveal"
                    disabled={!tableReady}
                    aria-pressed={reveal}
                    onClick={() => setReveal((v) => !v)}
                  >
                    {reveal ? "四家明牌" : "当前视角"}
                  </button>
                </div>
              </div>
            )}
            </div>
          </>
        )}
      </section>
    </Dialog>
  );
}
