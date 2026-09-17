import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Home, Bot, Layers3, ScrollText, Settings, Check } from "lucide-react";
import {
  sceneTileName,
  scenePlayerStatus,
  type TableSceneState,
  type TableSceneCommand,
} from "../shared/table-scene";
import "./table-controls.css";
import { tableOverlayLayout } from "./table-overlay-layout";

export function TableControls({
  state: s,
  onCommand,
  connectionQuality,
}: {
  state: TableSceneState;
  onCommand: (command: TableSceneCommand) => void;
  connectionQuality?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [actionsStyle, setActionsStyle] = useState<CSSProperties>({
    visibility: "hidden",
  });
  useEffect(() => {
    const parent = host.current?.parentElement,
      frame = parent?.querySelector("iframe");
    if (!parent || !frame) return;
    const resize = () => {
      const a = parent.getBoundingClientRect(),
        b = frame.getBoundingClientRect();
      const layout = tableOverlayLayout(a, b,s.safeArea);
      setActionsStyle({
        bottom: layout.actionBottom,
        right: layout.actionRight,
        maxWidth: layout.actionMaxWidth,
      });
    };
    const observer = new ResizeObserver(resize);
    observer.observe(parent);
    observer.observe(frame);
    resize();
    return () => observer.disconnect();
  }, [s.safeArea]);
  const me = s.players.find((p) => p.seat === s.me),
    turn = s.players.find((p) => p.seat === s.turn);
  const source = s.pending && s.players.find((p) => p.seat === s.pending!.from);
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
              ? `已选${sceneTileName(s.selected)} · 再点出牌`
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
        <button
          className={`table-back${connectionQuality ? " with-network-status" : ""}`}
          onClick={() => onCommand({ type: "menu", menu: "leave" })}
        >
          <Home size={18} aria-hidden="true" />
          <span>大厅</span>
          {connectionQuality && <small className="table-connection-quality">{connectionQuality}</small>}
        </button>
        <span className="table-activity sr-only" role="status">
          {activity}
        </span>
        <div className="table-menu-actions">
          <button
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
          <button
            aria-label="牌局信息"
            onClick={() => onCommand({ type: "menu", menu: "table" })}
          >
            <Layers3 size={18} aria-hidden="true" />
            <span>牌局</span>
          </button>
          <button
            aria-label="对局记录"
            onClick={() => onCommand({ type: "menu", menu: "events" })}
          >
            <ScrollText size={18} aria-hidden="true" />
            <span>记录</span>
          </button>
          <button
            aria-label="牌桌设置"
            onClick={() => onCommand({ type: "menu", menu: "settings" })}
          >
            <Settings size={18} aria-hidden="true" />
            <span>设置</span>
          </button>
        </div>
      </nav>
      {!!s.actions.length && (
        <div
          className="table-claim-actions"
          style={actionsStyle}
          role="group"
          aria-label="碰杠胡操作"
          aria-busy={s.disabled}
        >
          {s.actions.map((a, i) => (
            <button
              key={`${a.id}-${a.tile ?? i}`}
              className={
                a.id === "pass" ? "claim-pass" : a.id === "hu" ? "claim-hu" : ""
              }
              disabled={s.disabled || !s.connected}
              aria-label={
                a.tile === undefined
                  ? a.label
                  : `${a.label} ${sceneTileName(a.tile)}`
              }
              onClick={() =>
                onCommand({ type: "action", action: a.id, tile: a.tile })
              }
            >
              <span>{a.label}</span>
              {a.tile !== undefined && <small>{sceneTileName(a.tile)}</small>}
            </button>
          ))}
        </div>
      )}
      <div className="table-portrait-notice">
        横屏打牌更清楚，请将手机横过来
      </div>
    </div>
  );
}
