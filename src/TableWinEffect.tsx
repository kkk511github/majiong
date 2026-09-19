import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import type { Result } from "../shared/types";
import { layoutTable, sceneOffset, type TableSceneState } from "../shared/table-scene";
import { tableOverlayLayout } from "./table-overlay-layout";
import { isRobbedKongWinner, winDisplayLabel } from "./win-label";
import { winTheme } from "./win-theme";
import { SpecialWinArt } from "./SpecialWinArt";
import "./table-win-effect.css";

/** Show each result beside the player it belongs to, relative to the viewer's seat. */
export function TableWinEffect({ state, result }: { state: TableSceneState; result: Result }) {
  const sourceLabel=result.winners.some(seat=>isRobbedKongWinner(result,seat))?"补杠被抢":"点炮";
  const ref=useRef<HTMLDivElement>(null);
  const [positions,setPositions]=useState<Record<number,CSSProperties>>({});
  const [discarderPosition,setDiscarderPosition]=useState<CSSProperties>({visibility:"hidden"});
  useLayoutEffect(()=>{
    const host=ref.current?.parentElement,frame=host?.querySelector("iframe");
    if(!host||!frame)return;
    const resize=()=>{
      const bounds=host.getBoundingClientRect(),f=tableOverlayLayout(bounds,frame.getBoundingClientRect(),state.safeArea);
      const safeWidth=Math.max(0,bounds.width-f.safeLeft-f.safeRight);
      const clampLeft=(left:number,width:number)=>Math.max(f.safeLeft,Math.min(left,bounds.width-f.safeRight-width));
      const next:Record<number,CSSProperties>={};
      for(const seat of result.winners){
        const offset=sceneOffset(seat,state.me),avatar=f.players[offset];
        const side=offset===1||offset===3;
        const width=Math.min(safeWidth,Math.max(side?70:180,(side?150:310)*f.scale));
        const letters=side?Math.min(4,winDisplayLabel(result,seat).length):winDisplayLabel(result,seat).length;
        const style={width,"--win-letter-size":`${Math.min(Math.max(24,44*f.scale),(width-8)*(side?1:.68)/letters)}px`,"--win-name-size":`${Math.max(12,20*f.scale)}px`} as CSSProperties;
        if(offset===0){
          const hand=layoutTable(state).filter(t=>t.seat===seat&&t.area==="hand");
          const handTop=hand.length?Math.min(...hand.map(t=>t.y-t.h/2)):491;
          next[seat]={...style,left:clampLeft(Math.min(f.left+624*f.scale,f.contentRight-width),width),bottom:bounds.height-(f.top+handTop*f.scale)+4};
        }else{
          // Side labels sit below their own avatar, outside the tile wall.
          // Opposite labels sit below that player's rack, above the centre.
          const x=side?avatar.x:640+avatar.dx;
          const y=side?avatar.y+108:112+avatar.dy;
          next[seat]={...style,left:clampLeft(f.left+x*f.scale-width/2,width),top:f.top+y*f.scale};
        }
      }
      setPositions(next);
      if(result.from!==undefined){
        // Adjacent to the actual Cocos avatar: self, right, opposite, left.
        const offset=sceneOffset(result.from,state.me),avatar=f.players[offset];
        let [x,y]=[[1106,515],[1106,207],[950,111],[161,207]][offset];
        x+=avatar.dx;y+=avatar.dy;
        // Once a side avatar moves inward, keep the marker below its panel,
        // instead of pushing it onto that player's tile wall.
        if((offset===1||offset===3)&&avatar.dx!==0){x=avatar.x;y=avatar.y+116;}
        const fontSize=Math.max(12,Math.max(18,32*f.scale)*Math.min(1,2.4/(sourceLabel.length+.4))),badgeWidth=fontSize*(sourceLabel.length+.4);
        setDiscarderPosition({left:Math.max(8,Math.min(bounds.width-badgeWidth-8,f.left+x*f.scale-badgeWidth/2)),top:f.top+y*f.scale-fontSize*.6,width:badgeWidth,fontSize});
      }
    };
    const observer=new ResizeObserver(resize);observer.observe(host);observer.observe(frame);resize();
    return ()=>observer.disconnect();
  },[state,result]);
  const name=(seat:number)=>state.players.find(p=>p.seat===seat)?.name??`牌友${seat+1}`;
  const specials=[...new Set(result.winners.map(seat=>winDisplayLabel(result,seat)))].filter(label=>winTheme(label));
  return <div ref={ref} className="table-win-effect" role="status" aria-label="胡牌结果">
    {specials.length>0&&<div className="special-win-stage" data-count={specials.length} aria-hidden="true">
      {specials.map(label=><SpecialWinArt key={label} label={label} names={result.winners.filter(seat=>winDisplayLabel(result,seat)===label).map(name).join(" · ")} />)}
    </div>}
    {result.from!==undefined&&<strong className="seat-discarder" data-seat={result.from} data-relative-seat={sceneOffset(result.from,state.me)} style={discarderPosition} aria-label={`${name(result.from)}${sourceLabel}`}>{sourceLabel}</strong>}
    {result.winners.map(seat=><div key={seat} className={`win-callout${sceneOffset(seat,state.me)%2?" win-callout-side":""}${winDisplayLabel(result,seat).length>2?" win-callout-pattern":""}`} data-seat={seat} data-relative-seat={sceneOffset(seat,state.me)} style={positions[seat]??{visibility:"hidden"}}>
      <strong className="win-call-art" role="img" aria-label={winDisplayLabel(result,seat)}>{winDisplayLabel(result,seat)}</strong>
      <div className="win-call-details">
        <div className="win-call-winners"><span className="winner" data-seat={seat} title={name(seat)}>{name(seat)}</span></div>
      </div>
    </div>)}
    <span className="sr-only">{result.from===undefined?"":`${name(result.from)}${sourceLabel} → `}{result.winners.map(seat=>`${name(seat)}${winDisplayLabel(result,seat)}`).join("、")}</span>
  </div>;
}
