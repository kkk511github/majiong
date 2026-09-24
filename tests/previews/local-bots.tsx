import React,{useEffect,useMemo,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {act,viewFor} from '../../shared/engine';
import {setTrustee} from '../../shared/timing';
import {kind,seededRandom} from '../../shared/tiles';
import type {Action,Game,View} from '../../shared/types';
import type {TableSceneCommand} from '../../shared/table-scene';
import {CocosTable} from '../../src/CocosTable';
import {cocosState} from '../../src/cocos-state';
import {useGameMotion} from '../../src/GameMotion';
import {useScoreDebits} from '../../src/useScoreDebits';
import {listeningHints,readyDiscardTiles} from '../../src/listening-hints';
import {RoundReveal} from '../../src/RoundReveal';
import {ScoreDetails} from '../../src/Settlement';
import {Dialog} from '../../src/Dialog';
import type {OpeningCue} from '../../src/TableOpening';
import {RoomVoice} from '../../src/RoomVoice';
import type {RoomPhraseMessage,RoomPhraseId} from '../../shared/room-phrases';
import {gameAudio} from '../../src/audio';
import {discardedVoice} from '../../src/tile-voice';
import {actionVoices} from '../../src/voice-events';
import {createLocalBotGame,stepLocalBots,beginLocalRound} from './local-bot-game';
import '../../src/styles.css';
import '../../src/classic.css';
import '../../src/polish.css';
import '../../src/dialogs.css';
import '../../src/tables.css';
import '../../src/landscape.css';
import '../../src/web-browser.css';
import './local-bots.css';

const params=new URLSearchParams(location.search);
const rounds=params.get('rounds')==='2'?2:8;
const KEY=rounds===2?'jinling:isolated-local-bots-two-rounds-v2':'jinling:isolated-local-bots-v1';
// Tests can use a reproducible local wall and accelerate timers. Neither option
// exists in the production client or affects a server room.
const random=params.has('testSeed')?seededRandom(Number(params.get('testSeed'))):undefined;
const testSpeed=params.get('testSpeed')==='40'?40:undefined;
function initialGame(){
 try{const saved=JSON.parse(sessionStorage.getItem(KEY)||'null') as Game|null;
  if(saved?.id?.startsWith('local-bots-')&&saved.rules?.rounds===rounds&&saved.players?.length===4&&saved.players.filter(p=>p?.bot).length===3)return saved;
 }catch{/* A corrupt local preview cache must not affect accounts or live games. */}
 return createLocalBotGame(rounds,random,rounds!==2);
}
function LocalBots(){
 const [game,setGame]=useState(initialGame),[selected,setSelected]=useState<number|null>(null),[paused,setPaused]=useState(false),[busy,setBusy]=useState(true),[hidden,setHidden]=useState(document.hidden),[error,setError]=useState('');
 const [phrases,setPhrases]=useState<RoomPhraseMessage[]>([]),[opening,setOpening]=useState<OpeningCue|null>(null);
 const [resultVisible,setResultVisible]=useState(false),[details,setDetails]=useState(false),[autoDemo,setAutoDemo]=useState(false);
 const previousAudio=useRef<View|null>(null);
 const view=useMemo(()=>viewFor(game,0),[game]);
 const live=!paused&&!hidden&&!opening&&!resultVisible;
 const effects=useGameMotion(view,live),debits=useScoreDebits(view,live,!busy);
 const mine=view.players[0]!;
 const hintDiscard=mine.hand.length%3===2?selected??undefined:undefined;
 const hints=useMemo(()=>['playing','claiming'].includes(view.phase)?listeningHints(mine,view.rules,hintDiscard,view.players,{seat:0,earthlyWaits:view.earthlyWaits}):[],[view,hintDiscard,mine]);
 const ready=useMemo(()=>readyDiscardTiles(view),[view]);
 const phraseClient=useMemo(()=>({now:()=>Date.now(),prunePhraseMessages:()=>setPhrases(old=>{const next=old.filter(p=>Date.now()-p.at<6000);return next.length===old.length?old:next;}),sendPhrase:async(game:string,phrase:RoomPhraseId)=>{setPhrases(old=>[...old,{id:`local-phrase-${Date.now()}`,game,sender:'local-human',name:'你（本地）',seat:0,phrase,at:Date.now()}]);}}),[]);
 useEffect(()=>{const visibility=()=>setHidden(document.hidden);document.addEventListener('visibilitychange',visibility);gameAudio.configure({music:false,sound:true,voice:true,chat:true,voiceGender:'male',voiceVolume:.6,soundVolume:.5,musicVolume:0},true);return()=>{document.removeEventListener('visibilitychange',visibility);gameAudio.dispose();};},[]);
 useEffect(()=>{try{sessionStorage.setItem(KEY,JSON.stringify(game));}catch{/* Storage is optional. */}},[game]);
 useEffect(()=>{
  if(!live||busy||!['playing','claiming'].includes(game.phase))return;
  const timer=setTimeout(()=>{try{const next=stepLocalBots(game);if(next!==game){setGame(next);setSelected(null);}}catch(e){setError((e as Error).message);}},testSpeed??(autoDemo?400:700));
  return()=>clearTimeout(timer);
 },[game,live,busy,autoDemo]);
 useEffect(()=>{
  if(!live){previousAudio.current=view;return;}
  const spoken=discardedVoice(previousAudio.current,view);if(spoken)gameAudio.sayTile(spoken.key,spoken.tile);
  actionVoices(previousAudio.current,view).forEach(({key,phrase})=>gameAudio.sayTile(key,phrase));
  previousAudio.current=view;
 },[view,live]);
 const ended=['ended','finished'].includes(game.phase);
 useEffect(()=>{
  setResultVisible(false);setDetails(false);
  if(!ended)return;
  const timer=setTimeout(()=>setResultVisible(true),testSpeed?100:2300);
  return()=>clearTimeout(timer);
 },[game.id,game.round,ended]);
 useEffect(()=>{
  if(!autoDemo||!resultVisible||paused||hidden||game.phase!=='ended')return;
  const timer=setTimeout(()=>beginRound(),testSpeed?1200:5000);return()=>clearTimeout(timer);
 },[autoDemo,resultVisible,paused,hidden,game.phase,game.id,game.round]);
 const scene=cocosState(view,{connected:true,disabled:paused||busy||!!opening||resultVisible,practice:true,countdown:'—',selected,drawn:view.canDiscard?view.lastDraw:undefined,inspectedKind:selected===null?null:kind(selected),hintKinds:hints,hintDiscard,hintLabel:hintDiscard===undefined?'已经听牌':'打出后可听',effects});
 function beginRound(){
  try{gameAudio.unlock();const next=beginLocalRound(game,random);if(autoDemo)setTrustee(next,0,true,Date.now());setGame(next);setSelected(null);setError('');setResultVisible(false);setDetails(false);
   if(next.round===1)setOpening({key:`${next.id}:opening`,game:next.id,round:1,at:Date.now()});
   gameAudio.play('deal');
  }catch(e){setError((e as Error).message);}
 }
 function command(c:TableSceneCommand){
  if(c.type==='menu'&&c.menu==='result'){setResultVisible(true);return;}
  if(c.type==='select'){setSelected(c.tile);return;}
  if(c.type==='trustee'){const next=structuredClone(game);setTrustee(next,0,c.enabled,Date.now());next.revision++;if(!c.enabled)setAutoDemo(false);setGame(next);return;}
  if(!live||busy)return;
  let action:Action|undefined;
  if(c.type==='discard')action={type:'discard',tile:c.tile};
  if(c.type==='action'&&['pung','kong','hu','pass','selfKong','zhaozhi'].includes(c.action))action={type:c.action,...(c.tile!==undefined?{tile:c.tile}:{})} as Action;
  if(action)try{setGame(act(game,0,action));setSelected(null);setError('');}catch(e){setError((e as Error).message);}
 }
 const record=view.history.at(-1);
 return <div className="app classic polished local-bot-app">
  <CocosTable state={scene} onCommand={command} onEntryBusyChange={setBusy} readyDiscards={ready} scoreDebits={debits}
   opening={opening} onOpeningComplete={()=>setOpening(null)}
   winResult={effects.some(e=>e.type==='hu')?game.result:undefined}>
   {tableState=><RoomVoice client={phraseClient} game={game.id} connected={true} enabled={true} volume={.6} voiceGender="male" phrases={phrases} phrasesAvailable={true} tableState={tableState}/>}
  </CocosTable>
  <aside className="local-bot-tools" aria-label="本地练习控制">
   {ended?<button onClick={()=>setResultVisible(true)}>查看结算</button>:<button onClick={()=>setPaused(p=>!p)} disabled={game.phase==='waiting'}>{paused?'继续':'暂停'}</button>}
   <span>本地 · 3机器人 · {rounds}把</span>
  </aside>
  {game.phase==='waiting'&&<Dialog title="本地两把练习" variant="local-ready-dialog" close={()=>{}} hideClose dismissOnBackdrop={false}
   footer={<button className="primary" disabled={busy} onClick={beginRound}>{busy?'牌桌载入中…':'准备并开始'}</button>}>
   <p>你和三个机器人已入座。本桌最多两把，不连接真实服务器。</p>
   <ul>{game.players.map((p,i)=><li key={i}>{p!.name} · {i?'已准备':'等你准备'}</li>)}</ul>
   <label><input type="checkbox" checked={autoDemo} onChange={e=>setAutoDemo(e.target.checked)}/>自动演示两把（你也托管，按原托管规则摸打/过）</label>
   <p>开局动画 → 对局 → 单把结算 → 第二把 → 最终结算。可随时取消托管接手；原规则的提前结束条件仍然有效。</p>
  </Dialog>}
  {resultVisible&&record&&<Dialog title={game.phase==='finished'?'本桌最终战绩':`第${game.round}把结算`} variant="round-reveal-dialog" close={()=>setResultVisible(false)} dismissOnBackdrop={false}
   footer={<><button onClick={()=>setDetails(v=>!v)}>{details?'返回牌面':'计分明细'}</button>
    {game.phase==='finished'?<button className="primary" onClick={()=>{setGame(createLocalBotGame(rounds,random,false));setResultVisible(false);setAutoDemo(false);}}>重新开桌</button>:<button className="primary" onClick={beginRound}>{autoDemo?'5秒后自动进入第二把 · 立即继续':'准备下一把'}</button>}</>}>
   {details?<ScoreDetails record={record} me={0}/>:<RoundReveal view={view} record={{...record,totalRounds:rounds,matchFinished:game.phase==='finished'}}/>}
  </Dialog>}
  {paused&&<div className="local-bot-paused" role="status">已暂停 · 点击左上角继续</div>}
  {error&&<div className="local-bot-error" role="alert">{error}<button onClick={()=>setError('')}>关闭</button></div>}
  <div className="sr-only" role="status">本地机器人桌，玩家1人、机器人3人，不连接服务器。{view.canDiscard?'轮到你出牌':game.phase==='claiming'?'等待碰杠胡响应':'机器人思考中'}</div>
 </div>;
}
const root=createRoot(document.getElementById('root')!);root.render(<LocalBots/>);
if(import.meta.hot)import.meta.hot.dispose(()=>root.unmount());
