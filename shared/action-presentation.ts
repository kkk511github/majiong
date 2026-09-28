/** Presentation only. Never use these timings to gate a turn or settle a hand. */
export const ACTION_TIMING={
 press:90,release:100,pass:150,touchGuard:180,
 pung:{duration:1200,impact:155,travel:155,hold:900},
 kong:{duration:1450,impact:220,travel:220,hold:1120},
 hu:{duration:1120,impact:260,travel:260,hold:850},
 insertion:420,
 debit:{regular:1800,penalty:3600},
 completionGrace:600,
} as const;
export type ActionKind='pung'|'kong'|'hu';
export const ACTION_SIZE={pung:{w:190,h:178},kong:{w:202,h:192},hu:{w:220,h:208}} as const;
export type ActionCue={key:string;type:string;seat:number;concealed?:boolean;upgraded?:boolean;selfDraw?:boolean;label?:string};
export const actionKind=(id:string):ActionKind|'pass'|undefined=>id==='selfKong'?'kong':(['pung','kong','hu','pass'].includes(id)?id as ActionKind|'pass':undefined);
const clamp=(v:number)=>Math.max(0,Math.min(1,v));
const lerp=(a:number,b:number,t:number)=>a+(b-a)*clamp(t);
/** Distinct bounded timelines sampled by Cocos. No infinite ambient animation. */
export function actionPose(kind:ActionKind,elapsed:number,reduced=false){
 const timing=ACTION_TIMING[kind],t=Math.max(0,elapsed),fade=clamp((timing.duration-t)/(timing.duration-timing.hold));
 if(reduced)return{scale:1,y:0,alpha:Math.min(clamp(t/70),fade),ink:0,spread:1,contact:0};
 const alpha=Math.min(clamp(t/70),fade);
 const shrink=lerp(1,.45,(t-timing.hold)/(timing.duration-timing.hold));
 if(kind==='pung')return{scale:(t<100?lerp(1.28,1.06,t/100):lerp(1.06,1,(t-100)/80))*shrink,y:0,alpha,ink:clamp(t/70)*clamp((340-t)/160),spread:lerp(1.42,1,t/155),contact:clamp(1-Math.abs(t-155)/65)};
 if(kind==='kong')return{scale:lerp(1.35,1,t/300)*shrink,y:t<90?lerp(-6,-12,t/90):t<220?lerp(-12,0,(t-90)/130):t<265?lerp(0,-2,(t-220)/45):lerp(-2,0,(t-265)/70),alpha,ink:clamp((t-160)/60)*clamp((475-t)/200),spread:lerp(.45,1.15,(t-170)/110),contact:clamp(1-Math.abs(t-220)/100)};
 return{scale:lerp(1.45,1,(t-95)/265)*shrink,y:t<260?lerp(5,0,t/260):0,alpha:t<95?0:Math.min(clamp((t-95)/100),fade),ink:clamp(t/130)*clamp((760-t)/240),spread:lerp(.35,1,t/260),contact:clamp(1-Math.abs(t-260)/120)};
}
/** Bounded deduplication. Reset consumes a restored snapshot instead of replaying it. */
export class ActionCueMemory{
 private seen=new Set<string>();
 consume(events:readonly ActionCue[],play:boolean){
  const fresh:ActionCue[]=[];
  for(const cue of events){if(this.seen.has(cue.key))continue;this.seen.add(cue.key);if(play&&['pung','kong','hu'].includes(cue.type))fresh.push(cue);}
  while(this.seen.size>96)this.seen.delete(this.seen.values().next().value!);
  const rank={pung:1,kong:2,hu:3};
  return fresh.filter((cue,i)=>!fresh.some((other,j)=>other.seat===cue.seat&&(rank[other.type as ActionKind]>rank[cue.type as ActionKind]||rank[other.type as ActionKind]===rank[cue.type as ActionKind]&&j>i)));
 }
 reset(events:readonly ActionCue[]=[]){this.seen.clear();this.consume(events,false);}
}
