import {useLayoutEffect,useRef,useState,type CSSProperties} from 'react';
import type {Result,Seat} from '../shared/types';
import {layoutTable,sceneOffset,type TableSceneState} from '../shared/table-scene';
import {actionAnchor,actionObstacles,type ActionRect} from '../shared/action-anchors';
import {tableOverlayLayout} from './table-overlay-layout';
import {winDisplayLabel} from './win-label';
import './table-win-effect.css';
/** Quiet labels for paused/restored replay. Live confirmed wins are animated
 * by TableActionEffects, never by a second centre-screen renderer. */
export function TableWinEffect({state,result}:{state:TableSceneState;result:Result}){
 const ref=useRef<HTMLDivElement>(null),[styles,setStyles]=useState<Record<number,CSSProperties>>({});
 useLayoutEffect(()=>{const host=ref.current?.parentElement,frame=host?.querySelector('iframe');if(!host||!frame)return;
  const resize=()=>{const f=tableOverlayLayout(host.getBoundingClientRect(),frame.getBoundingClientRect(),state.safeArea,state.tableStyle),obstacles=actionObstacles(state,layoutTable(state)),reserved:ActionRect[]=[],next:Record<number,CSSProperties>={};
   for(const seat of result.winners){const a=actionAnchor(state,seat,obstacles,reserved,true);reserved.push(a);next[seat]={left:f.left+a.x*f.scale,top:f.top+a.y*f.scale,width:a.w*f.scale,fontSize:Math.max(10,14*f.scale)};}setStyles(next);
  };const observer=new ResizeObserver(resize);observer.observe(host);observer.observe(frame);resize();return()=>observer.disconnect();
 },[state,result]);
 return <div ref={ref} className="table-win-effect jade-result-labels" role="status" aria-label="胡牌结果">{result.winners.map(seat=><div className="jade-result-label" data-seat={seat} data-relative-seat={sceneOffset(seat,state.me)} key={seat} style={styles[seat]??{visibility:'hidden'}}><img src={`${import.meta.env.BASE_URL}ui/actions-jade-v2/hu.png`} alt="胡"/><span>{state.players.find(p=>p.seat===seat)?.name}</span><small>{winDisplayLabel(result,seat as Seat)}</small></div>)}</div>;
}
