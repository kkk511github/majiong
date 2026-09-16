import { TILE_POSE_METRICS } from "./tile-pose-metrics";
const tileAspect = (pose: string) => TILE_POSE_METRICS[pose].w / TILE_POSE_METRICS[pose].h;
/** The table renderer is a view, never a rules engine or a source of hidden cards. */
export interface ScenePlayer {
  avatar?: string;
  name: string; score: number; seat: number; bot: boolean; trustee: boolean;
  hand: number[]; handCount: number; flowers: number[]; discards: number[];
  melds: {type:'pung'|'kong'; tiles:number[]; from:number; concealed:boolean}[];
}
export interface TableSceneState {
  key:string; revision:number; presentation?:'replay'; me:number; turn:number; dealer:number;
  phase:string; code:string; round:number; rounds?:number; remaining:number;
  rulesName?:string; roundMultiplier?:number; nextRoundMultiplier?:number;
  countdown:string; connected:boolean; disabled:boolean; practice:boolean; canDiscard:boolean;
  players: ScenePlayer[];
  selected:number|null; drawn?:number; inspectedKind:number|null;
  hintKinds:number[]; hintLabel:string;
  hintDiscard?:number; hintUnseen?:Record<number,number>; zhaozhiAvailable?:boolean; zhaozhi?:boolean;
  actions:{id:string; label:string; tile?:number}[];
  lastDiscard?:{tile:number;seat:number};
  pending?:{tile:number;from:number;answered:boolean;kind:string};
  effects:{key:string;type:string;seat:number;concealed?:boolean;upgraded?:boolean;selfDraw?:boolean}[];
  trusteeDisabled:boolean;
}
export type TableSceneCommand =
  | {type:'select';tile:number}
  | {type:'action';action:string;tile?:number}
  | {type:'trustee';enabled:boolean}
  | {type:'menu';menu:'leave'|'settings'|'events'|'table'|'result';seat?:number};

export interface SceneTile {
  id:string; tile?:number; seat:number; pose:string;
  x:number; y:number; w:number; h:number; z:number;
  area:'hand'|'meld'|'flower'|'river'; selected?:boolean; highlight?:boolean;
  clickable?:boolean; source?:number; stack?:boolean; last?:boolean; claimTarget?:boolean;
  /** Baked screen-space projection; the rack uses the exact same edge vectors. */
  shear?:number; rack?:number;
  /** Whole-row rigid rotation, in Cocos counter-clockwise degrees. */
  rotation?:number;
}
export const tileKind = (tile:number) => tile<136?Math.floor(tile/4):tile-102;
export const sceneTileName = (tile:number) => {
 const k=tileKind(tile);
 return k<27?'一二三四五六七八九'[k%9]+['万','筒','条'][Math.floor(k/9)]:['东','南','西','北','中','发','白','春','夏','秋','冬','梅','兰','竹','菊'][k-27];
};
export const sceneOffset=(seat:number,me:number)=>(seat-me+4)%4;
const poses=['bottom','right','top','left'];

/** Only an unanswered, actionable claim may spotlight a public opponent tile.
 * Rob-kong targets are public but are not part of the discard river. */
export function claimPrompt(s:TableSceneState){
 const pending=s.pending;
 if(s.presentation==='replay'||s.phase!=='claiming'||!pending||pending.answered||pending.from===s.me)return undefined;
 const actions=s.actions.filter(a=>['pung','kong','hu'].includes(a.id));
 if(!actions.length)return undefined;
 const source=s.players.find(p=>p.seat===pending.from);
 return {tile:pending.tile,from:pending.from,name:sceneTileName(pending.tile),
  source:source?.name||['自己','下家','对家','上家'][sceneOffset(pending.from,s.me)],
  kind:pending.kind,labels:actions.map(a=>a.label)};
}

export interface MeldSourceMarker { id:string; tileId:string; source:number; x:number; y:number; size:number; rotation:number }
/** The source arrow belongs on the middle tile face, including the upper kong
 * tile. Keep it attached when the river, flowers or other hands change. */
export function layoutMeldSources(tiles:SceneTile[],me:number):MeldSourceMarker[]{
 return tiles.filter(t=>t.area==='meld'&&t.source!==undefined&&t.source!==t.seat).map(t=>{
  const upper=tiles.find(v=>v.id===t.id.replace(/-1$/,'-3')&&v.stack);
  const face=upper||t;
  return {id:'source-'+t.id,tileId:face.id,source:t.source!,x:face.x,y:face.y-face.h*.09,
   size:Math.max(22,Math.min(28,Math.min(face.w,face.h)*.6)),rotation:[180,-90,0,90][sceneOffset(t.source!,me)]};
 });
}

