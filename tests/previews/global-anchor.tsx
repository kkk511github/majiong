import React, {useState} from "react";
import {createRoot} from "react-dom/client";
import {RotateCcw,ChevronRight,ArrowRight,Check,Eye} from "lucide-react";
import {act,viewFor} from "../../shared/engine";
import {tileName} from "../../shared/tiles";
import {cocosState} from "../../src/cocos-state";
import {CocosTable} from "../../src/CocosTable";
import {Tile} from "../../src/Tile";
import type {Game,Seat} from "../../shared/types";
import {anchorGame,claimFourth,discardAnchor,advanceToAnchorDraw,opponentDiscard,finishAnchorClaims,canAnchorWin,ANCHOR_TILE,WAIT_WAN,type AnchorScenario} from "../fixtures/global-anchor-game";
import "../../src/styles.css";
import "../../src/classic.css";
import "../../src/polish.css";
import "./global-anchor.css";

const examples:[AnchorScenario,string,string][]=[
 ["original","原例：打6条，听5万","黄色成立 · 不等于能胡范围内所有牌"],
 ["win","实收：打6条，听5条","范围命中 + 选择胡牌 → 外包"],
 ["change","改支：摸3筒，打5万","换听的同一刻，颜色与责任一起取消"],
 ["concealed","例外：三碰后暗杠","补牌再出6条，不建立架牌"],
];
function Preview(){
 const [scenario,setScenario]=useState<AnchorScenario>("original"),[multiple,setMultiple]=useState(1);
 const [g,setGame]=useState(()=>anchorGame()),[step,setStep]=useState(0),[me,setMe]=useState<Seat>(0);
 const [candidate,setCandidate]=useState(22),[notice,setNotice]=useState("");
 const [timeline,setTimeline]=useState<Game[]>(()=>[anchorGame()]);
 const [error,setError]=useState("");
 const v=viewFor(g,me),active=(v.globalAnchorDiscards??[]).length>0;
 const labels=scenario==="change"?["三碰","第四碰","打6条架牌","摸3筒","打5万改支"]:
  scenario==="concealed"?["三碰","暗杠补6条","打6条独钓"]:["三碰","第四碰","打6条架牌","乙出牌","胡牌 / 过"];
 const scene={...cocosState(v,{connected:true,disabled:true,practice:false,countdown:"演示",selected:null,
  drawn:v.lastDraw,inspectedKind:null,hintKinds:[],hintLabel:"",effects:[]}),presentation:"replay" as const};
 const transfers=g.result?.transfers??[],outside=transfers.filter(t=>t.reason==="全球独钓承包");
 const stateLabel=g.result?(outside.length?"外包已结算":"普通胡牌结算"):active?"黄色架牌生效":scenario==="change"&&step>=4?"已改支 · 架牌取消":scenario==="concealed"&&step>=2?"暗杠形成 · 无架牌":"尚未建立架牌";
 function reset(next:AnchorScenario=scenario,m=multiple){const initial=anchorGame(next,m);setScenario(next);setMultiple(m);setGame(initial);setTimeline([initial]);setStep(0);setNotice("");setError("");setCandidate(22);}
 function update(next:Game,nextStep:number,message=""){setGame(next);setTimeline([...timeline.slice(0,step+1),next]);setStep(nextStep);setNotice(message);setError("");}
 function run(action:()=>void){try{action();}catch(e){setError((e as Error).message);}}
 function next(){run(()=>{
  if(step===0)update(claimFourth(g,scenario),1,scenario==="concealed"?"暗杠即时收分按现有规则；它不会产生黄色架牌。":"第四次碰牌已完成，还要打出一张牌才建立架牌。");
  else if(step===1)update(discardAnchor(g),2,scenario==="concealed"?"虽已剩一张手牌，但来源是暗杠补牌，不产生架牌。":"甲打出的这张6条标黄，风险范围为4～8条。");
  else if(scenario==="change"&&step===2)update(advanceToAnchorDraw(g),3,"甲摸到3筒。只是摸牌，旧听牌仍保留，黄色暂不取消。");
  else if(scenario==="change"&&step===3)update(finishAnchorClaims(act(g,0,{type:"discard",tile:WAIT_WAN},6000)),4,"打出5万、留下3筒：服务器已同步清除原架牌和对应外包责任。");
 });}
 function discard(){run(()=>{const next=opponentDiscard(g,candidate),can=canAnchorWin(next);
  update(can?next:finishAnchorClaims(next),3,can?"乙的牌可以胡，但尚未结算。甲必须实际选择胡牌。":"乙正常打出"+tileName(candidate*4)+"。甲不能胡这张牌，不产生外包。");
 });}
 function decide(hu:boolean){run(()=>update(finishAnchorClaims(g,{0:hu?"hu":"pass"}),4,hu?"结算取自真实规则引擎。":"甲选择过，不产生任何架牌外包。"));}
 return <div className="anchor-demo app classic polished">
  <header className="anchor-header"><div><span className="anchor-eyebrow">金陵麻将 · 规则实盘</span><h1>全球独钓<span>黄色架牌</span></h1></div><div className="anchor-header-actions"><span>本地演示 · 不影响正式牌局</span><button onClick={()=>reset()}><RotateCcw size={16}/>重新演示</button></div></header>
  <nav className="anchor-scenarios" aria-label="选择复现场景">{examples.map(([key,title,small],i)=><button key={key} aria-pressed={scenario===key} onClick={()=>reset(key)}><span className="anchor-index">0{i+1}</span><span><strong>{title}</strong><small>{small}</small></span><ChevronRight size={17}/></button>)}</nav>
  <main className="anchor-workspace">
   <section className="anchor-stage"><div className="anchor-stage-title"><span><i className={active?"active":""}/>{stateLabel}</span><button onClick={()=>setMe(((me+1)%4) as Seat)}><Eye size={15}/> {['甲','乙','丙','丁'][me]}的视角</button></div>
    <div className="anchor-table"><CocosTable state={scene} embedded onCommand={()=>{}}/></div>
    <div className="anchor-timeline" aria-label="复现步骤">{labels.map((label,i)=><button key={label} aria-label={label} disabled={i>timeline.length-1} aria-current={i===step?"step":undefined} onClick={()=>{setStep(i);setGame(timeline[i]);setNotice("");}}><b>{i<step?<Check size={13}/>:i+1}</b>{label}{i<labels.length-1&&<ChevronRight size={13}/>}</button>)}</div>
    <div className="anchor-explanation" role="status"><span>{String(step+1).padStart(2,"0")}</span><p>{notice|| (step===0?scenario==="concealed"?"甲已碰三嘴，手中1筒×4和5万。先暗杠，再补牌。":"甲已碰三嘴。丁打出1筒，甲可以碰第四嘴。":stateLabel)}</p></div>
   </section>
   <aside className="anchor-panel">
    <div className="anchor-panel-head"><h2>本步判定</h2><div className="anchor-multiple" aria-label="选择本把倍率"><button aria-pressed={multiple===1} onClick={()=>reset(scenario,1)}>普通局</button><button aria-pressed={multiple===2} onClick={()=>reset(scenario,2)}>比下胡 ×2</button></div></div>
    <div className="anchor-facts"><div><small>架牌基准 · 打出去的牌</small><div className={active?"anchor-card yellow":"anchor-card"}><Tile tile={ANCHOR_TILE}/><span>{active?"6条 · 已标黄":"6条 · 未生效"}</span></div></div><div><small>甲的手牌 · 演示中可见</small><div className="anchor-retained">{g.players[0]!.hand.map(t=><Tile key={t} tile={t}/>)}<span>{g.players[0]!.hand.length===1?"听"+tileName(g.players[0]!.hand[0]):"手中"+g.players[0]!.hand.length+"张"}</span></div></div></div>
    <section className={"anchor-range"+(active?" is-active":"")}><h3>{active?"本次外包风险范围":"当前无有效架牌范围"}</h3><div>{[21,22,23,24,25].map(k=><span key={k}><Tile tile={k*4}/></span>)}</div><p>同花色 ±2，含6条本身。可以正常出牌；只有甲能胡且选择胡牌，才判定外包。</p></section>
    {step<2||scenario==="change"&&step<4?<button className="anchor-primary" onClick={next}>{step===0?scenario==="concealed"?"暗杠1筒，补6条":"碰第四嘴 · 1筒":step===1?"打出6条":step===2?"继续至甲摸3筒":"打出5万 · 改听3筒"}<ArrowRight size={17}/></button>:scenario!=="change"?<section className="anchor-discard-test"><h3>乙试着出一张牌</h3><div className="anchor-candidates">{[20,21,22,23,24,25,26,...(scenario==="win"?[]:[4])].map(k=><button key={k} aria-label={"乙选择"+tileName(k*4)} aria-pressed={candidate===k} disabled={step!==2} onClick={()=>setCandidate(k)}><Tile tile={k*4}/><small>{tileName(k*4)}</small></button>)}</div>{step===2?<button className="anchor-primary" onClick={discard}>乙打出{tileName(candidate*4)}<ArrowRight size={17}/></button>:step===3&&canAnchorWin(g)?<div className="anchor-decisions"><button onClick={()=>decide(false)}>甲选择过</button><button className="anchor-primary" onClick={()=>decide(true)}>甲选择胡牌</button></div>:<button className="anchor-secondary" onClick={()=>{const saved=timeline[2];setGame(saved);setStep(2);setTimeline(timeline.slice(0,3));setNotice("");}}>换一张牌再试</button>}</section>:<div className="anchor-cleared"><Check size={20}/><strong>颜色已取消 · 外包已清除</strong><p>以后即使换回原来的5万，也不会恢复这次架牌。</p></div>}
    <div className="anchor-bill"><div><span>本次架牌外包</span><strong>{outside.reduce((n,t)=>n+t.amount,0)}<small> 分</small></strong></div><p>{outside.length?"乙付甲 "+outside[0].amount+" 分，记入桌外输赢。":g.result?"本次为普通胡牌，未触发架牌外包。":"若成立："+(multiple===1?"普通局50":"比下胡100")+"分。尚未选择胡牌时不扣分。"}</p>{transfers.length>0&&<ul>{transfers.map((t,i)=><li key={i}>{['甲','乙','丙','丁'][t.from]} → {['甲','乙','丙','丁'][t.to]}：{t.reason} {t.amount}分{t.scope==="external"?"（桌外）":"（桌内）"}</li>)}</ul>}</div>
    {error&&<p role="alert">{error}</p>}
   </aside>
  </main>
  <footer className="anchor-footer"><span>只记录第四次碰牌之后打出的那一张 · 同点数的其他牌不染色</span><span>暗杠补牌不架牌 / 摸切不取消 / 主动换听立即取消</span></footer>
 </div>;
}
document.documentElement.dataset.runtime="web";
const root=createRoot(document.getElementById("root")!);root.render(<Preview/>);if(import.meta.hot)import.meta.hot.dispose(()=>root.unmount());
