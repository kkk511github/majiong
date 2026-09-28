import {useEffect,useLayoutEffect,useRef,useState,type CSSProperties,type PointerEvent} from 'react';
import type {TableSceneState,TableSceneCommand} from '../shared/table-scene';
import {sceneTileName,tileKind} from '../shared/table-scene';
import {ACTION_TIMING,actionKind} from '../shared/action-presentation';
import {frameStyle,TILE_FRAMES} from './tile-art';
import {gameAudio} from './audio';
import './action-buttons.css';
import {ActionButtonAura} from './ActionButtonAura';
type Choice=TableSceneState['actions'][number];
const keyOf=(a:Choice)=>`${a.id}:${a.tile??''}`;
export const actionContext=(s:TableSceneState)=>`${s.key}:${s.round}:${s.me}:${s.phase}:${s.pending?.from}:${s.pending?.tile}:${s.pending?.kind}:${s.pending?.answered}:${s.actions.map(keyOf).join(',')}`;
export function legalAction(s:TableSceneState,key:string){return s.connected&&!s.disabled&&!s.players.find(p=>p.seat===s.me)?.trustee?s.actions.find(a=>keyOf(a)===key&&actionKind(a.id)):undefined;}
type Held={pointer:number;key:string;context:string;choices:Choice[];style:CSSProperties;box:DOMRect};
/** Input affordance only. Confirmation artwork and sounds have separate owners. */
export function ActionButtons({state:s,style,onCommand,onGestureBarrier}:{state:TableSceneState;style:CSSProperties;onCommand:(c:TableSceneCommand)=>void;onGestureBarrier?:(blocked:boolean)=>void}){
 const root=useRef<HTMLDivElement>(null),latest=useRef({s,onCommand,onGestureBarrier});latest.current={s,onCommand,onGestureBarrier};
 const held=useRef<Held|null>(null),[press,setPress]=useState<Held|null>(null),[submitted,setSubmitted]=useState<string|null>(null),pending=useRef<string|null>(null);
 const releaseTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined),feedbackTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
 const context=actionContext(s);
 const barrier=(value:boolean)=>latest.current.onGestureBarrier?.(value);
 const finish=()=>{const p=held.current;held.current=null;setPress(null);if(p&&root.current?.hasPointerCapture(p.pointer))root.current.releasePointerCapture(p.pointer);clearTimeout(releaseTimer.current);releaseTimer.current=setTimeout(()=>barrier(false),ACTION_TIMING.touchGuard);};
 const cancel=()=>{if(held.current)finish();};
 useEffect(()=>{window.addEventListener('blur',cancel);window.addEventListener('resize',cancel);document.addEventListener('visibilitychange',cancel);return()=>{window.removeEventListener('blur',cancel);window.removeEventListener('resize',cancel);document.removeEventListener('visibilitychange',cancel);clearTimeout(releaseTimer.current);clearTimeout(feedbackTimer.current);barrier(false);};},[]);
 useLayoutEffect(()=>{if(!s.disabled){pending.current=null;setSubmitted(null);}if(!s.connected)cancel();},[context,s.disabled,s.connected]);
 const submit=(key:string,expected:string)=>{
  const current=latest.current.s,a=legalAction(current,key);if(!a||pending.current||expected!==actionContext(current))return;
  pending.current=key;setSubmitted(key);barrier(true);gameAudio.play('click');
  latest.current.onCommand({type:'action',action:a.id,tile:a.tile});
  clearTimeout(feedbackTimer.current);feedbackTimer.current=setTimeout(()=>{if(!latest.current.s.disabled){pending.current=null;setSubmitted(null);}},ACTION_TIMING.pass);
 };
 const down=(e:PointerEvent<HTMLButtonElement>,a:Choice)=>{
  if(e.button!==0||held.current||pending.current||!legalAction(latest.current.s,keyOf(a)))return;
  e.preventDefault();e.stopPropagation();clearTimeout(releaseTimer.current);barrier(true);
  const p={pointer:e.pointerId,key:keyOf(a),context:actionContext(latest.current.s),choices:ordered,style,box:e.currentTarget.getBoundingClientRect()};held.current=p;setPress(p);root.current?.setPointerCapture(e.pointerId);
 };
 const up=(e:PointerEvent<HTMLDivElement>)=>{const p=held.current;if(!p||p.pointer!==e.pointerId)return;e.preventDefault();e.stopPropagation();if(e.clientX>=p.box.left&&e.clientX<=p.box.right&&e.clientY>=p.box.top&&e.clientY<=p.box.bottom)submit(p.key,p.context);finish();};
 const ordered=[...s.actions.filter(a=>a.id!=='pass'&&actionKind(a.id)),...s.actions.filter(a=>a.id==='pass')];
 const choices=press?.choices??ordered;
 // Keep empty slots during a captured touch, not obsolete actionable buttons.
 return <div ref={root} className={`table-claim-actions jade-action-row${s.simplifiedEffects?' crystal-simplified':''}`} style={{...(press?.style??style),'--action-press-ms':`${ACTION_TIMING.press}ms`,'--action-release-ms':`${ACTION_TIMING.release}ms`} as CSSProperties} role={choices.length?'group':undefined} aria-label={choices.length?'碰杠胡操作':undefined} aria-busy={s.disabled} onPointerUp={up} onPointerCancel={cancel} onLostPointerCapture={cancel}>
  {choices.map(a=>{const key=keyOf(a),kind=actionKind(a.id)!,valid=s.actions.some(n=>keyOf(n)===key),chosen=submitted===key,blocked=s.disabled||!s.connected||!!pending.current;return <span className={`jade-action-slot${kind==='pass'?' jade-pass-slot':''}`} key={key}>
   {valid&&<button type="button" className={`jade-action jade-${kind}${press?.key===key?' is-pressed':''}${chosen?' is-chosen':''}`} data-action={a.id} data-state={chosen?'pending':blocked?'disabled':press?.key===key?'pressed':'default'} aria-label={a.tile===undefined?(kind==='hu'?'胡':a.label):`${a.label} ${sceneTileName(a.tile)}`} aria-busy={chosen||undefined} disabled={blocked} onPointerDown={e=>down(e,a)} onClick={e=>{e.stopPropagation();if(e.detail===0){submit(key,context);finish();}}}>
    <span className="jade-contact-shadow" aria-hidden="true"/>
    <span className="jade-press-layer" aria-hidden="true"><ActionButtonAura kind={kind}/><img className="jade-plate" src={`${import.meta.env.BASE_URL}ui/actions-crystal-v3/plate.png`} alt="" draggable={false}/><span className="crystal-sheen"/><img className="jade-glyph" src={`${import.meta.env.BASE_URL}ui/actions-jade-v2/${kind}.png`} alt="" draggable={false}/><i className="jade-signature"/><i className="jade-pending-mark"/></span>
    {a.tile!==undefined&&<span className="claim-choice-tile" role="img" aria-label={sceneTileName(a.tile)} style={frameStyle(TILE_FRAMES[tileKind(a.tile)])}/>}
    <span className="sr-only">{chosen?'等待确认':a.label}</span>
   </button>}
  </span>;})}
 </div>;
}
