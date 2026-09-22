import { useEffect, useRef, useState } from "react";
import type { RecordsPage } from "../shared/types";
import { client } from "./game-client";
import { CompletedTableArrivals, RECORDS_POLL_MS } from "./records-live";

export type RecordsFeedPhase = "connecting" | "live" | "retrying" | "paused";

export function useLiveRecords(
  active: boolean,
  accountId: string | undefined,
  onSnapshot: (page: RecordsPage, newGames: string[], notify: boolean) => void,
) {
  const callback = useRef(onSnapshot);
  callback.current = onSnapshot;
  const [status, setStatus] = useState<{
    phase: RecordsFeedPhase;
    updatedAt: number | null;
  }>({ phase: "connecting", updatedAt: null });

  useEffect(() => {
    if (!active || !accountId) {
      setStatus((previous) => ({ ...previous, phase: "paused" }));
      return;
    }
    const arrivals = new CompletedTableArrivals();
    let disposed = false,
      pending = false,
      suppressNextSound = true;
    setStatus({
      phase: document.hidden ? "paused" : "connecting",
      updatedAt: null,
    });
    async function check(silent = false) {
      if (document.hidden || disposed) return;
      if (silent) suppressNextSound = true;
      if (pending) return;
      pending = true;
      try {
        // Page one, no filters: an old row entering page two or changing its read
        // status must never be mistaken for a newly completed table.
        const page = await client.loadRecords(
          true,
          new URLSearchParams({ page: "1", calendar: "0" }),
        );
        if (disposed) return;
        const games = arrivals.observe(page.records);
        const notify = !suppressNextSound && !document.hidden;
        suppressNextSound = false;
        if (!document.hidden) callback.current(page, games, notify);
        setStatus({
          phase: document.hidden ? "paused" : "live",
          updatedAt: Date.now(),
        });
      } catch {
        if (!disposed)
          setStatus((previous) => ({
            ...previous,
            phase: document.hidden ? "paused" : "retrying",
          }));
      } finally {
        pending = false;
      }
    }
    const visibility = () => {
      if (document.hidden) {
        suppressNextSound = true;
        setStatus((previous) => ({ ...previous, phase: "paused" }));
      } else void check(true);
    };
    const online = () => void check(true);
    void check(true);
    const pollRecords = () => check();
    const timer = window.setInterval(pollRecords, RECORDS_POLL_MS);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("online", online);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("online", online);
    };
  }, [active, accountId]);
  return status;
}