export interface FlowerRack { seat:number; lane:number; points:[number,number][] }
// All side-seat lanes share vertical axes with the flowers and rivers.
const PLAYER_LANES = [
 [[338,448],[948,448],[948,492],[338,492]],
 [[914,71],[958,71],[958,478],[914,478]],
 [[395,66],[889,66],[889,108],[395,108]],
 [[322,71],[366,71],[366,478],[322,478]],
] as [number,number][][];
// Fixed table fixtures, not boxes inferred from the current flower count.
export const FLOWER_SLOTS = [
 [[338,448],[820,448],[820,492],[338,492]],
 [[914,71],[958,71],[958,426],[914,426]],
 PLAYER_LANES[2],
 [[322,71],[366,71],[366,426],[322,426]],
] as [number,number][][];
// Twelve full-size flowers fit in each side trough. Additional flowers use
// four-tile reserve wells above the rivers, keeping each solid body visible.
function flowerRackPoints(offset:number,lane=0):[number,number][]{
 if(!lane)return FLOWER_SLOTS[offset];
 const x=offset===3?388+(lane-1)*34:866-(lane-1)*34;
 return [[x,116],[x+26,116],[x+26,191],[x,191]];
}
export function slotMetrics(offset:number,y:number,lane=0){
 const [tl,tr,br,bl]=PLAYER_LANES[offset],progress=(y-tl[1])/(bl[1]-tl[1]);
 const left=tl[0]+(bl[0]-tl[0])*progress,right=tr[0]+(br[0]-tr[0])*progress;
 const shear=((bl[0]+br[0])-(tl[0]+tr[0]))/2/(bl[1]-tl[1]);
 return {x:(left+right)/2+(offset===3?60:-60)*lane,width:right-left-4,shear};
}
/** The groove widens toward the viewer: use the adjacent visible edge, not
 * its centreline, when aligning a separate row beside the groove. */
export function slotEdgeMetrics(offset:number,y:number,edge:'inner'|'outer'){
 const [tl,tr,br,bl]=PLAYER_LANES[offset];
 const leftEdge=(offset===3)===(edge==='outer');
 const a=leftEdge?tl:tr,b=leftEdge?bl:br;
 const shear=(b[0]-a[0])/(b[1]-a[1]);
 return {x:a[0]+shear*(y-a[1]),shear};
}
/** Horizontal rows touch the same inset on both end walls of their trough. */
function horizontalSlotBounds(o:number,y:number,h:number){
 const [tl,tr,br,bl]=FLOWER_SLOTS[o];
 const edges=(cy:number)=>{const t=(cy-tl[1])/(bl[1]-tl[1]);return [tl[0]+(bl[0]-tl[0])*t,tr[0]+(br[0]-tr[0])*t];};
 const top=edges(y-h/2),bottom=edges(y+h/2);
 return {left:Math.max(top[0],bottom[0]),right:Math.min(top[1],bottom[1])};
}
export function tileFootprint(t:SceneTile,pad=0):[number,number][] {
 const shear=t.shear||0,halfHeight=t.h/2+pad;
 const halfWidth=(t.w-Math.abs(shear)*t.h)/2+pad;
 const points:[number,number][]=[[t.x-shear*halfHeight-halfWidth,t.y-halfHeight],
         [t.x-shear*halfHeight+halfWidth,t.y-halfHeight],
         [t.x+shear*halfHeight+halfWidth,t.y+halfHeight],
         [t.x+shear*halfHeight-halfWidth,t.y+halfHeight]];
 if(!t.rotation)return points;
 const a=t.rotation*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
 return points.map(([x,y])=>[t.x+(x-t.x)*c+(y-t.y)*s,t.y-(x-t.x)*s+(y-t.y)*c]);
}
export function tileBounds(t:SceneTile){
 const points=tileFootprint(t);
 return {w:Math.max(...points.map(p=>p[0]))-Math.min(...points.map(p=>p[0])),h:Math.max(...points.map(p=>p[1]))-Math.min(...points.map(p=>p[1]))};
}
export function layoutFlowerRacks(tiles:SceneTile[],me=0):FlowerRack[]{
 const racks:FlowerRack[]=[];
 for(let o=0;o<4;o++){
  const seat=(me+o)%4;racks.push({seat,lane:0,points:flowerRackPoints(o)});
  for(const lane of [1,2])if(tiles.some(t=>t.area==='flower'&&t.seat===seat&&t.rack===lane))
   racks.push({seat,lane,points:flowerRackPoints(o,lane)});
 }
 return racks;
}

