import { assetManager, _decorator, Component, Node, Label, Color, UITransform, Layers, view, ResolutionPolicy, Sprite, SpriteFrame, Texture2D, ImageAsset, JsonAsset, resources, Rect, Graphics, tween, Vec3, UIOpacity, game, profiler, Tween, sp } from 'cc';
import { layoutTable, layoutActions, layoutFlowerRacks, layoutMeldSources, tileFootprint, tileKind, sceneOffset, sceneTileName, type TableSceneState, type TableSceneCommand, type SceneTile } from './table-scene';
const { ccclass } = _decorator;
const GOLD='#e4c573', INK='#fcf1d0', GREEN='#093f37';
type Atlas={ [pose:string]:{rects:{x:number;y:number;w:number;h:number}[];width:number;height:number}};
const load=<T>(path:string,kind:any)=>new Promise<T>((resolve,reject)=>resources.load(path,kind,(e,r)=>e?reject(e):resolve(r as unknown as T)));
@ccclass('TableScene')
export class TableScene extends Component {
 private root!:Node; private hud!:Node; private racks!:Node; private effectsRoot!:Node; private state?:TableSceneState;
 private effectData=new Map<string,sp.SkeletonData>();
 private frames=new Map<string,SpriteFrame>(); private nodes=new Map<string,Node>(); private shadows=new Map<string,Node>();
 private avatarLoads=new Set<string>();
 private ready=false; private channel=''; private lastEffect='';
 private trusteeButton?:Node; private trusteeLabel?:Label; private trusteeCommand?:TableSceneCommand;
 private pointer?:Node; private pointerKey=''; private pointerAt='';
 private onMessage=(event:MessageEvent)=>{
  if(event.source!==window.parent||event.origin!==location.origin)return;
  const d=event.data;
  if(d?.scope!=='jinling-table-v1'||d.channel!==this.channel||d.type!=='state'||!Array.isArray(d.state?.players))return;
  this.state=d.state;if(this.ready)this.draw();
 };
 async start(){
  view.setDesignResolutionSize(1280,590,ResolutionPolicy.SHOW_ALL);game.frameRate=60;profiler.hideStats();
  this.channel=new URLSearchParams(location.search).get('channel')||'';
  this.root=this.make('Table',640,295,1280,590,this.node);
  this.hud=this.make('HUD',640,295,1280,590);
  this.racks=this.make('Flower racks',640,295,1280,590);
  this.effectsRoot=this.make('Effects',640,295,1280,590);
  window.addEventListener('message',this.onMessage);
  try{
   const catalog=(await load<JsonAsset>('tile-atlas',JsonAsset)).json as Atlas;
   await Promise.all(Object.entries(catalog).map(async([pose,data])=>{
    const texture=new Texture2D();texture.image=await load<ImageAsset>('tiles/'+pose,ImageAsset);
    data.rects.forEach((r,k)=>{const f=new SpriteFrame();f.texture=texture;f.rect=new Rect(r.x,r.y,r.w,r.h);this.frames.set(pose+'-'+k,f);});
   }));
   await Promise.all(['table','avatars','pointer','meld-source-dart'].map(async name=>{
    const img=await load<ImageAsset>('art/'+name,ImageAsset),tex=new Texture2D();tex.image=img;
    const f=new SpriteFrame();f.texture=tex;
    // Trim transparent padding in the sprite UVs; preserve the generated PNG.
    if(name==='meld-source-dart')f.rect=new Rect(190,161,867,902);
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
 onDestroy(){window.removeEventListener('message',this.onMessage);}
 private make(name:string,x:number,y:number,w:number,h:number,parent=this.root){const n=new Node(name);n.layer=Layers.Enum.UI_2D;n.parent=parent;n.addComponent(UITransform).setContentSize(w,h);n.setPosition(x-640,295-y,0);return n;}
 private text(parent:Node,str:string,x:number,y:number,w:number,h:number,size=20,color=INK){const n=this.make(str,x,y,w,h,parent),l=n.addComponent(Label);l.string=str;l.fontSize=size;l.lineHeight=size+4;l.color=new Color(color);l.isBold=true;l.overflow=Label.Overflow.SHRINK;l.horizontalAlign=Label.HorizontalAlign.CENTER;l.verticalAlign=Label.VerticalAlign.CENTER;return n;}
 private image(key:string,x:number,y:number,w:number,h:number,parent=this.root){const n=this.make(key,x,y,w,h,parent),sp=n.addComponent(Sprite);sp.sizeMode=Sprite.SizeMode.CUSTOM;sp.spriteFrame=this.frames.get(key)||null;n.getComponent(UITransform)!.setContentSize(w,h);return n;}
 private avatar(url:string|undefined,seat:number,x:number,y:number,w:number,h:number,parent:Node){
  const key=url||'avatar-'+seat,n=this.image(this.frames.has(key)?key:'avatar-'+seat,x,y,w,h,parent);n.name=key;
  if(url&&!this.frames.has(url)&&!this.avatarLoads.has(url)){
   this.avatarLoads.add(url);
   assetManager.loadRemote<ImageAsset>(url,{ext:'.jpg'},(error,img)=>{
    if(error||!img||!this.isValid)return;
    const texture=new Texture2D();texture.image=img;const frame=new SpriteFrame();frame.texture=texture;this.frames.set(url,frame);
    for(const node of this.hud.children)if(node.name===url&&node.isValid){const sprite=node.getComponent(Sprite);if(sprite)sprite.spriteFrame=frame;}
   });
  }return n;
 }
 private plate(parent:Node,x:number,y:number,w:number,h:number,color=GREEN,border=GOLD,r=8){const n=this.make('panel',x,y,w,h,parent),g=n.addComponent(Graphics);g.fillColor=new Color(color);g.roundRect(-w/2,-h/2,w,h,r);g.fill();g.strokeColor=new Color(border);g.lineWidth=1.3;g.stroke();return n;}
 private button(parent:Node,label:string,x:number,y:number,w:number,h:number,command:TableSceneCommand,gold=false){
  const n=this.make('button-'+label,x,y,w,h,parent),g=n.addComponent(Graphics);
  g.fillColor=new Color(gold?'#91621c':'#092b28');g.roundRect(-w/2,-h/2-3,w,h,gold?h/2:9);g.fill();
  const colors=gold?['#bc862a','#e6ac3f','#f0bb56','#f7d477','#ffe6a4']:['#244039','#264e45','#2b584a','#315f51','#356652'];
  for(let i=0;i<5;i++){g.fillColor=new Color(colors[i]);g.roundRect(-w/2+i,-h/2+i,w-2*i,h-2*i,gold?h/2:8);g.fill();}
  g.strokeColor=new Color(GOLD);g.lineWidth=1.5;g.stroke();
  const t=this.make(label,640,295,w-8,h-5,n),l=t.addComponent(Label);l.string=label;l.fontSize=gold?(label.length>1?27:39):20;l.color=new Color(gold?'#5b260d':INK);l.isBold=true;l.lineHeight=44;l.horizontalAlign=Label.HorizontalAlign.CENTER;l.verticalAlign=Label.VerticalAlign.CENTER;
  const blocked=command.type==='action'?this.state?.disabled:command.type==='trustee'?this.state?.trusteeDisabled:false;
  if(blocked)n.addComponent(UIOpacity).opacity=130;
  n.on(Node.EventType.TOUCH_END,()=>{if(!blocked)this.emit(command);});return n;
 }
 private emit(command:TableSceneCommand){
  if(window.parent===window){if(this.state){
   if(command.type==='select'){this.state.selected=command.tile;this.state.inspectedKind=tileKind(command.tile);this.draw();}
   if(command.type==='trustee'){this.state.players.find(p=>p.seat===this.state!.me)!.trustee=command.enabled;this.draw();}
  }return;}
  window.parent.postMessage({scope:'jinling-table-v1',channel:this.channel,type:'command',command},location.origin==='null'?'*':location.origin);
 }
 private staticTable(){
  this.image('table',640,295,1280,590).setSiblingIndex(0);
  this.text(this.root,'金陵麻将',373,405,260,50,34,'#07554c');

 }
 private draw(){
  const s=this.state!,tiles=layoutTable(s),ids=new Set(tiles.map(t=>t.id));
  for(const [id,n]of this.nodes)if(!ids.has(id)){n.destroy();this.nodes.delete(id);this.shadows.get(id)?.destroy();this.shadows.delete(id);}
  this.hud.destroy();this.hud=this.make('HUD',640,295,1280,590);
  this.drawRacks(s,tiles);
  for(const t of tiles)this.drawTile(t);
  for(const marker of layoutMeldSources(tiles,s.me)){
   const n=this.image('meld-source-dart',marker.x,marker.y,marker.size*867/902,marker.size,this.hud);
   n.name=marker.id;n.setRotationFromEuler(0,0,marker.rotation);
  }
  this.drawHud(s);
  const last=tiles.find(t=>t.last);
  if(last){
   const positionKey=`${last.x},${last.y},${last.h}`;
   if(this.pointerKey!==last.id||this.pointerAt!==positionKey){if(this.pointer){Tween.stopAllByTarget(this.pointer);this.pointer.destroy();}this.pointer=this.image('pointer',last.x,last.y-last.h/2-17,24,30,this.effectsRoot);const at=this.pointer.position.clone();tween(this.pointer).repeatForever(tween().to(.65,{position:new Vec3(at.x,at.y+5,0)},{easing:'sineInOut'}).to(.65,{position:at},{easing:'sineInOut'})).start();this.pointerKey=last.id;this.pointerAt=positionKey;}
   this.pointer?.setSiblingIndex(this.root.children.length-1);
  }else{this.pointer?.destroy();this.pointer=undefined;this.pointerKey='';}
  this.drawEffect(s);this.effectsRoot.setSiblingIndex(this.root.children.length-1);(window as any).__JINLING_TABLE_LAYOUT__=tiles;
 }
 private drawRacks(s:TableSceneState,tiles:SceneTile[]){
  this.racks.destroy();this.racks=this.make('Flower racks',640,295,1280,590);
  for(const rack of layoutFlowerRacks(tiles,s.me)){
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
 private drawTile(t:SceneTile){
  if(t.area!=='hand'||t.pose.startsWith('back-')){
   let shadow=this.shadows.get(t.id);if(!shadow){shadow=this.make('contact-'+t.id,t.x,t.y+2,t.w+3,t.h+3);shadow.addComponent(Graphics);this.shadows.set(t.id,shadow);}
   shadow.setPosition(t.x-640,295-t.y-2,0);const g=shadow.getComponent(Graphics)!;g.clear();
   for(let i=2;i>=0;i--){g.fillColor=new Color(i===0?'#03291c65':'#03291c1a');const contact=t.area==='hand'?{...t,y:t.y+t.h*.32,h:t.h*.28}:t;const points=tileFootprint(contact,t.area==='flower'?-i/2:i);g.moveTo(points[0][0]-t.x,t.y-points[0][1]);for(const pt of points.slice(1))g.lineTo(pt[0]-t.x,t.y-pt[1]);g.close();g.fill();}
   shadow.setSiblingIndex(this.root.children.length-1);
  }
  let n=this.nodes.get(t.id);if(!n){n=this.make(t.id,t.x,t.y,t.w,t.h);n.addComponent(Sprite);this.nodes.set(t.id,n);}
  n.getComponent(UITransform)!.setContentSize(t.w,t.h);n.setPosition(t.x-640,295-t.y,0);
  n.setRotationFromEuler(0,0,t.rotation||0);
  let pose=t.pose;
  const sp=n.getComponent(Sprite)!;sp.sizeMode=Sprite.SizeMode.CUSTOM;sp.spriteFrame=this.frames.get(pose+'-'+(t.tile===undefined?0:tileKind(t.tile)))||null;n.getComponent(UITransform)!.setContentSize(t.w,t.h);sp.color=new Color(t.selected||t.highlight?'#fff7b1':'#ffffff');
  n.off(Node.EventType.TOUCH_END);if(t.clickable&&t.tile!==undefined)n.on(Node.EventType.TOUCH_END,()=>this.emit({type:'select',tile:t.tile!}));n.setSiblingIndex(this.root.children.length-1);
 }
 private drawHud(s:TableSceneState){
  const h=this.hud;if(s.presentation!=='replay'){
  this.button(h,'‹ 大厅',83,43,94,39,{type:'menu',menu:'leave'});
  this.button(h,'牌',1135,35,39,39,{type:'menu',menu:'table'});
  this.button(h,'录',1181,35,39,39,{type:'menu',menu:'events'});
  this.button(h,'⚙',1227,35,39,39,{type:'menu',menu:'settings'});
  }this.text(h,s.presentation==='replay'?'牌局回放':s.practice?'单人练习':`好友桌 ${s.code}`,80,90,135,30,18);this.text(h,`第 ${s.round} / ${s.rounds} 局`,80,119,135,28,16,'#cfc291');
  for(const p of s.players){
   const o=sceneOffset(p.seat,s.me);
   if(o===2){this.plate(h,950,32,166,56,'#0b332ed9','#a7965b');const avatar=this.avatar(p.avatar,p.seat,892,32,44,44,h);if(s.presentation==='replay')avatar.on(Node.EventType.TOUCH_END,()=>this.emit({type:'menu',menu:'table',seat:p.seat}));this.text(h,p.name,963,20,91,24,18);this.text(h,`${p.score} 分`,963,43,92,22,18,GOLD);if(p.seat===s.dealer)this.text(h,'庄',1020,16,24,23,17,'#ffd374');continue;}
   const x=o===0?1198:o===3?68:1200,y=o===0?508:207;
   this.plate(h,x,y+25,100,126,'#0b332ed9','#a7965b');const avatar=this.avatar(p.avatar,p.seat,x,y,50,50,h);if(s.presentation==='replay')avatar.on(Node.EventType.TOUCH_END,()=>this.emit({type:'menu',menu:'table',seat:p.seat}));this.text(h,p.name,x,y+40,95,27,18);this.text(h,`${p.score} 分`,x,y+66,96,27,20,GOLD);if(p.seat===s.dealer)this.text(h,'庄',x+35,y-20,24,23,17,'#ffd374');
  }
  const center=this.make('center',640,282,1280,590,h);
  const g=this.make('compass',640,278,116,108,center).addComponent(Graphics);g.fillColor=new Color('#092724');g.roundRect(-61,-57,122,114,16);g.fill();g.fillColor=new Color('#283633');g.moveTo(-52,-45);g.lineTo(52,-45);g.lineTo(61,-28);g.lineTo(61,28);g.lineTo(43,50);g.lineTo(-43,50);g.lineTo(-61,28);g.lineTo(-61,-28);g.close();g.fill();g.strokeColor=new Color('#697264');g.lineWidth=2;g.stroke();g.fillColor=new Color('#09201e');g.roundRect(-30,-19,60,38,13);g.fill();
  const positions=[[640,317],[684,278],[640,240],[596,278]];for(let o=0;o<4;o++){const seat=(s.me+o)%4;this.text(center,['东','南','西','北'][seat],positions[o][0],positions[o][1],28,27,21,s.turn===seat?GOLD:'#c3ccc0');}
  this.text(center,s.countdown,640,278,57,36,s.countdown.length>=3?25:33,'#26ddf5');
  const flowers=Math.max(0,20-s.players.reduce((n,p)=>n+p.flowers.length,0));this.text(center,`余牌 ${s.remaining}`,548,265,60,27,15,'#deebd9');this.text(center,`余花 ${flowers}`,548,294,60,27,15,'#deebd9');this.text(center,'把数',732,262,60,23,16,'#a4c4b2');this.text(center,`${s.round} / ${s.rounds}`,732,290,60,29,21,GOLD);
  if(this.trusteeButton)this.trusteeButton.active=s.presentation!=='replay';
  if(s.presentation==='replay'){this.text(h,'点击头像切换视角',640,455,250,30,17,'#bdd2bd');h.setSiblingIndex(this.root.children.length-1);return;}
  const me=s.players.find(p=>p.seat===s.me)!,ended=['ended','finished'].includes(s.phase);
  this.trusteeCommand=ended?{type:'menu',menu:'result'}:{type:'trustee',enabled:!me.trustee};
  // Keep the touch target alive across countdown/state pushes. Rebuilding it
  // between TOUCH_START and TOUCH_END used to swallow the first cancellation.
  if(!this.trusteeButton){
   const n=this.button(this.root,'托管',1107,88,103,37,{type:'trustee',enabled:true});
   this.trusteeButton=n;this.trusteeLabel=n.children[0].getComponent(Label)!;
   n.off(Node.EventType.TOUCH_END);
   n.on(Node.EventType.TOUCH_END,()=>{if(this.trusteeCommand&&(!this.state?.trusteeDisabled||this.trusteeCommand.type==='menu'))this.emit(this.trusteeCommand);});
  }
  this.trusteeLabel!.string=ended?'本局结算':me.trustee?'取消托管':'托管';
  (this.trusteeButton.getComponent(UIOpacity)||this.trusteeButton.addComponent(UIOpacity)).opacity=!ended&&s.trusteeDisabled?130:255;
  this.trusteeButton.setSiblingIndex(this.root.children.length-1);
  const actionRow=layoutActions(s,layoutTable(s));
  actionRow.forEach(({action:a,x,y,w,h:height})=>this.button(h,a.label,x,y,w,height,{type:'action',action:a.id,tile:a.tile},true));

  if(s.hintKinds.length&&!s.actions.length){this.plate(h,639,447,Math.min(630,150+s.hintKinds.length*31),48,'#063f38ed','#bfb570');this.text(h,s.hintLabel,548,447,105,35,16,GOLD);s.hintKinds.forEach((k,i)=>this.image('own-'+k,609+i*31,446,29,42,h));}
  if(!s.connected)this.text(h,'正在重新连接…',640,397,330,35,23);
  h.setSiblingIndex(this.root.children.length-1);
 }
 private drawEffect(s:TableSceneState){
  const e=s.effects.find(e=>['pung','kong','hu'].includes(e.type));if(!e||e.key===this.lastEffect)return;this.lastEffect=e.key;
  const key=e.type==='kong'?(e.concealed?'concealed-kong':e.upgraded?'upgrade-kong':'kong'):e.type==='hu'&&e.selfDraw?'self-draw':e.type;
  const data=this.effectData.get(key);if(!data)return;
  const n=this.make('spine-'+key,640,300,280,280,this.effectsRoot),effect=n.addComponent(sp.Skeleton);
  effect.skeletonData=data;effect.premultipliedAlpha=false;effect.setCompleteListener(()=>n.destroy());effect.setAnimation(0,'activate',false);

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
