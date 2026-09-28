import {layoutTable,type TableSceneState} from '../shared/table-scene';
import {actionKind} from '../shared/action-presentation';
import {tableOverlayLayout} from './table-overlay-layout';

/** Primary stays on its reference anchor; pass sits a compact edge-gap away.
 * Other main-action spacing and card avoidance remain independent. */
export function tableActionRail(s:TableSceneState,f:ReturnType<typeof tableOverlayLayout>,hostHeight:number){
 const primary=s.actions.filter(a=>a.id!=='pass'&&actionKind(a.id)).length;
 const pass=s.actions.some(a=>a.id==='pass'),k=f.scale;
 const cards=layoutTable(s).map(t=>({x:f.left+(t.x-t.w/2)*k,y:f.top+(t.y-t.h/2)*k,w:t.w*k,h:t.h*k}));
 const safeEnd=f.contentRight,guard=Math.max(3,4*k);
 const make=(factor:number,shift:number,spacing=144)=>{
  const main=Math.max(44,Math.min(88,88*k)*factor),secondary=Math.max(44,Math.min(68,68*k)*factor);
  const pitch=Math.max(main+12,spacing*k);
  const gap=Math.max(12,pitch-main),passGap=Math.max(12,22*k);
  // Flex gap already contributes `gap`; offset only the pass slot so that
  // main-to-main spacing and the main button's anchor do not move.
  const extra=primary?passGap-gap:0;
  // Four primary choices (hu + three self-kongs) can use the otherwise empty
  // pass bay. One/two/three primary actions keep the usual reference anchor.
  const endCentre=f.left+Math.min(primary>=4&&!pass?990:914,1280-(s.safeArea?.right??0)-190)*k+shift;
  const first=primary?endCentre-(primary-1)*pitch:endCentre+pitch;
  const left=first-(primary?main:secondary)/2;
  const height=primary?main:secondary,centreY=f.handTop-Math.max(4,6*k)-height/2;
  const boxes=Array.from({length:primary},(_,i)=>({x:left+i*pitch,y:centreY-main/2,w:main,h:main}));
  if(pass)boxes.push({x:primary?endCentre+main/2+passGap:first-secondary/2,y:centreY-secondary/2,w:secondary,h:secondary});
  const fits=boxes.every(a=>a.x>=f.safeLeft&&a.x+a.w<=safeEnd&&cards.every(b=>a.x+a.w+guard<=b.x||b.x+b.w+guard<=a.x||a.y+a.h+guard<=b.y||b.y+b.h+guard<=a.y));
  return {left:left-3,bottom:hostHeight-centreY-height/2-3,main,pass:secondary,gap,passMargin:extra,boxes,fits};
 };
 let best:ReturnType<typeof make>|undefined,cost=Infinity;
 for(const spacing of [144,128,112,96,80])for(const factor of [1,.9,.8,.7])for(let n=0;n<=24;n++){
  const at=make(factor,-n*8*k,spacing),penalty=n*8*k+(1-factor)*160*k+(144-spacing)*k;
  if(at.fits&&penalty<cost){best=at;cost=penalty;}
 }
 return best??make(.8,0);
}
