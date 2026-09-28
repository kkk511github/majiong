import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { sceneOffset, layoutTable, type TableSceneState } from "../shared/table-scene";
import { isDiscardPenalty, scoreDebitDuration, scoreDebitTone, type ScoreDebit } from "./score-debits";
import {actionEffectBounds} from '../shared/action-anchors';
import type {ActionKind} from '../shared/action-presentation';
import { scoreDebitPosition, DEBIT_HEIGHT, DEBIT_WIDTH, DEBIT_RISE, type DebitObstacle } from "./score-debit-layout";
import { tableOverlayLayout } from "./table-overlay-layout";
import "./score-debits.css";

export function ScoreDebitOverlay({
  state,
  events,
  completedActions,
}: {
  state: TableSceneState;
  events: ScoreDebit[];
  completedActions?:ReadonlySet<string>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const retained=useRef(new Map<string,{x:number;y:number}>());
  const [frame, setFrame] = useState({ left: 0, top: 0, scale: 0 });
  const [controls, setControls] = useState<DebitObstacle[]>([]);
  useLayoutEffect(() => {
    const host = ref.current?.parentElement,
      iframe = host?.querySelector("iframe");
    if (!host || !iframe) return;
    const resize = () =>
      setFrame(
        tableOverlayLayout(
          host.getBoundingClientRect(),
          iframe.getBoundingClientRect(),
          state.safeArea,
          state.tableStyle,
        ),
      );
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    observer.observe(iframe);
    resize();
    return () => observer.disconnect();
  }, [state.safeArea, state.tableStyle]);
  useLayoutEffect(() => {
    const host = ref.current?.parentElement;
    if (!host || !frame.scale) return;
    const bounds = host.getBoundingClientRect();
    setControls(
      Array.from(
        host.querySelectorAll<HTMLElement>(
          ".table-claim-actions,.table-claim-source,.mahjong-hint-layer section,.table-toolbar button,.room-communication-tools,.room-communication-panel",
        ),
      )
        .filter((el) => el.getClientRects().length)
        .map((el) => {
          const r = el.getBoundingClientRect();
          return {
            x: (r.left - bounds.left - frame.left + r.width / 2) / frame.scale,
            y: (r.top - bounds.top - frame.top + r.height / 2) / frame.scale,
            w: r.width / frame.scale,
            h: r.height / frame.scale,
          };
        }),
    );
  }, [frame, state]);
  const visibleEvents=events.filter(e=>!e.waiting);
  const tiles=visibleEvents.length?layoutTable(state):[];
  const occupied: DebitObstacle[] = [...controls,...(visibleEvents.length?state.effects:[]).filter(e=>['pung','kong','hu'].includes(e.type)&&!completedActions?.has(e.key)).map(e=>actionEffectBounds(state,e.seat,tiles,e.type as ActionKind))];
  const keys=new Set(events.map(e=>e.key));for(const key of retained.current.keys())if(!keys.has(key))retained.current.delete(key);
  return (
    <div
      ref={ref}
      className="score-debit-layer"
      role="status"
      aria-label="本次扣分"
      aria-live="polite"
      aria-atomic="true"
    >
      {state.connected &&
        state.presentation !== "replay" &&
        visibleEvents.map((event) => {
          let scale=Math.max(frame.scale,.7),ratio=frame.scale?scale/frame.scale:1;
          let metrics={w:DEBIT_WIDTH*ratio,h:DEBIT_HEIGHT*ratio};
          let position = scoreDebitPosition(state, event.seat, occupied,retained.current.get(event.key),metrics,tiles);
          if(!position){scale=frame.scale;ratio=1;metrics={w:DEBIT_WIDTH,h:DEBIT_HEIGHT};position=scoreDebitPosition(state,event.seat,occupied,undefined,metrics,tiles);}
          if (!position || !frame.scale) return null;
          retained.current.set(event.key,position);
          occupied.push({ ...position, y:position.y-DEBIT_RISE/2, w:metrics.w*1.08, h:metrics.h*1.08+DEBIT_RISE });
          const name =
            state.players.find((p) => p.seat === event.seat)?.name ?? "牌友";
          return (
            <div
              key={event.key}
              className="score-debit-anchor"
              data-seat={event.seat}
              data-relative-seat={sceneOffset(event.seat, state.me)}
              data-reason={event.label}
              data-tone={scoreDebitTone(event)}
              data-reduced={state.simplifiedEffects||undefined}
              style={
                {
                  left: frame.left + position.x * frame.scale,
                  top: frame.top + position.y * frame.scale,
                  transform: `translate(-50%,-50%) scale(${scale})`,
                  "--debit-duration": `${scoreDebitDuration(event)}ms`,
                  "--debit-number-size": `${Math.min(40,100/((String(event.amount).length+.6)*.62))}px`,
                } as CSSProperties
              }
            >
              <div
                className={`score-debit${isDiscardPenalty(event) ? " score-debit-penalty" : ""}`}
                aria-label={`${name} · ${event.label}扣${event.amount}分`}
              >
                <small className="score-debit-player" aria-hidden="true">{name}</small>
                <strong aria-hidden="true"><em>−</em>{event.amount}</strong>
                <span className="score-debit-reason" aria-hidden="true">{event.label}</span>
              </div>
            </div>
          );
        })}
    </div>
  );
}
