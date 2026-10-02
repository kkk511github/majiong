import type {SceneTile,TableSceneState} from './table-scene';

/** Visual detection only: require an authoritative discard from a known hand,
 * not a sort, reconnect, pung or kong. Identity is the physical copy. */
export function drawnTileInsertion(state:TableSceneState,previous:readonly SceneTile[],seat=state.me):number|undefined {
  const me=state.players.find(p=>p.seat===seat);
  const oldDraw=previous.find(t=>t.area==='hand'&&t.seat===seat&&(t.id.startsWith('draw-')||t.drawSlot&&t.recordedDraw));
  const drawn=seat===state.me?state.drawn:me?.drawn;
  if(!me||oldDraw?.tile===undefined||drawn===oldDraw.tile||!me.hand.includes(oldDraw.tile))return undefined;
  const otherDiscard=previous.some(t=>t.area==='hand'&&t.seat===seat&&t.tile!==undefined&&t.tile!==oldDraw.tile&&!me.hand.includes(t.tile)&&me.discards.includes(t.tile));
  return otherDiscard?oldDraw.tile:undefined;
}
type Point={x:number;y:number;w:number;h:number};
export function handInsertionPoint(from:Point,to:Point,progress:number,lift=24):Point {
  const p=Math.max(0,Math.min(1,progress));
  const ease=(t:number)=>t*t*(3-2*t);
  let x=from.x,y=from.y;
  if(p<.22)y-=lift*ease(p/.22);
  else if(p<.78){const k=ease((p-.22)/.56);x=from.x+(to.x-from.x)*k;y=from.y+(to.y-from.y)*k-lift;}
  else {x=to.x;y=to.y-lift*(1-ease((p-.78)/.22));}
  return {x,y,w:from.w+(to.w-from.w)*p,h:from.h+(to.h-from.h)*p};
}
