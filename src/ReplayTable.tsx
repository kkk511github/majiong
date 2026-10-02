import { useMemo } from 'react';
import type { RoundReplay, Seat } from '../shared/types';
import type { TableSceneState } from '../shared/table-scene';
import { replayHand } from './replay-hand';
import { ruleDisplayName } from '../shared/nanjing-rules';
import { CocosTable } from './CocosTable';
import { avatarURL } from './game-client';

/** Completed-round snapshots use the same tile, rack and effect renderer as play.
 * No replay command is ever forwarded to the live game client. */
export function ReplayTable({data,step,perspective,setPerspective,reveal,animate,speed=1,onSurfaceInteraction,onEntryBusyChange}:{
 data:RoundReplay;step:number;perspective:Seat;setPerspective:(seat:Seat)=>void;reveal:boolean;animate:boolean;speed?:number;onSurfaceInteraction?:()=>void;onEntryBusyChange?:(busy:boolean)=>void;
}){
 const state=useMemo<TableSceneState>(()=>{
  const frame=data.frames[step],preceding=data.frames.slice(0,step+1).reverse();
  const discard=preceding.find(f=>f.type==='discard');
  const lastDiscard=discard?.seat!==undefined&&discard.tile!==undefined&&frame.players[discard.seat].discards.includes(discard.tile)?{seat:discard.seat,tile:discard.tile}:undefined;
  const hands=frame.players.map((_,seat)=>replayHand(data.frames,step,seat as Seat,seat===perspective||reveal||!!(frame.result?.reason==='hu'&&frame.result.winners.includes(seat as Seat))));
  const drawn=hands[perspective].drawn;
  const effectType=frame.type==='pung'?'pung':['kong','concealedKong','addedKong'].includes(frame.type)?'kong':frame.type==='finish'&&frame.result?.winners.length?'hu':undefined;
  return {
   globalAnchorDiscards:frame.globalAnchorDiscards??[],
   revealedWinners:frame.result?.reason==='hu'?frame.result.winners:[],
   key:data.id,revision:step,presentation:'replay',me:perspective,turn:frame.turn,dealer:data.frames[0].turn,
   replayPlaying:animate,replaySpeed:speed,replayReveal:reveal,
   phase:frame.result?'ended':'playing',code:data.code,round:data.round,rounds:data.rules?.rounds,remaining:frame.remaining,
   rulesName:ruleDisplayName(data.rules),roundMultiplier:data.multiplier,
   countdown:animate?'▶':'Ⅱ',connected:true,disabled:true,practice:false,canDiscard:false,selected:null,drawn,inspectedKind:null,hintKinds:[],hintLabel:'',actions:[],trusteeDisabled:true,lastDiscard,
   effects:animate&&effectType?(effectType==='hu'?frame.result!.winners:[frame.seat??frame.turn]).map(seat=>({key:`${data.id}:${step}:${perspective}:${seat}`,type:effectType,seat,concealed:frame.type==='concealedKong',upgraded:frame.type==='addedKong',selfDraw:frame.result?.from===undefined})):[],
   players:frame.players.map((p,seat)=>({name:data.names[seat],avatar:avatarURL(data.avatars?.[seat]),seat,score:p.score,bot:false,trustee:false,handCount:p.hand.length,
    ...hands[seat],flowers:[...p.flowers],discards:[...p.discards],melds:p.melds.map(m=>({...m,tiles:m.concealed?m.tiles.slice(0,1):[...m.tiles]}))})),
  };
 },[data,step,perspective,reveal,animate,speed]);
 const result=data.frames[step].result;
 return <div className="replay-cocos" aria-label="四家牌桌录像">
  <CocosTable embedded state={state} winResult={result?.winners.length?result:undefined} onEntryBusyChange={onEntryBusyChange} onSurfaceInteraction={onSurfaceInteraction} onCommand={command=>{if(command.type==='menu'&&command.menu==='table'&&command.seat!==undefined&&command.seat>=0&&command.seat<4)setPerspective(command.seat as Seat);}} />
 </div>;
}
