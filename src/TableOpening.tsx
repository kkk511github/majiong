import { useEffect, useState } from "react";
import { SkipForward } from "lucide-react";
import type { TableSceneState } from "../shared/table-scene";
import "./table-opening.css";

export interface OpeningCue { key: string; game: string; round: number; at: number }
export const OPENING_DURATION = 1800;
export const OPENING_ENTER_DURATION = 600;
export const openingScene = `${import.meta.env.BASE_URL}art/opening/table-arrival-v1.webp`;
export const openingTitle = `${import.meta.env.BASE_URL}art/opening/start-gold-v1.webp`;

/** Never obscure a restored game, a claim or an already played turn. */
export function canShowOpening(cue: OpeningCue | null | undefined, state: TableSceneState, now: number) {
  return !!cue && now - cue.at < 6000 && openingMatchesState(cue, state);
}

/** Once accepted, an opening can cover loading without expiring mid-transition. */
export function openingMatchesState(cue: OpeningCue, state: TableSceneState) {
  return state.round === 1 && cue.game === state.key && cue.round === state.round &&
    state.connected && state.phase === "playing" &&
    !state.presentation && !state.lastDiscard &&
    state.players.every(p => !p.discards.length && !p.melds.length);
}

export function TableOpening({ state, done, tableReady = true }: { state: TableSceneState; done: () => void; tableReady?: boolean }) {
  const [ready, setReady] = useState(false);
  const [entered, setEntered] = useState(false);
  const [reduced] = useState(() => matchMedia("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    let cancelled = false;
    const images = [openingScene, openingTitle].map(src => {
      const image = new Image(); image.src = src; return image.decode();
    });
    // Keep the entrance present while art decodes; failed art must not trap entry.
    Promise.all(images).catch(() => {}).then(() => { if (!cancelled) setReady(true); });
    const fallback = setTimeout(() => setReady(true), 2500);
    return () => { cancelled = true; clearTimeout(fallback); };
  }, []);
  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => setEntered(true), reduced ? 0 : OPENING_ENTER_DURATION);
    return () => clearTimeout(timer);
  }, [ready, reduced]);
  const exiting = entered && tableReady;
  useEffect(() => {
    if (!exiting) return;
    if (document.hidden) { done(); return; }
    const timer = setTimeout(done, reduced ? 350 : OPENING_DURATION - OPENING_ENTER_DURATION);
    const visibility = () => { if (document.hidden) done(); };
    document.addEventListener("visibilitychange", visibility);
    return () => { clearTimeout(timer); document.removeEventListener("visibilitychange", visibility); };
  }, [exiting, done, reduced]);
  return <section className={`table-opening${ready ? " opening-entered" : ""}${exiting ? " opening-exiting" : ""}${reduced ? " opening-reduced" : ""}`} aria-label={`第${state.round}把开局`}>
    <img className="opening-scene" src={openingScene} alt="" draggable={false} />
    <div className="opening-call" role="status">
      <img src={openingTitle} alt="开局" draggable={false} />
      <p>四位就座 · 好戏开场</p>
      <small>第 {state.round} 把 · {state.players[state.dealer]?.name}坐庄</small>
    </div>
    {tableReady && <button className="opening-skip" onClick={done}><SkipForward size={16} />进入牌局</button>}
  </section>;
}
