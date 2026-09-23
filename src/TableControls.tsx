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

const actionHint = (id: string, robKong: boolean) =>
  id === "pass" ? "暂不响应" : id === "pung" ? "收成一组" :
  id === "kong" ? "四张成杠" : id === "hu" ? (robKong ? "抢杠胡" : "确认胡牌") : "选择杠牌";

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
  const [sourceStyle, setSourceStyle] = useState<CSSProperties>({ visibility: "hidden" });
  const [submittedAction, setSubmittedAction] = useState<string | null>(null);
  // This is only button feedback. Legal choices and submission locking continue
  // to come from the authoritative scene and the existing game-client request.
  const actionContext = `${s.key}:${s.round}:${s.phase}:${s.pending?.from}:${s.pending?.tile}:${s.pending?.kind}:${s.pending?.answered}:${s.actions.map(a => `${a.id}-${a.tile ?? ""}`).join(",")}`;
  useEffect(() => { if (!s.disabled) setSubmittedAction(null); }, [s.disabled, actionContext]);
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
        "--claim-scale": layout.scale,
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
  }, [s.safeArea]);
  const me = s.players.find((p) => p.seat === s.me),
    turn = s.players.find((p) => p.seat === s.turn);
  const source = s.pending && s.players.find((p) => p.seat === s.pending!.from);
  const prompt = claimPrompt(s);
  const claimContext = s.pending
    ? `${source?.name ?? "牌友"}${s.pending.kind === "robKong" ? "补杠" : "打出"}${sceneTileName(s.pending.tile)}`
    : "";
  const ended = ["ended", "finished"].includes(s.phase);
  const actions = [...s.actions.filter(a => a.id !== "pass"), ...s.actions.filter(a => a.id === "pass")];
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
        <div className="table-menu-actions">
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
      {prompt && (
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
      {!!s.actions.length && (
        <div
          className="table-claim-actions"
          style={actionsStyle}
          role="group"
          aria-label="碰杠胡操作"
          aria-busy={s.disabled}
        >
          {actions.map((a, i) => {
            const actionKey = `${a.id}-${a.tile ?? i}`;
            const chosen = s.disabled && submittedAction === `${actionContext}:${actionKey}`;
            return (
            <button
              key={actionKey}
              className={`${a.id === "pass" ? "claim-pass" : a.id === "hu" ? "claim-main claim-hu" : "claim-main"}${chosen ? " is-chosen" : ""}`}
              data-action={a.id}
              disabled={s.disabled || !s.connected}
              aria-label={
                a.tile === undefined
                  ? a.label
                  : `${a.label} ${sceneTileName(a.tile)}`
              }
              onClick={() => {
                setSubmittedAction(`${actionContext}:${actionKey}`);
                onCommand({ type: "action", action: a.id, tile: a.tile });
              }}
            >
              <strong>{a.label}</strong>
              <small>{chosen ? "提交中…" : a.tile !== undefined ? sceneTileName(a.tile) : actionHint(a.id, s.pending?.kind === "robKong")}</small>
            </button>
          );})}
        </div>
      )}
      <div className="table-portrait-notice">
        横屏打牌更清楚，请将手机横过来
      </div>
    </div>
  );
}
