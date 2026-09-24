import { useEffect, useRef, useState } from "react";
import { CheckCircle2, LoaderCircle, WifiOff, Signal } from "lucide-react";
import type { NetworkHealth } from "./network-health";
import { NETWORK_HINT_DELAY_MS, NETWORK_RECOVERED_MS, networkFeedback } from "./network-feedback";

export function NetworkFeedback({ online, connected, health, room, notice, retry, resume }: {
  online: boolean; connected: boolean; health: NetworkHealth; room: boolean;
  notice: string; retry: () => void; resume: () => void;
}) {
  const ready = online && connected && health.phase === "ready";
  const lostAt = useRef<number | null>(null);
  const wasReady = useRef(false);
  const [clock, setClock] = useState(Date.now());
  const [recoveredAt, setRecoveredAt] = useState<number | null>(null);
  const [retryBusy, setRetryBusy] = useState(false);
  useEffect(() => {
    const now = Date.now();
    setClock(now);
    if (!online) {
      lostAt.current = null; wasReady.current = false; setRecoveredAt(null);
      return;
    }
    if (ready) {
      if (wasReady.current && lostAt.current !== null && now - lostAt.current >= NETWORK_HINT_DELAY_MS)
        setRecoveredAt(now);
      lostAt.current = null; wasReady.current = true;
      return;
    }
    lostAt.current ??= now;
    setRecoveredAt(null);
  }, [online, ready]);
  useEffect(() => {
    if (!online) return;
    const timer = setInterval(() => setClock(Date.now()), 400);
    return () => clearInterval(timer);
  }, [online]);
  useEffect(() => {
    if (!retryBusy) return;
    const timer = setTimeout(() => setRetryBusy(false), 1500);
    return () => clearTimeout(timer);
  }, [retryBusy]);
  const model = networkFeedback({
    online, connected, health, room, notice, now: clock,
    elapsed: lostAt.current === null ? 0 : Math.max(0, clock - lostAt.current),
    recovered: recoveredAt !== null && clock - recoveredAt < NETWORK_RECOVERED_MS,
  });
  if (!model) return null;
  const Icon = model.tone === "success" ? CheckCircle2 : model.tone === "progress" ? LoaderCircle : model.tone === "error" ? WifiOff : Signal;
  return <aside className={`network-feedback connection-banner network-feedback-${model.tone}`}
    role="status" aria-live="polite" aria-atomic="true" aria-label="网络连接状态">
    <Icon size={18} aria-hidden="true" />
    <span><strong>{model.title}</strong><small>{model.detail}</small></span>
    {model.action === "retry" && <button disabled={retryBusy} onClick={() => {
      if (retryBusy) return;
      setRetryBusy(true); retry();
    }}>{retryBusy ? "连接中…" : "重试连接"}</button>}
    {model.action === "resume" && <button disabled={retryBusy} onClick={() => {
      if (retryBusy) return;
      setRetryBusy(true); resume();
    }}>在此恢复</button>}
  </aside>;
}
