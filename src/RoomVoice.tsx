import { useEffect, useRef, useState } from "react";
import { App as NativeApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { Mic, Volume2, X, Square } from "lucide-react";
import type { RoomVoiceMessage } from "../shared/room-voice";
import { gameAudio } from "./audio";
import { VoiceRecorder } from "./voice-recorder";
import type { GameClient } from "./game-client";

export function RoomVoice({
  client,
  game,
  connected,
  enabled,
  volume,
  me,
  messages,
}: {
  client: GameClient;
  game: string;
  connected: boolean;
  enabled: boolean;
  volume: number;
  me: string;
  messages: RoomVoiceMessage[];
}) {
  const [open, setOpen] = useState(false),
    [phase, setPhase] = useState<
      "idle" | "permission" | "recording" | "sending"
    >("idle");
  const [canceling, setCanceling] = useState(false),
    [elapsed, setElapsed] = useState(0),
    [error, setError] = useState("");
  const [playing, setPlaying] = useState("");
  const recorder = useRef<VoiceRecorder | null>(null),
    upload = useRef<AbortController | null>(null);
  const player = useRef<HTMLAudioElement | null>(null),
    origin = useRef(0),
    cancel = useRef(false),
    start = useRef(0);
  const alive = useRef(true),
    seen = useRef(new Set(messages.map((m) => m.id)));
  function stopPlayback() {
    const previous = player.current;
    player.current = null;
    if (previous) {
      previous.pause();
      previous.onended = null;
      previous.onerror = null;
      previous.removeAttribute("src");
      previous.load();
    }
    if (alive.current) setPlaying("");
    gameAudio.setCommunication(recorder.current ? "recording" : "off");
  }
  function stopAll() {
    recorder.current?.finish(false);
    recorder.current = null;
    upload.current?.abort();
    upload.current = null;
    stopPlayback();
    gameAudio.setCommunication("off");
    if (alive.current) {
      setPhase("idle");
      setCanceling(false);
    }
  }
  async function play(message: RoomVoiceMessage, automatic = false) {
    if (!enabled || recorder.current || document.hidden) return;
    if (playing === message.id && !automatic) {
      stopPlayback();
      return;
    }
    stopPlayback();
    const audio = new Audio(`data:audio/wav;base64,${message.audio}`);
    player.current = audio;
    audio.volume = Math.max(0, Math.min(1, volume));
    gameAudio.setCommunication("playing");
    setPlaying(message.id);
    audio.onended = audio.onerror = () => {
      if (player.current === audio) stopPlayback();
    };
    try {
      await audio.play();
    } catch {
      if (player.current === audio) stopPlayback();
    }
  }
  async function finish(send: boolean) {
    const current = recorder.current;
    if (!current) return;
    recorder.current = null;
    const bytes = current.finish(send && !cancel.current);
    gameAudio.setCommunication("off");
    setCanceling(false);
    if (!bytes) {
      setPhase("idle");
      if (send && !cancel.current) setError("说话时间太短，请按住后说话");
      return;
    }
    const controller = new AbortController();
    upload.current = controller;
    setPhase("sending");
    try {
      await client.sendVoice(bytes, game, controller.signal);
    } catch (e) {
      if (alive.current && !controller.signal.aborted)
        setError(e instanceof Error ? e.message : "语音发送失败");
    } finally {
      if (upload.current === controller) {
        upload.current = null;
        if (alive.current) setPhase("idle");
      }
    }
  }
  async function begin(y: number) {
    if (!connected || recorder.current || upload.current || document.hidden)
      return;
    stopPlayback();
    setError("");
    cancel.current = false;
    setCanceling(false);
    origin.current = y;
    const current = new VoiceRecorder();
    recorder.current = current;
    setPhase("permission");
    gameAudio.setCommunication("recording");
    try {
      const ready = await current.start(() => void finish(true));
      if (ready && recorder.current === current && alive.current) {
        start.current = Date.now();
        setElapsed(0);
        setPhase("recording");
      }
    } catch (e) {
      if (recorder.current !== current || !alive.current) return;
      recorder.current = null;
      current.finish(false);
      gameAudio.setCommunication("off");
      setPhase("idle");
      setError(
        e instanceof DOMException && e.name === "NotAllowedError"
          ? "麦克风权限未开启，请在系统设置中允许后再试"
          : "麦克风暂时无法使用，请重试",
      );
    }
  }
  useEffect(() => {
    alive.current = true;
    const hide = () => {
        if (document.hidden) stopAll();
      },
      blur = () => stopAll();
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("blur", blur);
    const expiry = setInterval(() => client.pruneVoiceMessages(), 5000);
    const native = Capacitor.isNativePlatform()
      ? NativeApp.addListener("appStateChange", (state) => {
          if (!state.isActive) stopAll();
        })
      : undefined;
    return () => {
      clearInterval(expiry);
      alive.current = false;
      stopAll();
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("blur", blur);
      void native?.then((h) => h.remove());
    };
  }, [game]);
  useEffect(() => {
    if (!connected) stopAll();
  }, [connected]);
  useEffect(() => {
    if (!enabled) stopPlayback();
  }, [enabled]);
  useEffect(() => {
    if (phase !== "recording") return;
    const timer = setInterval(
      () =>
        setElapsed(
          Math.min(15, Math.floor((Date.now() - start.current) / 1000)),
        ),
      200,
    );
    return () => clearInterval(timer);
  }, [phase]);
  useEffect(() => {
    const fresh = messages.filter((m) => !seen.current.has(m.id));
    for (const message of messages) seen.current.add(message.id);
    if (seen.current.size > 100)
      seen.current = new Set(messages.map((m) => m.id));
    const last = fresh
      .filter((m) => m.sender !== me && client.now() - m.at < 10000)
      .at(-1);
    if (last && enabled) void play(last, true);
  }, [messages]);
  return (
    <div className="room-voice">
      <button
        className="icon-button"
        aria-label="同桌语音"
        aria-expanded={open}
        onClick={() => {
          setOpen(!open);
          setError("");
          if (open) stopAll();
        }}
      >
        <Mic size={20} />
        {messages.length > 0 && <i />}
      </button>
      {open && (
        <section className="voice-panel" aria-label="同桌语音面板">
          <header>
            <strong>同桌语音</strong>
            <button
              aria-label="关闭同桌语音"
              onClick={() => {
                stopAll();
                setOpen(false);
              }}
            >
              <X size={18} />
            </button>
          </header>
          <div className="voice-clips">
            {messages.length ? (
              messages.slice(-4).map((m) => (
                <button
                  key={m.id}
                  disabled={!enabled}
                  onClick={() => void play(m)}
                  aria-label={`播放${m.name}的语音`}
                >
                  <span>{m.sender === me ? "我" : m.name}</span>
                  {playing === m.id ? (
                    <Square size={15} />
                  ) : (
                    <Volume2 size={16} />
                  )}
                  <b>{Math.ceil(m.duration)}″</b>
                </button>
              ))
            ) : (
              <p>按住下方按钮说话，同桌玩家可听到</p>
            )}
          </div>
          <button
            className={`hold-to-talk ${phase === "recording" ? "recording" : ""} ${canceling ? "canceling" : ""}`}
            disabled={!connected || phase === "sending"}
            onContextMenu={(e) => e.preventDefault()}
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              e.preventDefault();
              e.currentTarget.setPointerCapture(e.pointerId);
              void begin(e.clientY);
            }}
            onPointerMove={(e) => {
              if (!recorder.current) return;
              cancel.current = origin.current - e.clientY > 45;
              setCanceling(cancel.current);
            }}
            onPointerUp={() => void finish(true)}
            onPointerCancel={() => void finish(false)}
            onKeyDown={(e) => {
              if ((e.key === " " || e.key === "Enter") && !e.repeat) {
                e.preventDefault();
                void begin(0);
              }
              if (e.key === "Escape") void finish(false);
            }}
            onKeyUp={(e) => {
              if (e.key === " " || e.key === "Enter") {
                e.preventDefault();
                void finish(true);
              }
            }}
          >
            <Mic size={18} />
            {phase === "permission"
              ? "请允许麦克风，按住说话"
              : phase === "sending"
                ? "正在发送…"
                : phase === "recording"
                  ? `${canceling ? "松手取消" : "松开发送"} · ${elapsed} 秒`
                  : "按住说话"}
          </button>
          <small>
            {canceling ? "松开后这条语音不会发送" : "最长 15 秒 · 上滑取消"}
            {!enabled && " · 已关闭播放"}
          </small>
          {error && (
            <p className="voice-error" role="alert">
              {error}
            </p>
          )}
        </section>
      )}
    </div>
  );
}
