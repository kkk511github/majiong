import {Node,Sprite,SpriteFrame,UITransform,UIOpacity,Label,Color,Graphics,tween,Tween,Vec3} from 'cc';
import {ACTION_TIMING,actionPose,ActionCueMemory,type ActionCue,type ActionKind} from './action-presentation';
import {confirmedActionAnchor,actionCaptionAnchor,actionEffectBounds,type ActionRect} from './action-anchors';
import type {TableSceneState,SceneTile} from './table-scene';
type Slot={root:Node;glyph:Node;ink:Node;contact:Node;name:Label;tag:Label;nameShadow:Label;tagShadow:Label;cue?:ActionCue;kind?:ActionKind;progress:{ms:number};animation?:Tween<{ms:number}>;sounded:boolean;rect:ActionRect};
/** Four reusable, player-owned presentation slots. No timers, game writes or
 * global animation stopping. Every effect ends at its configured deadline. */
export class TableActionEffects{
 private memory=new ActionCueMemory();private slots=new Map<number,Slot>();
 private prior?:{context:string;revision:number;connected:boolean;at:number};
 private state?:TableSceneState;
 private layoutToken?:unknown;private safeKey='';
 constructor(private parent:Node,private frames:Map<string,SpriteFrame>,private impact:(cue:ActionCue)=>void,private complete:(cue:ActionCue)=>void){}
 private node(parent:Node,name:string,w:number,h:number){const n=new Node(name);n.layer=parent.layer;n.parent=parent;n.addComponent(UITransform).setContentSize(w,h);n.addComponent(UIOpacity);return n;}
 private slot(seat:number){let slot=this.slots.get(seat);if(slot)return slot;
  const root=this.node(this.parent,`confirmed-action-${seat}`,204,192),ink=this.node(root,'separate-ink-strokes',150,100),contact=this.node(root,'contact-accent',100,10),glyph=this.node(root,'action-glyph',112,112);
  glyph.addComponent(Sprite).sizeMode=Sprite.SizeMode.CUSTOM;
  const caption=(name:string,y:number)=>{const n=this.node(root,name,140,20);n.setPosition(0,y);const l=n.addComponent(Label);l.fontSize=17;l.lineHeight=20;l.color=new Color('#f2efdb');l.horizontalAlign=Label.HorizontalAlign.CENTER;l.overflow=Label.Overflow.SHRINK;return l;};
  const nameShadow=caption('action-player-shadow',-60),name=caption('action-player',-59),tagShadow=caption('action-tag-shadow',-79),tag=caption('action-confirmed-tag',-78);
  nameShadow.color=tagShadow.color=new Color('#062c25c8');tagShadow.fontSize=tag.fontSize=13;tag.color=new Color('#e1d3a6');
  slot={root,glyph,ink,contact,name,tag,nameShadow,tagShadow,progress:{ms:0},sounded:false,rect:{x:0,y:0,w:132,h:102}};root.active=false;this.slots.set(seat,slot);return slot;
 }
 private stop(slot:Slot){slot.animation?.stop();slot.animation=undefined;slot.root.active=false;slot.cue=undefined;slot.kind=undefined;slot.progress.ms=0;slot.sounded=false;slot.root.setScale(1,1,1);}
 reset(events:readonly ActionCue[]=[]){for(const s of this.slots.values())this.stop(s);this.memory.reset(events);this.prior=undefined;}
 render(state:TableSceneState,tiles:readonly SceneTile[],layoutToken?:unknown){
  this.state=state;const context=`${state.key}:${state.round}:${state.me}:${state.presentation??'live'}`,prior=this.prior,delta=state.revision-(prior?.revision??0);
  const continuous=!!prior&&prior.context===context&&state.connected&&prior.connected&&!document.hidden&&delta>=0&&(state.presentation==='replay'?delta<=1:delta<=3&&(delta<=1||performance.now()-prior.at<1800));
  if(!continuous){for(const slot of this.slots.values())this.stop(slot);this.memory.reset(state.effects);}
  const fresh=this.memory.consume(state.effects,continuous);
  this.prior={context,revision:state.revision,connected:state.connected,at:performance.now()};
  for(const cue of fresh){
   if(!state.players.some(p=>p.seat===cue.seat))continue;
   const slot=this.slot(cue.seat),rank={pung:1,kong:2,hu:3},kind=cue.type as ActionKind;
   if(slot.root.active&&slot.kind&&rank[slot.kind]>rank[kind])continue;
   this.stop(slot);slot.cue=cue;slot.kind=kind;slot.root.active=true;
   const sprite=slot.glyph.getComponent(Sprite)!;sprite.spriteFrame=this.frames.get('action-'+kind)??null;sprite.color=new Color(kind==='hu'?'#fff0cb':'#ffffff');
   slot.name.string=state.players.find(p=>p.seat===cue.seat)?.name??'';
   slot.tag.string=kind==='kong'?(cue.concealed?'暗杠':cue.upgraded?'补杠':'明杠'):kind==='hu'?(cue.label&&cue.label!=='胡'?cue.label:cue.selfDraw?'自摸':'胡牌'):'';
   slot.nameShadow.string=slot.name.string;slot.tagShadow.string=slot.tag.string;
   const ink=slot.ink.getComponent(Graphics)??slot.ink.addComponent(Graphics);ink.clear();ink.strokeColor=new Color('#c9b985');ink.fillColor=new Color('#c9b985');ink.lineWidth=2;
   if(kind==='pung'){for(const sign of [-1,1]){ink.moveTo(sign*61,-3);ink.lineTo(sign*33,2);ink.lineTo(sign*38,-2);ink.close();ink.fill();}}
   else if(kind==='kong'){ink.moveTo(-46,-24);ink.lineTo(-15,-21);ink.moveTo(15,-21);ink.lineTo(46,-24);ink.stroke();}
   else{ink.moveTo(-48,-15);ink.bezierCurveTo(-60,20,-28,37,0,34);ink.moveTo(0,-32);ink.bezierCurveTo(32,-33,54,-15,48,12);ink.stroke();}
   const contact=slot.contact.getComponent(Graphics)??slot.contact.addComponent(Graphics);contact.clear();contact.fillColor=new Color('#e9ddad');contact.roundRect(-28,-1,56,2,1);contact.fill();slot.contact.setPosition(0,-29);
   this.paint(slot);
   slot.animation=tween(slot.progress).to(ACTION_TIMING[kind].duration/1000,{ms:ACTION_TIMING[kind].duration},{onUpdate:()=>this.paint(slot)}).call(()=>{if(slot.cue?.key!==cue.key)return;this.stop(slot);this.complete(cue);}).start();
  }
  const safeKey=JSON.stringify(state.safeArea??{}),reposition=fresh.length>0||!continuous||layoutToken===undefined||layoutToken!==this.layoutToken||safeKey!==this.safeKey;
  this.layoutToken=layoutToken;this.safeKey=safeKey;
  for(const [seat,slot]of this.slots)if(slot.root.active&&reposition){
   const anchor=confirmedActionAnchor(state,seat,tiles,slot.kind!),caption=actionCaptionAnchor(state,seat,tiles,anchor),scale=anchor.w/204;slot.rect=actionEffectBounds(state,seat,tiles,slot.kind!,anchor,caption);
   slot.root.setPosition(anchor.x-640,295-anchor.y);slot.root.setScale(scale,scale,1);
   const x=(caption.x-anchor.x)/scale,y=(anchor.y-caption.y)/scale;
   for(const label of [slot.name,slot.nameShadow,slot.tag,slot.tagShadow])label.node.getComponent(UITransform)!.setContentSize(caption.w/scale,20);
   slot.name.node.setPosition(x,y+9);slot.nameShadow.node.setPosition(x+.6,y+8);
   slot.tag.node.setPosition(x,y-10);slot.tagShadow.node.setPosition(x+.6,y-11);
  }
 }
 private paint(s:Slot){
  if(!s.root.isValid||!s.kind||!s.cue)return;
  const reduced=this.state?.simplifiedEffects||window.matchMedia('(prefers-reduced-motion: reduce)').matches,p=actionPose(s.kind,s.progress.ms,!!reduced);
  s.glyph.setScale(p.scale,p.scale,1);s.glyph.setPosition(0,-p.y+10);s.glyph.getComponent(UIOpacity)!.opacity=p.alpha*255;
  s.ink.getComponent(UIOpacity)!.opacity=p.ink*140;s.ink.setScale(p.spread,1,1);s.contact.getComponent(UIOpacity)!.opacity=p.contact*140;
  s.name.node.getComponent(UIOpacity)!.opacity=p.alpha*255;s.tag.node.getComponent(UIOpacity)!.opacity=p.alpha*255;
  s.nameShadow.node.getComponent(UIOpacity)!.opacity=p.alpha*255;s.tagShadow.node.getComponent(UIOpacity)!.opacity=p.alpha*255;
  if(!s.sounded&&s.progress.ms>=ACTION_TIMING[s.kind].impact){s.sounded=true;this.impact(s.cue);}
 }
 destroy(){for(const s of this.slots.values()){this.stop(s);s.root.destroy();}this.slots.clear();this.memory.reset();}
}
