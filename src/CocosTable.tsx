import { ReadyDiscardArrows } from "./ReadyDiscardArrows";
import { ScoreDebitOverlay } from "./ScoreDebitOverlay";
import type { ScoreDebit } from "./score-debits";
import { TableWinEffect } from "./TableWinEffect";
import type { Result } from "../shared/types";
import { TableControls } from "./TableControls";
import { gameAudio } from "./audio";
import { WinHintPanel } from "./WinHintPanel";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { TableOpening, canShowOpening, openingMatchesState, type OpeningCue } from "./TableOpening";
import type { TableSceneCommand, TableSceneState, TableSafeArea } from "../shared/table-scene";
import { tableSafeArea } from "./table-safe-area";
import "./cocos-table.css";
import {androidDiagnostics} from './android-diagnostics';
import { createTableChannel } from "./cocos-channel";
import {winDisplayLabel} from './win-label';
import type {Seat} from '../shared/types';
import { visibleTimeout } from './visible-timeout';

/** One canvas and one renderer for Android, iOS and the browser. The iframe
 * receives only the public view and explicit local UI state, never the wall. */
export function CocosTable({
  state,
  onCommand,
  children,
  embedded = false,
  connectionQuality,
  readyDiscards = [],
  scoreDebits = [],
  winResult,
  onSurfaceInteraction,
  opening,
  openingWaiting,
  onOpeningComplete,
  onEntryBusyChange,
  onActionComplete,
}: {
  state: TableSceneState;
  onCommand: (command: TableSceneCommand) => void;
  children?: ReactNode | ((state: TableSceneState) => ReactNode);
  embedded?: boolean;
  connectionQuality?: string;
  readyDiscards?: number[];
  scoreDebits?: ScoreDebit[];
  winResult?: Result;
  onSurfaceInteraction?: () => void;
  opening?: OpeningCue | null;
  openingWaiting?: number;
  onOpeningComplete?: (opening: OpeningCue) => void;
  onEntryBusyChange?: (busy: boolean) => void;
  onActionComplete?:(key:string)=>void;
}) {
  const [dismissedOpening, setDismissedOpening] = useState("");
  const [acceptedOpening, setAcceptedOpening] = useState("");
  const completedOpenings = useRef(new Set<string>());
  const openingComplete = useRef(onOpeningComplete);
  openingComplete.current = onOpeningComplete;
  const dismissOpening = useCallback(() => {
    if (!opening) return;
    setDismissedOpening(opening.key);
    if (!completedOpenings.current.has(opening.key)) {
      completedOpenings.current.add(opening.key);
      openingComplete.current?.(opening);
    }
  }, [opening?.key]);
  const frame = useRef<HTMLIFrameElement>(null);
  const gestureBarrier=useRef(false),heardActions=useRef(new Set<string>());
  const actionSounds=useRef(new Map<number,()=>void>());
  const knownCues=useRef(new Map<string,TableSceneState['effects'][number]>()),completedCues=useRef(new Set<string>()),cueContext=useRef('');
  const [,setCompletionRevision]=useState(0);
  const [handBlocked,setHandBlocked]=useState(false);
  const guardHand=useCallback((blocked:boolean)=>{gestureBarrier.current=blocked;setHandBlocked(blocked);},[]);
  const surfaceInteraction=useRef(onSurfaceInteraction);
  surfaceInteraction.current=onSurfaceInteraction;
  const safeProbe = useRef<HTMLDivElement>(null);
  const [safeArea,setSafeArea] = useState<TableSafeArea>({left:0,right:0,top:0,bottom:0});
  const viewState=useMemo(()=>({...state,safeArea,tableStyle:'reference-3d' as const,effects:state.effects.map(e=>e.type==='hu'&&winResult?{...e,label:winDisplayLabel(winResult,e.seat as Seat)}:e)}),[state,safeArea,winResult]);
  const context=`${state.key}:${state.round}:${state.me}:${state.presentation}`;
  useEffect(()=>()=>{for(const cancel of actionSounds.current.values())cancel();actionSounds.current.clear();},[context,state.connected,state.presentation==='replay'?state.revision:undefined]);
  if(cueContext.current!==context||!state.connected){knownCues.current.clear();completedCues.current.clear();cueContext.current=context;}
  if(state.connected)for(const cue of viewState.effects)knownCues.current.set(cue.key,cue);
  while(knownCues.current.size>96)knownCues.current.delete(knownCues.current.keys().next().value!);
  const [channel,setChannel] = useState(createTableChannel);
  const [failure,setFailure] = useState<"timeout"|"page"|"resources"|"graphics">("resources");
  const graphicsRecoveries = useRef<number[]>([]);
  const graphicsReloadPending = useRef(false);
  const graphicsRecoveryStarted = useRef<number | undefined>(undefined);
  const mutedRecoveryCues = useRef(new Set<string>());
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const readyRef = useRef(false);
  readyRef.current = status === 'ready';
  useEffect(() => {
    if (status !== 'ready') {
      for (const cancel of actionSounds.current.values()) cancel();
      actionSounds.current.clear();
    }
  }, [status]);
  useLayoutEffect(() => {
    if (!embedded && opening && canShowOpening(opening, state, Date.now()))
      setAcceptedOpening(opening.key);
    // Fast resume receives its state snapshot before the synced pong restores
    // connected. A cue first seen during that gap must be reconsidered once
    // the same game is connected; its key and round need not change again.
  }, [opening?.key, state.key, state.round, state.connected, embedded]);
  const showingOpening = !embedded && status !== "error" && !!opening &&
    acceptedOpening === opening.key && dismissedOpening !== opening.key &&
    openingMatchesState(opening, state);
  const waitingForOpening = !embedded && status !== "error" && !!opening &&
    acceptedOpening === opening.key && dismissedOpening === opening.key &&
    openingWaiting !== undefined && openingMatchesState(opening, state);
  useEffect(() => {
    onEntryBusyChange?.(status !== "ready" || showingOpening || waitingForOpening);
  }, [status, showingOpening, waitingForOpening, onEntryBusyChange]);
  useEffect(() => () => onEntryBusyChange?.(false), [onEntryBusyChange]);
  const latest = useRef({ state:viewState, onCommand,onActionComplete });
  useEffect(() => {
    for (const theme of ["plate", "pung", "kong", "hu", "pass", "crystal", "fire-ring"]) {
      const image = new Image();
      image.src = `${import.meta.env.BASE_URL}ui/${theme==='crystal'?'actions-crystal-v3/plate':theme==='fire-ring'?'actions-crystal-v3/fire-ring':`actions-jade-v2/${theme}`}.png`;
      if(typeof image.decode==='function')void image.decode().catch(() => {});
    }
  }, []);
  latest.current = { state:viewState, onCommand,onActionComplete };
  useEffect(()=>{androidDiagnostics.context(state);},[state.code,state.round,state.phase]);
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
  const sentState = useRef("");
  const send = (force = false) => {
    const target = frame.current?.contentWindow;
    if (!target) return;
    if (graphicsRecoveryStarted.current !== undefined)
      for (const cue of latest.current.state.effects) mutedRecoveryCues.current.add(cue.key);
    while (mutedRecoveryCues.current.size > 96) mutedRecoveryCues.current.delete(mutedRecoveryCues.current.values().next().value!);
    const message = {
        scope: "jinling-table-v1",
        channel,
        type: "state",
        state: { ...latest.current.state, externalControls: !embedded,
          effects: latest.current.state.effects.filter(cue => !mutedRecoveryCues.current.has(cue.key)) },
      };
    const key = JSON.stringify(message);
    // App clocks tick four times per second. Identical snapshots need not
    // cross the iframe bridge or wake its layout/HUD work again.
    if (!force && sentState.current === key) return;
    target.postMessage(message,
      location.origin === "null" ? "*" : location.origin,
    );
    sentState.current = key;
  };
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
      if (graphicsReloadPending.current) return;
      if (data.type === "ready") {
        androidDiagnostics.record('table-ready', undefined, {
          reason:graphicsRecoveryStarted.current === undefined ? 'initial-load' : 'graphics-recovered',
          elapsedMs:graphicsRecoveryStarted.current === undefined ? undefined : Date.now()-graphicsRecoveryStarted.current,
          attempt:graphicsRecoveries.current.length,
        });
        // Resource readiness precedes applying the replay snapshot. Keep the
        // loading cover and playback clock gated until that snapshot is drawn.
        if (latest.current.state.presentation !== 'replay') setStatus("ready");
        send(true);
        graphicsRecoveryStarted.current = undefined;
      }
      if (data.type === 'frame-presented') {
        const state = latest.current.state;
        if (state.presentation === 'replay' && data.key === state.key &&
            data.round === state.round && data.revision === state.revision && data.me === state.me)
          setStatus('ready');
      }
      if (data.type === "error") {androidDiagnostics.tableError(data.diagnostic??{});setFailure("resources");setStatus("error");}
      if(data.type==='action-impact'||data.type==='action-complete'){
        const s=latest.current.state,e=knownCues.current.get(data.key);
        if(!readyRef.current||mutedRecoveryCues.current.has(data.key)||!e||e.seat!==data.seat||e.type!==data.action||!s.connected||document.hidden||!['pung','kong','hu'].includes(e.type))return;
        if(data.type==='action-complete'){
          if(completedCues.current.has(e.key))return;completedCues.current.add(e.key);
          while(completedCues.current.size>96)completedCues.current.delete(completedCues.current.values().next().value!);
          setCompletionRevision(v=>v+1);latest.current.onActionComplete?.(e.key);return;
        }
        // Simultaneous winners get individual visuals but one shared shout.
        const key=e.type==='hu'?`hu:${e.key.slice(0,e.key.lastIndexOf(':'))}`:e.key;
        if(heardActions.current.has(key))return;heardActions.current.add(key);
        while(heardActions.current.size>96)heardActions.current.delete(heardActions.current.values().next().value!);
        actionSounds.current.get(e.seat)?.();actionSounds.current.set(e.seat,gameAudio.playOwnedAction(e.type as 'pung'|'kong'|'hu'));
        gameAudio.sayTile(key+':landed',e.type==='hu'?'胡了':e.type==='pung'?'碰':e.concealed?'暗杠':e.upgraded?'补杠':'杠');
        if(e.type==='kong'){
          const batch=(key:string)=>key.split(':').slice(0,-2).join(':');
          const flower=[...knownCues.current.values()].find(f=>f.type==='flower'&&f.seat===e.seat&&batch(f.key)===batch(e.key));
          if(flower)gameAudio.sayTile(flower.key+':after-kong','补花');
        }
      }
      if (
        data.type === "command" &&
        data.command &&
        typeof data.command.type === "string"
      )
        {if(!readyRef.current)return;if(gestureBarrier.current&&['select','discard'].includes(data.command.type))return;latest.current.onCommand(data.command);}
    };
    const resume = () => {
      if (!document.hidden) send(true);
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
  }, [viewState, status, embedded]);
  useEffect(() => {
    if (status !== "loading") return;
    androidDiagnostics.record('table-loading', undefined, {
      reason:graphicsRecoveryStarted.current === undefined ? 'initial-load' : 'graphics-recovery',
      attempt:graphicsRecoveries.current.length, visible:!document.hidden,
    });
    return visibleTimeout(() => {androidDiagnostics.tableError({stage:'timeout',message:'Table ready handshake timed out'});setFailure("timeout");setStatus("error");}, 20000);
  }, [status, channel]);
  useEffect(() => {
    if (status !== 'loading' || !graphicsReloadPending.current) return;
    // Do not allocate another GPU renderer while the OS has backgrounded us.
    return visibleTimeout(() => {
      graphicsReloadPending.current = false;
      setChannel(createTableChannel());
    }, 300);
  }, [status, channel]);
  useEffect(() => {
    const canvas = status === "ready" ? frame.current?.contentDocument?.querySelector("canvas") : null;
    if (!canvas) return;
    // Cocos' bundled WebGL renderer only logs context loss. Its state keeps
    // advancing while no new cards can be painted. Recreate only the canvas
    // page, then the ready handshake restores our latest authoritative view.
    const lost = (event: Event) => {
      event.preventDefault();
      if (graphicsReloadPending.current || !readyRef.current) return;
      readyRef.current = false;
      androidDiagnostics.tableError({stage:'graphics',message:'WebGL context lost'});
      // A graphics interruption is not entrance completion. Preserve an
      // unfinished opening; TableOpening pauses while tableReady is false
      // and reports completion only after the replacement renderer is ready.
      setFailure("graphics");
      const now = Date.now();
      graphicsRecoveries.current = graphicsRecoveries.current.filter(at => now-at < 60000);
      if (graphicsRecoveries.current.length >= 2) {
        setStatus("error");
        return;
      }
      graphicsRecoveries.current.push(now);
      graphicsRecoveryStarted.current = now;
      graphicsReloadPending.current = true;
      for (const cue of latest.current.state.effects) mutedRecoveryCues.current.add(cue.key);
      setStatus("loading");
    };
    canvas.addEventListener("webglcontextlost", lost);
    return () => canvas.removeEventListener("webglcontextlost", lost);
  }, [status, channel, opening?.key]);
  useEffect(() => {
    // Pointer events in the canvas iframe do not bubble to App's document.
    // Resume synchronously within this trusted gesture (postMessage is too late).
    const doc = status === "ready" ? frame.current?.contentDocument : null;
    if (!doc) return;
    doc.addEventListener("pointerdown", gameAudio.unlock, { capture: true });
    doc.addEventListener("pointerup", gameAudio.unlock, { capture: true });
    doc.addEventListener("touchend", gameAudio.unlock, { capture: true, passive: true });
    const interact=()=>surfaceInteraction.current?.();
    doc.addEventListener("pointerup",interact);
    doc.addEventListener("keydown", gameAudio.unlock, { capture: true });
    return () => {
      doc.removeEventListener("pointerdown", gameAudio.unlock, {
        capture: true,
      });
      doc.removeEventListener("keydown", gameAudio.unlock, { capture: true });
      doc.removeEventListener("pointerup", gameAudio.unlock, { capture: true });
      doc.removeEventListener("touchend", gameAudio.unlock, { capture: true });
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
        style={{pointerEvents:handBlocked||status!=='ready'?'none':undefined}}
        onError={() => {androidDiagnostics.tableError({stage:'page',message:'Table iframe failed to load'});setFailure("page");setStatus("error");}}
      />
      {status !== "ready" && !showingOpening && (
        <div className={`cocos-loading cocos-loading-blue${status === "loading" ? " cocos-loading-pending" : ""}`} role="status" aria-label={status === "loading" ? (failure === 'graphics' ? '正在恢复牌桌画面' : '正在进入牌桌') : undefined}>
          {status === "loading" && <strong>{failure === 'graphics' ? '正在恢复牌桌画面…' : '正在进入牌桌…'}</strong>}
          {status === "error" && <strong>
            {{timeout:"牌桌加载超时",page:"牌桌页面未能打开",resources:"牌桌资源加载失败",graphics:"牌桌画面暂时中断"}[failure]}
          </strong>}
          {status === "error" && <p>可以重新加载牌桌，当前对局进度会保留。</p>}
          {status === "error" && (
            <button
              onClick={() => {
                graphicsRecoveries.current = [];
                graphicsReloadPending.current = false;
                setStatus("loading");
                setChannel(createTableChannel());
              }}
            >
              重新加载
            </button>
          )}
          {status === "error" && !embedded && (
            <button onClick={() => onCommand({ type: "menu", menu: "leave" })}>
              返回大厅
            </button>
          )}
        </div>
      )}
      {status === "ready" && !embedded && (
        <TableControls state={viewState} onCommand={onCommand} connectionQuality={connectionQuality} onGestureBarrier={guardHand}/>
      )}
      {status === "ready" && !embedded && (
        <WinHintPanel state={viewState} onCommand={onCommand} readyDiscards={readyDiscards} />
      )}
      {status === "ready" && !embedded && <ReadyDiscardArrows state={viewState} tiles={readyDiscards} />}
      {status === "ready" && !showingOpening && !embedded && <ScoreDebitOverlay state={viewState} events={scoreDebits} completedActions={completedCues.current} />}
      {status === "ready" && embedded && winResult && !viewState.effects.some(e=>e.type==='hu') && <TableWinEffect state={viewState} result={winResult} />}
      {status === "ready" && !showingOpening && children && <div className="cocos-voice">{typeof children === "function" ? children(viewState) : children}</div>}
      {(showingOpening || waitingForOpening) && opening && (
        <TableOpening
          key={opening.key}
          state={viewState}
          done={dismissOpening}
          tableReady={status === "ready"}
          completed={waitingForOpening}
          waitingCount={openingWaiting}
        />
      )}
    </main>
  );
}
