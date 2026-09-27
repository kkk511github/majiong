import {useEffect,useState} from 'react';
import {ControlApi,errorMessage} from './api';
import {ErrorNotice} from './ui';
import {recordDate,recordDayRange} from '../record-dates';
import type {ReconciliationReport} from '../../server/reconciliation';
const labels={passed:'核对通过',warning:'需留意',mismatch:'存在差异',unverifiable:'证据不足'};
export function Reconciliation({api}:{api:ControlApi}){
 const [from,setFrom]=useState(recordDate(Date.now())),[to,setTo]=useState(from),[error,setError]=useState('');
 const [data,setData]=useState<{pending:number;reports:ReconciliationReport[]}>(),[busy,setBusy]=useState(false),[reload,setReload]=useState(0);
 const query=new URLSearchParams({from:String(recordDayRange(from).from),to:String(recordDayRange(to).to)}).toString();
 useEffect(()=>{const abort=new AbortController();api.get<typeof data>(`/reconciliation?${query}`,abort.signal).then(d=>{if(!abort.signal.aborted){setData(d);setError('');}}).catch(e=>{if(!abort.signal.aborted)setError(errorMessage(e));});return()=>abort.abort();},[api,query,reload]);
 useEffect(()=>{if(!data?.pending)return;const timer=setTimeout(()=>setReload(n=>n+1),2000);return()=>clearTimeout(timer);},[data]);
 async function scan(){setBusy(true);try{await api.post(`/reconciliation?${query}`,{});setReload(n=>n+1);}catch(e){setError(errorMessage(e));}finally{setBusy(false);}}
 return <section className="control-card" aria-label="自动对账中心"><h2>自动对账中心</h2>
  <p>已结束牌桌自动排队核对收支、余额与App/后台/日周结计算。这里只报警，不修改积分、不重发账单，不读取已发送的Telegram文件。历史缺失分录将标为证据不足。</p>
  <div className="control-toolbar"><label>开始日期<input type="date" value={from} onChange={e=>e.target.value&&setFrom(e.target.value)}/></label><label>结束日期<input type="date" value={to} onChange={e=>e.target.value&&setTo(e.target.value)}/></label>
   <button disabled={busy} onClick={()=>void scan()}>核对这个范围</button><button onClick={()=>setReload(n=>n+1)}>刷新</button></div>
  {error&&<ErrorNotice>{error}</ErrorNotice>}<p>待核对：{data?.pending??0} 桌；范围最多31天、200桌。</p>
  <table><thead><tr><th>房间号</th><th>结束日期</th><th>状态</th><th>结果说明</th></tr></thead><tbody>{data?.reports.map(r=><tr key={r.game}><td>{r.code}</td><td>{recordDate(r.at)}</td><td>{labels[r.status]}</td><td>{r.issues.join('；')||`${r.rounds}把的收支、净额及终桌余额一致`}</td></tr>)}</tbody></table>
 </section>;
}
