// Development-only: the production table and opening overlay, no account or network changes.
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { CocosTable } from "../../src/CocosTable";
import { TableOpening, type OpeningCue } from "../../src/TableOpening";
import { cocosState } from "../../src/cocos-state";
import { act, createGame, newPlayer, seats, startRound, viewFor } from "../../shared/engine";
import { seededRandom } from "../../shared/tiles";
import "../../src/styles.css";
import "../../src/classic.css";
import "../../src/polish.css";
import "../../src/tables.css";
import "../../src/landscape.css";
import "../../src/table-room.css";
import "../../src/hand-controls.css";
import "../../src/table-redesign.css";

document.documentElement.dataset.tablePlatform = "standard";

const game = createGame("118011", "preview", { turnSeconds: 0 });
game.players = seats.map(seat => ({ ...newPlayer(String(seat), ["金陵牌友", "秦淮月", "清风南来", "烟雨行舟"][seat]), ready: true }));
const initialGame = startRound(game, Date.now(), seededRandom(42));
function Preview() {
  const [current, setCurrent] = useState(initialGame);
  const [cue, setCue] = useState<OpeningCue | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [still, setStill] = useState(false);
  const state = cocosState(viewFor(current, 0), { connected: true, disabled: false, practice: true, countdown: "—", selected, inspectedKind: null, hintKinds: [], hintLabel: "", effects: [] });
  return <div className="app classic polished" data-page="table">
    <CocosTable state={state} opening={cue} onCommand={command => {
      if (command.type === "select" && !(state.canDiscard && selected === command.tile))
        setSelected(value => value === command.tile ? null : command.tile);
      if (state.canDiscard && (command.type === "discard" || command.type === "select") && selected === command.tile) {
        setCurrent(value => act(value, 0, { type: "discard", tile: command.tile }));
        setSelected(null);
      }
    }} />
    {still && <div className="opening-keyframe"><TableOpening state={state} done={() => {}} /></div>}
    <nav style={{position:"fixed",zIndex:40,bottom:8,left:12,display:"flex",gap:8}} aria-label="开桌预览控制">
      <button onClick={() => {setStill(false);setCue({key:crypto.randomUUID(),game:state.key,round:state.round,at:Date.now()});}}>播放开桌</button>
      <button onClick={() => {setCue(null);setStill(v => !v);}}>定格预览</button>
      <button onClick={() => {setCue(null);setStill(false);setSelected(null);setCurrent(structuredClone(initialGame));}}>重试上拖出牌</button>
      <a href="./records.html" style={{color:"#fff4cc",background:"#123f36",padding:8,borderRadius:8}}>战绩预览</a>
    </nav>
    <style>{`.opening-keyframe .table-opening,.opening-keyframe .opening-scene,.opening-keyframe .opening-call{animation-play-state:paused;animation-delay:-.6s}.app.polished .opening-keyframe .opening-skip{display:none}.app.polished nav[aria-label="开桌预览控制"] button{background:#164c3f;color:#fff0c4;border:1px solid #b6a16a;border-radius:7px;padding:8px 12px;min-height:44px}`}</style>
  </div>;
}
const root = createRoot(document.getElementById("root")!);
root.render(<Preview />);
if (import.meta.hot) import.meta.hot.dispose(() => root.unmount());
