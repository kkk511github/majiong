import { assetManager, _decorator, Component, Node, Label, Color, UITransform, Layers, view, ResolutionPolicy, Sprite, SpriteFrame, Texture2D, ImageAsset, JsonAsset, resources, Rect, Graphics, tween, Vec3, UIOpacity, game, profiler, Tween, sp, EventTouch } from 'cc';
import { scenePlayerStatus, layoutPlayerHud, layoutTable, layoutActions, layoutFlowerRacks, claimPrompt, tileFootprint, tileKind, sceneOffset, sceneTileName, nextCompassMemory, type CompassMemory, type TableSceneState, type SceneTile } from './table-scene';
import { beginTileDrag, canContinueTileDrag, shouldDiscardDraggedTile, type TileDragOrigin } from './tile-drag';
const { ccclass } = _decorator;
// Visual tokens for the straight-table skin.  Gameplay never reads these
// values; keeping them together makes the Cocos scene easy to retheme without
// touching scoring, tile identity, or the bridge protocol.
const GOLD='#f0d27b', INK='#f5f0d9', GREEN='#073b3d';
const PANEL='#063d3f';
type Atlas={ [pose:string]:{rects:{x:number;y:number;w:number;h:number}[];width:number;height:number}};
type VisualTile=Pick<SceneTile,'x'|'y'|'w'|'h'>;
type MotionSnapshot=Pick<TableSceneState,'key'|'round'|'me'|'revision'|'connected'|'phase'|'presentation'>&{renderedAt:number};
type TileFlight={tile:SceneTile;identity?:number;progress:{t:number};animation:Tween<{t:number}>;endsAt:number};
type ReleasedTile={tile:number;id:string;visual:VisualTile;key:string;round:number;me:number;revision:number;sawDisabled:boolean;timer:ReturnType<typeof setTimeout>;rejectionTimer?:ReturnType<typeof setTimeout>};
type AvatarFailure={attempts:number;retryAt:number};
const AVATAR_ATTEMPT_LIMIT=3,AVATAR_RETRY_BASE_MS=500;
const load=<T>(path:string,kind:any)=>new Promise<T>((resolve,reject)=>resources.load(path,kind,(e,r)=>e?reject(e):resolve(r as unknown as T)));
@ccclass('TableScene')
export class TableScene extends Component {
 private root!:Node; private hud!:Node; private racks!:Node; private marks!:Node; private effectsRoot!:Node; private state?:TableSceneState;
 private layoutKey=''; private hudKey=''; private racksKey=''; private marksKey=''; private orderKey=''; private countdownLabel?:Label;
 private compassRoot?:Node; private compassWinds:Label[]=[]; private compassHighlights:UIOpacity[]=[];
 private compassMemory?:CompassMemory; private compassActive=-1; private compassPerspective=-1;
 private stateFrame=0;
 private effectData=new Map<string,sp.SkeletonData>();
 private frames=new Map<string,SpriteFrame>(); private nodes=new Map<string,Node>(); private shadows=new Map<string,Node>();
 private tileLayout=new Map<string,SceneTile>();
 private previousTiles=new Map<string,SceneTile>(); private previousPhysical=new Map<string,number>(); private byPhysical=new Map<number,SceneTile>();
 private renderedTiles=new Map<string,VisualTile>(); private renderedShadows=new Map<string,{position:Vec3;scale:Vec3}>();
 private tileFlights=new Map<string,TileFlight>(); private motionSnapshot?:MotionSnapshot; private animateTiles=false; private animateEffects=false; private skipNextTransition=false;
 // Local visual studies can slow this class without adding transport fields.
 private motionScale=1;
 private releasedTile?:ReleasedTile; private motionEffects=new Set<Node>(); private seenEffects=new Set<string>();
 private handTouch?:{id:string;pointer:number|null;origin:TileDragOrigin;startX:number;startY:number;x:number;y:number;base:Vec3;released?:boolean;moved:boolean};
 private avatarLoads=new Set<string>(); private avatarFailures=new Map<string,AvatarFailure>();
 private ready=false; private channel='';
 private trusteeButton?:Node; private trusteeLabel?:Label; private trusteeCommand?:TableSceneCommand;
 private lastHandTap?:{tile:number;key:string;round:number;turn:number;phase:string;canDiscard:boolean;at:number};
 private pointer?:Node; private pointerKey=''; private pointerAt='';
 private cancelHandTouch=()=>{if(!this.handTouch)return;this.handTouch=undefined;if(this.ready&&this.state)this.draw();};
 private onBlur=()=>{this.handTouch=undefined;this.lastHandTap=undefined;this.clearReleasedTile();this.skipNextTransition=true;if(this.ready&&this.state)this.draw();};
 private onVisibility=()=>{this.skipNextTransition=true;if(document.hidden){this.handTouch=undefined;this.clearReleasedTile();}if(this.ready&&this.state)this.draw();};
 // Creator converts an actual touchend outside the last rendered tile bounds to
 // TOUCH_CANCEL. Remember the browser event before Creator dispatches it, so an
 // updated release position still discards, while a real system cancel never does.
 private onTouchRelease=(event:TouchEvent)=>{const touch=this.handTouch;if(touch&&Array.from(event.changedTouches).some(point=>point.identifier===touch.pointer))touch.released=true;};
 private onTouchCancel=(event:TouchEvent)=>{const touch=this.handTouch;if(touch&&Array.from(event.changedTouches).some(point=>point.identifier===touch.pointer))this.cancelHandTouch();};
 private onMouseRelease=(event:MouseEvent)=>{if(event.button===0&&this.handTouch?.pointer===0)this.handTouch.released=true;};
 private onMessage=(event:MessageEvent)=>{
  if(event.source!==window.parent||event.origin!==location.origin)return;
  const d=event.data;
  if(d?.scope!=='jinling-table-v1'||d.channel!==this.channel||d.type!=='state'||!Array.isArray(d.state?.players))return;
  // State messages can arrive in the same display frame (claim, replacement,
  // countdown). Paint the newest geometry once, retaining each confirmed cue.
  if(!d.state.connected)this.skipNextTransition=true;
  if(this.releasedTile)this.releasedTile.sawDisabled ||= d.state.disabled;
  // Observe before frame coalescing: discard and claim can arrive together.
  this.compassMemory=nextCompassMemory(d.state,this.compassMemory);
  const queued=!document.hidden&&this.stateFrame&&this.state?.key===d.state.key&&this.state?.round===d.state.round?this.state.effects:[];
  this.state={...d.state,effects:Array.from(new Map([...queued,...d.state.effects].map(e=>[e.key,e])).values())};
  if(this.ready&&!this.stateFrame)this.stateFrame=requestAnimationFrame(()=>{this.stateFrame=0;if(this.isValid&&this.ready)this.draw();});
 };
 async start(){
  view.setDesignResolutionSize(1280,590,ResolutionPolicy.SHOW_ALL);game.frameRate=60;profiler.hideStats();
  this.channel=new URLSearchParams(location.search).get('channel')||'';
  this.root=this.make('Table',640,295,1280,590,this.node);
  this.hud=this.make('HUD',640,295,1280,590);
  this.racks=this.make('Flower racks',640,295,1280,590);
  this.marks=this.make('Tile markers',640,295,1280,590);
  this.effectsRoot=this.make('Effects',640,295,1280,590);
  window.addEventListener('message',this.onMessage);
  window.addEventListener('blur',this.onBlur);document.addEventListener('visibilitychange',this.onVisibility);
  window.addEventListener('touchend',this.onTouchRelease,true);window.addEventListener('touchcancel',this.onTouchCancel,true);window.addEventListener('mouseup',this.onMouseRelease,true);window.addEventListener('resize',this.cancelHandTouch);
  try{
   const catalog=(await load<JsonAsset>('tile-atlas',JsonAsset)).json as Atlas;
   await Promise.all(Object.entries(catalog).map(async([pose,data])=>{
    const texture=new Texture2D();texture.image=await load<ImageAsset>('tiles/'+pose,ImageAsset);
    data.rects.forEach((r,k)=>{const f=new SpriteFrame();f.texture=texture;f.rect=new Rect(r.x,r.y,r.w,r.h);this.frames.set(pose+'-'+k,f);});
   }));
   await Promise.all(['table','avatars','pointer','table-tool-jade-v2'].map(async name=>{
    const img=await load<ImageAsset>('art/'+name,ImageAsset),tex=new Texture2D();tex.image=img;
    const f=new SpriteFrame();f.texture=tex;
    this.frames.set(name,f);
    if(name==='avatars')for(let k=0;k<4;k++){const a=new SpriteFrame();a.texture=tex;a.rect=new Rect(k%2*img.width/2,Math.floor(k/2)*img.height/2,img.width/2,img.height/2);this.frames.set('avatar-'+k,a);}
   }));
   const effects=(await load<JsonAsset>('art/action-fx-data',JsonAsset)).json as any;
   const fxTexture=new Texture2D();fxTexture.image=await load<ImageAsset>('art/action-fx',ImageAsset);
   for(const [key,json] of Object.entries(effects.skeletons)){
    const data=new sp.SkeletonData();data.skeletonJson=json as any;data.atlasText=effects.atlas;data.textures=[fxTexture];data.textureNames=['action-fx.png'];this.effectData.set(key,data);
   }
   this.staticTable();this.ready=true;
   (window as any).__JINLING_TABLE_READY__=true;
   window.parent.postMessage({scope:'jinling-table-v1',channel:this.channel,type:'ready'},location.origin==='null'?'*':location.origin);
   if(window.parent===window)this.state=this.demo();
   if(this.state)this.draw();
  }catch(e){console.error('Table assets',e);this.text(this.root,'牌桌加载失败，请返回后重试',640,295,500,50,24);window.parent.postMessage({scope:'jinling-table-v1',channel:this.channel,type:'error'},location.origin==='null'?'*':location.origin);}
 }
 onDestroy(){cancelAnimationFrame(this.stateFrame);for(const opacity of this.compassHighlights)Tween.stopAllByTarget(opacity);window.removeEventListener('message',this.onMessage);window.removeEventListener('blur',this.onBlur);document.removeEventListener('visibilitychange',this.onVisibility);window.removeEventListener('touchend',this.onTouchRelease,true);window.removeEventListener('touchcancel',this.onTouchCancel,true);window.removeEventListener('mouseup',this.onMouseRelease,true);window.removeEventListener('resize',this.cancelHandTouch);this.handTouch=undefined;this.clearReleasedTile();this.clearMotion();}
 private make(name:string,x:number,y:number,w:number,h:number,parent=this.root){const n=new Node(name);n.layer=Layers.Enum.UI_2D;n.parent=parent;n.addComponent(UITransform).setContentSize(w,h);n.setPosition(x-640,295-y,0);return n;}
 private text(parent:Node,str:string,x:number,y:number,w:number,h:number,size=20,color=INK){const n=this.make(str,x,y,w,h,parent),l=n.addComponent(Label);l.string=str;l.fontSize=size;l.lineHeight=size+4;l.color=new Color(color);l.isBold=true;l.overflow=Label.Overflow.SHRINK;l.horizontalAlign=Label.HorizontalAlign.CENTER;l.verticalAlign=Label.VerticalAlign.CENTER;return n;}
 private image(key:string,x:number,y:number,w:number,h:number,parent=this.root){const n=this.make(key,x,y,w,h,parent),sp=n.addComponent(Sprite);sp.sizeMode=Sprite.SizeMode.CUSTOM;sp.spriteFrame=this.frames.get(key)||null;n.getComponent(UITransform)!.setContentSize(w,h);return n;}
 private avatar(url:string|undefined,seat:number,x:number,y:number,w:number,h:number,parent:Node){
  const key=url||'avatar-'+seat,n=this.image(this.frames.has(key)?key:'avatar-'+seat,x,y,w,h,parent);n.name=key;
  const failure=url?this.avatarFailures.get(url):undefined;
  const retryReady=!failure||(failure.attempts<AVATAR_ATTEMPT_LIMIT&&Date.now()>=failure.retryAt);
  if(url&&!this.frames.has(url)&&!this.avatarLoads.has(url)&&retryReady){
   this.avatarLoads.add(url);
   // The profile/header first display this digest through a plain <img>. Use a
   // distinct cache key for the CORS-enabled WebGL texture; otherwise WebKit or
   // Chromium can reuse the earlier response without its CORS headers.
   const remote=url+(url.includes('?')?'&':'?')+'table-avatar=1';
   assetManager.loadRemote<ImageAsset>(remote,{ext:'.jpg'},(error,img)=>{
    this.avatarLoads.delete(url);
    if(!this.isValid)return;
    if(error||!img){
     const attempts=(this.avatarFailures.get(url)?.attempts||0)+1;
     const retryAt=Date.now()+attempts*AVATAR_RETRY_BASE_MS;
     this.avatarFailures.set(url,{attempts,retryAt});
     if(attempts<AVATAR_ATTEMPT_LIMIT)setTimeout(()=>{
      if(!this.isValid||!this.state?.players.some(player=>player.avatar===url))return;
      this.hudKey='';this.draw();
     },Math.max(0,retryAt-Date.now()));
     return;
    }
    this.avatarFailures.delete(url);
    const texture=new Texture2D();texture.image=img;const frame=new SpriteFrame();frame.texture=texture;this.frames.set(url,frame);
    for(const node of this.hud.children)if(node.name===url&&node.isValid){const sprite=node.getComponent(Sprite);if(sprite)sprite.spriteFrame=frame;}
   });
  }return n;
 }
 private plate(parent:Node,x:number,y:number,w:number,h:number,color=PANEL,border=GOLD,r=8){const n=this.make('panel',x,y,w,h,parent),g=n.addComponent(Graphics);g.fillColor=new Color(color);g.roundRect(-w/2,-h/2,w,h,r);g.fill();g.strokeColor=new Color(border);g.lineWidth=1.3;g.stroke();return n;}
 private hudBadge(parent:Node,name:string,x:number,y:number,w:number,h:number,fill='#063d3fb8',border='#d8c27a66',r=4){const n=this.make(name,x,y,w,h,parent),g=n.addComponent(Graphics);g.fillColor=new Color(fill);g.roundRect(-w/2,-h/2,w,h,r);g.fill();g.strokeColor=new Color(border);g.lineWidth=1;g.stroke();return n;}
 private hudAvatarFrame(parent:Node,name:string,x:number,y:number,size:number,border:string){const n=this.make(name,x,y,size,size,parent),g=n.addComponent(Graphics);g.fillColor=new Color('#073c3f00');g.roundRect(-size/2,-size/2,size,size,9);g.fill();g.strokeColor=new Color(border);g.lineWidth=1.6;g.stroke();return n;}
 private button(parent:Node,label:string,x:number,y:number,w:number,h:number,command:TableSceneCommand,gold=false){
  const n=this.make('button-'+label,x,y,w,h,parent),g=n.addComponent(Graphics);
  const pass=command.type==='action'&&command.action==='pass';
  g.fillColor=new Color('#022d30');g.roundRect(-w/2,-h/2-3,w,h,10);g.fill();
  const colors=gold?(pass?['#0b3b3d','#0e4444','#124c4b','#155352','#185a58']:['#14504c','#1a5b55','#20665d','#267165','#2b7a6d']):['#104c4c','#155957','#1a6562','#20706b','#267b74'];
  for(let i=0;i<5;i++){g.fillColor=new Color(colors[i]);g.roundRect(-w/2+i,-h/2+i,w-2*i,h-2*i,gold?10:8);g.fill();}
  g.strokeColor=new Color(gold?(pass?'#83957788':'#c4b783'):GOLD);g.lineWidth=1.3;g.stroke();
  const t=this.make(label,640,295,w-8,h-5,n),l=t.addComponent(Label);l.string=label;l.fontSize=gold?(label.length>1?25:35):20;l.color=new Color(gold?(pass?'#b9c4a9':'#e6d5a3'):INK);l.isBold=true;l.lineHeight=44;l.horizontalAlign=Label.HorizontalAlign.CENTER;l.verticalAlign=Label.VerticalAlign.CENTER;
  const blocked=command.type==='action'?this.state?.disabled:command.type==='trustee'?this.state?.trusteeDisabled:false;
  if(blocked)n.addComponent(UIOpacity).opacity=130;
  n.on(Node.EventType.TOUCH_END,()=>{if(!blocked)this.emit(command);});return n;
 }
 private emit(command:TableSceneCommand){
  if(window.parent===window){if(this.state){
   if(command.type==='select'){this.state.selected=command.tile;this.state.inspectedKind=tileKind(command.tile);this.draw();}
   if(command.type==='trustee'){this.state.players.find(p=>p.seat===this.state!.me)!.trustee=command.enabled;this.draw();}
  }return;}
  if(command.type==='discard'){
   if(this.releasedTile)return;
   this.holdReleasedTile(command.tile);
  }
  window.parent.postMessage({scope:'jinling-table-v1',channel:this.channel,type:'command',command},location.origin==='null'?'*':location.origin);
 }
 private toolButton(parent:Node,kind:'trustee'|'settings',x:number,y:number,command:TableSceneCommand){
  const n=this.image('table-tool-jade-v2',x,y,44,44,parent);n.name=`table-tool-${kind}`;
  const icon=this.make('tool-icon',640,288,20,18,n),g=icon.addComponent(Graphics);
  g.strokeColor=new Color('#efdfb9');g.fillColor=new Color('#efdfb9');g.lineWidth=1.4;
  if(kind==='trustee'){
   g.roundRect(-7,-5,14,10,2);g.stroke();
   g.moveTo(0,5);g.lineTo(0,8);g.moveTo(-9,-2);g.lineTo(-9,2);g.moveTo(9,-2);g.lineTo(9,2);g.stroke();
   g.circle(0,9,1);g.fill();g.circle(-3,0,1);g.fill();g.circle(3,0,1);g.fill();
  }else{
   // Compact vector gear stays sharp over the generated jade button skin.
   g.circle(0,0,6);g.stroke();g.circle(0,0,2.3);g.stroke();
   for(let i=0;i<8;i++){const a=i*Math.PI/4;g.moveTo(Math.cos(a)*6,Math.sin(a)*6);g.lineTo(Math.cos(a)*9,Math.sin(a)*9);}g.stroke();
  }
  const caption=this.text(n,kind==='trustee'?'托管':'设置',640,307,36,13,10,'#efdfb9');caption.name='tool-caption';
  n.on(Node.EventType.TOUCH_END,()=>this.emit(command));return n;
 }
 private animationScale(){return Math.max(.5,Math.min(4,this.motionScale||1));}
 private physicalTile(t:SceneTile,s:TableSceneState):number|undefined{
  if(t.area==='meld'){
   const parts=t.id.split('-'),slot=Number(parts[3]),meld=s.players.find(p=>p.seat===t.seat)?.melds[Number(parts[2])];
   // Opponents expose only copy 0. Unknown backs retain their scene-slot
   // identity; never invent three copies of the one public physical tile.
   if(meld?.concealed)return slot===3?meld.tiles[0]:meld.tiles.length===4?meld.tiles[slot+1]:undefined;
  }
  return t.tile;
 }
 private visualTile(t:SceneTile):VisualTile{
  const node=this.nodes.get(t.id);if(!node?.isValid)return t;
  const size=node.getComponent(UITransform)!;
  return{x:node.position.x+640,y:295-node.position.y,w:size.width*node.scale.x,h:size.height*node.scale.y};
 }
 private placeTile(node:Node,at:VisualTile,t:SceneTile){node.setPosition(at.x-640,295-at.y,0);node.setScale(at.w/t.w,at.h/t.h,1);}
 private stopFlight(id:string){this.tileFlights.get(id)?.animation.stop();this.tileFlights.delete(id);}
 private clearMotion(){
  for(const id of this.tileFlights.keys())this.stopFlight(id);
  for(const node of this.motionEffects){Tween.stopAllByTarget(node);const opacity=node.getComponent(UIOpacity);if(opacity)Tween.stopAllByTarget(opacity);if(node.isValid)node.destroy();}
  this.motionEffects.clear();
 }
 private clearReleasedTile(){
  if(this.releasedTile){clearTimeout(this.releasedTile.timer);if(this.releasedTile.rejectionTimer)clearTimeout(this.releasedTile.rejectionTimer);this.layoutKey='';}
  this.releasedTile=undefined;
 }
 private holdReleasedTile(tile:number){
  const s=this.state,t=Array.from(this.tileLayout.values()).find(t=>t.seat===s?.me&&t.area==='hand'&&t.tile===tile);
  if(!s?.connected||!s.canDiscard||!t)return;
  this.stopFlight(t.id);
  let released:ReleasedTile;
  const timer=setTimeout(()=>{if(this.releasedTile!==released)return;this.clearReleasedTile();if(this.isValid&&this.ready&&this.state)this.draw();},3500);
  released={tile,id:t.id,visual:this.visualTile(t),key:s.key,round:s.round,me:s.me,revision:s.revision,sawDisabled:s.disabled,timer};
  this.releasedTile=released;
 }
 private reconcileRelease(s:TableSceneState,reset:boolean){
  const held=this.releasedTile;if(!held)return;
  if(reset||!s.connected||held.key!==s.key||held.round!==s.round||held.me!==s.me){this.clearReleasedTile();return;}
  const stillInHand=s.players.find(p=>p.seat===s.me)?.hand.includes(held.tile);
  // An accepted tile stays available as a motion origin until drawTile consumes
  // its new river/meld destination. A rejected action returns it to its rack.
  if(!stillInHand)return;
  if(s.revision>held.revision||!s.canDiscard||!['playing','claiming'].includes(s.phase)){this.clearReleasedTile();return;}
  if(held.sawDisabled&&!s.disabled&&!held.rejectionTimer){
   held.rejectionTimer=setTimeout(()=>{
    const current=this.state;
    if(this.releasedTile===held&&current&&!current.disabled&&current.revision===held.revision&&current.players.find(p=>p.seat===current.me)?.hand.includes(held.tile)){
     this.clearReleasedTile();if(this.ready&&this.isValid)this.draw();
    }
   },180);
  }
  held.sawDisabled ||= s.disabled;
 }
 private prepareMotion(s:TableSceneState){
  const last=this.motionSnapshot,active=(phase:string)=>['playing','claiming'].includes(phase);
  const advance=last?s.revision-last.revision:Infinity;
  // React may coalesce a claim and its replacement draw into one update.
  // Animate small, recent forward skips, but never backfill a restored game.
  const continuous=advance>=0&&(advance<=1||advance<=3&&performance.now()-(last?.renderedAt??0)<1800);
  const replayContext=!!last&&!this.skipNextTransition&&!document.hidden&&s.connected&&last.connected&&s.key===last.key&&s.round===last.round&&s.me===last.me&&s.presentation==='replay'&&last.presentation==='replay';
  const replayStep=replayContext&&advance===1,replayRedraw=replayContext&&advance===0;
  this.animateTiles=!!last&&!this.skipNextTransition&&!document.hidden&&s.connected&&last.connected&&
   s.key===last.key&&s.round===last.round&&s.me===last.me&&s.presentation!=='replay'&&last.presentation!=='replay'&&
   active(s.phase)&&active(last.phase)&&continuous;
  this.animateEffects=this.animateTiles||replayStep;
  this.skipNextTransition=false;
  if(!this.animateTiles){
   if(replayStep||replayRedraw){for(const id of this.tileFlights.keys())this.stopFlight(id);}
   else{this.clearMotion();this.seenEffects.clear();}
   this.handTouch=undefined;
  }
  this.reconcileRelease(s,!this.animateTiles);
  this.renderedTiles=new Map(Array.from(this.previousTiles).map(([id,t])=>[id,this.visualTile(t)]));
  this.renderedShadows=new Map(Array.from(this.shadows).filter(([,node])=>node.isValid).map(([id,node])=>[id,{position:node.position.clone(),scale:node.scale.clone()}]));
 }
 private startFlight(node:Node,from:VisualTile,t:SceneTile,ms:number,arc:boolean,arrival:boolean){
  this.stopFlight(t.id);
  const progress={t:0},shadow=this.shadows.get(t.id),scale=this.animationScale();
  const lift=arc?Math.min(14,Math.hypot(from.x-t.x,from.y-t.y)*.045):0;
  const paint=()=>{
   if(!this.isValid||!node.isValid)return;
   const k=progress.t,x=from.x+(t.x-from.x)*k,groundY=from.y+(t.y-from.y)*k,w=from.w+(t.w-from.w)*k,h=from.h+(t.h-from.h)*k;
   this.placeTile(node,{x,y:groundY-4*lift*k*(1-k),w,h},t);
   if(shadow?.isValid){this.placeTileShadow(shadow,t,x,groundY);shadow.setScale(w/t.w,h/t.h,1);}
  };
  // A direct ease-out reacts immediately; no slow wind-up before the tile moves.
  const animation=tween(progress).to(ms/1000*scale,{t:1},{easing:'quadOut',onUpdate:paint}).call(()=>{
   this.tileFlights.delete(t.id);
   if(this.isValid&&node.isValid){this.placeTile(node,t,t);if(shadow?.isValid){this.placeTileShadow(shadow,t);shadow.setScale(1,1,1);}if(arrival)this.flowerArrival(t);}
  });
  this.tileFlights.set(t.id,{tile:t,identity:this.physicalTile(t,this.state!),progress,animation,endsAt:performance.now()+ms*scale});
  paint();animation.start();
 }
 private applyTileMotion(t:SceneTile,node:Node){
  const shadow=this.shadows.get(t.id),current=this.renderedTiles.get(t.id);
  if(!this.animateTiles){node.setScale(1,1,1);shadow?.setScale(1,1,1);return;}
  if(this.handTouch?.id===t.id){this.stopFlight(t.id);if(current)this.placeTile(node,current,t);return;}
  const physical=this.physicalTile(t,this.state!),release=physical!==undefined&&this.releasedTile?.tile===physical?this.releasedTile.visual:undefined;
  if(release&&t.area==='hand'){this.stopFlight(t.id);this.placeTile(node,release,t);return;}
  const active=this.tileFlights.get(t.id),target=active?.tile;
  if(target&&current&&active?.identity===physical&&target.x===t.x&&target.y===t.y&&target.w===t.w&&target.h===t.h){
   this.placeTile(node,current,t);const oldShadow=this.renderedShadows.get(t.id);if(shadow&&oldShadow){shadow.setPosition(oldShadow.position);shadow.setScale(oldShadow.scale);}return;
  }
  const sameSlot=this.previousTiles.get(t.id),stable=sameSlot&&this.previousPhysical.get(t.id)===physical;
  const old=stable?sameSlot:physical!==undefined?this.byPhysical.get(physical):undefined;
  let from:VisualTile|undefined=release||(old?(this.renderedTiles.get(old.id)||old):undefined);
  if(release)this.clearReleasedTile();
  const crossing=old?.area!==t.area;
  if(!old&&t.area==='hand'){
   const o=sceneOffset(t.seat,this.state!.me),offset=[{x:20,y:-48},{x:-32,y:20},{x:20,y:32},{x:32,y:-20}][o];
   // Draw from the edge next to the shortened hand, not a fixed original slot.
   from={...t,x:t.x+offset.x,y:t.y+offset.y,w:t.w*.94,h:t.h*.94};
  }else if(!old&&['river','meld','flower'].includes(t.area)){
   const hands=Array.from(this.previousTiles.values()).filter(v=>v.seat===t.seat&&v.area==='hand'),hand=hands[hands.length-1];
   from=release||(hand?(this.renderedTiles.get(hand.id)||hand):undefined);
  }
  this.stopFlight(t.id);
  if(!from||Math.hypot(from.x-t.x,from.y-t.y)<.5&&Math.abs(from.w-t.w)<.5&&Math.abs(from.h-t.h)<.5){node.setScale(1,1,1);shadow?.setScale(1,1,1);return;}
  const ms=t.area==='river'?280:t.area==='flower'?300:t.area==='meld'?300:crossing?260:210;
  this.startFlight(node,from,t,ms,crossing||t.area==='river',t.area==='flower'&&crossing);
 }
 private flowerArrival(t:SceneTile){
  const node=this.make('flower-arrival-'+t.tile,t.x,t.y,t.w+8,t.h+8,this.effectsRoot);this.motionEffects.add(node);
  const g=node.addComponent(Graphics);g.strokeColor=new Color('#d8d4aa');g.lineWidth=1.5;g.roundRect(-t.w/2-3,-t.h/2-3,t.w+6,t.h+6,5);g.stroke();
  const opacity=node.addComponent(UIOpacity);opacity.opacity=135;
  tween(opacity).to(.55*this.animationScale(),{opacity:0},{easing:'sineOut'}).call(()=>{this.motionEffects.delete(node);if(node.isValid)node.destroy();}).start();
 }
 private staticTable(){
  this.image('table',640,295,1280,590).setSiblingIndex(0);
  // The supplied table art carries the tactile jade texture and frame.  A
  // translucent cyan grade lifts the blue channel to match the reference
  // table while retaining the texture on iOS and Android (where replacing a
  // large PNG at runtime is unnecessarily expensive).
  const grade=this.make('table-color-grade',640,295,1280,590),g=grade.addComponent(Graphics);
  g.fillColor=new Color('#007b7890');g.rect(-640,-295,1280,590);g.fill();
  g.fillColor=new Color('#00252d24');g.roundRect(-610,-277,1220,554,18);g.fill();
  g.strokeColor=new Color('#8bc9b64a');g.lineWidth=1.2;g.roundRect(-610,-277,1220,554,18);g.stroke();
  grade.setSiblingIndex(1);
  // A quiet watermark keeps the large centre readable without competing with
  // the compass or the discard rivers.
  this.text(this.root,'金陵麻将',640,170,280,42,30,'#c2e0c52e');

 }
 private draw(){
  const s=this.state!;
  const {countdown,effects,trusteeDisabled,safeArea,...layoutState}=s;
  const layoutKey=JSON.stringify(layoutState);
  // A clock tick is not a new arrangement. Leave in-flight nodes, shadows,
  // touch bindings and the compass alive; only its text can change.
  if(this.orderKey&&!this.skipNextTransition&&this.motionSnapshot?.revision===s.revision&&this.layoutKey===layoutKey){
   this.reconcileRelease(s,false);this.refreshHud(s);this.drawEffect(s);this.positionDraggedTile();this.effectsRoot.setSiblingIndex(this.root.children.length-1);this.motionSnapshot.renderedAt=performance.now();return;
  }
  this.prepareMotion(s);this.layoutKey=layoutKey;
  const tiles=layoutTable(s),ids=new Set(tiles.map(t=>t.id));
  this.tileLayout=new Map(tiles.map(tile=>[tile.id,tile]));
  if(this.handTouch&&(!ids.has(this.handTouch.id)||!canContinueTileDrag(s,this.handTouch.origin)))this.handTouch=undefined;
  for(const [id,n]of this.nodes)if(!ids.has(id)){this.stopFlight(id);n.destroy();this.nodes.delete(id);this.shadows.get(id)?.destroy();this.shadows.delete(id);}
  this.drawRacks(s,tiles);
  for(const t of tiles)this.drawTile(t);
  this.drawMarks(tiles);this.refreshHud(s);
  // Sorting every individual sprite on every snapshot repeatedly invalidates
  // the whole scene hierarchy. Reorder only when its actual tile order changes.
  const orderKey=tiles.map(t=>t.id).join(',');
  if(this.orderKey!==orderKey){
   // Paint the complete contact-shadow layer first, then the complete tile
   // layer. Interleaving shadow/tile per card lets the next side card's shadow
   // cover the previous card's alpha edge and creates a false felt-coloured
   // seam even though their visual bounds already touch.
   for(const t of tiles)if(!t.stack)this.shadows.get(t.id)?.setSiblingIndex(this.root.children.length-1);
   for(const t of tiles){
    // An upper kong touches the lower solid, not the felt. Its tight shadow
    // belongs immediately under that upper tile and on top of the base.
    if(t.stack)this.shadows.get(t.id)?.setSiblingIndex(this.root.children.length-1);
    this.nodes.get(t.id)?.setSiblingIndex(this.root.children.length-1);
   }
   this.orderKey=orderKey;
  }
  this.marks.setSiblingIndex(this.root.children.length-1);this.hud.setSiblingIndex(this.root.children.length-1);
  const last=tiles.find(t=>t.last);
  if(last){
   const positionKey=`${last.x},${last.y},${last.h}`;
   if(this.pointerKey!==last.id||this.pointerAt!==positionKey){if(this.pointer){Tween.stopAllByTarget(this.pointer);this.pointer.destroy();}this.pointer=this.image('pointer',last.x,last.y-last.h/2-17,24,30,this.effectsRoot);const at=this.pointer.position.clone();tween(this.pointer).repeatForever(tween().to(.65,{position:new Vec3(at.x,at.y+5,0)},{easing:'sineInOut'}).to(.65,{position:at},{easing:'sineInOut'})).start();this.pointerKey=last.id;this.pointerAt=positionKey;}
   const flight=this.tileFlights.get(last.id),pointer=this.pointer;
   if(pointer&&flight){pointer.active=false;tween(pointer).delay(Math.max(0,(flight.endsAt-performance.now())/1000)).call(()=>{if(pointer.isValid)pointer.active=true;}).start();}
   else if(pointer)pointer.active=true;
   this.pointer?.setSiblingIndex(this.root.children.length-1);
  }else{this.pointer?.destroy();this.pointer=undefined;this.pointerKey='';}
  this.drawEffect(s);this.positionDraggedTile();this.effectsRoot.setSiblingIndex(this.root.children.length-1);(window as any).__JINLING_TABLE_LAYOUT__=tiles;
  this.previousTiles=new Map(this.tileLayout);this.previousPhysical=new Map();this.byPhysical=new Map();
  for(const tile of tiles){const physical=this.physicalTile(tile,s);if(physical!==undefined){this.previousPhysical.set(tile.id,physical);this.byPhysical.set(physical,tile);}}
  this.motionSnapshot={key:s.key,round:s.round,me:s.me,revision:s.revision,connected:s.connected,phase:s.phase,presentation:s.presentation,renderedAt:performance.now()};
 }
 private drawRacks(s:TableSceneState,tiles:SceneTile[]){
  const racks=layoutFlowerRacks(tiles,s.me),key=JSON.stringify(racks);
  if(key===this.racksKey)return;this.racksKey=key;
  this.racks.destroy();this.racks=this.make('Flower racks',640,295,1280,590);
  this.racks.setSiblingIndex(1);
  for(const rack of racks){
   // The slot and its flowers share one fixed camera geometry. Recesses do
   // not resize with tile count; the felt texture remains visible inside them.
   const n=this.make('rack-'+rack.seat+'-'+rack.lane,640,295,1280,590,this.racks);
   const points=rack.points,g=n.addComponent(Graphics);
   const path=(dy=0)=>{g.moveTo(points[0][0]-640,295-points[0][1]-dy);for(const pt of points.slice(1))g.lineTo(pt[0]-640,295-pt[1]-dy);g.close();};
   path();g.fillColor=new Color('#003a3025');g.fill();
   for(const [width,color,dy] of [[7,'#022d2918',0],[4,'#022d2975',0],[1.4,'#54a18765',2]] as [number,string,number][]){path(dy);g.lineWidth=width;g.strokeColor=new Color(color);g.stroke();}
   // Dark rear bevel and a narrow lit front lip read as an inset trough.
   g.moveTo(points[0][0]-640,295-points[0][1]);g.lineTo(points[1][0]-640,295-points[1][1]);g.strokeColor=new Color('#012b286b');g.lineWidth=2;g.stroke();
   g.moveTo(points[3][0]-640,295-points[3][1]-1);g.lineTo(points[2][0]-640,295-points[2][1]-1);g.strokeColor=new Color('#6bb89a85');g.lineWidth=1.5;g.stroke();
  }
 }
 private drawMarks(tiles:SceneTile[]){
  // Supplier direction is carried by the turned physical tile. Do not draw
  // a yellow arrow over meld faces; actionable claims keep their own outline.
  const claims=tiles.filter(t=>t.claimTarget);
  const key=JSON.stringify(claims.map(t=>[t.id,t.x,t.y,t.w,t.h]));
  if(this.marksKey===key){if(!this.animateTiles)for(const node of this.marks.children){Tween.stopAllByTarget(node);node.active=true;}return;}this.marksKey=key;
  for(const child of this.marks.children)Tween.stopAllByTarget(child);
  this.marks.destroy();this.marks=this.make('Tile markers',640,295,1280,590);
  for(const t of claims){
   const n=this.make('claim-target-'+t.id,t.x,t.y,t.w+8,t.h+8,this.marks),g=n.addComponent(Graphics);
   g.strokeColor=new Color('#ffdc65');g.lineWidth=3;
   g.roundRect(-t.w/2-3,-t.h/2-3,t.w+6,t.h+6,5);g.stroke();
  }
 }
 private refreshHud(s:TableSceneState){
  const key=JSON.stringify([s.me,s.turn,s.dealer,s.presentation,s.phase,s.code,s.round,s.rounds,s.rulesName,
   s.roundMultiplier,s.nextRoundMultiplier,s.practice,s.connected,s.externalControls,s.safeArea,s.disabled,
   s.trusteeDisabled,s.actions,s.pending,s.remaining,
   // Keep each visible flower tally keyed independently; two seats can trade
   // a flower while the table total stays unchanged.
   s.players.map(p=>[p.seat,p.name,p.score,p.avatar,p.bot,p.trustee,p.online,p.flowers.length])]);
  if(key!==this.hudKey){
   this.hudKey=key;
   // Compass geometry and its short highlight tween survive HUD text changes.
   if(this.compassRoot)this.compassRoot.parent=this.root;
   this.hud.destroy();this.hud=this.make('HUD',640,295,1280,590);this.drawHud(s);
  }
  this.drawCompass(s);
  if(this.countdownLabel&&this.countdownLabel.string!==s.countdown){this.countdownLabel.string=s.countdown;this.countdownLabel.fontSize=s.countdown.length>=3?25:33;}
 }
 private drawCompass(s:TableSceneState){
  if(!this.compassRoot){
   this.compassRoot=this.make('center',640,295,1280,590,this.hud);
   const compass=this.make('compass',640,257,122,92,this.compassRoot);
   const frame=compass.addComponent(Graphics);
   const polygon=(g:Graphics,points:number[][])=>{g.moveTo(points[0][0],points[0][1]);for(const p of points.slice(1))g.lineTo(p[0],p[1]);g.close();};
   polygon(frame,[[-42,45],[42,45],[60,27],[60,-27],[42,-45],[-42,-45],[-60,-27],[-60,27]]);
   frame.fillColor=new Color('#063b3d');frame.fill();frame.strokeColor=new Color('#6ea99a');frame.lineWidth=1.2;frame.stroke();
   const regions=[
    [[-40,-42],[40,-42],[26,-23],[-26,-23]],
    [[43,40],[57,26],[57,-26],[43,-40],[30,-20],[30,20]],
    [[-40,42],[40,42],[26,23],[-26,23]],
    [[-43,40],[-57,26],[-57,-26],[-43,-40],[-30,-20],[-30,20]],
   ];
   for(let offset=0;offset<4;offset++){
    const base=this.make('compass-sector-'+offset,640,295,122,92,compass),g=base.addComponent(Graphics);
    polygon(g,regions[offset]);g.fillColor=new Color('#0b4c4b');g.fill();g.strokeColor=new Color('#5c948480');g.lineWidth=1;g.stroke();
    const light=this.make('compass-highlight-'+offset,640,295,122,92,compass),gold=light.addComponent(Graphics);
    polygon(gold,regions[offset]);gold.fillColor=new Color('#a4812f');gold.fill();
    gold.strokeColor=new Color('#f4da7860');gold.lineWidth=3;gold.stroke();
    gold.strokeColor=new Color('#f5dd8b');gold.lineWidth=1.1;gold.stroke();
    const opacity=light.addComponent(UIOpacity);opacity.opacity=0;this.compassHighlights.push(opacity);
   }
   const well=this.make('compass-well',640,295,54,38,compass).addComponent(Graphics);
   well.fillColor=new Color('#042d31');well.roundRect(-27,-19,54,38,10);well.fill();well.strokeColor=new Color('#4d8980');well.lineWidth=1;well.stroke();
   const positions=[[0,33],[44,0],[0,-33],[-44,0]];
   for(let offset=0;offset<4;offset++){
    const [x,y]=positions[offset],word=this.text(compass,'',640+x,295+y,28,23,19,'#becbb8');
    word.name='compass-wind-'+offset;this.compassWinds.push(word.getComponent(Label)!);
   }
   const clock=this.text(compass,s.countdown,640,295,54,36,s.countdown.length>=3?25:33,'#26ddf5');clock.name='table-countdown';this.countdownLabel=clock.getComponent(Label)!;
  }
  if(this.compassRoot.parent!==this.hud)this.compassRoot.parent=this.hud;
  this.compassMemory=nextCompassMemory(s,this.compassMemory);
  // No local discard history on entry: show the authoritative current turn.
  const seat=this.compassMemory.lastDiscardSeat??s.turn,active=sceneOffset(seat,s.me);
  const perspectiveChanged=this.compassPerspective!==s.me;
  if(perspectiveChanged){
   for(let offset=0;offset<4;offset++)this.compassWinds[offset].string=['东','南','西','北'][(s.me+offset)%4];
   this.compassPerspective=s.me;
  }
  const selectionChanged=active!==this.compassActive;
  if(selectionChanged){
   const previous=this.compassActive;
   for(let offset=0;offset<4;offset++){
    const opacity=this.compassHighlights[offset];Tween.stopAllByTarget(opacity);opacity.opacity=0;
    if(offset===active){
     if(previous>=0&&this.animateEffects&&!document.hidden)tween(opacity).to(.14,{opacity:255},{easing:'sineOut'}).start();
     else opacity.opacity=255;
    }
   }
   this.compassActive=active;
  }
  if(perspectiveChanged||selectionChanged)
   for(let offset=0;offset<4;offset++)this.compassWinds[offset].color=new Color(offset===active?'#fff0bf':'#becbb8');
 }
 private placeTileShadow(shadow:Node,t:SceneTile,x=t.x,y=t.y){
  // A meld's contact shadow falls away from the table centre. Applying the
  // former universal +Y offset to side melds painted a false dark-green seam
  // between otherwise touching cards.
  const [dx,dy]=t.stack?[0,1] as const:t.area==='meld'
   ?([[0,2],[2,0],[0,-2],[-2,0]] as const)[sceneOffset(t.seat,this.state!.me)]
   :[0,2] as const;
  shadow.setPosition(x+dx-640,295-y-dy,0);
 }
 private drawTile(t:SceneTile){
  if(t.area!=='hand'||t.pose.startsWith('back-')){
   let shadow=this.shadows.get(t.id);const old=this.previousTiles.get(t.id),sameShape=shadow&&old&&old.w===t.w&&old.h===t.h&&old.shear===t.shear&&old.rotation===t.rotation;
   if(!shadow){shadow=this.make('contact-'+t.id,t.x,t.y+2,t.w+3,t.h+3);shadow.addComponent(Graphics);this.shadows.set(t.id,shadow);}
   this.placeTileShadow(shadow,t);
   if(!sameShape){const g=shadow.getComponent(Graphics)!;g.clear();
    for(let i=2;i>=0;i--){
     const meld=t.area==='meld';
     // Meld sprites already contain their baked tabletop shading. Add only a
     // tight, soft contact shadow so they read as resting on felt rather than
     // as thick blocks or floating stickers.
     g.fillColor=new Color(i===0?(meld?'#03291c42':'#03291c65'):(meld?'#03291c12':'#03291c1a'));
     const contact=t.area==='hand'?{...t,y:t.y+t.h*.32,h:t.h*.28}:t;
     const padding=t.area==='flower'?-i/2:meld?i*.35:i;
     const points=tileFootprint(contact,padding);g.moveTo(points[0][0]-t.x,t.y-points[0][1]);for(const pt of points.slice(1))g.lineTo(pt[0]-t.x,t.y-pt[1]);g.close();g.fill();
    }
   }
  }
  let n=this.nodes.get(t.id);if(!n){n=this.make(t.id,t.x,t.y,t.w,t.h);n.addComponent(Sprite);this.nodes.set(t.id,n);if(t.area==='hand'&&t.pose==='own')this.bindTileTouch(n,t.id);}
  n.getComponent(UITransform)!.setContentSize(t.w,t.h);n.setPosition(t.x-640,295-t.y,0);
  n.setRotationFromEuler(0,0,t.rotation||0);
  let pose=t.pose;
  const sp=n.getComponent(Sprite)!;sp.sizeMode=Sprite.SizeMode.CUSTOM;sp.spriteFrame=this.frames.get(pose+'-'+(t.tile===undefined?0:tileKind(t.tile)))||null;n.getComponent(UITransform)!.setContentSize(t.w,t.h);sp.color=new Color(t.globalAnchor?'#ffe16a':t.selected||t.highlight?'#fff7b1':'#ffffff');
  this.applyTileMotion(t,n);
 }
 private bindTileTouch(node:Node,id:string){
  // Bind once: one-second countdown pushes must not replace an in-flight touch.
  // Resolve the latest layout by physical tile ID, never by the sorted hand index.
  node.on(Node.EventType.TOUCH_START,(event:EventTouch)=>{
   const tile=this.tileLayout.get(id),state=this.state;
   if(this.handTouch||this.releasedTile||!state||!tile?.clickable||tile.tile===undefined)return;
   const origin=beginTileDrag(state,tile.tile);if(!origin)return;
   const point=event.getUILocation();
   // A second grab can begin before selection/return motion has settled.
   // Freeze the painted geometry, not the future rack target, before the
   // pointer takes ownership of position updates.
   const frozen=this.visualTile(tile);
   this.stopFlight(id);
   this.placeTile(node,frozen,tile);
   this.handTouch={id,pointer:event.getID(),origin,startX:point.x,startY:point.y,x:point.x,y:point.y,base:node.position.clone(),moved:false};
  });
  node.on(Node.EventType.TOUCH_MOVE,(event:EventTouch)=>{
   const touch=this.handTouch;if(!touch||touch.id!==id||touch.pointer!==event.getID())return;
   if(!this.state||!canContinueTileDrag(this.state,touch.origin)){this.cancelHandTouch();return;}
   const point=event.getUILocation();touch.x=point.x;touch.y=point.y;touch.moved ||= Math.hypot(point.x-touch.startX,point.y-touch.startY)>=10;this.positionDraggedTile();
  });
  node.on(Node.EventType.TOUCH_END,(event:EventTouch)=>{
   if(this.handTouch?.id===id)this.finishHandTouch(event);
  });
  node.on(Node.EventType.TOUCH_CANCEL,(event:EventTouch)=>{
   if(this.handTouch?.id!==id||this.handTouch.pointer!==event.getID())return;
   if(this.handTouch.released)this.finishHandTouch(event);else this.cancelHandTouch();
  });
 }
 private finishHandTouch(event:EventTouch){
  const touch=this.handTouch;if(!touch||touch.pointer!==event.getID())return;
  const point=event.getUILocation(),state=this.state;
  touch.x=point.x;touch.y=point.y;this.positionDraggedTile();
  this.handTouch=undefined;
  if(state&&canContinueTileDrag(state,touch.origin)){
   const discard=shouldDiscardDraggedTile(state,touch.origin,point.x-touch.startX,point.y-touch.startY,point);
   // An unsuccessful drag keeps the selection; taps preserve the existing click flow.
   const tapped=!touch.moved&&Math.hypot(point.x-touch.startX,point.y-touch.startY)<10;
   const previous=this.lastHandTap;
   const doubleTap=tapped&&touch.origin.canDiscard&&previous?.tile===touch.origin.tile&&
    previous.key===state.key&&previous.round===state.round&&previous.turn===state.turn&&
    previous.phase===state.phase&&previous.canDiscard&&performance.now()-previous.at<=400;
   if(discard||doubleTap){this.lastHandTap=undefined;this.emit({type:'discard',tile:touch.origin.tile});}
   else if(tapped){
    this.lastHandTap={tile:touch.origin.tile,key:state.key,round:state.round,turn:state.turn,phase:state.phase,canDiscard:touch.origin.canDiscard,at:performance.now()};
    this.emit({type:'select',tile:touch.origin.tile});
   }else this.lastHandTap=undefined;
  }
  if(this.ready&&this.state)this.draw();
 }
 private positionDraggedTile(){
  const touch=this.handTouch;
  if(!touch||!touch.origin.canDiscard)return;
  const node=this.nodes.get(touch.id);if(!node?.isValid)return;
  // getUILocation uses upward-positive design coordinates, matching node space.
  node.setPosition(touch.base.x+touch.x-touch.startX,touch.base.y+touch.y-touch.startY,0);
  node.setSiblingIndex(this.root.children.length-1);this.orderKey='';
 }
 private drawHud(s:TableSceneState){
  const h=this.hud;
  this.text(h,s.presentation==='replay'?'牌局回放':s.practice?'单人练习':`好友桌 ${s.code}`,80,78,150,30,18,INK);
  this.text(h,`${s.rulesName ? s.rulesName+' · ' : ''}${s.rounds ? s.round+' / '+s.rounds+' 把' : '第 '+s.round+' 把'}`,80,107,156,28,16,'#b9d1bf');
  if(s.roundMultiplier!==undefined)this.text(h,`${s.roundMultiplier>1?'比下胡':'本把'} × ${s.roundMultiplier}`,80,134,148,23,18,GOLD);
  if(s.presentation!=='replay'&&s.phase==='ended'&&s.nextRoundMultiplier!==undefined)
   this.text(h,`下把${s.nextRoundMultiplier>1?'比下胡':'恢复'} × ${s.nextRoundMultiplier}`,80,321,146,28,16,GOLD);
  for(const p of s.players){
   const o=sceneOffset(p.seat,s.me),status=scenePlayerStatus(s,p),info=layoutPlayerHud(o,s.safeArea);
   const border=status.active?'#73e2d8':'#c2ae68';
   const statusColor=status.tone==='offline'?'#ffccb5':status.tone==='trustee'?'#ffe6a2':'#d5f1e8';
   const marker=(x:number,y:number,w:number)=>{
    if(!status.label)return;
    const badge=this.plate(h,x,y,w,23,status.tone==='offline'?'#633c2cf5':'#123c33f5',statusColor,5);badge.name=`player-status-${p.seat}`;
    this.text(h,status.label,x,y,w-4,23,16,statusColor);
   };

   if(o===2){
    // The opposite identity is a narrow vertical card on the upper-right
    // rail.  The old 166px horizontal plate reached back over the exposed
    // meld/flower row; keeping this stack inside its own reserved bounds lets
   // every public tile remain visible while matching the reference card.
    const x=info.x,top=info.y-info.h/2,avatarY=top+30;
    // Keep the identity rail transparent over the felt.  A full dark plate
    // here used to fold over the first right-hand discard at dense tables;
    // only the portrait ring and the score/flower badge carry a visible fill.
    // Retain the named, bounds-only node for accessibility/replay probes; it
    // has no Graphics component and therefore cannot occlude a tile.
    this.make(`player-panel-${p.seat}`,x,info.y,info.w,info.h,h);
    this.hudAvatarFrame(h,`player-avatar-ring-${p.seat}`,x,avatarY,64,status.active?'#73e2d8':'#c2ae68');
    const avatar=this.avatar(p.avatar,p.seat,x,avatarY,60,60,h);
    if(s.presentation==='replay')avatar.on(Node.EventType.TOUCH_END,()=>this.emit({type:'menu',menu:'table',seat:p.seat}));
    // The nickname is painted directly over the lower edge of the portrait;
    // keep only a transparent named node for probes and accessibility.
    this.make(`player-name-plate-${p.seat}`,x,top+51,72,16,h);
    const name=this.text(h,p.name,x,top+51,68,14,10,INK);name.name=`player-name-${p.seat}`;
    // Score and flowers share one compact translucent frame.  Keeping the
    // two rows in one badge matches the reference and avoids a second bright
    // rectangle reading like another tile.
    this.hudBadge(h,`player-flower-count-box-${p.seat}`,x,top+89,76,45,'#063d3fb8','#d8c27a66',4);
    const score=this.text(h,`${p.score}`,x,top+76,68,18,16,GOLD);score.name=`player-score-${p.seat}`;
    // The flower tally is immediately below the score, in the same compact
    // translucent stack as the reference.  It never sits on the side rail.
    const flowers=this.text(h,`✿ ×${p.flowers.length}`,x,top+101,60,15,12,'#f3b39d');flowers.name=`player-flower-count-${p.seat}`;
    // The active ring is the status cue for the compact opposite rail. Keep a
    // named, non-painted status node for screen readers without adding text
    // over the first right-hand discard.
    if(status.label){const statusNode=this.text(h,status.label,x,top+126,72,10,9,statusColor);statusNode.name=`player-status-${p.seat}`;statusNode.addComponent(UIOpacity).opacity=0;}
    if(p.seat===s.dealer)this.text(h,'庄',x+27,top+7,22,16,13,'#ffe08a');
    continue;
   }
   const x=info.x,y=info.y;
   if(o===0){
    // The local player uses the same vertical identity stack as the side
    // seats, tucked into the lower-left cutout so it never touches the hand.
    // Keep a bounds-only panel for safe-area probes; all visible pieces below
    // are individual transparent/sem transparent elements.
    this.make(`player-panel-${p.seat}`,x,info.y,info.w,info.h,h);
    const avatarX=x-info.w/2+27,avatarY=y-28,avatarSize=56;
    this.hudAvatarFrame(h,`player-avatar-ring-${p.seat}`,avatarX,avatarY,avatarSize,status.active?'#73e2d8':'#c2ae68');
    const avatar=this.avatar(p.avatar,p.seat,avatarX,avatarY,52,52,h);
    if(s.presentation==='replay')avatar.on(Node.EventType.TOUCH_END,()=>this.emit({type:'menu',menu:'table',seat:p.seat}));
    this.make(`player-name-plate-${p.seat}`,avatarX,avatarY+18,72,16,h);
    const name=this.text(h,p.name,avatarX,avatarY+18,68,14,10,INK);name.name=`player-name-${p.seat}`;
    this.hudBadge(h,`player-flower-count-box-${p.seat}`,avatarX,y+27,82,50,'#063d3fb8','#d8c27a66',4);
    const score=this.text(h,`${p.score}`,avatarX,y+12,72,22,18,GOLD);score.name=`player-score-${p.seat}`;
    const flowers=this.text(h,`✿ ×${p.flowers.length}`,avatarX,y+41,72,21,13,'#f3b39d');flowers.name=`player-flower-count-${p.seat}`;
    if(status.label){const statusNode=this.text(h,status.label,avatarX,y+67,76,12,10,statusColor);statusNode.name=`player-status-${p.seat}`;statusNode.addComponent(UIOpacity).opacity=0;}
    if(p.seat===s.dealer)this.text(h,'庄',avatarX+27,avatarY-18,20,20,16,'#ffe08a');
    continue;
   }
   // Side players use the reference stack: avatar first, nickname over its
   // lower edge, then one shared translucent badge for score and flowers.
   this.make(`player-panel-${p.seat}`,x,info.plateY,info.w,info.h,h);
   marker(x,y-37,100);
   const avatarSize=58;
   this.hudAvatarFrame(h,`player-avatar-ring-${p.seat}`,x,y,avatarSize,status.active?'#73e2d8':'#c2ae68');
   const avatar=this.avatar(p.avatar,p.seat,x,y,54,54,h);
   if(s.presentation==='replay')avatar.on(Node.EventType.TOUCH_END,()=>this.emit({type:'menu',menu:'table',seat:p.seat}));
   this.make(`player-name-plate-${p.seat}`,x,y+19,76,17,h);
   const name=this.text(h,p.name,x,y+19,72,15,11,INK);name.name=`player-name-${p.seat}`;
   this.hudBadge(h,`player-flower-count-box-${p.seat}`,x,y+63,82,50,'#063d3fb8','#d8c27a66',4);
   const score=this.text(h,`${p.score}`,x,y+46,74,22,18,GOLD);score.name=`player-score-${p.seat}`;
   const flowers=this.text(h,`✿ ×${p.flowers.length}`,x,y+74,74,21,13,'#f3b39d');flowers.name=`player-flower-count-${p.seat}`;
   if(p.seat===s.dealer)this.text(h,'庄',x+37,y-20,24,23,17,'#ffe08a');
  }
  const prompt=claimPrompt(s);
  if(prompt&&!s.externalControls){
   // Keep the compass and counters untouched; the left lower rail is clear
   // of hand tiles, all three river columns, flowers and action controls.
   const card=this.plate(h,112,360,180,86,'#07494af5','#d0bd79',10);card.name='claim-prompt';
   this.text(h,`${prompt.source} · ${prompt.kind==='robKong'?'补杠':'打出'}`,99,330,144,20,15);
   this.image('own-'+tileKind(prompt.tile),59,369,35,52,h).name='claim-prompt-tile';
   this.text(h,prompt.name,136,357,100,25,22,GOLD);
   this.text(h,'可'+prompt.labels.join(' / '),136,384,106,24,17);
  }
  const flowers=Math.max(0,20-s.players.reduce((n,p)=>n+p.flowers.length,0));
  // The counters sit beside the fixed compass; river origins are pushed away
  // from this centre rail even when every player has 27 discards.
  const countX=531,roundX=772,countWidth=66;
  this.text(h,`余牌 ${s.remaining}`,countX,238,countWidth,27,15,'#dce9d5').name='table-remaining-count';
  this.text(h,`余花 ${flowers}`,countX,267,countWidth,27,15,'#dce9d5').name='table-flowers-count';
  this.text(h,'把数',roundX,235,countWidth,23,16,'#b9d3c0').name='table-round-label';
  this.text(h,s.rounds?`${s.round} / ${s.rounds}`:String(s.round),roundX,264,countWidth,29,21,GOLD).name='table-round-count';
  if(this.trusteeButton)this.trusteeButton.active=s.presentation!=='replay'&&!s.externalControls;
  if(s.presentation==='replay'){this.text(h,'点击头像切换视角',640,455,250,30,17,'#bdd2bd');h.setSiblingIndex(this.root.children.length-1);return;}
  if(s.externalControls){h.setSiblingIndex(this.root.children.length-1);return;}
  const me=s.players.find(p=>p.seat===s.me)!,ended=['ended','finished'].includes(s.phase);
  this.trusteeCommand=ended?{type:'menu',menu:'result'}:{type:'trustee',enabled:!me.trustee};
  // Keep the touch target alive across countdown/state pushes. Rebuilding it
  // between TOUCH_START and TOUCH_END used to swallow the first cancellation.
  if(!this.trusteeButton){
   const n=this.toolButton(this.root,'trustee',1235,35,{type:'trustee',enabled:true});
   this.trusteeButton=n;this.trusteeLabel=n.getChildByName('tool-caption')!.getComponent(Label)!;
   n.off(Node.EventType.TOUCH_END);
   n.on(Node.EventType.TOUCH_END,()=>{if(this.trusteeCommand&&(!this.state?.trusteeDisabled||this.trusteeCommand.type==='menu'))this.emit(this.trusteeCommand);});
  }
  this.trusteeLabel!.string=ended?'结算':me.trustee?'取消':'托管';
  (this.trusteeButton.getComponent(UIOpacity)||this.trusteeButton.addComponent(UIOpacity)).opacity=!ended&&s.trusteeDisabled?130:255;
  this.trusteeButton.setSiblingIndex(this.root.children.length-1);
  const actionRow=layoutActions(s,layoutTable(s));
  actionRow.forEach(({action:a,x,y,w,h:height})=>this.button(h,a.label,x,y,w,height,{type:'action',action:a.id,tile:a.tile},true));

  if(!s.connected)this.text(h,'正在重新连接…',640,397,330,35,23);
  h.setSiblingIndex(this.root.children.length-1);
 }
 private drawEffect(s:TableSceneState){
  for(const e of s.effects){
   if(this.seenEffects.has(e.key))continue;
   this.seenEffects.add(e.key);
   // Entering, restoring and replay seeks consume historical feedback instead
   // of presenting all of it as if the player had just performed the actions.
   if(!this.animateEffects)continue;
   const label=e.type==='pung'?'碰':e.type==='flower'?'补花':e.type==='kong'?(e.concealed?'暗杠':e.upgraded?'补杠':'明杠'):'';
   if(label){this.actionWord(s,e.seat,label);continue;}
   // The React bridge normally owns wins. Keep the standalone canvas fallback
   // without changing the installed app's TableWinEffect behavior.
   if(e.type==='hu'){
    const key=e.selfDraw?'self-draw':'hu',data=this.effectData.get(key);if(!data)continue;
    const node=this.make('spine-'+key,640,300,280,280,this.effectsRoot),effect=node.addComponent(sp.Skeleton);this.motionEffects.add(node);
    effect.skeletonData=data;effect.premultipliedAlpha=false;effect.setCompleteListener(()=>{this.motionEffects.delete(node);if(node.isValid)node.destroy();});effect.setAnimation(0,'activate',false);
   }
  }
 }
 private actionPosition(s:TableSceneState,seat:number){
  const o=sceneOffset(seat,s.me),preferred=[{x:650,y:435},{x:935,y:260},{x:650,y:125},{x:385,y:265}][o];
  const obstacles=Array.from(this.tileLayout.values()).map(t=>({x:t.x,y:t.y,w:t.w,h:t.h}));
  for(let index=0;index<4;index++){const p=layoutPlayerHud(index,s.safeArea);obstacles.push({x:p.x,y:p.plateY,w:p.w,h:p.h});}
  obstacles.push({x:640,y:257,w:124,h:96},{x:531,y:250,w:72,h:66},{x:772,y:250,w:72,h:66},
   // The compact opposite flower badge sits below its score, not on a rail.
   {x:layoutPlayerHud(2,s.safeArea).x,y:89+layoutPlayerHud(2,s.safeArea).dy,w:76,h:45});
  const fits=(x:number,y:number)=>obstacles.every(b=>Math.abs(x-b.x)>=(144+b.w)/2+4||Math.abs(y-5-b.y)>=(76+b.h)/2+4);
  if(fits(preferred.x,preferred.y))return preferred;
  const zone=[{left:230,right:1110,top:395,bottom:446},{left:918,right:1120,top:150,bottom:420},{left:360,right:915,top:95,bottom:154},{left:164,right:400,top:160,bottom:415}][o];
  let best:{x:number;y:number;distance:number}|undefined;
  for(let y=zone.top;y<=zone.bottom;y+=6)for(let x=zone.left;x<=zone.right;x+=6){
   if(!fits(x,y))continue;
   const distance=(x-preferred.x)**2+(y-preferred.y)**2;if(!best||distance<best.distance)best={x,y,distance};
  }
  return best||[{x:940,y:432},{x:1060,y:328},{x:640,y:126},{x:210,y:328}][o];
 }
 private actionWord(s:TableSceneState,seat:number,value:string){
  const o=sceneOffset(seat,s.me);
  let at:{x:number;y:number};
  if(o===0){
   const hand=Array.from(this.tileLayout.values()).filter(t=>t.seat===seat&&t.area==='hand');
   at=hand.length?{x:(Math.min(...hand.map(t=>t.x-t.w/2))+Math.max(...hand.map(t=>t.x+t.w/2)))/2,y:508}:{x:700,y:508};
  }else at=this.actionPosition(s,seat);
  // Replacement flowers can arrive immediately after a kong. One cue per seat
  // keeps them readable instead of stacking several animated panels together.
  for(const active of this.motionEffects)if(active.name==='motion-action-'+seat){
   Tween.stopAllByTarget(active);const opacity=active.getComponent(UIOpacity);if(opacity)Tween.stopAllByTarget(opacity);
   this.motionEffects.delete(active);if(active.isValid)active.destroy();
  }
  const width=value.length===1?78:112,node=this.make('motion-action-'+seat,at.x,at.y,width,54,this.effectsRoot);this.motionEffects.add(node);
  const g=node.addComponent(Graphics);g.fillColor=new Color('#103e32bd');g.roundRect(-width/2,-25,width,50,12);g.fill();
  g.strokeColor=new Color('#c8bd8840');g.lineWidth=1;g.roundRect(-width/2,-25,width,50,12);g.stroke();
  // Text only: the former ornament below the glyphs looked like a stray dot.
  this.text(node,value,640,295,width-8,48,value==='补花'?32:38,'#ebd6a3').name='table-action-value';
  const opacity=node.addComponent(UIOpacity),scale=this.animationScale();opacity.opacity=0;
  tween(opacity).to(.1*scale,{opacity:255},{easing:'sineOut'}).delay(.42*scale).to(.22*scale,{opacity:0},{easing:'sineIn'}).call(()=>{this.motionEffects.delete(node);if(node.isValid)node.destroy();}).start();
 }
 private demo():TableSceneState{
  const hand=[20,21,22,24,25,28,32,33,84,85,56,57,60,64];
  return {key:'demo',revision:1,me:0,turn:3,dealer:0,phase:'playing',code:'582619',round:2,rounds:4,remaining:46,countdown:'10',connected:true,disabled:false,practice:true,canDiscard:true,selected:null,drawn:64,inspectedKind:null,hintKinds:[],hintLabel:'可胡',trusteeDisabled:false,actions:[{id:'pass',label:'过'},{id:'pung',label:'碰'},{id:'kong',label:'杠'},{id:'hu',label:'胡'}],effects:[],lastDiscard:{tile:79,seat:3},players:[
   {name:'金陵牌友',score:90,seat:0,bot:false,trustee:false,hand,handCount:14,flowers:[132,140],melds:[],discards:[120,47,0,1]},
   {name:'秦淮',score:90,seat:1,bot:true,trustee:false,hand:[],handCount:10,flowers:[136,128],melds:[{type:'pung',tiles:[56,57,58],from:2,concealed:false}],discards:[4,68,100,112,108]},
   {name:'钟山',score:90,seat:2,bot:true,trustee:false,hand:[],handCount:10,flowers:[124,137,129,139],melds:[{type:'pung',tiles:[96,97,98],from:3,concealed:false}],discards:[5,6,7,48,116]},
   {name:'莫愁',score:90,seat:3,bot:true,trustee:false,hand:[],handCount:13,flowers:[138,125,141,130,126,142],melds:[],discards:[109,113,121,11,79]}
  ]};
 }
}
