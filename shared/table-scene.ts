import { TILE_POSE_METRICS } from "./tile-pose-metrics";
import { layout3DTable } from './table-3d-layout';
const tileAspect = (pose: string) => TILE_POSE_METRICS[pose].w / TILE_POSE_METRICS[pose].h;
/** The table renderer is a view, never a rules engine or a source of hidden cards. */
export interface ScenePlayer {
  avatar?: string;
  online?: boolean;
  name: string; score: number; seat: number; bot: boolean; trustee: boolean;
  hand: number[]; handCount: number; flowers: number[]; discards: number[];
  melds: {type:'pung'|'kong'; tiles:number[]; from:number; concealed:boolean; added?:boolean}[];
}
/** Presence comes from the public snapshot; never infer another player's claims. */
export function scenePlayerStatus(s: TableSceneState, p: ScenePlayer) {
  const active = s.connected && s.phase === 'playing' && s.turn === p.seat;
  if (!s.connected) return {active:false,label:'',tone:'muted' as const};
  if (s.presentation === 'replay') return {active,label:active?'出牌中':'',tone:'normal' as const};
  if (!p.bot && p.online === false) return {active,label:p.trustee?'离线·托管':'已离线',tone:'offline' as const};
  if (!p.bot && p.trustee) return {active,label:'托管中',tone:'trustee' as const};
  if (active) return {active,label:'出牌中',tone:'normal' as const};
  if (s.phase === 'claiming' && p.seat === s.me && s.actions.length)
    return {active:false,label:s.disabled?'提交中':'待响应',tone:'normal' as const};
  return {active:false,label:'',tone:'normal' as const};
}
export interface TableSceneState {
  /** Client-only visual skin, never used by the rules or server. */
  tableStyle?:'reference-3d';
  globalAnchorDiscards?:{seat:number;tile:number}[];
  externalControls?:boolean;
  /** Local viewport cutouts, in 1280×590 design coordinates. */
  safeArea?:TableSafeArea;
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
export interface TableSafeArea { left:number; right:number; top:number; bottom:number }

/** Move player information inside the cutout without scaling the table or tiles. */
export function layoutPlayerHud(offset:number, safe?:TableSafeArea,style?:TableSceneState['tableStyle']) {
 // The local plate sits above the hand, clear of its selection lift. The
 // opposite player uses a compact vertical identity rail: the portrait,
 // name, score and flower count all live in one reserved strip at the upper
 // right, instead of a wide horizontal plate over the exposed tiles.
 const horizontal=offset===0;
 const topIdentity=offset===2;
 // Portraits follow the four anchors in the reference board: opposite at the
 // upper rail, local at lower-left, and the two side players on their lanes.
 // Leave room for the far player's complete hand + four open-kong rack.
 const modern=style==='reference-3d';
 const x=modern?(topIdentity?911:offset===0?155:offset===3?99:1180):(topIdentity?954:offset===0?124:offset===3?108:1189);
 const y=modern?(topIdentity?78:offset===0?414:142):(topIdentity?54:offset===0?382:offset===3?142:200);
 const edge=(value:number|undefined)=>value&&value>0?value+8:0;
 const left=edge(safe?.left),right=1280-edge(safe?.right);
 // The previous player's standing tiles start beyond x=224. Shrink the text
 // column on cutout phones while keeping the avatar itself at full size.
 const w=topIdentity?76:offset===0?Math.min(166,Math.max(80,224-left)):100;
 // The local stack is painted as separate avatar/name/score/flower pieces,
 // but keep its reserved hit-test rail compact enough for the external claim
 // card on narrow screens.  The visible flower badge may extend a few pixels
 // below this transparent bounds node; it still stays above the hand rack.
 const h=topIdentity?108:horizontal?96:126,plateOffset=topIdentity||horizontal?0:25;
 const top=edge(safe?.top),bottom=590-edge(safe?.bottom);
 const px=Math.max(left+w/2,Math.min(right-w/2,x));
 // Preserve the existing bottom alignment on screens with no lower inset.
 const py=safe?.top||safe?.bottom?Math.max(top+h/2,Math.min(bottom-h/2,y+plateOffset))-plateOffset:y;
 return {x:px,y:py,dx:px-x,dy:py-y,w,h,plateY:py+plateOffset};
}
export type TableSceneCommand =
  | {type:'select';tile:number}
  | {type:'discard';tile:number}
  | {type:'action';action:string;tile?:number}
  | {type:'trustee';enabled:boolean}
  | {type:'menu';menu:'leave'|'settings'|'events'|'table'|'result';seat?:number};

export interface SceneTile {
  globalAnchor?:boolean;
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

/**
 * Return the physical tile position that identifies who supplied an exposed
 * pung or added kong. The index is expressed in the owner's rack order (left to
 * right for the bottom player, then transformed by the pose for the other
 * three seats): the downstream/right supplier is the third tile, the
 * upstream/left supplier is the first tile.  A claim from the opposite seat
 * keeps all three faces upright; only adjacent suppliers turn a tile.
 */
export function meldSourceTileIndex(owner:number,from:number,concealed=false):0|2|undefined {
 if(concealed||from===owner)return undefined;
 const relative=(from-owner+4)%4;
 return relative===1?2:relative===3?0:undefined;
}

/** Local presentation memory only; a claimed discard can disappear from the
 * current river snapshot while still being the latest actual discard. */
export interface CompassMemory {
 key:string; round:number; revision:number; presentation?:'replay'; connected:boolean;
 lastDiscardSeat?:number;
}
export function nextCompassMemory(
 s:Pick<TableSceneState,'key'|'round'|'revision'|'presentation'|'connected'|'lastDiscard'>,
 previous?:CompassMemory,
):CompassMemory {
 const same=previous&&previous.key===s.key&&previous.round===s.round&&previous.presentation===s.presentation&&
  s.revision>=previous.revision&&!(s.presentation==='replay'&&s.revision>previous.revision+1)&&
  !(s.connected&&!previous.connected);
 const seat=s.lastDiscard?.seat;
 const known=seat!==undefined&&Number.isInteger(seat)&&seat>=0&&seat<4;
 return {key:s.key,round:s.round,revision:s.revision,presentation:s.presentation,connected:s.connected,
  lastDiscardSeat:known?seat:same?previous.lastDiscardSeat:undefined};
}
const poses=['bottom','right','top','left'];
// Added and concealed kongs keep the fourth tile centred on the middle body.
// A direct/open kong remains four complete base tiles. Only this small,
// screen-space displacement shows an actual upper layer.
const MELD_STACK_OFFSET=10;
// Far-seat melds share the existing shallow face-up camera. A raised solid
// projects upward, never toward the viewer; four pixels show its lower tier
// while both solids stay between the top edge and fixed flower trough.
const TOP_MELD_STACK_LIFT=4;
// Alpha-tight sprites still have a rounded antialiased corner.  A sub-pixel
// tuck closes that optical seam without covering another tile's face.
const TOP_MELD_EDGE_TUCK=.75;
// Side images include a ~6.5px projected ivory/green front wall. Adjacent
// tabletop faces meet before that wall ends: the nearer solid occludes the
// rear wall. Packing full sprite rectangles exposes a green stripe per tile.
const SIDE_MELD_CONTACT_DEPTH=6.5;
// The baked side camera has zero yaw: world height projects straight up on
// screen, not inward along X. Both kong types use the same physical lift.
const SIDE_MELD_STACK_LIFT=8;
const TOP_DRAW_GAP=12;
const TOP_MELD_FIXTURE_SHIFT=40;
// Move the complete opposite rack as one unit. The separate draw gap and
// every meld's internal/group spacing remain unchanged at all hand lengths.
const TOP_RACK_RIGHT_SHIFT=81;
// Keep one future maximum-width open kong plus its replacement draw inside
// the local rail. This only translates the local rack; tile size is unchanged.
const BOTTOM_RACK_RIGHT=1248;
const BOTTOM_FUTURE_MELD_DELTA=4*65+14-3*65;
const BOTTOM_RACK_EXTRA_LEFT=28;
/** The reference table keeps ten discards on each rail.  Tile 11 starts a
 * second line at the same rail origin, so its leading card touches the first
 * card instead of being appended after a gap. */
export const RIVER_ROW_CAPACITY=10;
// These are fixed rail origins in the 1280×590 design.  They are deliberately
// outside the side-player fixtures: the first line sits beside the centre,
// while later lines grow inward without covering flowers or standing hands.
const RIVER_ROW_GAP=37;
const RIVER_CARD_PITCH=32;
const RIVER_SIDE_PITCH=28;
const RIVER_ORIGINS:{x:number;y:number}[]=[
 // Pull every rail away from the compass.  The bottom/top origins move along
 // their outward normals; side origins get a small outward inset that also
 // leaves a shadow-width gutter beside the flower troughs.
 {x:492,y:404}, // self: left-to-right, then upward
 {x:916,y:384}, // downstream/right: bottom-to-top, then left
 {x:788,y:110}, // opposite/top: right-to-left, then downward
 {x:360,y:108}, // upstream/left: top-to-bottom, then right
];

/** A concealed kong keeps three backs and shows its upper tile face. */
export function meldDisplayTiles(m: {concealed:boolean; type:string; tiles:number[]; added?:boolean}): (number|undefined)[] {
 return m.concealed ? [undefined,undefined,undefined,m.tiles[0]]
  : m.tiles.length ? m.tiles : Array(m.type==='kong'?4:3).fill(undefined);
}

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
/** When a pung or added kong preserves source direction, its arrow belongs on
 * the middle face (the upper face after an upgrade). Direct kongs omit it. */
export function layoutMeldSources(tiles:SceneTile[],me:number):MeldSourceMarker[]{
 return tiles.filter(t=>t.area==='meld'&&t.source!==undefined&&t.source!==t.seat).map(t=>{
  const upper=tiles.find(v=>v.id===t.id.replace(/-1$/,'-3')&&v.stack);
  const face=upper||t;
  return {id:'source-'+t.id,tileId:face.id,source:t.source!,x:face.x,y:face.y-face.h*.09,
   // Dense four-meld side rails scale their whole physical group. Keep the
   // direction marker inside that smaller face instead of enforcing a desktop
   // minimum that would spill into the next group.
   size:Math.max(15,Math.min(28,Math.min(face.w,face.h)*.6)),rotation:[180,-90,0,90][sceneOffset(t.source!,me)]};
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
 [[468,433],[820,433],[820,477],[468,477]],
 // Flowers sit between the discard rail and the standing hand.  Keep the
 // troughs outside the three-column river footprint so the bevels can touch
 // without covering a discard.
 [[949,71],[993,71],[993,426],[949,426]],
 // Leave the top flowers on the upper-right end wall.  They flow right to
 // left and stop before the compact opposite-player identity rail.
 [[332,44],[826,44],[826,88],[332,88]],
 [[287,106],[331,106],[331,478],[287,478]],
] as [number,number][][];
// Twelve full-size flowers fit in each side trough. Additional flowers use
// four-tile reserve wells above the rivers, keeping each solid body visible.
function flowerRackPoints(offset:number,lane=0):[number,number][]{
 if(!lane)return FLOWER_SLOTS[offset];
 const x=offset===3?383+(lane-1)*34:866-(lane-1)*34;
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
 return s.tableStyle==='reference-3d'?layout3DTable(s):layoutLegacyTable(s);
}
export function layoutLegacyTable(s:TableSceneState):SceneTile[] {
 const result:SceneTile[]=[];
 const anchors=new Set((s.globalAnchorDiscards??[]).map(a=>a.tile));
 // A claimed anchor moves from the river to an exposed set. The original
 // physical tile remains yellow there until its owner's wait changes.
 const add=(t:SceneTile)=>result.push({...t,globalAnchor:
  (t.area==='river'||t.area==='meld')&&t.tile!==undefined&&anchors.has(t.tile)});
 for(const p of s.players) {
  const o=sceneOffset(p.seat,s.me), pose=poses[o];
  if(o===0) {
   // Keep the full rack near the centre; melds and the draw slot share its anchor.
   let x=200,meldCursor=181;
   const selectable=s.presentation!=='replay'&&s.connected&&!s.disabled&&!p.trustee&&['playing','claiming'].includes(s.phase);
   // Keep the selection glow while leaving the fixed claim strip unobstructed.
   const selectedLift=s.actions.length?2:15;
   p.melds.forEach((m,mi)=>{
    const ts=meldDisplayTiles(m);
    const sourceIndex=meldSourceTileIndex(p.seat,m.from,m.concealed);
    const handBaseline=540+98/2;
    if(m.concealed){
     // A concealed kong uses the same physical scale as the local hand: three
     // covered bodies on the felt and one readable body centred above card 2.
     const scale=65/TILE_POSE_METRICS.own.w;
     const cover={pose:'cover-bottom',w:TILE_POSE_METRICS['cover-bottom'].w*scale,h:TILE_POSE_METRICS['cover-bottom'].h*scale};
     const face={pose:'bottom',w:TILE_POSE_METRICS.bottom.w*scale,h:TILE_POSE_METRICS.bottom.h*scale};
     const localCenters=[cover.w/2,cover.w*1.5,cover.w*2.5],groupShift=meldCursor;
     ts.forEach((tile,ti)=>{
      const stack=ti===3,base=stack?face:cover;
      add({id:`meld-${p.seat}-${mi}-${ti}`,tile,seat:p.seat,pose:base.pose,area:'meld',x:groupShift+localCenters[stack?1:ti],y:handBaseline-base.h/2-(stack?MELD_STACK_OFFSET:0),w:base.w,h:base.h,z:900+(stack?40:ti),source:undefined,stack,rotation:0});
     });
     meldCursor=groupShift+cover.w*3+14;
    }else{
     // Exposed sets are real tiles lying on the felt. The straight and turned
     // poses are rendered from one camera with one material/light rig, so the
     // green substrate and contact edge stay in the same physical direction.
     // Pack the three physical bodies by their alpha-tight widths.  The turned
     // supplier is wider, but it only touches its neighbour; it may never sit
     // over either readable face.
     // Use the same physical image scale as the local standing hand.  The
     // tabletop projection changes the apparent height, not the tile size.
     const scale=65/TILE_POSE_METRICS.own.w;
     const directKong=m.type==='kong'&&m.added!==true;
     const stacked=m.type==='kong'&&m.added===true;
     // A direct/open kong is four complete straight bodies on the felt. An
     // added kong keeps the original three-body pung and locks tile 4 to the
     // middle target; its original source direction remains visible.
     const baseCount=stacked?3:ts.length;
     const bases=ts.slice(0,baseCount).map((tile,ti)=>{
      const pose=tile===undefined?'cover-bottom':!directKong&&sourceIndex===ti?'meld-bottom-cross':'meld-bottom';
      return {pose,w:TILE_POSE_METRICS[pose].w*scale,h:TILE_POSE_METRICS[pose].h*scale};
     });
     let localCursor=0;
     const localCenters=bases.map(base=>{
      const center=localCursor+base.w/2;
      localCursor+=base.w;
      return center;
     });
     const groupMin=0,groupMax=localCursor,groupShift=meldCursor;
     const centers=localCenters.map(center=>groupShift+center);
     ts.forEach((tile,ti)=>{
      const stack=stacked&&ti===3;
      // The upper tile is the exact same projected solid as its target. Its
      // centre remains locked to logical tile 1 and only moves inward to show
      // the second layer; it must never be independently resized or recropped.
      const base=stack?bases[1]:bases[ti];
      const targetY=handBaseline-bases[1].h/2;
      const y=stack?targetY-MELD_STACK_OFFSET:handBaseline-base.h/2;
      add({id:`meld-${p.seat}-${mi}-${ti}`,tile,seat:p.seat,pose:base.pose,area:'meld',x:stack?centers[1]:centers[ti],y,w:base.w,h:base.h,z:900+(stack?40:ti),source:ti===1&&!directKong?m.from:undefined,stack,rotation:0});
     });
     // The fourteen-pixel felt seam is independent of whether either endpoint
     // uses the wider turned pose. The shortened hand below only advances when
     // this real physical width reaches its former anchor.
     meldCursor=groupShift+groupMax+14;
    }
    x+=154;
   });
   if(p.melds.length){
    // The no-overlap physical groups are wider than the former interleaved
    // sprites.  Preserve a real felt gutter before the first standing hand
    // tile, moving that shortened hand only when its old anchor is too close.
    x=Math.max(x+22,meldCursor+65/2);
   }
   const capacity=Math.max(0,13-3*p.melds.length);
   // Reserve the next exposed group before it exists. A maximum-width direct
   // kong adds four 65px bodies plus the group seam while removing three
   // standing hand slots. Translating the already-laid melds and the hand by
   // the same amount preserves every group relationship and prevents the next
   // replacement draw from crossing the right table edge.
   const futureMeldDelta=p.melds.length<4?BOTTOM_FUTURE_MELD_DELTA:0;
   const reservedDrawRight=x+capacity*65+15+65/2+futureMeldDelta;
   const fittingShift=Math.max(0,reservedDrawRight-BOTTOM_RACK_RIGHT);
   const rackLeft=Math.min(x-65/2,...result.filter(tile=>tile.seat===p.seat&&tile.area==='meld').map(tile=>tile.x-tile.w/2));
   // Move the local rack left as one rigid unit while it has room. Four
   // maximum-width open kongs already fill this rail: never force their first
   // body off-screen just to apply the additional visual inset.
   const extraLeft=Math.min(BOTTOM_RACK_EXTRA_LEFT,Math.max(0,rackLeft-fittingShift-12));
   const bottomRackShift=fittingShift+extraLeft;
   if(bottomRackShift){
    for(const tile of result)if(tile.seat===p.seat&&tile.area==='meld')tile.x-=bottomRackShift;
    x-=bottomRackShift;
   }
   p.hand.filter(t=>t!==s.drawn).forEach((tile,i)=>add({id:`hand-${tile}`,tile,seat:p.seat,pose:'own',area:'hand',x:x+i*65,y:540-(s.selected===tile?selectedLift:0),w:65,h:98,z:1000+i,selected:s.selected===tile,clickable:selectable}));
   // A constant rack capacity, not the current hand length, reserves the draw slot.
   if(s.drawn!==undefined)add({id:`draw-${s.drawn}`,tile:s.drawn,seat:p.seat,pose:'own',area:'hand',x:x+capacity*65+15,y:540-(s.selected===s.drawn?selectedLift:0),w:65,h:98,z:1050,selected:s.selected===s.drawn,clickable:selectable});
  } else {
   const revealed=p.hand.length>0;
   const capacity=Math.max(0,13-3*p.melds.length),regularCount=Math.min(capacity,p.handCount);
   const topNormalScale=33/TILE_POSE_METRICS.top.w;
   const topGroupGap=p.melds.length===4?6:10;
   // Keep every far-seat tile at hand scale. If several wide turned poses make
   // the rail wider, translate the complete hand+meld rack left as a rigid
   // unit instead of shrinking or hiding the last group under the identity HUD.
   const topBodySpan=o===2?p.melds.reduce((sum,m)=>{
    const ts=meldDisplayTiles(m),directKong=m.type==='kong'&&!m.concealed&&m.added!==true;
    const sourceIndex=directKong?undefined:meldSourceTileIndex(p.seat,m.from,m.concealed);
    const stacked=m.type==='kong'&&(m.concealed||m.added===true),baseCount=stacked?3:ts.length;
    const bodies=ts.slice(0,baseCount).reduce<number>((width,tile,ti)=>{
     const tilePose=tile===undefined?'cover-meld-top':sourceIndex===ti?'meld-bottom-cross':'meld-bottom';
     return width+TILE_POSE_METRICS[tilePose]!.w*topNormalScale;
    },0);
    return sum+bodies-Math.max(0,baseCount-1)*TOP_MELD_EDGE_TUCK;
   },0):0;
   const topDefaultCursor=395.5+capacity*33;
   const topFixtureShift=o===2&&p.melds.length?TOP_MELD_FIXTURE_SHIFT:0;
   const topCrowdedShift=o===2
    ?topFixtureShift+Math.max(0,topDefaultCursor+topBodySpan+Math.max(0,p.melds.length-1)*topGroupGap-868)
    :0;
   const drawDistance=39,sideMeldCount=p.melds.length*3;
   // The shortened hand keeps its established spacing. Side melds retain a
   // fixed physical tile size; only their already-overlapped centre advances
   // become tighter on crowded rails.
   const pitch=sideMeldCount&&o%2
    ?o===1?21.5:p.melds.length===1?15.5:22.5
    :revealed?29:24;
   // Reserve the new tile beside the shortened row. The previous player's
   // revealed thirteen-tile hand also needs room below it before a draw arrives.
   // On the left/upstream rail the public groups occupy the upper end and the
   // concealed hand follows them.  Reserve a draw at the lower end even before
   // it arrives, so a draw never shifts either the hand or an exposed group.
   const regularSpan=Math.max(0,regularCount-1)*pitch;
   const extraCount=Math.max(0,p.handCount-capacity);
   const lowerDrawSpan=drawDistance+Math.max(0,extraCount-1)*pitch;
   const lowerHandLimit=(revealed?460:442)-regularSpan-lowerDrawSpan;
   const sideGroupGap=6,sideHandGap=13,sideHandHeight=revealed?36:70;
   type SidePlanCard={tile:number|undefined;ti:number;stack:boolean;screenIndex:number;pose:string;turned:boolean;w:number;h:number;y:number;normalWidth:number};
   const sidePlans:{sourceIndex:0|2|undefined;cards:SidePlanCard[];min:number;max:number}[]=o%2?p.melds.map(m=>{
    const directKong=m.type==='kong'&&!m.concealed&&m.added!==true;
    const sourceIndex=directKong?undefined:meldSourceTileIndex(p.seat,m.from,m.concealed),ts=meldDisplayTiles(m);
    const stacked=m.type==='kong'&&(m.concealed||m.added===true),baseCount=stacked?3:ts.length;
    const normalScale=36/TILE_POSE_METRICS[pose].h;
    const normalWidth=TILE_POSE_METRICS[pose].w*normalScale;
    const cards=ts.map((tile,ti)=>{
     const stack=stacked&&ti===3,screenIndex=stack?1:o===1?baseCount-1-ti:ti;
     const turned=sourceIndex===ti;
     const cardPose=tile===undefined?'cover-'+pose:turned?'meld-cross-'+pose:pose;
     const h=turned?TILE_POSE_METRICS[cardPose].h*normalScale:36;
     const w=turned?TILE_POSE_METRICS[cardPose].w*normalScale:tileAspect(cardPose)*h;
     return {tile,ti,stack,screenIndex,pose:cardPose,turned,w,h,y:0,normalWidth};
    });
    return {sourceIndex,cards,min:0,max:0};
   }):[];
   // Reserve the hidden/revealed hand and its draw slot first. Every meld tile
   // keeps its 36px face; dense layouts show less of the next card, matching
   // the standing side hand, while every group boundary keeps real felt.
   const upstreamHandReserve=Math.max(0,regularCount-1)*pitch+drawDistance+sideHandHeight;
   const downstreamHandBottom=105+Math.max(0,regularCount-1)*pitch+sideHandHeight/2;
   const sideAvailable=o===3
    ?478-61-sideHandGap-upstreamHandReserve
    :(s.actions.length?428:490)-(downstreamHandBottom+sideHandGap);
   const baseCards=sidePlans.flatMap(group=>group.cards.filter(card=>!card.stack));
   const sideJoins=sidePlans.reduce((sum,group)=>sum+Math.max(0,group.cards.filter(card=>!card.stack).length-1),0);
   const rawMeldSpan=baseCards.reduce((sum,card)=>sum+card.h,0);
   const requiredOverlap=sideJoins
    ?(rawMeldSpan+Math.max(0,sidePlans.length-1)*sideGroupGap-sideAvailable)/sideJoins
    :0;
   // When the table is not showing claim controls, exposed sets use the
   // parallel inner rail beside the unchanged standing hand. That full rail
   // has room for normal groups without shrinking or covering readable faces.
   // Claim controls keep the older outer-rail packing so their fixed hit area
   // remains clear.
   const separatedMeldRail=!s.actions.length;
   const minimumSideTuck=SIDE_MELD_CONTACT_DEPTH;
   // A fourth full-size side meld can use the complete vertical felt beside
   // the unchanged hand rail. The lower contact edge stops one pixel above
   // the local standing hand; the upper edge may meet the top felt boundary.
   // This avoids shrinking faces or folding separate groups into each other.
   const separatedMeldTop=0,separatedMeldBottom=490;
   const separatedAvailable=separatedMeldBottom-separatedMeldTop;
   const separatedOverlap=sideJoins
    ?(rawMeldSpan+Math.max(0,sidePlans.length-1)*sideGroupGap-separatedAvailable)/sideJoins
    :0;
   const sideOverlap=Math.min(32,Math.max(
    minimumSideTuck,
    separatedMeldRail?separatedOverlap:requiredOverlap,
   ));
   const legacySideOverlap=Math.min(32,Math.max(2,requiredOverlap));
   let sideCursor=0;
   for(const group of sidePlans){
    let edge=0;
    const ordered=group.cards.filter(card=>!card.stack).sort((a,b)=>a.screenIndex-b.screenIndex);
    ordered.forEach(card=>{card.y=edge+card.h/2;edge+=card.h-sideOverlap;});
    const middle=group.cards.find(card=>card.ti===1)!;
    // Keep the tabletop anchor on the middle tile. Baked camera height rises
    // in screen Y for both side seats; it never moves the upper card sideways.
    group.cards.filter(card=>card.stack).forEach(card=>{card.y=middle.y-SIDE_MELD_STACK_LIFT;});
    const localMin=Math.min(...group.cards.map(card=>card.y-card.h/2));
    const localMax=Math.max(...group.cards.map(card=>card.y+card.h/2));
    const shift=sideCursor-localMin;
    for(const card of group.cards)card.y+=shift;
    group.min=sideCursor;group.max=localMax+shift;sideCursor=group.max+sideGroupGap;
   }
   const sideMeldSpan=sidePlans.length?sideCursor-sideGroupGap:0;
   const legacySideMeldSpan=rawMeldSpan+Math.max(0,sidePlans.length-1)*sideGroupGap-sideJoins*legacySideOverlap;
   const sideMeldOrigin=separatedMeldRail
    ?o===3?separatedMeldTop:separatedMeldBottom-sideMeldSpan
    :o===3?61:downstreamHandBottom+sideHandGap;
   const start=o===3&&sideMeldCount
    ?61+legacySideMeldSpan+sideHandGap+sideHandHeight/2
    :o===3?Math.min(105,lowerHandLimit):105;
   // Keep side melds on the exact same rail as the shortened hand. Hidden
   // standing backs are narrower than exposed faces, but their inner edge and
   // centre line still belong to this one physical player-side rack.
   const handInset=p.melds.length?(revealed?140:122):(revealed?104:82);
   const sideRailX=(y:number)=>revealed
    ?slotMetrics(o,y).x+(o===3?-handInset:handInset)
    :slotEdgeMetrics(o,y,'outer').x+(o===3?-handInset:handInset);
   for(let i=0;i<p.handCount;i++){
    const back=o===2?'back-top':o===1?'back-right':'back-left';
    const extra=i>=capacity;
    const slot=i;
    // Next player's draw stays above their hand; previous player's draw follows
    // its last tile below, rather than an empty slot reserved for thirteen tiles.
    // Keep the far hand's complete 46px body inside the canvas. Its bottom
    // edge remains one pixel above the unchanged flower strip at y=47.
    const y=o===2?23:!extra?start+slot*pitch:o===1
     ?start-drawDistance-(slot-capacity)*pitch
     :start+Math.max(0,regularCount-1)*pitch+drawDistance+(slot-capacity)*pitch;
    // The row and flower groove have the same vertical axis; every tile stands upright.
    // Its baked camera supplies depth; never shear the vertical tile body.
    // The outer inset leaves a shadow-width gutter beside the avatar while
    // the public groups replace the removed concealed cards on this axis.
    const sideX=sideRailX(y);
    // In the opposite player's local right-to-left order, the draw is outside
    // the left end of the unchanged regular rack. Reserve a real felt gap;
    // never reuse a normal hand slot or overlap the first standing tile.
    const topX=extra
     ?400-33-TOP_DRAW_GAP-(slot-capacity)*33
     :400+i*33;
    // A separate draw slot changes only the distance along the hand rail.
    // Its player-side edge stays on the same line as the standing hand.
    const x=o===2?topX-topCrowdedShift+TOP_RACK_RIGHT_SHIFT:sideX;
    add({id:`hand-${p.seat}-${i}`,tile:revealed?p.hand[i]:undefined,seat:p.seat,pose:revealed?pose:back,area:'hand',x,y,w:o===2?33:revealed?tileAspect(pose)*36:tileAspect(back)*70,h:o===2?46:revealed?36:70,shear:o%2&&revealed?slotMetrics(o,y).shear:0,z:y});
   }
   if(o===2){
    // The far player follows the same physical rule as the other three seats:
    // pungs and added kongs may show one turned supplier, while direct kongs
    // keep all four base faces straight. Their width/physical scale is the
    // same as before; the native flat camera reserves real stack headroom.
    // Keep each body within the former 99px group reservation so four groups
    // still clear the compact opposite-player HUD.
    const topPlans=p.melds.map(m=>{
     const ts=meldDisplayTiles(m),directKong=m.type==='kong'&&!m.concealed&&m.added!==true;
     const sourceIndex=directKong?undefined:meldSourceTileIndex(p.seat,m.from,m.concealed);
     const stacked=m.type==='kong'&&(m.concealed||m.added===true),baseCount=stacked?3:ts.length;
     const bases=ts.slice(0,baseCount).map((tile,ti)=>{
      const pose=tile===undefined?'cover-meld-top':sourceIndex===ti?'meld-bottom-cross':'meld-bottom';
      return {pose,w:TILE_POSE_METRICS[pose].w*topNormalScale,h:TILE_POSE_METRICS[pose].h*topNormalScale};
     });
     return {m,ts,bases,stacked,baseCount,directKong};
    });
    let topCursor=395.5+Math.max(0,13-3*p.melds.length)*33-topCrowdedShift+TOP_RACK_RIGHT_SHIFT;
    topPlans.forEach(({m,ts,bases,stacked,baseCount,directKong},mi)=>{
     let localCursor=0;
     const centers=[0,0,0];
     const orderedBases=bases.map((base,ti)=>({base,ti,screenIndex:baseCount-1-ti})).sort((a,b)=>a.screenIndex-b.screenIndex);
     orderedBases.forEach(({base,ti},index)=>{
      centers[ti]=localCursor+base.w/2;
      localCursor+=base.w-(index<orderedBases.length-1?TOP_MELD_EDGE_TUCK:0);
     });
     // Both baked flat poses expose their green substrate/contact edge at the
     // screen-bottom side.  Align that physical edge, not image centres, so the
     // shorter turned tile sits on the same felt plane instead of floating.
     // Keep the established base contact edge; the shallow native camera
     // leaves room to raise a second solid without clipping its upper face.
     const topContact=45;
     ts.forEach((tile,ti)=>{
      const stack=stacked&&ti===3;
      // Added and concealed kongs duplicate the middle tile's projected body.
      // A concealed kong reveals a face above three covered tiles.
      const base=stack
       ?m.concealed
        ?{pose:'meld-bottom',w:TILE_POSE_METRICS['meld-bottom'].w*topNormalScale,h:TILE_POSE_METRICS['meld-bottom'].h*topNormalScale}
        :bases[1]
       :bases[ti];
      const targetY=topContact-bases[1].h/2;
      const x=topCursor+(stack?centers[1]:centers[ti]);
      const y=stack?targetY-TOP_MELD_STACK_LIFT:topContact-base.h/2;
      add({id:`meld-${p.seat}-${mi}-${ti}`,tile,seat:p.seat,pose:base.pose,area:'meld',x,y,w:base.w,h:base.h,shear:0,z:316+(stack?80:ti),source:ti===1&&!m.concealed&&!directKong?m.from:undefined,stack,rotation:0});
     });
     topCursor+=localCursor+topGroupGap;
    });
   }else{
    // Normalize each group's real bounds. Internal projected sidewalls are
    // occluded by their neighbour; only independent groups keep a felt seam.
    sidePlans.forEach((group,mi)=>group.cards.forEach(card=>{
     const m=p.melds[mi],y=sideMeldOrigin+card.y;
    const handRailX=sideRailX(y);
    const railX=handRailX+(separatedMeldRail?(o===3?48:-48):0);
    const edgeDirection=o===1?1:-1;
    const baseX=railX+edgeDirection*(card.normalWidth-card.w)/2;
    const middle=group.cards.find(candidate=>candidate.ti===1)!;
    const middleX=railX+edgeDirection*(middle.normalWidth-middle.w)/2;
    // Align the upper solid to the target's player-side edge. The tiny
    // face/cover crop correction is not a sideways layer displacement; the
    // visible stack height was projected in Y above.
    const x=card.stack
      ?middleX+edgeDirection*(middle.w-card.w)/2
      :baseX;
     const directKong=m.type==='kong'&&!m.concealed&&m.added!==true;
     add({id:`meld-${p.seat}-${mi}-${card.ti}`,tile:card.tile,seat:p.seat,pose:card.pose,area:'meld',x,y,w:card.w,h:card.h,shear:0,z:300+y+(card.stack?80:0),source:card.ti===1&&!m.concealed&&!directKong?m.from:undefined,stack:card.stack,rotation:0});
    }));
   }
  }
  p.flowers.forEach((tile,i)=>{
   if(o%2){
    // Both side racks have equal, constant width. The baked solid contains
    // a raised front wall; its tabletop footprint joins the next tile.
    const lane=i<12?0:1+Math.floor((i-12)/4),index=lane?(i-12)%4:i;
    const count=Math.min(lane?4:12,p.flowers.length-(lane?12+(lane-1)*4:0));
    const [tl,tr,br]=flowerRackPoints(o,lane);
    // The reference packs flowers as one continuous strip.  Keep a narrow
    // inset for the rack wall, then overlap the antialiased edge slightly so
    // the ivory faces and green bases touch instead of showing felt slivers.
     const w=tr[0]-tl[0]-5,h=w/tileAspect('flower-'+pose),edgeOverlap=1.75;
     const pitch=Math.min(h-edgeOverlap,(br[1]-tl[1]-4-h)/Math.max(1,count-1));
     const x=(tl[0]+tr[0])/2;
     // The reference keeps the visible side flowers clear of the river ends:
     // left flowers start just below the upper rail, right flowers finish just
     // above the lower rail.  Reserve the full trough for large overflow
     // counts, while ordinary racks use those reference-facing anchors.
     const edge=o===3||lane
      ?(lane?tl[1]:(count<=8?106:tl[1]))+2+h/2
      :(count<=8?398:br[1])-2-h/2;
     const y=edge+index*pitch*(o===3||lane?1:-1);
    // The left/right flower sprites already contain the ±90° camera turn;
    // keep node rotation zero so it is not applied a second time.
    add({id:`flower-${tile}`,tile,seat:p.seat,pose:'flower-'+pose,area:'flower',x,y,w,h,shear:0,rotation:0,rack:lane,z:200+y});
    return;
   }
   // The upper kong layer projects one pixel toward table centre. Keep the
   // opposite flower strip one contact-shadow pixel beyond that layer.
   const y=o===0?455:67,topStep=p.flowers.length>16?24:30;
   // The upper and lower flower faces have a transparent atlas margin. A
   // slightly deeper physical overlap hides that margin, so the green bases
   // read as one connected row instead of separate floating cards.
   const edgeOverlap=2.5;
   const h=o===0?42:40,edges=horizontalSlotBounds(o,y,h);
   const w=o===0?Math.min(34,(edges.right-edges.left)/Math.max(1,p.flowers.length)):topStep;
   const pitch=Math.max(1,w-edgeOverlap);
   const x=o===0?edges.left+w/2+i*pitch:edges.right-w/2-(p.flowers.length-1-i)*pitch;
   // Top/bottom poses are pre-projected at the reference's zero roll.
   add({id:`flower-${tile}`,tile,seat:p.seat,pose:'flower-'+pose,area:'flower',x,y,w,h,shear:0,rotation:0,rack:0,z:200+y});
  });
 }
 // Reserve the whole row from the first discard. Never derive its origin,
 // pitch or capacity from the number already discarded: old tiles must stay
 // put when the next tile arrives, including at a row/column boundary.
 // Every rail fills toward the player's hand and wraps toward the open centre:
 // self up, downstream/右 left, opposite down, upstream/左 right. This is
 // deliberately the inverse of the old outward-growing implementation.
 // Keep fixed endpoints so adding a tile never recentres an existing column.
 const prompt=claimPrompt(s);
 for(const p of s.players){
  const o=sceneOffset(p.seat,s.me);
   p.discards.forEach((tile,i)=>{
    const row=Math.floor(i/RIVER_ROW_CAPACITY),col=i%RIVER_ROW_CAPACITY,h=o%2?33:44,w=o%2?tileAspect(poses[o])*h:34;
   // Start the opposite river nearest the centre, then fill towards its hand.
   // Its three reserved rows keep the same clear footprint as before.
   // Eleven is the first tile in the second line.  The line origin is shared
   // with the first tile, so the new line's leading card sits flush against
   // the first discard instead of leaving a floating gap at the corner.
   const origin=RIVER_ORIGINS[o];
   const y=o===0?origin.y-row*RIVER_ROW_GAP:o===2?origin.y+row*RIVER_ROW_GAP:o===1?origin.y-col*RIVER_SIDE_PITCH:origin.y+col*RIVER_SIDE_PITCH;
   const shear=0;
   const x=o%2?(o===3?origin.x+row*43:origin.x-row*43):o===2?origin.x-col*RIVER_CARD_PITCH:origin.x+col*RIVER_CARD_PITCH;
   const rotation=0;
   const last=s.lastDiscard?.seat===p.seat&&s.lastDiscard.tile===tile&&['playing','claiming'].includes(s.phase)&&s.pending?.kind!=='robKong';
   const claimTarget=prompt?.kind!=='robKong'&&prompt?.from===p.seat&&prompt.tile===tile;
   add({id:`river-${tile}`,tile,seat:p.seat,pose:poses[o],area:'river',x,y,w,h,shear,rotation,z:500+y,highlight:s.inspectedKind===tileKind(tile),last,claimTarget});
  });
 }
 return result.sort((a,b)=>a.z-b.z);
}
