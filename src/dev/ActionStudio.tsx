import {useEffect,useMemo,useRef,useState} from 'react';
import {CocosTable} from '../CocosTable';
import {cocosState} from '../cocos-state';
import {gameFeedback,type GameFeedback} from '../game-feedback';
import {gameAudio} from '../audio';
import {viewFor,selfKongs} from '../../shared/engine';
import type {Game,Seat,Action} from '../../shared/types';
import {claimFixture,crowdedClaimFixture,confirmFixture,kongFixture,addedFixture,multiWinFixture,debitFixture,rapidFixture,type DebitCase,type CrowdedAction} from './action-studio-fixtures';
import {useScoreDebits} from '../useScoreDebits';
import {ACTION_TIMING} from '../../shared/action-presentation';
import './action-studio.css';

export default function ActionStudio(){
 const tableOnly=new URLSearchParams(location.search).get('tableOnly')==='1';
 const [crowdedAction,setCrowdedAction]=useState<CrowdedAction>(()=>{const a=new URLSearchParams(location.search).get('choice');return ['hu','hu-claim','pung','kong','hu-pung','kong-pung','multi-kong'].includes(a??'')?a as CrowdedAction:'all';});
 const [game,setGame]=useState(()=>new URLSearchParams(location.search).get('crowded')==='1'?crowdedClaimFixture(crowdedAction):claimFixture()),[seat,setSeat]=useState<Seat>(0),[me,setMe]=useState<Seat>(0),[effects,setEffects]=useState<GameFeedback[]>([]),[busy,setBusy]=useState(false),[connected,setConnected]=useState(true),[simple,setSimple]=useState(false),[sound,setSound]=useState(false),[message,setMessage]=useState('仅本地表现验收，不连接对局服务器'),[reject,setReject]=useState(false);
 const [debitCase,setDebitCase]=useState<DebitCase>('concealed'),[doubled,setDoubled]=useState(false),[tableBusy,setTableBusy]=useState(true);
 const [completedActions,setCompletedActions]=useState<ReadonlySet<string>>(()=>new Set());
 const gameRef=useRef(game);gameRef.current=game;const rev=useRef(20),timers=useRef<ReturnType<typeof setTimeout>[]>([]);
 const wait=(fn:()=>void,ms:number)=>{const t=setTimeout(fn,ms);timers.current.push(t);};
 const cancel=()=>{timers.current.forEach(clearTimeout);timers.current=[];setBusy(false);};
 const showCrowded=(a:CrowdedAction)=>{setCrowdedAction(a);cancel();setMe(0);setEffects([]);setGame({...crowdedClaimFixture(a),revision:++rev.current});setMessage('满牌操作布局 · 合法动作由本地引擎判定');};
 const isolate=(...games:Game[])=>{const id=`action-studio-run-${++rev.current}`;games.forEach(g=>{g.id=id;});};
 useEffect(()=>()=>{timers.current.forEach(clearTimeout);gameAudio.dispose();},[]);
 useEffect(()=>{gameAudio.configure({sound,voice:sound,music:false,soundVolume:.45,voiceVolume:.65,musicVolume:0,simplifiedEffects:simple},true);},[sound,simple]);
 function present(before:Game,after:Game){
  const a=structuredClone(before),b=structuredClone(after);a.revision=++rev.current;b.revision=rev.current+1;
  setGame(a);setEffects([]);setMessage('本地引擎确认前，不播放成立特效');
  wait(()=>{rev.current=b.revision;setGame(b);setEffects(gameFeedback(viewFor(a,me),viewFor(b,me)));setMessage('已由本地引擎确认 · 正在播放');},110);
 }
 function play(kind:'pung'|'kong'|'concealed'|'hu'|'added'|'multi'|'insert'){
  cancel();setConnected(true);gameAudio.unlock();try{
   if(kind==='added'){const pair=addedFixture(seat);isolate(pair.before,pair.pung,pair.after);present(pair.before,pair.pung);wait(()=>present(pair.pung,pair.after),ACTION_TIMING.pung.duration+180);return;}
   if(kind==='multi'){const pair=multiWinFixture();isolate(pair.before,pair.after);present(pair.before,pair.after);return;}
   const before=kind==='concealed'||kind==='insert'?kongFixture(seat):claimFixture(seat);
   if(kind==='insert'){before.lastDraw=0;const after=confirmFixture(before,seat,{type:'discard',tile:96});isolate(before,after);present(before,after);return;}
   const action:Action=kind==='concealed'?{type:'selfKong',tile:selfKongs(before,seat)[0]}:{type:kind},after=confirmFixture(before,seat,action);isolate(before,after);present(before,after);
  }catch(e){setMessage('验收场景未通过：'+String(e));}
 }
 function rapid(){cancel();setConnected(true);try{const p=rapidFixture(seat);isolate(p.before,p.pung,p.kong,p.hu);present(p.before,p.pung);wait(()=>{present(p.pung,p.kong);wait(()=>present(p.kong,p.hu),300);},300);}catch(e){setMessage(String(e));}}
 const view=useMemo(()=>viewFor(game,me),[game,me]),debits=useScoreDebits(view,connected,!tableBusy,completedActions),scene=cocosState(view,{connected,disabled:busy,practice:true,countdown:'验收',selected:null,drawn:view.canDiscard?view.lastDraw:undefined,inspectedKind:null,hintKinds:[],hintLabel:'',effects,simplifiedEffects:simple});
 return <div className={`app polished action-studio${tableOnly?' is-table-only':''}`}>{tableOnly&&<label className="action-preview-switch">满牌布局<select aria-label="满牌布局" value={crowdedAction} onChange={e=>showCrowded(e.target.value as CrowdedAction)}><option value="all">胡＋杠＋碰＋过</option><option value="hu">单胡（自摸）</option><option value="hu-claim">胡＋过</option><option value="pung">单碰＋过</option><option value="kong">单杠（暗杠）</option><option value="hu-pung">胡＋碰＋过</option><option value="kong-pung">杠＋碰＋过</option><option value="multi-kong">胡＋三种可杠牌</option></select></label>}<header><b>动作验收 · 不发送网络操作</b><label>动作玩家<select aria-label="动作玩家" value={seat} onChange={e=>setSeat(Number(e.target.value) as Seat)}>{['本家','下家','对家','上家'].map((n,i)=><option value={i} key={n}>{n}</option>)}</select></label><label>观看座位<select aria-label="观看座位" value={me} onChange={e=>{cancel();setMe(Number(e.target.value) as Seat);setEffects([]);}}>{[0,1,2,3].map(i=><option key={i} value={i}>{i+1}号</option>)}</select></label><button onClick={()=>{cancel();setGame({...claimFixture(),revision:++rev.current});setEffects([]);setMe(0);}}>合法按钮</button><button onClick={()=>setBusy(v=>!v)}>切换禁用</button><label><input type="checkbox" checked={reject} onChange={e=>setReject(e.target.checked)}/>模拟拒绝</label><label><input type="checkbox" checked={simple} onChange={e=>setSimple(e.target.checked)}/>简化特效</label><label><input type="checkbox" checked={sound} onChange={e=>{gameAudio.unlock();setSound(e.target.checked);}}/>声音</label><a href="/">返回应用</a></header>
  <section className="action-studio-table"><CocosTable state={scene} winResult={game.result} scoreDebits={debits} onEntryBusyChange={setTableBusy} onActionComplete={key=>setCompletedActions(old=>{const next=new Set(old);next.add(key);while(next.size>96)next.delete(next.values().next().value!);return next;})} onCommand={c=>{if(c.type!=='action')return;const before=gameRef.current,actor=me;setBusy(true);setMessage('待确认：按压已响应，尚未宣布动作成立');wait(()=>{setBusy(false);if(reject){setMessage('模拟请求失败 · 按钮恢复，未播放成立特效');return;}try{const after=confirmFixture(before,actor,c.action==='selfKong'?{type:'selfKong',tile:c.tile!}:{type:c.action} as Action);after.revision=++rev.current;setGame(after);setEffects(gameFeedback(viewFor(before,actor),viewFor(after,actor)));setMessage('动作已由本地引擎确认');}catch(e){setMessage(String(e));}},650);}}/></section>
  <footer><div className="action-studio-tools">{([['pung','播放碰'],['kong','播放明杠'],['concealed','播放暗杠'],['hu','播放胡'],['added','碰后补杠'],['multi','多家胡牌'],['insert','摸牌插入']] as const).map(([k,label])=><button key={k} onClick={()=>play(k)}>{label}</button>)}<button onClick={()=>{setGame(g=>({...g,revision:++rev.current}));setEffects(e=>e.map(x=>({...x})));setMessage('重推同一事件：不得重播');}}>重复事件</button><button onClick={()=>{cancel();setConnected(false);setMessage('断线；正在清理旧表现');wait(()=>{setConnected(true);setGame(g=>({...g,revision:++rev.current}));setMessage('重连恢复；不得补播旧动作');},500);}}>断线重连</button><button onClick={rapid}>连续触发</button></div><output aria-live="polite">{message}</output></footer>
  <nav className="action-studio-debits" aria-label="罚分验收"><button onClick={()=>{cancel();setConnected(true);setMe(0);setEffects([]);setGame({...crowdedClaimFixture(),revision:++rev.current});setMessage('满牌展示：本家13张手牌，65张弃牌、20张花牌、六组碰牌；按钮由本地引擎判定，不连接服务器');}}>满牌场景</button><select aria-label="满牌操作场景" value={crowdedAction} onChange={e=>{const a=e.target.value as CrowdedAction;setCrowdedAction(a);cancel();setMe(0);setEffects([]);setGame({...crowdedClaimFixture(a),revision:++rev.current});setMessage("满牌操作布局 · 合法动作由本地引擎判定");}}><option value="all">胡＋杠＋碰＋过</option><option value="hu">单胡（自摸）</option><option value="hu-claim">胡＋过</option><option value="pung">单碰＋过</option><option value="kong">单杠（暗杠）</option><option value="hu-pung">胡＋碰＋过</option><option value="kong-pung">杠＋碰＋过</option><option value="multi-kong">胡＋三种可杠牌</option></select><select aria-label="罚分类型" value={debitCase} onChange={e=>setDebitCase(e.target.value as DebitCase)}>{([['concealed','暗杠'],['open','明杠'],['added','补杠'],['flower','花杠'],['winds','四连风'],['fourSame','四张同牌'],['fourFollow','四家同牌'],['capped','余额封顶']] as const).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select><label><input type="checkbox" checked={doubled} onChange={e=>setDoubled(e.target.checked)}/>比下胡×2</label><button onClick={()=>{cancel();setConnected(true);const p=debitFixture(debitCase,seat,doubled?2:1);p.before.id=p.after.id=`action-studio-debit-${rev.current+1}`;present(p.before,p.after);}}>显示扣分</button></nav>
 </div>;
}
