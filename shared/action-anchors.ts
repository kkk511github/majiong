import {layoutPlayerHud,layoutTable,sceneOffset,tileFootprint,type SceneTile,type TableSceneState} from './table-scene';
import {ACTION_SIZE,type ActionKind} from './action-presentation';
export type ActionRect={x:number;y:number;w:number;h:number};
export function actionObstacles(s:TableSceneState,tiles:readonly SceneTile[]):ActionRect[]{
 const cards=tiles.map(t=>{const p=tileFootprint(t,3),xs=p.map(p=>p[0]),ys=p.map(p=>p[1]);return{x:(Math.min(...xs)+Math.max(...xs))/2,y:(Math.min(...ys)+Math.max(...ys))/2,w:Math.max(...xs)-Math.min(...xs),h:Math.max(...ys)-Math.min(...ys)};});
 return [...cards,...[0,1,2,3].map(o=>{const p=layoutPlayerHud(o,s.safeArea,s.tableStyle);return{x:p.x,y:p.plateY,w:p.w,h:p.h};}),{x:640,y:260,w:300,h:106}];
}
export const clearOf=(a:ActionRect,b:ActionRect,gap=4)=>Math.abs(a.x-b.x)>=(a.w+b.w)/2+gap||Math.abs(a.y-b.y)>=(a.h+b.h)/2+gap;
/** Requested hand-centred transient stamp. Insets only prevent edge clipping;
 * positions come from the final hand layout, never mutate any tile positions. */
export function handActionAnchor(s:TableSceneState,seat:number,tiles:readonly SceneTile[],kind:ActionKind='pung'):ActionRect{
 const hands=tiles.filter(t=>t.seat===seat&&t.area==='hand'),points=hands.flatMap(t=>tileFootprint(t));
 const avatar=layoutPlayerHud(sceneOffset(seat,s.me),s.safeArea,s.tableStyle),size=ACTION_SIZE[kind];
 const x=points.length?(Math.min(...points.map(p=>p[0]))+Math.max(...points.map(p=>p[0])))/2:avatar.x;
 const y=points.length?(Math.min(...points.map(p=>p[1]))+Math.max(...points.map(p=>p[1])))/2:avatar.y;
 return{...size,x:Math.max((s.safeArea?.left??0)+size.w/2+8,Math.min(1272-(s.safeArea?.right??0)-size.w/2,x)),y:Math.max((s.safeArea?.top??0)+size.h/2+8,Math.min(582-(s.safeArea?.bottom??0)-size.h/2,y))};
}
/** Pung/kong occupy the owner's fixed three-row discard zone, even when no
 * tile has yet been discarded. Probe layout only; never publish fake cards. */
