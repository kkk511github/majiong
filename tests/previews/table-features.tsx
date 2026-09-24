import React,{useMemo,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {act,viewFor} from '../../shared/engine';
import {kind} from '../../shared/tiles';
import {CocosTable} from '../../src/CocosTable';
import {cocosState} from '../../src/cocos-state';
import {listeningHints,readyDiscardTiles} from '../../src/listening-hints';
import {anchorGame,claimFourth,discardAnchor,advanceToAnchorDraw,WAIT_WAN,ANCHOR_TILE} from '../fixtures/global-anchor-game';
import {debitGame,applyDebit} from '../fixtures/debit-game';
import '../../src/styles.css';import '../../src/classic.css';import '../../src/polish.css';import '../../src/tables.css';import '../../src/landscape.css';import '../../src/web-browser.css';
import './table-features.css';

const cases=[['claim','待碰牌立体框'],['highlight','选牌同牌高亮'],['anchor','全球独钓架牌'],['listening','选牌听牌提示'],['concealed','暗杠贴合'],['added','补杠贴合'],['open','明杠']] as const;
type Case=typeof cases[number][0];
function Features(){
 const requested=new URLSearchParams(location.search).get('case');
 const [mode,setMode]=useState<Case>(cases.some(c=>c[0]===requested)?requested as Case:'anchor'),[changed,setChanged]=useState(false),[selected,setSelected]=useState<number|null>(null),[observer,setObserver]=useState<0|1|2|3>(2);
 const game=useMemo(()=>{
  if(['concealed','added','open'].includes(mode)){const type=mode as 'concealed'|'added'|'open';return applyDebit(debitGame(type),type);}
  let g=anchorGame('change');if(mode==='claim'||mode==='highlight')return g;
  g=claimFourth(g,'change');if(mode==='listening')return g;
  g=discardAnchor(g);return changed?act(advanceToAnchorDraw(g),0,{type:'discard',tile:WAIT_WAN}):g;
 },[mode,changed]);
 const me=['concealed','added','open'].includes(mode)?observer:0;
 const view=viewFor(game,me),mine=view.players[me]!;
 const selectedTile=mode==='listening'?(selected??ANCHOR_TILE):selected;
 const hintDiscard=mine.hand.length%3===2?selectedTile??undefined:undefined;
 const hints=listeningHints(mine,view.rules,hintDiscard,view.players,{seat:me,earthlyWaits:view.earthlyWaits});
 const state=cocosState(view,{connected:true,disabled:false,practice:true,countdown:'—',selected:selectedTile,drawn:view.canDiscard?view.lastDraw:undefined,inspectedKind:selectedTile===null?null:kind(selectedTile),hintKinds:hints,hintDiscard,hintLabel:'本地显示检查',effects:[]});
 // Each independent fixture is a fresh table, not a live transition between
 // unrelated physical tile identities. Real transitions are exercised in bots.
 state.key=`feature-${mode}-${changed}`;
 if(mode==='highlight')state.inspectedKind=kind(state.pending!.tile);
 const message=mode==='highlight'?'选牌时同牌值的弃牌以浅黄色显示；架牌的深黄色优先，不会被覆盖。':mode==='claim'?'框线直接贴在牌面上，随3D透视，不再用屏幕正矩形。':mode==='anchor'?(changed?'已经换听：原架牌的黄色标记应消失。':'由原引擎完成第四副副露并打出六条：有效架牌应呈黄色。'):mode==='listening'?'已选六条：显示打出后的听口与未见张数；只使用本人手牌和公开信息。':mode==='open'?'明杠四张并排，不套用补杠叠放。':'上层牌正落在中间底牌上，不重复叠加屏幕位移。';
 return <div className="app classic polished feature-app">
  <header className="feature-controls"><label>显示场景<select aria-label="显示场景" value={mode} onChange={e=>{setMode(e.target.value as Case);setChanged(false);setSelected(null);}}>{cases.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
   {mode==='anchor'&&<button onClick={()=>setChanged(v=>!v)}>{changed?'恢复架牌示例':'换听，验证去黄'}</button>}
   {['concealed','added','open'].includes(mode)&&<select aria-label="杠牌方位" value={observer} onChange={e=>setObserver(Number(e.target.value) as 0|1|2|3)}><option value={0}>本家</option><option value={3}>下家</option><option value={2}>对家</option><option value={1}>上家</option></select>}
   <a href="./local-bots.html?rounds=2">两把完整流程</a><small>本地演示 · 不连接服务器</small>
   <a href="./room-communication.html?actions=all">碰杠胡过／托管／短句</a>
   <a href="./opening.html">开局</a><a href="./score-debits.html">扣分</a><a href="./records.html">结算／回放</a>
   <a href="./table-motion-v2.html?scene=full-pung">满碰</a><a href="./table-motion-v2.html?scene=full-open">满明杠</a>
  </header>
  <CocosTable state={state} readyDiscards={readyDiscardTiles(view)} onCommand={c=>{if(c.type==='select')setSelected(c.tile);}}/>
  <p className="feature-description" role="status">{message}</p>
 </div>;
}
createRoot(document.getElementById('root')!).render(<Features/>);
