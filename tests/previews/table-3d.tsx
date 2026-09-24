import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { fullMeldFixture, busyTableFixture } from './table-full-meld-fixture';
import { install3DStudy } from './table-3d-cocos';
import { referenceSnapshot } from './table-reference-layout';
import './table-3d.css';

function Preview() {
  const [mode,setMode]=useState('reference'),[me,setMe]=useState(0),[enabled,setEnabled]=useState(true),[ready,setReady]=useState(false),[error,setError]=useState('');
  const frame=useRef<HTMLIFrameElement>(null), handle=useRef<Awaited<ReturnType<typeof install3DStudy>> | null>(null);
  const state=useMemo(()=>{
    const s=mode==='reference'?referenceSnapshot():mode==='busy'||mode==='dense-flowers'?busyTableFixture():fullMeldFixture(mode==='kong'?'kong':'pung');
    if(mode==='dense-flowers')for(const p of s.players)p.flowers=Array.from({length:p.seat%2?2:8},(_,i)=>124+(p.seat===0?0:p.seat===2?8:p.seat===1?16:18)+i);
    if(mode==='normal'||mode==='flowers') for(const p of s.players) {
      p.melds=p.melds.slice(0,1); p.handCount=10; p.hand=Array.from({length:10},(_,i)=>64+i);
      p.discards=[108+p.seat,112+p.seat,116+p.seat,120+p.seat,16+p.seat,20+p.seat];
    }
    if(mode==='flowers')for(const p of s.players)p.flowers=Array.from({length:5},(_,i)=>124+p.seat*5+i);
    if(mode==='stack') for(const p of s.players) {
      p.melds=p.melds.slice(0,2).map((m,i)=>({...m,type:'kong',tiles:Array.from({length:4},(_,copy)=>m.tiles[0]+copy),concealed:i===0,added:i===1}));
      p.handCount=7;p.hand=Array.from({length:7},(_,i)=>64+i);
    }
    s.me=me;s.turn=me;s.drawn=undefined;s.disabled=true;s.effects=[];s.externalControls=true;
    s.players=s.players.map(p=>({...p,hand:p.seat===me?(p.hand.length?p.hand:Array.from({length:p.handCount},(_,i)=>64+i)):[]}));
    s.code='本地3D试验';s.rulesName='分区布局';s.revision++;
    return s;
  },[mode,me]);
  useEffect(()=>{
    let disposed=false, installing=false;
    const load=async(event:MessageEvent)=>{
      if(event.source!==frame.current?.contentWindow || event.origin!==location.origin || event.data?.type!=='ready' || installing) return;
      installing=true;
      try { const h=await install3DStudy(frame.current!); if(disposed)h.destroy();else{handle.current=h;setReady(true);} }
      catch(e){if(!disposed)setError((e as Error).message);}
    };
    window.addEventListener('message',load);
    return ()=>{disposed=true;window.removeEventListener('message',load);handle.current?.destroy();};
  },[]);
  useEffect(()=>{if(ready)try{handle.current?.sync(state,enabled);}catch(e){setError((e as Error).message);console.error(e);}},[ready,state,enabled]);
  useEffect(()=>{const resize=()=>handle.current?.sync(state,enabled);window.addEventListener('resize',resize);return()=>window.removeEventListener('resize',resize);},[state,enabled]);
  return <main className="study"><header><div><strong>真实 Cocos · 3D 牌面试验</strong><small>弃牌/副露3D，保留原手牌 · 不连接线上</small></div>
    <label>视角<select aria-label="玩家视角" value={me} onChange={e=>setMe(Number(e.target.value))}>{['自己','下家','对家','上家'].map((label,i)=><option key={i} value={i}>{label}</option>)}</select></label>
    <label>场景<select aria-label="场景" value={mode} onChange={e=>setMode(e.target.value)}><option value="reference">参考图3 · 实测对齐</option><option value="normal">正常牌桌</option><option value="flowers">四家同尺寸花牌</option><option value="pung">四家满碰</option><option value="kong">四家满明杠</option><option value="stack">暗杠与补杠</option><option value="busy">每家27张弃牌</option><option value="dense-flowers">多花牌＋三排弃牌</option></select></label>
    <button aria-pressed={enabled} onClick={()=>setEnabled(v=>!v)}>{enabled?'正在看3D · 切回原版':'正在看原版 · 切到3D'}</button>
    <span role="status">{error||(!ready?'加载真实牌桌与3D牌体…':'牌面方向跟随所属玩家')}</span>
  </header>{error && <p className="study-error" role="alert">3D预览暂未完成：{error}</p>}<iframe ref={frame} title="真实 Cocos 3D 牌桌" src="/output/cocos-table-3d-preview/build/web-mobile/index.html?channel=3d-study"/></main>;
}
createRoot(document.getElementById('root')!).render(<Preview/>);
