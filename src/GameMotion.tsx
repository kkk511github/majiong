import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import type { View } from "../shared/types";
import { gameFeedback, type GameFeedback } from "./game-feedback";
import "./game-motion.css";

/** One short batch, never a queue: reconnecting must not replay old turns. */
export function useGameMotion(view: View | null, live: boolean) {
  const before = useRef<View | null>(null);
  const [visible, setVisible] = useState(!document.hidden);
  const [events, setEvents] = useState<GameFeedback[]>([]);
  const timeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    const change = () => {
      before.current = null;
      setEvents([]);
      setVisible(!document.hidden);
    };
    document.addEventListener("visibilitychange", change);
    return () => {
      document.removeEventListener("visibilitychange", change);
      clearTimeout(timeout.current);
    };
  }, []);
  useEffect(() => {
    if (!live || !visible) {
      before.current = null;
      setEvents([]);
      clearTimeout(timeout.current);
      return;
    }
    const fresh = gameFeedback(before.current, view);
    before.current = view;
    if (!fresh.length) return;
    setEvents(fresh);
    clearTimeout(timeout.current);
    timeout.current = setTimeout(() => setEvents([]), 1050);
  }, [view, live, visible]);
  return events;
}

/** Animate only artwork; layout and touch targets always use confirmed final positions. */
export function useHandMotion(view: View | null, live: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const previous = useRef<{
    id: string;
    round: number;
    width: number;
    tiles: Map<string, number>;
  } | null>(null);
  const animations = useRef<Animation[]>([]);
  useLayoutEffect(() => {
    const hand = ref.current;
    if (!hand || !view) {
      previous.current = null;
      return;
    }
    const elements = Array.from(
      hand.querySelectorAll<HTMLElement>(":scope > [data-tile]"),
    );
    const tiles = new Map(
      elements.map((tile) => [
        tile.dataset.tile!,
        tile.getBoundingClientRect().left,
      ]),
    );
    const old = previous.current;
    previous.current = {
      id: view.id,
      round: view.round,
      width: hand.getBoundingClientRect().width,
      tiles,
    };
    animations.current.forEach((a) => a.cancel());
    animations.current = [];
    if (
      !old ||
      !live ||
      document.hidden ||
      matchMedia("(prefers-reduced-motion: reduce)").matches ||
      old.id !== view.id ||
      old.round !== view.round ||
      Math.abs(
        old.width - hand.getBoundingClientRect().width,
      ) > 2
    )
      return;
    if (Array.from(tiles.keys()).join() === Array.from(old.tiles.keys()).join())
      return;
    for (const tile of elements) {
      const art = tile.querySelector<HTMLElement>(".tile-art");
      if (!art?.animate) continue;
      const from = old.tiles.get(tile.dataset.tile!);
      const dx =
        from === undefined ? 0 : (from - tile.getBoundingClientRect().left) / (hand.getBoundingClientRect().width / hand.offsetWidth || 1);
      if (from !== undefined && Math.abs(dx) < 1) continue;
      const animation = art.animate(
        from === undefined
          ? [
              { transform: "translateY(14px) scale(.94)", opacity: 0.35 },
              { transform: "translateY(0) scale(1)", opacity: 1 },
            ]
          : [
              { transform: `translateX(${dx}px)` },
              { transform: "translateX(0)" },
            ],
        {
          duration: from === undefined ? 250 : 190,
          easing: "cubic-bezier(.2,.8,.25,1)",
        },
      );
      animations.current.push(animation);
    }
  }, [view, live]);
  useEffect(() => () => animations.current.forEach((a) => a.cancel()), []);
  return ref;
}

export function GameMotion({
  events,
  view,
}: {
  events: GameFeedback[];
  view: View;
}) {
  // The table result dialog carries the win animation; it must open without an artificial delay.
  if (view.result) return null;
  // Flower replacement is announced by voice; only claimed sets get a visual callout.
  const strongest = events.filter(
    (event) => event.type === "pung" || event.type === "kong",
  );
  return (
    <div className="table-motion-layer" aria-hidden="true">
      {strongest.map((event) => (
        <div
          key={event.key}
          className={`table-action-feedback feedback-${(event.seat - view.me + 4) % 4} feedback-${event.type}`}
        >
          <span className="call-burst">
            {Array.from({ length: 8 }, (_, i) => (
              <i key={i} style={{ "--ray": i } as CSSProperties} />
            ))}
          </span>
          <strong>
            {event.type === "pung"
              ? "碰"
              : event.type === "kong"
                ? event.concealed
                  ? "暗杠"
                  : event.upgraded
                    ? "补杠"
                    : "杠"
                : "补花"}
          </strong>
          <small>
            {event.type === "flower"
              ? `+${event.count} 花`
              : view.players[event.seat]?.name}
          </small>
        </div>
      ))}
    </div>
  );
}
