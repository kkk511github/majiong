import { useEffect, useRef, useState } from "react";
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
import { tileName } from "../shared/tiles";
import { client } from "./game-client";
import { Dialog } from "./Dialog";
import { gameAudio } from "./audio";
import { ReplayTable } from "./ReplayTable";
import "./replay.css";
import { signedScore } from "../shared/settlement";

const labels: Record<ReplayFrame["type"], string> = {
  start: "开局发牌",
  draw: "摸牌",
  flower: "补花",
  discard: "打出",
  pung: "碰牌",
  kong: "明杠",
  concealedKong: "暗杠",
  addedKong: "补杠",
  zhaozhi: "报照直",
  claim: "响应出牌",
  pass: "过",
  finish: "本局结算",
};
export function ReplayPanel({
  initialId = "",
  close,
}: {
  initialId?: string;
  close: () => void;
}) {
  const playbackRun = useRef(0);
  const [perspective, setPerspective] = useState<Seat>(0);
  const [reveal, setReveal] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [input, setInput] = useState(initialId);
  const [query, setQuery] = useState({ id: initialId, attempt: 0 });
  const [data, setData] = useState<RoundReplay | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [step, setStep] = useState(0),
    [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1),
    [copied, setCopied] = useState(false);
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
    if (!playing || !total) return;
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
  }, [playing, step, total, speed, data]);
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
    gameAudio.setReplayActive(playing);
    return () => gameAudio.setReplayActive(false);
  }, [playing]);
  useEffect(() => {
    if (!playing || !frame) return;
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
  }, [playing, frame, data, step]);
  const event = frame
    ? `${frame.seat !== undefined ? data!.names[frame.seat] + " · " : ""}${labels[frame.type]}${frame.tile !== undefined ? " " + tileName(frame.tile) : ""}`
    : "";
  return (
    <Dialog
      title="牌局回放"
      variant="replay-dialog"
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
                  await navigator.clipboard.writeText(data.id);
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
      <section className="replay-panel">
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
              data={data}
              step={step}
              perspective={perspective}
              setPerspective={setPerspective}
              reveal={reveal}
              animate={playing}
            />
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
                <input
                  type="range"
                  aria-label="回放进度"
                  min={0}
                  max={total - 1}
                  value={step}
                  onChange={(e) => seek(Number(e.target.value))}
                />
                <div>
                  <span className="replay-step-label">
                    {step + 1} / {total} 步
                  </span>
                  <button
                    aria-label="回到开局"
                    disabled={step === 0}
                    onClick={() => seek(0)}
                  >
                    <SkipBack size={18} />
                  </button>
                  <button
                    aria-label="上一步"
                    disabled={step === 0}
                    onClick={() => seek(step - 1)}
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <button
                    className="replay-play"
                    aria-label={playing ? "暂停回放" : "播放回放"}
                    onClick={() => {
                      gameAudio.unlock();
                      playbackRun.current++;
                      if (step >= total - 1) setStep(0);
                      setPlaying((p) => !p);
                    }}
                  >
                    {playing ? <Pause size={18} /> : <Play size={18} />}
                    {playing ? "暂停" : "播放"}
                  </button>
                  <button
                    aria-label="下一步"
                    disabled={step >= total - 1}
                    onClick={() => seek(step + 1)}
                  >
                    <ChevronRight size={18} />
                  </button>
                  <button
                    aria-label="查看结算"
                    disabled={step >= total - 1}
                    onClick={() => seek(total - 1)}
                  >
                    <SkipForward size={18} />
                  </button>
                  <select
                    aria-label="回放速度"
                    value={speed}
                    onChange={(e) => setSpeed(Number(e.target.value))}
                  >
                    <option value={1}>1 倍速</option>
                    <option value={2}>2 倍速</option>
                    <option value={4}>4 倍速</option>
                  </select>
                  <button
                    className="replay-reveal"
                    aria-pressed={reveal}
                    onClick={() => setReveal((v) => !v)}
                  >
                    {reveal ? "四家明牌" : "当前视角"}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </section>
    </Dialog>
  );
}