/** Claim controls have a reserved strip above the right end of the hand.
 * Keep their right edge and height fixed; never search for another position. */
export function layoutActions(s:TableSceneState,_tiles:SceneTile[]){
 const count=s.actions.length,size=60,gap=count>4?2:10;
 return s.actions.map((action,i)=>({action,x:1140-size/2-(count-1-i)*(size+gap),y:459,w:size,h:size}));
}

/** Design coordinates are fixed at 1280×590. Only one uniform camera scale changes
 * with the viewport; tile count never changes a tile's size. */
export function layoutTable(s:TableSceneState):SceneTile[] {
 const result:SceneTile[]=[];
 const add=(t:SceneTile)=>result.push(t);
 for(const p of s.players) {
  const o=sceneOffset(p.seat,s.me), pose=poses[o];
  if(o===0) {
   let x=110;
   // Keep the selection glow while leaving the fixed claim strip unobstructed.
   const selectedLift=s.actions.length?2:15;
   p.melds.forEach((m,mi)=>{
    const ts=m.tiles.length?m.tiles:Array(m.type==='kong'?4:3).fill(undefined);
    // Exposed sets lie on the felt: use the baked ivory wall/green-base camera,
    // not the front-facing standing hand sprite. Their feet share the hand line.
    ts.forEach((tile,ti)=>add({id:`meld-${p.seat}-${mi}-${ti}`,tile:m.concealed?undefined:tile,seat:p.seat,pose:m.concealed?'cover-bottom':'bottom',area:'meld',x:x+(ti===3?1:ti)*46,y:556-(ti===3?22:0),w:46,h:46*163/116,z:900+(ti===3?40:ti),source:ti===1&&!m.concealed?m.from:undefined,stack:ti===3}));
    x+=146;
   });
   p.hand.filter(t=>t!==s.drawn).forEach((tile,i)=>add({id:`hand-${tile}`,tile,seat:p.seat,pose:'own',area:'hand',x:x+i*65,y:540-(s.selected===tile?selectedLift:0),w:65,h:98,z:1000+i,selected:s.selected===tile,clickable:s.canDiscard&&!p.trustee&&!s.disabled}));
   // A constant rack capacity, not the current hand length, reserves the draw slot.
   if(s.drawn!==undefined)add({id:`draw-${s.drawn}`,tile:s.drawn,seat:p.seat,pose:'own',area:'hand',x:x+Math.max(0,13-3*p.melds.length)*65+15,y:540-(s.selected===s.drawn?selectedLift:0),w:65,h:98,z:1050,selected:s.selected===s.drawn,clickable:s.canDiscard&&!p.trustee&&!s.disabled});
  } else {
   const revealed=p.hand.length>0;
   for(let i=0;i<p.handCount;i++){
    const back=o===2?'back-top':o===1?'back-right':'back-left';
    const capacity=13-3*p.melds.length;
    const extra=!revealed&&o%2&&i>=capacity;
    const slot=i;
    const y=o===2?38:extra?(o===1?393:442):105+slot*(revealed?29:24);
    // The row and flower groove have the same vertical axis; every tile stands upright.
    // Its baked camera supplies depth; never shear the vertical tile body.
    const sideX=revealed?slotMetrics(o,y).x+(o===3?-104:104):slotEdgeMetrics(o,y,'outer').x+(o===3?-82:82);
    const x=o===2?437+i*33:sideX;
    add({id:`hand-${p.seat}-${i}`,tile:revealed?p.hand[i]:undefined,seat:p.seat,pose:revealed?pose:back,area:'hand',x,y,w:o===2?33:revealed?tileAspect(pose)*36:tileAspect(back)*70,h:o===2?46:revealed?36:70,shear:o%2&&revealed?slotMetrics(o,y).shear:0,z:y});
   }
   p.melds.forEach((m,mi)=>{
    const ts=m.tiles.length?m.tiles:Array(m.type==='kong'?4:3).fill(undefined);
    ts.forEach((tile,ti)=>{
     const stack=ti===3;
     // Opposite melds replace the removed concealed tiles in the same rack.
     const baseY=o===3?110+mi*96+(ti===3?1:ti)*29:408-mi*87-(ti===3?1:ti)*29;
     const x=o===2?437+p.handCount*33+mi*102+(ti===3?1:ti)*33:slotMetrics(o,baseY).x+(o===3?-52:52);
     const y=o===2?38-(stack?14:0):baseY-(stack?12:0);
     const sidePose=m.concealed?'cover-'+pose:pose;
     add({id:`meld-${p.seat}-${mi}-${ti}`,tile:m.concealed?undefined:tile,seat:p.seat,pose:o===2?(m.concealed?'cover-'+pose:pose):sidePose,area:'meld',x,y,w:o===2?33:tileAspect(sidePose)*36,h:o===2?46:36,shear:o%2?slotMetrics(o,baseY).shear:0,z:300+y+(stack?80:0),source:ti===1&&!m.concealed?m.from:undefined,stack});
    });
   });
  }
  p.flowers.forEach((tile,i)=>{
   if(o%2){
    // Both side racks have equal, constant width. The baked solid contains
    // a raised front wall; its tabletop footprint joins the next tile.
    const lane=i<12?0:1+Math.floor((i-12)/4),index=lane?(i-12)%4:i;
    const count=Math.min(lane?4:12,p.flowers.length-(lane?12+(lane-1)*4:0));
    const [tl,tr,br]=flowerRackPoints(o,lane);
    const w=tr[0]-tl[0]-5,h=w/tileAspect('flower-'+pose);
    // Overlap only the antialiased contact edges: no felt sliver between flowers,
    // while the wide ivory wall and green base remain visible on every tile.
    const pitch=Math.min(h-1.75,(br[1]-tl[1]-4-h)/Math.max(1,count-1));
    const x=(tl[0]+tr[0])/2;
    const y=o===3||lane?tl[1]+2+h/2+index*pitch:br[1]-2-h/2-index*pitch;
    add({id:`flower-${tile}`,tile,seat:p.seat,pose:'flower-'+pose,area:'flower',x,y,w,h,shear:0,rack:lane,z:200+y});
    return;
   }
   const y=o===0?471:88,topStep=p.flowers.length>16?24:30;
   const h=o===0?42:40,edges=horizontalSlotBounds(o,y,h);
   const w=o===0?Math.min(34,(edges.right-edges.left)/Math.max(1,p.flowers.length)):topStep;
   const x=o===0?edges.left+w/2+i*w:edges.right-topStep/2-(p.flowers.length-1-i)*topStep;
   add({id:`flower-${tile}`,tile,seat:p.seat,pose:'flower-'+pose,area:'flower',x,y,w,h,shear:0,rack:0,z:200+y});
  });
 }
 // Reserve the whole row from the first discard. Never derive its origin,
 // pitch or capacity from the number already discarded: old tiles must stay
 // put when the next tile arrives, including at a row/column boundary.
 // Both horizontal rivers read left-to-right on screen. Side rivers read
 // top-to-bottom; they keep the same upright, joined strips as the troughs.
 const prompt=claimPrompt(s);
 for(const p of s.players){
  const o=sceneOffset(p.seat,s.me);
  p.discards.forEach((tile,i)=>{
   const capacity=9;
   const row=Math.floor(i/capacity),col=i%capacity,h=o%2?33:44,w=o%2?tileAspect(poses[o])*h:34;
   // Three downward rows fit above the local flower trough. Side columns
   // sit just outside their ends so even a third row leaves corners clear.
   const y=o===0?352+row*38:o===2?132+row*38:182+col*28;
   const shear=0;
   const x=o%2?(o===3?473-row*43:807+row*43):512+col*32;
   const rotation=0;
   const last=s.lastDiscard?.seat===p.seat&&s.lastDiscard.tile===tile&&['playing','claiming'].includes(s.phase)&&s.pending?.kind!=='robKong';
   const claimTarget=prompt?.kind!=='robKong'&&prompt?.from===p.seat&&prompt.tile===tile;
   add({id:`river-${tile}`,tile,seat:p.seat,pose:poses[o],area:'river',x,y,w,h,shear,rotation,z:500+y,highlight:s.inspectedKind===tileKind(tile),last,claimTarget});
  });
 }
 return result.sort((a,b)=>a.z-b.z);
}
