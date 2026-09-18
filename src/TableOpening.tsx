import { useEffect, useState } from "react";
import { SkipForward } from "lucide-react";
import type { TableSceneState } from "../shared/table-scene";
import "./table-opening.css";

export interface OpeningCue { key: string; game: string; round: number; at: number }
export const OPENING_DURATION = 1800;
export const openingScene = `${import.meta.env.BASE_URL}art/opening/table-arrival-v1.webp`;
export const openingTitle = `${import.meta.env.BASE_URL}art/opening/start-gold-v1.webp`;

/** Never obscure a restored game, a claim or an already played turn. */
export function canShowOpening(cue: OpeningCue | null | undefined, state: TableSceneState, now: number) {
  return !!cue && state.round === 1 && cue.game === state.key && cue.round === state.round &&
    now - cue.at < 6000 && state.connected && state.phase === "playing" &&
    !state.presentation && !state.lastDiscard &&
    state.players.every(p => !p.discards.length && !p.melds.length);
}

export function TableOpening({ state, done }: { state: TableSceneState; done: () => void }) {
  const [ready, setReady] = useState(false);
  const [reduced] = useState(() => matchMedia("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    let cancelled = false;
    const images = [openingScene, openingTitle].map(src => {
      const image = new Image(); image.src = src; return image.decode();
    });
    Promise.all(images).then(() => { if (!cancelled) setReady(true); }).catch(() => { if (!cancelled) done(); });
    const fallback = setTimeout(done, 2500);
    return () => { cancelled = true; clearTimeout(fallback); };
  }, [done]);
  useEffect(() => {
    if (!ready) return;
    if (document.hidden) { done(); return; }
    const timer = setTimeout(done, reduced ? 350 : OPENING_DURATION);
    const visibility = () => { if (document.hidden) done(); };
    document.addEventListener("visibilitychange", visibility);
    return () => { clearTimeout(timer); document.removeEventListener("visibilitychange", visibility); };
  }, [ready, done, reduced]);
  if (!ready) return null;
  return <section className={`table-opening${reduced ? " opening-reduced" : ""}`} aria-label={`第${state.round}把开局`}>
    <img className="opening-scene" src={openingScene} alt="" draggable={false} />
    <div className="opening-call" role="status">
      <img src={openingTitle} alt="开局" draggable={false} />
      <p>四位就座 · 好戏开场</p>
      <small>第 {state.round} 把 · {state.players[state.dealer]?.name}坐庄</small>
    </div>
    <button className="opening-skip" onClick={done}><SkipForward size={16} />进入牌局</button>
  </section>;
}
