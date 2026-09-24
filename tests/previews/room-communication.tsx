import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { CocosTable } from "../../src/CocosTable";
import { RoomVoice } from "../../src/RoomVoice";
import { cocosState } from "../../src/cocos-state";
import { gameAudio } from "../../src/audio";
import { viewFor } from "../../shared/engine";
import type { RoomPhraseId, RoomPhraseMessage } from "../../shared/room-phrases";
import { debitGame } from "../fixtures/debit-game";
import "../../src/styles.css";
import "../../src/classic.css";
import "../../src/polish.css";
import "../../src/tables.css";
import "../../src/landscape.css";
import "../../src/web-browser.css";

// A local visual fixture only: no authentication, service connection or real table.
function Preview() {
  const game = useMemo(() => debitGame(), []);
  const [phrases, setPhrases] = useState<RoomPhraseMessage[]>([]);
  const [connected, setConnected] = useState(true);
  const [available, setAvailable] = useState(true);
  const [enabled, setEnabled] = useState(true);
  const [gender, setGender] = useState<"male" | "female">("male");
  const [seat, setSeat] = useState<0 | 1 | 2 | 3>(0);
  const [turn, setTurn] = useState(0);
  const [claim, setClaim] = useState(false);
  const [visualAction,setVisualAction]=useState<{seq:number;type:string}|null>(null);
  const seq = useRef(0);
  const testing = useRef({ failNext: false, sent: [] as RoomPhraseId[] });
  const receive = (seat: number, phrase: RoomPhraseId) => {
    const p = game.players[seat]!;
    setPhrases(old => [...old, { id: `phrase-${++seq.current}`, game: game.id, sender: p.id, name: p.name, seat: seat as 0 | 1 | 2 | 3, phrase, at: Date.now() }]);
  };
  const client = useMemo(() => ({
    now: () => Date.now(),
    sendPhrase: async (_game: string, phrase: RoomPhraseId) => {
      if (testing.current.failNext) { testing.current.failNext = false; throw Error("发送失败，请重试"); }
      testing.current.sent.push(phrase); receive(seat, phrase);
    },
    prunePhraseMessages: () => setPhrases(old => { const next = old.filter(m => Date.now() - m.at < 6000); return next.length === old.length ? old : next; }),
  }), [seat]);
  useEffect(() => {
    gameAudio.configure({ music: false, sound: false, voice: true, chat: enabled, voiceGender: gender, voiceVolume: .7, soundVolume: 0, musicVolume: 0 }, true);
    (window as any).__communication = { receive, setConnected, setAvailable, setEnabled, setGender, setSeat, setTurn, setClaim, testing: testing.current };
  }, [enabled, gender, seat]);
  useEffect(() => {
    const unlock = () => gameAudio.unlock();
    const visible = () => gameAudio.setVisible(!document.hidden);
    document.addEventListener("pointerdown", unlock, true);
    document.addEventListener("visibilitychange", visible);
    return () => { document.removeEventListener("pointerdown", unlock, true); document.removeEventListener("visibilitychange", visible); gameAudio.dispose(); };
  }, []);
  const view = viewFor(game, seat);
  const scene = cocosState(view, { connected, disabled: false, practice: false, countdown: "10", selected: null, inspectedKind: null, hintKinds: [], hintLabel: "", effects: [] });
  scene.turn = turn; scene.lastDiscard = { seat: turn, tile: 24 + turn };
  const allActions=new URLSearchParams(location.search).get('actions')==='all';
  if (claim||allActions) { scene.phase = "claiming"; scene.pending = { tile: 40, from: 1, answered: false, kind: "discard" }; scene.actions = [{ id: "pung", label: "碰" }, { id: "kong", label: "杠" }, ...(allActions?[{id:'hu',label:'胡'}]:[]), { id: "pass", label: "过" }]; scene.canDiscard = false; }
  if(allActions&&visualAction){scene.revision+=visualAction.seq;scene.effects=[{key:`local-action-${visualAction.seq}`,type:visualAction.type,seat}];}
  return <div className="app classic polished"><CocosTable state={scene} onCommand={command=>{if(allActions&&command.type==='action'&&['pung','kong'].includes(command.action))setVisualAction(v=>({seq:(v?.seq??0)+1,type:command.action}));}}>{tableState => <RoomVoice client={client} game={game.id} connected={connected} enabled={enabled} volume={.7} voiceGender={gender} phrases={phrases} phrasesAvailable={available} tableState={tableState}/>}</CocosTable></div>;
}
const root = createRoot(document.getElementById("root")!);
root.render(<Preview/>);
if (import.meta.hot) import.meta.hot.dispose(() => root.unmount());
