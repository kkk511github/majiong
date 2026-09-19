import React, { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { CocosTable } from "../../src/CocosTable";
import { cocosState } from "../../src/cocos-state";
import { viewFor } from "../../shared/engine";
import { useScoreDebits } from "../../src/useScoreDebits";
import {
  applyDebit,
  debitGame,
  type DebitExample,
} from "../fixtures/debit-game";
import "../../src/styles.css";
import "../../src/classic.css";
import "../../src/polish.css";
import "../../src/table-controls.css";

function Preview() {
  const [g, setGame] = useState(() => debitGame());
  const [me, setMe] = useState<0 | 1 | 2 | 3>(0);
  const [busy, setBusy] = useState(true);
  const [multiplier, setMultiplier] = useState(1);
  const sequence = useRef(0);
  const view = viewFor(g, me);
  const debits = useScoreDebits(view, true, !busy);
  const state = cocosState(view, {
    connected: true,
    disabled: false,
    practice: false,
    countdown: "10",
    selected: null,
    inspectedKind: null,
    hintKinds: [],
    hintLabel: "",
    effects: [],
  });
  function play(example: DebitExample) {
    const current = ++sequence.current;
    const start = debitGame(example, multiplier);
    start.id = `debit-preview-${current}`;
    setGame(start);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (sequence.current === current) setGame(applyDebit(start, example));
      }),
    );
  }
  return (
    <div className="app classic polished">
      <CocosTable
        state={state}
        scoreDebits={debits}
        onCommand={() => {}}
        onEntryBusyChange={setBusy}
      />
      <nav className="debit-preview-controls" aria-label="扣分预览控制">
        {(["concealed", "open", "added", "winds", "fourSame"] as const).map(
          (example, i) => (
            <button disabled={busy} key={example} onClick={() => play(example)}>
              {["暗杠", "明杠", "补杠", "四连风", "四张同牌"][i]}
            </button>
          ),
        )}
        <button onClick={() => setMultiplier((v) => (v === 1 ? 2 : 1))}>
          {multiplier === 1 ? "普通局" : "比下胡 ×2"}
        </button>
        <button
          onClick={() => setMe((value) => ((value + 1) % 4) as 0 | 1 | 2 | 3)}
        >
          换视角
        </button>
      </nav>
      <style>{`.debit-preview-controls{position:fixed;bottom:8px;left:12px;z-index:40;display:flex;gap:5px}.app.polished .debit-preview-controls button{background:#143d32e8;color:#e8d6aa;border:1px solid #82714d;border-radius:6px;padding:5px 9px;font-size:12px;min-height:32px}`}</style>
    </div>
  );
}
const root = createRoot(document.getElementById("root")!);
root.render(<Preview />);
if (import.meta.hot) import.meta.hot.dispose(() => root.unmount());
