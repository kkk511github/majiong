import { ReadyDiscardArrows } from "./ReadyDiscardArrows";
import { TableWinEffect } from "./TableWinEffect";
import type { Result } from "../shared/types";
import { TableControls } from "./TableControls";
import { gameAudio } from "./audio";
import { WinHintPanel } from "./WinHintPanel";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { TableOpening, canShowOpening, type OpeningCue } from "./TableOpening";
import type { TableSceneCommand, TableSceneState, TableSafeArea } from "../shared/table-scene";
import { tableSafeArea } from "./table-safe-area";
import "./cocos-table.css";
import { createTableChannel } from "./cocos-channel";

/** One canvas and one renderer for Android, iOS and the browser. The iframe
 * receives only the public view and explicit local UI state, never the wall. */
export function CocosTable({
  state,
  onCommand,
  children,
  embedded = false,
  connectionQuality,
  readyDiscards = [],
  winResult,
  onSurfaceInteraction,
  opening,
}: {
  state: TableSceneState;
  onCommand: (command: TableSceneCommand) => void;
  children?: ReactNode;
  embedded?: boolean;
  connectionQuality?: string;
  readyDiscards?: number[];
  winResult?: Result;
  onSurfaceInteraction?: () => void;
  opening?: OpeningCue | null;
}) {
  const [dismissedOpening, setDismissedOpening] = useState("");
  const dismissOpening = useCallback(() => setDismissedOpening(opening?.key ?? ""), [opening?.key]);
  const frame = useRef<HTMLIFrameElement>(null);
  const surfaceInteraction=useRef(onSurfaceInteraction);
  surfaceInteraction.current=onSurfaceInteraction;
  const safeProbe = useRef<HTMLDivElement>(null);
  const [safeArea,setSafeArea] = useState<TableSafeArea>({left:0,right:0,top:0,bottom:0});
  const viewState=useMemo(()=>({...state,safeArea}),[state,safeArea]);
  const [channel,setChannel] = useState(createTableChannel);
  const [failure,setFailure] = useState<"timeout"|"page"|"resources">("resources");
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const latest = useRef({ state:viewState, onCommand });
  useEffect(() => {
    // Decode before a win occurs so the short reveal never starts with empty art.
    for (const theme of ["sea", "jade", "bloom", "celestial", "gold"]) {
      const image = new Image();
      image.src = `${import.meta.env.BASE_URL}art/win-v2/${theme}.webp`;
      void image.decode().catch(() => {});
    }
  }, []);
  latest.current = { state:viewState, onCommand };
  useEffect(()=>{
    const probe=safeProbe.current,iframe=frame.current;
    if(!probe||!iframe)return;
    const resize=()=>{
      const css=getComputedStyle(probe),number=(value:string)=>Number.parseFloat(value)||0;
      const next=tableSafeArea({left:number(css.paddingLeft),right:number(css.paddingRight),top:number(css.paddingTop),bottom:number(css.paddingBottom)},iframe.getBoundingClientRect(),{width:window.innerWidth,height:window.innerHeight});
      setSafeArea(previous=>Object.keys(next).every(key=>next[key as keyof TableSafeArea]===previous[key as keyof TableSafeArea])?previous:next);
    };
    const observer=new ResizeObserver(resize);
    observer.observe(probe,{box:"border-box"});observer.observe(iframe);
    // Opposite landscape orientations can swap left/right insets while the
    // total padding and viewport size stay equal. Observe each edge separately.
    for(const edge of probe.children)observer.observe(edge);
    window.addEventListener("resize",resize);window.addEventListener("orientationchange",resize);
    resize();
    return ()=>{observer.disconnect();window.removeEventListener("resize",resize);window.removeEventListener("orientationchange",resize);};
  },[]);
  const send = () =>
    frame.current?.contentWindow?.postMessage(
      {
        scope: "jinling-table-v1",
        channel,
        type: "state",
        // Live games and replays share the seat-aware result overlay. Sending
        // hu to the iframe would also play its older centre-table effect.
        state: { ...latest.current.state, effects: latest.current.state.effects.filter(e => e.type !== "hu"), externalControls: !embedded },
      },
      location.origin === "null" ? "*" : location.origin,
    );
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (
        event.origin !== location.origin ||
        event.source !== frame.current?.contentWindow
      )
        return;
      const data = event.data;
      if (data?.scope !== "jinling-table-v1" || data.channel !== channel)
        return;
      if (data.type === "ready") {
        setStatus("ready");
        send();
      }
      if (data.type === "error") {setFailure("resources");setStatus("error");}
      if (
        data.type === "command" &&
        data.command &&
        typeof data.command.type === "string"
      )
        latest.current.onCommand(data.command);
    };
    const resume = () => {
      if (!document.hidden) send();
    };
    window.addEventListener("message", receive);
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("pageshow", resume);
    return () => {
      window.removeEventListener("message", receive);
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("pageshow", resume);
    };
  }, [channel]);
  useEffect(() => {
    if (status === "ready") send();
  }, [viewState, status]);
  useEffect(() => {
    if (status !== "loading") return;
    const timeout = setTimeout(() => {setFailure("timeout");setStatus("error");}, 20000);
    return () => clearTimeout(timeout);
  }, [status]);
  useEffect(() => {
    // Pointer events in the canvas iframe do not bubble to App's document.
    // Resume synchronously within this trusted gesture (postMessage is too late).
    const doc = status === "ready" ? frame.current?.contentDocument : null;
    if (!doc) return;
    doc.addEventListener("pointerdown", gameAudio.unlock, { capture: true });
    const interact=()=>surfaceInteraction.current?.();
    doc.addEventListener("pointerup",interact);
    doc.addEventListener("keydown", gameAudio.unlock, { capture: true });
    return () => {
      doc.removeEventListener("pointerdown", gameAudio.unlock, {
        capture: true,
      });
      doc.removeEventListener("keydown", gameAudio.unlock, { capture: true });
      doc.removeEventListener("pointerup",interact);
    };
  }, [status]);

  return (
    <main
      className={`cocos-game${embedded ? " cocos-embedded" : " external-table-controls"}`}
      id={embedded ? undefined : "cocos-table-board"}
      aria-label="南京麻将牌桌"
    >
      <div className="table-safe-area-probe" ref={safeProbe} aria-hidden="true">
        <i className="table-safe-edge safe-left"/><i className="table-safe-edge safe-right"/>
        <i className="table-safe-edge safe-top"/><i className="table-safe-edge safe-bottom"/>
      </div>
      <iframe
        ref={frame}
        title="金陵麻将牌桌"
        src={`${import.meta.env.BASE_URL}cocos-table/index.html?channel=${encodeURIComponent(channel)}`}
        allow="autoplay"
        onError={() => {setFailure("page");setStatus("error");}}
      />
      {status !== "ready" && (
        <div className="cocos-loading" role="status">
          {status === "error" && <strong>
            {{timeout:"牌桌加载超时",page:"牌桌页面未能打开",resources:"牌桌资源加载失败"}[failure]}
          </strong>}
          {status === "error" && <p>可以重新加载牌桌，当前对局进度会保留。</p>}
          {status === "error" && (
            <button
              onClick={() => {
                setStatus("loading");
                setChannel(createTableChannel());
              }}
            >
              重新加载
            </button>
          )}
          {!embedded && (
            <button onClick={() => onCommand({ type: "menu", menu: "leave" })}>
              返回大厅
            </button>
          )}
        </div>
      )}
      {status === "ready" && !embedded && (
        <TableControls state={viewState} onCommand={onCommand} connectionQuality={connectionQuality} />
      )}
      {status === "ready" && !embedded && (
        <WinHintPanel state={viewState} onCommand={onCommand} readyDiscards={readyDiscards} />
      )}
      {status === "ready" && !embedded && <ReadyDiscardArrows state={state} tiles={readyDiscards} />}
      {status === "ready" && winResult && <TableWinEffect state={viewState} result={winResult} />}
      {children && <div className="cocos-voice">{children}</div>}
      {status === "ready" && !embedded && opening && dismissedOpening !== opening.key && canShowOpening(opening, state, Date.now()) && <TableOpening key={opening.key} state={state} done={dismissOpening} />}
    </main>
  );
}