export function confirmedActionAnchor(s:TableSceneState,seat:number,tiles:readonly SceneTile[],kind:ActionKind):ActionRect{
 if(kind==='hu')return handActionAnchor(s,seat,tiles,kind);
 const probe={...s,players:s.players.map(p=>p.seat===seat?{...p,discards:Array.from({length:30},(_,i)=>(seat*32+i)%124)}:p)};
 const points=layoutTable(probe).filter(t=>t.seat===seat&&t.area==='river').flatMap(t=>tileFootprint(t));
 if(!points.length)return handActionAnchor(s,seat,tiles,kind);
 const size=ACTION_SIZE[kind],x=(Math.min(...points.map(p=>p[0]))+Math.max(...points.map(p=>p[0])))/2,y=(Math.min(...points.map(p=>p[1]))+Math.max(...points.map(p=>p[1])))/2;
 return{...size,x:Math.max((s.safeArea?.left??0)+size.w/2+8,Math.min(1272-(s.safeArea?.right??0)-size.w/2,x)),y:Math.max((s.safeArea?.top??0)+size.h/2+8,Math.min(582-(s.safeArea?.bottom??0)-size.h/2,y))};
}
/** Keep the small player/tag caption off the compass and non-river cards. */
export function actionCaptionAnchor(s:TableSceneState,seat:number,tiles:readonly SceneTile[],anchor:ActionRect):ActionRect{
 const scale=anchor.w/204,w=140*scale,h=40*scale,obstacles=[...actionObstacles(s,tiles.filter(t=>t.area!=='river')),{x:anchor.x,y:anchor.y-10*scale,w:165*scale,h:165*scale}];
 const candidates=[{x:0,y:100},{x:160,y:0},{x:-160,y:0},{x:0,y:-120}].map(p=>({x:anchor.x+p.x*scale,y:anchor.y+p.y*scale,w,h}));
 const fits=(a:ActionRect)=>a.x-w/2>=(s.safeArea?.left??0)+8&&a.x+w/2<=1272-(s.safeArea?.right??0)&&a.y-h/2>=(s.safeArea?.top??0)+8&&a.y+h/2<=582-(s.safeArea?.bottom??0)&&obstacles.every(o=>clearOf(a,o));
 const found=candidates.find(fits);if(found)return found;
 let best:ActionRect|undefined,score=Infinity;
 for(let y=(s.safeArea?.top??0)+h/2+8;y<=582-(s.safeArea?.bottom??0)-h/2;y+=8)for(let x=(s.safeArea?.left??0)+w/2+8;x<=1272-(s.safeArea?.right??0)-w/2;x+=8){const a={x,y,w,h},d=(x-anchor.x)**2+(y-anchor.y)**2;if(d<score&&fits(a)){best=a;score=d;}}
 if(best)return best;
 const fallback=actionAnchor(s,seat,obstacles,[],false);return{x:fallback.x,y:fallback.y,w:Math.min(w,fallback.w),h:Math.min(h,fallback.h)};
}
export function actionEffectBounds(s:TableSceneState,seat:number,tiles:readonly SceneTile[],kind:ActionKind,a=confirmedActionAnchor(s,seat,tiles,kind),b=actionCaptionAnchor(s,seat,tiles,a)):ActionRect{
 const l=Math.min(a.x-a.w/2,b.x-b.w/2),r=Math.max(a.x+a.w/2,b.x+b.w/2),t=Math.min(a.y-a.h/2,b.y-b.h/2),bottom=Math.max(a.y+a.h/2,b.y+b.h/2);
 return{x:(l+r)/2,y:(t+bottom)/2,w:r-l,h:bottom-t};
}
/** One radial rule anchored to the mapped portrait, not four unrelated offsets. */
export function actionAnchor(s:TableSceneState,seat:number,obstacles:readonly ActionRect[],reserved:readonly ActionRect[]=[],large=false):ActionRect&{compact:boolean}{
 const p=layoutPlayerHud(sceneOffset(seat,s.me),s.safeArea,s.tableStyle),angle=Math.atan2(295-p.y,640-p.x);
 const safe={l:(s.safeArea?.left??0)+8,r:1272-(s.safeArea?.right??0),t:(s.safeArea?.top??0)+8,b:582-(s.safeArea?.bottom??0)};
 for(const [w,h]of [[large?132:116,112],[92,78],[72,64]]){
  const choices:({x:number;y:number;score:number})[]=[];
  for(let d=90;d<=285;d+=15)for(let a=-.9;a<=.9;a+=.15){const x=p.x+Math.cos(angle+a)*d,y=p.y+Math.sin(angle+a)*d;choices.push({x,y,score:Math.abs(d-125)+Math.abs(a)*95});}
  choices.sort((a,b)=>a.score-b.score);
  const found=choices.find(c=>c.x-w/2>=safe.l&&c.x+w/2<=safe.r&&c.y-h/2>=safe.t&&c.y+h/2<=safe.b&&[...obstacles,...reserved].every(o=>clearOf({...c,w,h},o)));
  if(found)return{x:found.x,y:found.y,w,h,compact:w<100};
 }
 // Dense exposed hands can occupy the inward corridor. Search the remaining
 // felt by distance from the same portrait, before using its compact badge.
 for(const [w,h]of [[72,64],[56,48]]){
  let best:ActionRect|undefined,score=Infinity;
  for(let y=safe.t+h/2;y<=safe.b-h/2;y+=8)for(let x=safe.l+w/2;x<=safe.r-w/2;x+=8){
   const r={x,y,w,h},distance=Math.hypot(x-p.x,y-p.y);if(distance>430||distance>=score||![...obstacles,...reserved].every(o=>clearOf(r,o)))continue;
   score=distance;best=r;
  }if(best)return{...best,compact:true};
 }
 // Extreme occupancy: identify the player at the portrait, never use centre.
 return{x:Math.max(safe.l+32,Math.min(safe.r-32,p.x)),y:Math.max(safe.t+24,p.y-48),w:64,h:48,compact:true};
}
