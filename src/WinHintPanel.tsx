import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { TableSceneState, TableSceneCommand } from "../shared/table-scene";
import { TileFace } from "./Tile";
import { tileName } from "../shared/tiles";
import "./win-hint-panel.css";
import { layoutTable } from "../shared/table-scene";
import { tableOverlayLayout } from "./table-overlay-layout";
const NO_READY_DISCARDS: number[] = [];

export function WinHintPanel({
  state: s,
  onCommand,
  readyDiscards = NO_READY_DISCARDS,
}: {
  state: TableSceneState;
  readyDiscards?: number[];
  onCommand: (c: TableSceneCommand) => void;
}) {
  const hostRef=useRef<HTMLDivElement>(null);
  const [position,setPosition]=useState<CSSProperties>({visibility:"hidden"});
  useEffect(()=>{
    const host=hostRef.current?.parentElement;if(!host)return;
    const iframe=host.querySelector("iframe");
    const resize=()=>{
      const parent=host.getBoundingClientRect(),rect=iframe?.getBoundingClientRect()??parent;
      const f=tableOverlayLayout(parent,rect,s.safeArea,s.tableStyle),k=f.scale;
      const hu=s.actions.some(a=>a.id==="hu") && (s.pending || s.hintDiscard === undefined),count=hu?1:s.hintKinds.length;
      const meta=hu?26:12;
      const local=f.players[0];
      const hintLeft=Math.max(f.safeLeft,f.left+(local.x+local.w/2)*k+8);
      const right=Math.min(parent.width-f.safeRight,f.contentRight);
      const available=Math.max(0,Math.min(right-hintLeft,1020*k));
      const width=Math.min(available,Math.max(hu?200:0,meta+count*Math.max(40,52*k)));
      const left=Math.max(hintLeft,Math.min(f.left+624*k,right-width));
      const own=s.players?.length ? layoutTable(s).filter(t=>t.seat===s.me&&t.area==="hand") : [];
      const under=own.filter(t=>f.left+(t.x+t.w/2)*k>left&&f.left+(t.x-t.w/2)*k<left+width);
      const handTop=under.length?Math.min(...under.map(t=>t.y-t.h/2)):491;
      const h=hu?Math.max(38,44*k):Math.max(32,40*k);
      const arrowGap=under.some(t=>t.tile!==undefined&&readyDiscards.includes(t.tile))?Math.max(14,22*k):0;
      let top=f.top+handTop*k-h-arrowGap-4;
      const controls=host.querySelector(".table-claim-actions")?.getBoundingClientRect();
      if(controls&&left+width>controls.left-parent.left-8&&left<controls.right-parent.left+8)
        top=Math.min(top,controls.top-parent.top-h-8);
      const item=Math.max(5,(width-(hu?meta+12:12))/Math.max(1,count));
      const dense=item<32;
      // Account for both borders, vertical padding and the small contact
      // shadow. The tile must fit inside the content box, not the outer box.
      const innerHeight=h-10;
      setPosition({left,top:Math.max(54,top),width,height:h,"--hint-direction":dense?"column":"row","--hint-gap":dense?"0px":"2px","--hint-tile-height":`${dense?Math.min(innerHeight-8,item*1.1):Math.min(innerHeight-4,(item-12)/.69)}px`,"--hint-font":`${dense?Math.min(9,item*.55):Math.min(13,item*.24)}px`} as CSSProperties);
    };
    const observer=new ResizeObserver(resize);observer.observe(host);if(iframe)observer.observe(iframe);
    const controls=host.querySelector(".table-claim-actions");if(controls)observer.observe(controls);
    resize();return ()=>observer.disconnect();
  },[s.hintKinds.length,s.actions,s.selected,s.drawn,s.players,s.hintDiscard,s.safeArea,s.tableStyle,readyDiscards]);
  const active =
    s.presentation !== "replay" && ["playing", "claiming"].includes(s.phase);
  const hu = s.actions.some((a) => a.id === "hu") && (!!s.pending || s.hintDiscard === undefined);
  const totalUnseen = s.hintKinds.every(k=>s.hintUnseen?.[k] !== undefined) ? s.hintKinds.reduce((n,k)=>n+s.hintUnseen![k],0) : "—";
  const winningTile = s.pending?.tile ?? s.drawn;
  const show = active && (hu || s.hintKinds.length > 0);
  const canPreview = s.hintDiscard !== undefined;
  const title = hu
    ? s.pending
      ? "现在可以胡牌"
      : "现在可以自摸"
    : canPreview
      ? "打出后可听"
      : "已经听牌";
  return (
    <div ref={hostRef} className="mahjong-hint-layer">
      {show && (
        <section
          className={`win-hint-panel${hu ? " can-win" : ""}`}
          style={position}
          aria-label="胡牌提示"
          title="余牌按自己手牌和公开牌计算，包含其他玩家暗手；不是牌库中的确定张数"
        >
          <div className={hu ? "win-hint-heading" : "sr-only"}>
            <span className="listening-seal" aria-hidden="true">
              {hu ? (
                <img
                  src={`${import.meta.env.BASE_URL}ui/action-disc-hu-v1.png`}
                  alt=""
                />
              ) : null}
              {hu&&<b className="hint-hu-character">胡</b>}
            </span>
            <div className="sr-only">
              <strong>{title}</strong>
              <small>
                {hu
                  ? "点击右侧胡牌按钮确认"
                  : canPreview
                    ? "再次点选手牌出牌"
                    : "等待你的胡牌机会"}
              </small>
            </div>
            {!hu && <div className="hint-preview-summary" aria-label="听牌汇总">
              <strong>{canPreview ? `打${tileName(s.hintDiscard!)}` : "已听牌"}</strong>
              <small><b>{s.hintKinds.length}</b>种 · 余<b>{totalUnseen}</b>张</small>
            </div>}
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
                      ×<b>{s.hintUnseen?.[k] ?? "—"}</b>
                    </small>
                  </div>
                ))}
              </div>
              <footer className="sr-only">
                {s.hintKinds.length} 种听口 · 合计未见{totalUnseen}张 · 未见数含他人暗手

              </footer>
            </>
          ) : !hu ? (
            <p className="hint-empty">这张牌打出后暂无听口，试试其他手牌</p>
          ) : (
            <div className="hint-win-detail">
              {winningTile !== undefined && (
                <span
                  className="winning-tile-art"
                  aria-label={`胡牌${tileName(winningTile)}`}
                >
                  <TileFace tile={winningTile} />
                </span>
              )}
              <div>
                <strong>
                  {s.pending ? "点右侧「胡」确认" : "点右侧「自摸」确认"}
                </strong>
                <small>
                  {s.pending
                    ? "选择「过」将放弃本次胡牌"
                    : "继续出牌将放弃这次自摸"}
                </small>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
