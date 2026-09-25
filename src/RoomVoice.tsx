import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { App as NativeApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { MessageCircle, Volume2, X } from "lucide-react";
import { ROOM_PHRASES, ROOM_PHRASE_TTL_MS, type RoomPhraseId, type RoomPhraseMessage } from "../shared/room-phrases";
import { sceneOffset, type TableSceneState } from "../shared/table-scene";
import { gameAudio } from "./audio";
import type { GameClient } from "./game-client";
import { roomCommunicationLayout, roomPhrasePosition } from "./room-communication-layout";
import "./room-communication.css";

/** The table offers fixed recorded phrases only; it never captures a microphone. */
export function RoomVoice({
  client, game, connected, enabled, volume, phrases, phrasesAvailable, voiceGender, tableState,
}: {
  client: Pick<GameClient, "sendPhrase" | "now" | "prunePhraseMessages">;
  game: string;
  connected: boolean;
  enabled: boolean;
  volume: number;
  phrases: RoomPhraseMessage[];
  phrasesAvailable: boolean;
  voiceGender: "male" | "female";
  tableState: TableSceneState;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [playing, setPlaying] = useState("");
  const [sendingPhrase, setSendingPhrase] = useState<RoomPhraseId | null>(null);
  const sendingRef = useRef(false);
  const phraseStop = useRef<(() => void) | null>(null);
  const phraseSeen = useRef(new Set(phrases.map((m) => m.id)));
  const root = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<ReturnType<typeof roomCommunicationLayout> | null>(null);
  const alive = useRef(true);

  function stopPlayback() {
    const stop = phraseStop.current;
    phraseStop.current = null;
    stop?.();
    if (alive.current) setPlaying("");
  }
  function playPhrase(message: RoomPhraseMessage, automatic = false) {
    if (!enabled || !connected || document.hidden) return;
    if (playing === message.id && !automatic) { stopPlayback(); return; }
    stopPlayback();
    setPlaying(message.id);
    phraseStop.current = gameAudio.playChatPhrase(message.phrase, voiceGender, volume, (state) => {
      if (state === "ended" || state === "failed" || state === "cancelled") {
        if (alive.current) setPlaying(current => current === message.id ? "" : current);
      }
    });
  }
  async function sendPhrase(id: RoomPhraseId) {
    if (sendingRef.current || !connected || !phrasesAvailable) return;
    gameAudio.unlock();
    sendingRef.current = true;
    setSendingPhrase(id);
    setError("");
    try {
      await client.sendPhrase(game, id);
      if (alive.current) setOpen(false);
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : "短句发送失败，请重试");
    } finally {
      sendingRef.current = false;
      if (alive.current) setSendingPhrase(null);
    }
  }
  useEffect(() => {
    alive.current = true;
    const hide = () => { if (document.hidden) stopPlayback(); };
    document.addEventListener("visibilitychange", hide);
    const expiry = setInterval(() => client.prunePhraseMessages(), 500);
    const native = Capacitor.isNativePlatform()
      ? NativeApp.addListener("appStateChange", (state) => { if (!state.isActive) stopPlayback(); })
      : undefined;
    return () => {
      clearInterval(expiry);
      alive.current = false;
      stopPlayback();
      document.removeEventListener("visibilitychange", hide);
      void native?.then((h) => h.remove());
    };
  }, [game]);
  useLayoutEffect(() => {
    const host = root.current?.closest<HTMLElement>(".cocos-game");
    const frame = host?.querySelector("iframe");
    if (!host || !frame) return;
    const resize = () => {
      const a = host.getBoundingClientRect();
      const toolbar = host.querySelector(".table-menu-actions")?.getBoundingClientRect();
      setLayout(roomCommunicationLayout(a, frame.getBoundingClientRect(), tableState.safeArea, toolbar ? toolbar.bottom - a.top : 104,tableState.tableStyle));
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host); observer.observe(frame);
    const toolbar = host.querySelector(".table-menu-actions");
    if (toolbar) observer.observe(toolbar);
    resize();
    return () => observer.disconnect();
  }, [tableState.safeArea,tableState.tableStyle]);
  useEffect(() => {
    if (!open) return;
    const close = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", close);
    const tableDocument = root.current?.closest(".cocos-game")?.querySelector("iframe")?.contentDocument;
    const outside = () => setOpen(false);
    tableDocument?.addEventListener("pointerdown", outside);
    return () => {
      window.removeEventListener("keydown", close);
      tableDocument?.removeEventListener("pointerdown", outside);
    };
  }, [open]);
  useEffect(() => {
    if (!connected) { stopPlayback(); setOpen(false); }
  }, [connected]);
  const claimContext = `${tableState.phase}:${tableState.pending?.from}:${tableState.pending?.tile}:${tableState.pending?.kind}`;
  useEffect(() => {
    if (tableState.phase === "claiming" && tableState.actions.length) setOpen(false);
  }, [claimContext]);
  useEffect(() => {
    if (!enabled || volume <= 0) stopPlayback();
  }, [enabled, volume]);
  useEffect(() => {
    const fresh = phrases.filter(m => !phraseSeen.current.has(m.id));
    for (const message of phrases) phraseSeen.current.add(message.id);
    if (phraseSeen.current.size > 100) phraseSeen.current = new Set(phrases.map(m => m.id));
    const last = fresh.filter(m => m.game === game && client.now() - m.at >= -1000 && client.now() - m.at < ROOM_PHRASE_TTL_MS).slice(-1)[0];
    if (last && enabled) playPhrase(last, true);
  }, [phrases]);

  const bubbleMessages = phrases.filter((m, i) => m.game === game && client.now() - m.at < ROOM_PHRASE_TTL_MS && !phrases.slice(i + 1).some(next => next.seat === m.seat));
  return (
    <div ref={root} className={`room-communication${layout?.compact ? " compact" : ""}`} style={{ visibility: layout ? "visible" : "hidden", "--communication-scale": layout?.scale ?? 1 } as CSSProperties}>
      <div className={`room-communication-tools${layout?.compact && open ? " panel-open" : ""}`} style={{ ...layout?.rail, "--communication-button-size": `${layout?.size ?? 44}px` } as CSSProperties}>
        <button className="room-communication-button" aria-label="快捷短句" aria-expanded={open}
          onClick={() => { gameAudio.unlock(); setOpen(current => !current); setError(""); }}>
          <MessageCircle size={22} /><span>短句</span>
        </button>
      </div>
      {open && (
        <section className="room-communication-panel phrase-panel" aria-label="快捷短句面板" style={layout?.panel as CSSProperties}>
          <header><strong>快捷短句</strong><button aria-label="关闭快捷短句" onClick={() => setOpen(false)}><X size={20}/></button></header>
          <div className="phrase-list">
            {ROOM_PHRASES.map(phrase => <button key={phrase.id} disabled={!connected || !phrasesAvailable || sendingPhrase !== null} onClick={() => void sendPhrase(phrase.id)}><span>{phrase.text}</span>{sendingPhrase === phrase.id && <small>发送中…</small>}</button>)}
          </div>
          <footer>{!connected ? "连接恢复后可发送" : !phrasesAvailable ? "服务器暂未开启短句" : "点击发送 · 发完收起"}</footer>
          {error && <p className="phrase-error" role="alert">{error}</p>}
        </section>
      )}
      {layout && bubbleMessages.map(message => {
        const phrase = ROOM_PHRASES.find(p => p.id === message.phrase);
        if (!phrase) return null;
        const offset = sceneOffset(message.seat, tableState.me);
        return <button key={message.id} className={`room-phrase-bubble seat-${offset}`} data-seat={message.seat} style={roomPhrasePosition(layout, offset)} aria-label={`${message.name}：${phrase.text}，点击播放`} onClick={() => playPhrase(message)}>
          {playing === message.id ? <Volume2 size={15}/> : <MessageCircle size={15}/>}<span>{phrase.text}</span>
        </button>;
      })}
    </div>
  );
}
