import { useEffect, useRef, useState } from "react";
import { layoutTable, sceneTileName, type TableSceneState } from "../shared/table-scene";
import { tableOverlayLayout } from "./table-overlay-layout";

export function ReadyDiscardArrows({state, tiles}: {state:TableSceneState;tiles:number[]}) {
  const ref=useRef<HTMLDivElement>(null);
  const [frame,setFrame]=useState({left:0,top:0,scale:0});
  useEffect(()=>{
    const host=ref.current?.parentElement, iframe=host?.querySelector('iframe');
    if(!host||!iframe)return;
    const resize=()=>setFrame(tableOverlayLayout(host.getBoundingClientRect(),iframe.getBoundingClientRect()));
    const observer=new ResizeObserver(resize);observer.observe(host);observer.observe(iframe);resize();
    return ()=>observer.disconnect();
  },[]);
  const active=state.presentation!=='replay'&&state.connected&&!state.disabled&&state.phase==='playing'&&state.canDiscard&&!state.players.find(p=>p.seat===state.me)?.trustee;
  return <div ref={ref} className="ready-discard-arrows" aria-label="打出可听牌的手牌">
    {active&&layoutTable(state).filter(t=>t.area==='hand'&&t.seat===state.me&&t.tile!==undefined&&tiles.includes(t.tile)).map(t=><span key={t.id} className="ready-discard-arrow" data-tile={t.tile} aria-label={`打出${sceneTileName(t.tile!)}可听牌`} style={{left:frame.left+t.x*frame.scale,top:frame.top+(t.y-t.h/2)*frame.scale-3}}>▼</span>)}
  </div>;
}
