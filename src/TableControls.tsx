import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Bot, Check } from "lucide-react";
import {
  claimPrompt,
  sceneTileName,
  scenePlayerStatus,
  tileKind,
  type TableSceneState,
  type TableSceneCommand,
} from "../shared/table-scene";
import "./table-controls.css";
import { tableOverlayLayout } from "./table-overlay-layout";
import { frameStyle, TILE_FRAMES } from "./tile-art";
import {ActionButtons} from './ActionButtons';
import {tableActionRail} from './table-action-rail';

export function TableControls({
  state: s,
  onCommand,
  connectionQuality,
  onGestureBarrier,
}: {
  state: TableSceneState;
  onCommand: (command: TableSceneCommand) => void;
  connectionQuality?: string;
  onGestureBarrier?:(blocked:boolean)=>void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [actionsStyle, setActionsStyle] = useState<CSSProperties>({
    visibility: "hidden",
  });
  const [sourceStyle, setSourceStyle] = useState<CSSProperties>({ visibility: "hidden" });
  const [toolStyle,setToolStyle]=useState<CSSProperties>({visibility:'hidden'});
  useEffect(() => {
    const parent = host.current?.parentElement,
      frame = parent?.querySelector("iframe");
    if (!parent || !frame) return;
    const resize = () => {
      const a = parent.getBoundingClientRect(),
        b = frame.getBoundingClientRect();
      const layout = tableOverlayLayout(a, b,s.safeArea,s.tableStyle);
      const rail=tableActionRail(s,layout,a.height);
      setToolStyle({top:layout.top+Math.max(4,Math.min(12,12*layout.scale)),right:Math.max(10,a.width-layout.left-1280*layout.scale+(s.safeArea?.right??0)*layout.scale+10),left:'auto',visibility:'visible'});
      setActionsStyle({
        bottom: rail.bottom,
        left: rail.left,
        right: 'auto',
        transform: 'none',
        width: 'max-content',
        maxWidth: layout.actionMaxWidth,
        "--claim-scale": layout.scale,
        "--action-main-size": `${rail.main}px`,
        "--action-pass-size": `${rail.pass}px`,
        "--action-gap": `${rail.gap}px`,
        "--action-pass-margin": `${rail.passMargin}px`,
      } as CSSProperties);
      setSourceStyle({
        top: layout.sourceTop,
        left: layout.sourceLeft,
        width: layout.sourceWidth,
        height: layout.sourceHeight,
        "--claim-scale": layout.scale,
      } as CSSProperties);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(parent);
    observer.observe(frame);
    resize();
    return () => observer.disconnect();
  }, [s.safeArea,s.tableStyle,s.actions,s.players,s.drawn,s.selected]);
  const me = s.players.find((p) => p.seat === s.me),
    turn = s.players.find((p) => p.seat === s.turn);
  const source = s.pending && s.players.find((p) => p.seat === s.pending!.from);
  const prompt = claimPrompt(s);
  const claimContext = s.pending
    ? `${source?.name ?? "牌友"}${s.pending.kind === "robKong" ? "补杠" : "打出"}${sceneTileName(s.pending.tile)}`
    : "";
  const ended = ["ended", "finished"].includes(s.phase);
  const activity = !s.connected
    ? "正在同步牌桌"
    : ended
      ? "本把结束"
      : s.disabled
        ? "正在提交操作…"
        : me?.trustee
          ? "已开启托管"
          : s.canDiscard
            ? s.selected !== null
              ? `已选${sceneTileName(s.selected)} · 再点或上拖出牌`
              : "轮到你出牌"
            : s.phase === "claiming"
              ? `${claimContext}${claimContext ? " · " : ""}${s.pending?.answered ? "已响应，等待牌友" : s.actions.length ? "请选择操作" : "等待牌友响应"}`
              : `${turn?.name ?? "牌友"} · ${turn ? scenePlayerStatus(s, turn).label || "等待出牌" : "等待出牌"}`;
  return (
    <div className="table-controls" ref={host}>
      <ul className="sr-only" aria-label="玩家状态">
        {s.players.map((p) => (
          <li key={p.seat}>
            {p.name}：
            {scenePlayerStatus(s, p).label ||
              (s.connected ? "等待中" : "等待同步")}
          </li>
        ))}
      </ul>
      <nav className="table-toolbar" aria-label="牌桌工具">
        {connectionQuality && <small className="table-connection-quality" aria-label="网络状态">{connectionQuality}</small>}
        <span className="table-activity sr-only" role="status">
          {activity}
        </span>
        <div className="table-menu-actions" style={toolStyle}>
          <button
            className="table-tool-trustee"
            aria-label={
              ended ? "本局结算" : me?.trustee ? "取消托管" : "开启托管"
            }
            aria-pressed={ended ? undefined : !!me?.trustee}
            disabled={!ended && s.trusteeDisabled}
            onClick={() =>
              onCommand(
                ended
                  ? { type: "menu", menu: "result" }
                  : { type: "trustee", enabled: !me?.trustee },
              )
            }
          >
            {ended ? <Check size={18} aria-hidden="true" /> : <Bot size={18} aria-hidden="true" />}
            <span>{ended ? "结算" : me?.trustee ? "取消" : "托管"}</span>
          </button>
        </div>
      </nav>
      {prompt && !s.actions.some(a=>a.id==='hu') && (
        <aside className="table-claim-source" style={sourceStyle} aria-label="待响应牌" title={claimContext}>
          <div className="table-claim-source-copy">
            <span>{prompt.source}{prompt.kind === "robKong" ? "补杠" : "打出"}</span>
            <strong>{prompt.name}</strong>
          </div>
          <span className="table-claim-tile" role="img" aria-label={prompt.name}
            style={frameStyle(TILE_FRAMES[tileKind(prompt.tile)])} />
          <small className="table-claim-source-status">
            {!s.connected ? "等待连接恢复" : s.disabled ? "正在提交操作…" : "请选择操作"}
          </small>
        </aside>
      )}
      <ActionButtons state={s} style={actionsStyle} onCommand={onCommand} onGestureBarrier={onGestureBarrier}/>
      <div className="table-portrait-notice">
        横屏打牌更清楚，请将手机横过来
      </div>
    </div>
  );
}
