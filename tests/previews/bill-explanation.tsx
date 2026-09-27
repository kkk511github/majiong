// Development-only: the actual engine/ledger/card/replay components, no login
// or production service. The small wall deliberately ends after the kong.
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ScoreDetails} from '../../src/Settlement';
import {ReplayPanel} from '../../src/ReplayPanel';
import {client} from '../../src/game-client';
import {captureReplay} from '../../shared/replay';
import {debitGame,applyDebit} from '../fixtures/debit-game';
import '../../src/styles.css';
import '../../src/classic.css';
import '../../src/polish.css';
import '../../src/dialogs.css';
import '../../src/table-finish.css';
import '../../src/records-match.css';
import '../../src/record-details-theme.css';
import '../../src/tables.css';
import './bill-explanation.css';
function example(capped:boolean){
 const g=debitGame('concealed');g.id=capped?'bill-demo-capped':'bill-demo-kong';g.wall=[140];
 if(capped)g.players[1]!.score=3;
 g.roundStartScores=g.players.map(p=>p!.score);
 g.replay={version:1,id:`${g.id}-1`,code:g.code,round:1,rules:g.rules,multiplier:1,startedAt:Date.now()-1000,names:g.players.map(p=>p!.name),frames:[]};
 captureReplay(g,'start',Date.now()-1000);
 return applyDebit(g,'concealed');
}
const examples={kong:example(false),capped:example(true)};
client.loadReplay=async id=>{const data=Object.values(examples).find(g=>g.replay?.id===id)?.replay;if(!data)throw Error('仅支持本地演示回放');return structuredClone(data);};
function Demo(){
 const [kind,setKind]=useState<'kong'|'capped'>('kong'),[replay,setReplay]=useState<{id:string;transfer:number}|null>(null);
 const game=examples[kind],record=game.history[0];
 return <div className="app classic polished bill-demo"><main>
  <header><span className="bill-demo-tag">本地演示 · 非真实账单</span><h1>这笔分数，为什么这样算？</h1><p>点击下方任意一笔分数，展开解释卡；可查看它对应的回放位置。</p></header>
  <nav aria-label="演示场景"><button aria-pressed={kind==='kong'} onClick={()=>setKind('kong')}>暗杠收分</button><button aria-pressed={kind==='capped'} onClick={()=>setKind('capped')}>余额不足封顶</button></nav>
  <p className="bill-demo-example">{kind==='kong'?'金陵牌友暗杠，本把倍率 ×1，其他三家各付 5 分。':'金陵牌友暗杠：秦淮原来只有 3 分，所以实际付 3 分；其他两家各付 5 分。'}</p>
  <ScoreDetails key={kind} record={record} ledgerFirst onReplayTransfer={transfer=>setReplay({id:record.id,transfer})}/>
 </main>{replay&&<ReplayPanel key={replay.id} initialId={replay.id} initialTransfer={replay.transfer} close={()=>setReplay(null)}/>}
 <style>{`.bill-demo{height:100dvh;overflow:auto!important;background:linear-gradient(150deg,#edf3ef,#fcf9ef);color:#173e42}.bill-demo>main{width:min(1040px,calc(100% - 40px));margin:24px auto;padding-bottom:32px}.bill-demo header{padding:20px 26px;background:#123f50;color:#f2f7f5;border-radius:18px}.bill-demo h1{font-size:26px;margin:12px 0}.bill-demo header p{color:#c6dde2;font-size:15px;margin:0}.bill-demo-tag{color:#eedba2;font-size:13px;letter-spacing:1px}.bill-demo nav{display:flex;gap:10px;padding:18px 0 8px}.bill-demo nav button{border-radius:10px;padding:10px 22px;background:white;color:#234a4e;border:1px solid #b4c9c8}.bill-demo nav button[aria-pressed=true]{background:#19566a;color:white;border-color:#19566a}.bill-demo-example{font-size:15px;margin:8px 0 20px}.bill-demo .score-details{max-height:none;overflow:visible}.bill-demo .record-transfer-table button{padding:5px 18px;border:1px solid #81adb5;background:#e8f2f1;color:#174653;border-radius:9px;font-size:19px;font-weight:700}@media(max-height:450px){.bill-demo>main{margin:12px auto}.bill-demo header{padding:12px 20px}.bill-demo h1{font-size:22px;margin:6px 0}}`}</style>
 </div>;
}
const root=createRoot(document.getElementById('root')!);root.render(<Demo/>);
if(import.meta.hot)import.meta.hot.dispose(()=>root.unmount());
