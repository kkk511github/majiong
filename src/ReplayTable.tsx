import { useMemo } from 'react';
import type { RoundReplay, Seat } from '../shared/types';
import type { TableSceneState } from '../shared/table-scene';
import { kind } from '../shared/tiles';
import { ruleDisplayName } from '../shared/nanjing-rules';
import { CocosTable } from './CocosTable';

/** Completed-round snapshots use the same tile, rack and effect renderer as play.
 * No replay command is ever forwarded to the live game client. */
export function ReplayTable({data,step,perspective,setPerspective,reveal,animate,onSurfaceInteraction}:{
 data:RoundReplay;step:number;perspective:Seat;setPerspective:(seat:Seat)=>void;reveal:boolean;animate:boolean;onSurfaceInteraction?:()=>void;
}){
 const state=useMemo<TableSceneState>(()=>{
  const frame=data.frames[step],preceding=data.frames.slice(0,step+1).reverse();
  const discard=preceding.find(f=>f.type==='discard');
  const lastDiscard=discard?.seat!==undefined&&discard.tile!==undefined&&frame.players[discard.seat].discards.includes(discard.tile)?{seat:discard.seat,tile:discard.tile}:undefined;
  const event=preceding.find(f=>f.seat===perspective&&['draw','discard','pung','kong','concealedKong','addedKong'].includes(f.type));
  const drawn=event?.type==='draw'&&event.tile!==undefined&&frame.players[perspective].hand.includes(event.tile)?event.tile:undefined;
  const effectType=frame.type==='pung'?'pung':['kong','concealedKong','addedKong'].includes(frame.type)?'kong':undefined;
  return {
   key:data.id,revision:step,presentation:'replay',me:perspective,turn:frame.turn,dealer:data.frames[0].turn,
   phase:frame.result?'ended':'playing',code:data.code,round:data.round,rounds:data.rules?.rounds,remaining:frame.remaining,
   rulesName:ruleDisplayName(data.rules),roundMultiplier:data.multiplier,
   countdown:animate?'▶':'Ⅱ',connected:true,disabled:true,practice:false,canDiscard:false,selected:null,drawn,inspectedKind:null,hintKinds:[],hintLabel:'',actions:[],trusteeDisabled:true,lastDiscard,
   effects:animate&&effectType?[{key:`${data.id}:${step}:${perspective}`,type:effectType,seat:frame.seat??frame.result?.winners[0]??frame.turn,concealed:frame.type==='concealedKong',upgraded:frame.type==='addedKong',selfDraw:frame.result?.from===undefined}]:[],
   players:frame.players.map((p,seat)=>({name:data.names[seat],seat,score:p.score,bot:false,trustee:false,handCount:p.hand.length,
    hand:seat===perspective||reveal||!!frame.result?[...p.hand].sort((a,b)=>kind(a)-kind(b)||a-b):[],flowers:[...p.flowers],discards:[...p.discards],melds:p.melds.map(m=>({...m,tiles:m.concealed?m.tiles.slice(0,1):[...m.tiles]}))})),
  };
 },[data,step,perspective,reveal,animate]);
 const result=data.frames[step].result;
 return <div className="replay-cocos" aria-label="四家牌桌录像">
  <CocosTable embedded state={state} winResult={result?.winners.length?result:undefined} onSurfaceInteraction={onSurfaceInteraction} onCommand={command=>{if(command.type==='menu'&&command.menu==='table'&&command.seat!==undefined&&command.seat>=0&&command.seat<4)setPerspective(command.seat as Seat);}} />
 </div>;
}
