import {useEffect,type ComponentProps} from 'react';
import {CocosTable} from './CocosTable';
import {useVisibleClock} from './useVisibleClock';
import {decisionCountdown} from '../shared/timing';
import type {View} from '../shared/types';
import {gameAudio} from './audio';

/** Live countdowns update only the table subtree, not the entire app. */
export function LiveCocosTable({view,paused,now,...props}:ComponentProps<typeof CocosTable>&{view:View;paused:boolean;now:()=>number}){
 const timed=['playing','claiming'].includes(view.phase)&&view.rules.turnSeconds>0;
 const at=useVisibleClock(timed&&props.state.connected&&!paused&&!view.openingGate,now,t=>JSON.stringify(decisionCountdown(view,t)));
 const clock=timed?decisionCountdown(view,at):{seconds:0,overtime:false};
 const mine=view.players[view.me];
 useEffect(()=>{
  if(props.state.connected&&!paused&&!view.openingGate&&(view.canDiscard||view.actions.length)&&!mine?.trustee&&clock.seconds>0&&clock.seconds<=5)gameAudio.play('warning');
 },[props.state.connected,paused,view.openingGate,view.canDiscard,view.actions.length,mine?.trustee,clock.seconds,view.deadline]);
 const waiting=view.phase==='claiming'&&!view.actions.length&&clock.overtime;
 const countdown=!props.state.connected||paused||!timed?'—':view.openingGate||waiting?'…':String(clock.seconds).padStart(2,'0');
 const timerVisible=props.state.connected&&!paused&&timed&&!view.openingGate&&!waiting;
 return <>
  {timerVisible&&<span className="sr-only" role="timer" aria-label={`${clock.overtime?'超时':view.phase==='claiming'?'选择':'出牌'}剩余${clock.seconds}秒`}>{countdown}</span>}
  <CocosTable {...props} state={{...props.state,countdown}}/>
 </>;
}
