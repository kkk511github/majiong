import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { View } from "../shared/types";
import { scoreDebitDuration, scoreDebits, type ScoreDebit } from "./score-debits";

/** Per-player queues keep rapid successive payments legible without replaying on reconnect. */
export function useScoreDebits(
  view: View | null,
  live: boolean,
  ready: boolean,
) {
  const before = useRef<View | null>(null);
  const [visible, setVisible] = useState(!document.hidden);
  const [queue, setQueue] = useState<ScoreDebit[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const change = () => {
      before.current = null;
      setQueue([]);
      setVisible(!document.hidden);
    };
    document.addEventListener("visibilitychange", change);
    return () => {
      document.removeEventListener("visibilitychange", change);
      timers.current.forEach(clearTimeout);
      timers.current.clear();
    };
  }, []);
  useLayoutEffect(() => {
    if (!live || !visible || !view) {
      before.current = null;
      setQueue([]);
      return;
    }
    const prior = before.current;
    const sameTable = prior?.id === view.id && prior.me === view.me;
    if (sameTable && view.revision <= prior.revision) return;
    const fresh = scoreDebits(prior, view);
    before.current = view;
    if (!sameTable || prior.round !== view.round) setQueue(fresh);
    else if (fresh.length) setQueue((old) => [...old, ...fresh]);
  }, [view, live, visible]);
  const current = useMemo(
    () =>
      queue.filter(
        (event, index) =>
          queue.findIndex((other) => other.seat === event.seat) === index,
      ),
    [queue],
  );
  useEffect(() => {
    const active = new Set(
      ready && live && visible ? current.map((event) => event.key) : [],
    );
    for (const [key, timer] of timers.current)
      if (!active.has(key)) {
        clearTimeout(timer);
        timers.current.delete(key);
      }
    for (const key of active)
      if (!timers.current.has(key)) {
        timers.current.set(
          key,
          setTimeout(() => {
            timers.current.delete(key);
            setQueue((old) => old.filter((event) => event.key !== key));
          }, scoreDebitDuration(current.find((event) => event.key === key)!)),
        );
      }
  }, [current, ready, live, visible]);
  return live && visible ? current : [];
}
