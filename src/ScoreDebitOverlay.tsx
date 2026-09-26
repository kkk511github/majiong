import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { sceneOffset, type TableSceneState } from "../shared/table-scene";
import { isDiscardPenalty, scoreDebitDuration, type ScoreDebit } from "./score-debits";
import { scoreDebitPosition, DEBIT_HEIGHT, DEBIT_WIDTH, DEBIT_RISE, type DebitObstacle } from "./score-debit-layout";
import { tableOverlayLayout } from "./table-overlay-layout";
import "./score-debits.css";

export function ScoreDebitOverlay({
  state,
  events,
}: {
  state: TableSceneState;
  events: ScoreDebit[];
}) {
  const ref = useRef<HTMLDivElement>(null);
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
  const occupied: DebitObstacle[] = [...controls];
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
        events.map((event) => {
          const position = scoreDebitPosition(state, event.seat, occupied);
          if (!position || !frame.scale) return null;
          occupied.push({ ...position, y:position.y-DEBIT_RISE/2, w:DEBIT_WIDTH, h:DEBIT_HEIGHT+DEBIT_RISE });
          const name =
            state.players.find((p) => p.seat === event.seat)?.name ?? "牌友";
          return (
            <div
              key={event.key}
              className="score-debit-anchor"
              data-seat={event.seat}
              data-relative-seat={sceneOffset(event.seat, state.me)}
              style={
                {
                  left: frame.left + position.x * frame.scale,
                  top: frame.top + position.y * frame.scale,
                  transform: `translate(-50%,-50%) scale(${frame.scale})`,
                  "--debit-duration": `${scoreDebitDuration(event)}ms`,
                } as CSSProperties
              }
            >
              <div
                className={`score-debit${isDiscardPenalty(event) ? " score-debit-penalty" : ""}`}
                aria-label={`${name} · ${event.label}扣${event.amount}分`}
              >
                {isDiscardPenalty(event) && <small aria-hidden="true">{name}</small>}
                <strong aria-hidden="true">−{event.amount}</strong>
                <span aria-hidden="true">{event.label}</span>
              </div>
            </div>
          );
        })}
    </div>
  );
}
