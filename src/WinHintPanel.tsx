import { useEffect, useRef, useState } from "react";
import type { TableSceneState, TableSceneCommand } from "../shared/table-scene";
import { TileFace } from "./Tile";
import { tileName } from "../shared/tiles";
import "./win-hint-panel.css";

export function WinHintPanel({
  state: s,
  onCommand,
}: {
  state: TableSceneState;
  onCommand: (c: TableSceneCommand) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ left: 0, bottom: 0, width: 0 });
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    const host = ref.current?.parentElement;
    if (!host) return;
    const resize = () => {
      const w = host.clientWidth,
        h = host.clientHeight,
        k = Math.min(w / 1280, h / 590);
      setBox({
        left: (w - 1280 * k) / 2 + 128 * k,
        bottom: (h - 590 * k) / 2 + 107 * k,
        width: Math.min(
          s.actions.some((a) => a.id === "hu")
            ? 290
            : Math.max(252, 126 + s.hintKinds.length * 43),
          780 * k,
          w * 0.7,
        ),
      });
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();
    return () => observer.disconnect();
  }, [s.hintKinds.length, s.actions.some((a) => a.id === "hu")]);
  useEffect(() => setConfirm(false), [s.key, s.turn, s.phase, s.zhaozhi]);
  const active =
    s.presentation !== "replay" && ["playing", "claiming"].includes(s.phase);
  const hu = s.actions.some((a) => a.id === "hu");
  const winningTile = s.pending?.tile ?? s.drawn;
  const show = active && (hu || s.hintKinds.length > 0 || s.selected !== null);
  const canPreview = s.hintDiscard !== undefined;
  const title = hu
    ? s.pending
      ? "现在可以胡牌"
      : "现在可以自摸"
    : !s.hintKinds.length
      ? "暂未听牌"
      : canPreview
        ? "打出后可听"
        : "已经听牌";
  return (
    <div ref={ref} className="mahjong-hint-layer">
      {active && (s.zhaozhiAvailable || s.zhaozhi) && (
        <div className="zhaozhi-control">
          {s.zhaozhi ? (
            <span>已照直</span>
          ) : (
            <button disabled={s.disabled} onClick={() => setConfirm(!confirm)}>
              报照直
            </button>
          )}
          {confirm && (
            <div
              className="zhaozhi-confirm"
              role="dialog"
              aria-label="确认照直"
            >
              <strong>本局声明照直</strong>
              <p>
                不参与外包，不可胡对对胡；三嘴后不能杠。声明后本局不可撤销。
              </p>
              <button onClick={() => setConfirm(false)}>取消</button>
              <button
                disabled={s.disabled}
                onClick={() => {
                  onCommand({ type: "action", action: "zhaozhi" });
                  setConfirm(false);
                }}
              >
                确认照直
              </button>
            </div>
          )}
        </div>
      )}
      {show && !confirm && (
        <section
          className={`win-hint-panel${hu ? " can-win" : ""}`}
          style={box}
          aria-label="胡牌提示"
        >
          <div className="win-hint-heading">
            <span className="listening-seal">
              {hu ? (
                <img
                  src={`${import.meta.env.BASE_URL}art/hu-badge-v1.webp`}
                  alt=""
                />
              ) : (
                "听"
              )}
            </span>
            <div>
              <strong>{title}</strong>
              <small>
                {hu
                  ? "点击右侧胡牌按钮确认"
                  : canPreview
                    ? "再次点选手牌出牌"
                    : "等待你的胡牌机会"}
              </small>
            </div>
            {!hu && canPreview && (
              <span
                className="hint-discard"
                aria-label={`拟打出${tileName(s.hintDiscard!)}`}
              >
                <TileFace tile={s.hintDiscard!} />
              </span>
            )}
          </div>
          {!hu && s.hintKinds.length > 0 ? (
            <>
              <div
                className="winning-tile-list"
                role="list"
                aria-label="可胡牌"
              >
                {s.hintKinds.map((k) => (
                  <div
                    className={`winning-tile-item${s.hintUnseen?.[k] === 0 ? " exhausted" : ""}`}
                    role="listitem"
                    key={k}
                    aria-label={`${tileName(k * 4)}，未见${s.hintUnseen?.[k] ?? "—"}张`}
                  >
                    <span className="winning-tile-art">
                      <TileFace tile={k * 4} />
                    </span>
                    <small>
                      未见 <b>{s.hintUnseen?.[k] ?? "—"}</b>
                    </small>
                  </div>
                ))}
              </div>
              <footer>
                {s.hintKinds.length} 种听口 · 未见数含他人暗手
                <span>{s.hintKinds.length > 3 ? "横滑查看更多" : ""}</span>
              </footer>
            </>
          ) : !hu ? (
            <p className="hint-empty">这张牌打出后暂无听口，试试其他手牌</p>
          ) : (
            <div className="hint-win-detail">
              {winningTile !== undefined && <span className="winning-tile-art" aria-label={`胡牌${tileName(winningTile)}`}><TileFace tile={winningTile}/></span>}
              <div><strong>{s.pending ? "点右侧「胡」确认" : "点右侧「自摸」确认"}</strong>
                <small>{s.pending ? "选择「过」将放弃本次胡牌" : "继续出牌将放弃这次自摸"}</small></div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
