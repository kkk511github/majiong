import {useEffect,useRef,useState} from 'react';
/** Poll the server-adjusted clock without rerendering unless visible text
 * changes. No interval in the lobby, offline or while backgrounded. */
export function useVisibleClock(active:boolean,now:()=>number,signature:(at:number)=>string){
 const latest=useRef({now,signature});latest.current={now,signature};
 const [,tick]=useState(0);
 useEffect(()=>{
  let timer:ReturnType<typeof setInterval>|undefined,last=latest.current.signature(latest.current.now());
  const check=()=>{const s=latest.current.signature(latest.current.now());if(s!==last){last=s;tick(n=>n+1);}};
  const arm=()=>{clearInterval(timer);check();if(active&&!document.hidden)timer=setInterval(check,250);};
  arm();document.addEventListener('visibilitychange',arm);
  return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',arm);};
 },[active]);
 return now();
}
