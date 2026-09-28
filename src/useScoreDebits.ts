import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { View } from "../shared/types";
import { scoreDebitDuration, scoreDebits, type ScoreDebit } from "./score-debits";
import {gameFeedback} from './game-feedback';
import {ACTION_TIMING,type ActionKind} from '../shared/action-presentation';

/** Per-player queues keep rapid successive payments legible without replaying on reconnect. */
export function useScoreDebits(
  view: View | null,
  live: boolean,
  ready: boolean,
  completedActions?:ReadonlySet<string>,
) {
  const before = useRef<View | null>(null);
  const [visible, setVisible] = useState(!document.hidden);
  const [queue, setQueue] = useState<ScoreDebit[]>([]);
  const timers = useRef(new Map<string, {handle:ReturnType<typeof setTimeout>;phase:'wait'|'show'}>());
  const actions=useRef(new Map<number,NonNullable<ScoreDebit['afterAction']>>());
  useEffect(() => {
    const change = () => {
      before.current = null;
      actions.current.clear();
      setQueue(old=>old.length?[]:old);
      setVisible(!document.hidden);
    };
    document.addEventListener("visibilitychange", change);
    return () => {
      document.removeEventListener("visibilitychange", change);
      timers.current.forEach(t=>clearTimeout(t.handle));
      timers.current.clear();
    };
  }, []);
  useLayoutEffect(() => {
    if (!live || !visible || !view) {
      before.current = null;
      actions.current.clear();
      setQueue(old=>old.length?[]:old);
      return;
    }
    const prior = before.current;
    const sameTable = prior?.id === view.id && prior.me === view.me;
    if (sameTable && view.revision <= prior.revision) return;
    const now=performance.now();
    if(!sameTable||prior?.round!==view.round)actions.current.clear();
    for(const cue of gameFeedback(prior,view))if(['pung','kong','hu'].includes(cue.type))actions.current.set(cue.seat,{key:cue.key,seat:cue.seat,fallbackAt:now+ACTION_TIMING[cue.type as ActionKind].duration+(completedActions?ACTION_TIMING.completionGrace:80)});
    for(const [seat,action]of actions.current)if(action.fallbackAt<=now)actions.current.delete(seat);
    const transfers=view.roundTransfers?.slice(prior?.round===view.round?(prior.roundTransfers?.length??0):0)??[];
    const fresh = scoreDebits(prior, view).map(event=>{
      if(!['明杠','暗杠','补杠','花杠'].includes(event.label))return event;
      const transfer=transfers.filter(t=>t.from===event.seat&&(t.reason==='直杠'?'明杠':t.reason)===event.label&&actions.current.has(t.to)).sort((a,b)=>actions.current.get(b.to)!.fallbackAt-actions.current.get(a.to)!.fallbackAt)[0];
      return transfer?{...event,afterAction:actions.current.get(transfer.to)}:event;
    });
    before.current = view;
    if (!sameTable || prior.round !== view.round) setQueue(fresh);
    else setQueue(old=>{
      let changed=fresh.length>0;const next=old.map(event=>{const wait=event.afterAction,newest=wait&&actions.current.get(wait.seat);if(wait&&newest&&wait.key!==newest.key&&!completedActions?.has(wait.key)&&wait.fallbackAt>now){changed=true;return{...event,afterAction:newest};}return event;});
      return changed?[...next,...fresh]:old;
    });
  }, [view, live, visible]);
  const current = useMemo(
    () =>
      queue.filter(
        (event, index) =>
          queue.findIndex((other) => other.seat === event.seat) === index,
      ).map(event=>({...event,waiting:!!event.afterAction&&!completedActions?.has(event.afterAction.key)&&performance.now()<event.afterAction.fallbackAt})),
    [queue,completedActions],
  );
  useEffect(() => {
    const active = new Set(
      ready && live && visible ? current.map((event) => event.key) : [],
    );
    for (const [key, timer] of timers.current)
      if (!active.has(key)) {
        clearTimeout(timer.handle);
        timers.current.delete(key);
      }
    for (const key of active){
      const event=current.find(e=>e.key===key)!,phase=event.waiting?'wait':'show',old=timers.current.get(key);
      if(old?.phase===phase)continue;if(old)clearTimeout(old.handle);
        timers.current.set(
          key,
          {phase,handle:setTimeout(() => {
            timers.current.delete(key);
            setQueue(old=>phase==='wait'?old.some(e=>e.key===key)?[...old]:old:old.filter(e=>e.key!==key));
          }, phase==='wait'?Math.max(1,event.afterAction!.fallbackAt-performance.now()):scoreDebitDuration(event))},
        );
    }
  }, [current, ready, live, visible]);
  return live && visible ? current : [];
}
