import {useEffect,useState} from 'react';
import {ControlApi,errorMessage} from './api';
import type {ControlAccount} from './types';
import type {AndroidDiagnosticReport} from '../../shared/client-diagnostics';
import {diagnosticFailure} from '../../shared/client-diagnostics';
import {displayTime} from './model';
import {Modal,ErrorNotice,Loading} from './ui';
type Result={connection:'ready'|'offline'|'unsupported';retentionDays:number;requests:{id:string;source:string;actorId:string|null;createdAt:number;expiresAt:number;status:string;report:AndroidDiagnosticReport|null}[]};
const labels:Record<string,string>={pending:'等待设备上传',received:'已收到',expired:'请求已过期',unsupported:'当前客户端不支持'};
const fields:Record<string,string>={appVersion:'App版本',build:'构建号',android:'Android版本',ios:'iOS版本',api:'系统API',manufacturer:'品牌',model:'机型',webViewPackage:'WebView提供方',webViewVersion:'WebView版本',roundRect:'原生圆角接口',webgl:'WebGL',webgl2:'WebGL2',stage:'加载阶段'};
const sources:Record<string,string>={admin:'后台采集',automatic:'自动异常',user:'用户上传'};
export const diagnosticTime=(at:number)=>new Date(at+8*3600000).toISOString().replace('T',' ').slice(0,23);
const metaLabels:Record<string,string>={sequence:'序号',connectionId:'连接',phase:'连接阶段',operation:'操作类型',requestId:'请求编号',revision:'牌局版本',round:'把数',elapsedMs:'耗时(ms)',rttMs:'心跳RTT(ms)',smoothedRttMs:'平滑RTT(ms)',lastReceivedAgoMs:'距上次收包(ms)',bufferedBytes:'待发送字节',socketState:'Socket状态(0连接/1已开/2关闭中/3关闭)',closeCode:'关闭码',closeReason:'关闭原因',wasClean:'正常关闭',attempt:'重试次数',delayMs:'重试等待(ms)',online:'系统联网',visible:'应用前台',reason:'原因/前阶段',status:'HTTP状态',serverTimeMs:'服务器时间戳(ms)'};
export function Diagnostics({api,member,onClose}:{api:ControlApi;member:ControlAccount;onClose:()=>void}){
 const [data,setData]=useState<Result|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[revision,setRevision]=useState(0),[selected,setSelected]=useState('');
 const [filter,setFilter]=useState('all'),[query,setQuery]=useState('');
 const path=`/members/${encodeURIComponent(member.id)}/diagnostics`;
 useEffect(()=>{const abort=new AbortController();api.get<Result>(path,abort.signal).then(result=>{setData(result);setError('');}).catch(e=>{if(!abort.signal.aborted)setError(errorMessage(e));});return()=>abort.abort();},[api,path,revision]);
 useEffect(()=>{if(!data?.requests.some(r=>r.status==='pending'))return;const timer=setTimeout(()=>setRevision(n=>n+1),3000);return()=>clearTimeout(timer);},[data]);
 const active=data?.requests.find(r=>r.id===selected)??data?.requests[0];
 return <Modal title={`${member.name} · 客户端诊断`} onClose={onClose} wide busy={busy}>
  <p className="control-caption control-diagnostic-caption">支持新版 iOS / 安卓 App。仅采集本应用脱敏诊断，不读取系统日志或其他应用。报告保留7天；离线请求最多等待24小时，App 需重新连接。旧版客户端无法补取日志。</p>
  <div className="control-diagnostic-toolbar"><span>{data?{ready:'客户端诊断已连接',offline:'设备离线，采集后等待下次连接',unsupported:'当前连接不支持，请安装支持日志采集的新版 App'}[data.connection]:'正在读取…'}</span>
   <button className="control-button" disabled={busy||!data} onClick={async()=>{setBusy(true);setError('');try{setData(await api.post<Result>(path));setSelected('');}catch(e){setError(errorMessage(e));}finally{setBusy(false);}}}>采集客户端日志</button>
   <button className="control-button" disabled={busy} onClick={()=>setRevision(n=>n+1)}>刷新</button>
  </div>
  <ErrorNotice>{error}</ErrorNotice>
  {!data&&!error&&<Loading/>}
  {data&&!data.requests.length&&<p>暂无诊断记录。点击采集后，受支持的 iOS / 安卓 App 会自动上传，无需玩家操作。</p>}
  {!!data?.requests.length&&<label className="control-diagnostic-select">诊断记录<select value={active?.id??''} onChange={e=>setSelected(e.target.value)}>{data.requests.map(r=><option value={r.id} key={r.id}>{displayTime(r.createdAt)} · {sources[r.source]??r.source} · {labels[r.status]??r.status}</option>)}</select></label>}
  {active&&<p className="control-caption control-diagnostic-caption">编号：{active.id} · {sources[active.source]} · {labels[active.status]??active.status}{active.actorId?` · 操作管理员 ID：${active.actorId}`:''}</p>}
  {active?.report&&<section className="control-diagnostic-report" aria-label="诊断报告">
   <h3>设备与环境 · {active.report.platform==='ios'?'iOS':'安卓'}</h3><dl>{Object.entries(active.report.environment).map(([key,value])=><div key={key}><dt>{fields[key]??key}</dt><dd>{typeof value==='boolean'?(value?'支持':'不支持'):String(value)}</dd></div>)}</dl>
   {active.report.table&&<p>采集时所在牌桌：{active.report.table.code??'—'} · 第 {active.report.table.round??'—'} 把 · {active.report.table.phase??'—'}</p>}
   <h3>事件时间线（北京时间，毫秒）</h3>
   <p className="control-caption control-diagnostic-caption">本报告 {active.report.events.length} 条。{active.report.coverage?`覆盖 ${diagnosticTime(active.report.coverage.from)} 至 ${diagnosticTime(active.report.coverage.to)}；因过期、容量或上传大小限制未包含 ${active.report.coverage.dropped} 条。`:'旧版报告仅包含最近少量事件。'} 本地最多保留24小时、256条；正常心跳每分钟采样一次，并非全量抓包。事件时间来自设备，可结合心跳的服务器时间核对时钟偏差。1006只表示连接异常结束，不能单凭它判断运营商或服务端故障。</p>
   <div className="control-diagnostic-toolbar">
    <label>事件筛选 <select value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">全部</option><option value="network">网络连接</option><option value="command">操作确认</option><option value="failure">异常</option></select></label>
    <label>搜索 <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="连接编号、请求编号、关闭码"/></label>
    <button className="control-button" onClick={()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(active.report,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download=`diagnostic-${active.id}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}}>导出完整报告</button>
   </div>
   {active.report.events.filter(event=>(filter==='all'||(filter==='network'&&event.code==='network')||(filter==='command'&&event.code.startsWith('command-'))||(filter==='failure'&&diagnosticFailure(event)))&&JSON.stringify(event).toLowerCase().includes(query.toLowerCase())).map((event,i)=><article key={i}><strong>{diagnosticTime(event.at)} · {event.code}{event.tableCode?` · 房号 ${event.tableCode}`:''}</strong><p>{event.name} {event.message}</p><dl>{Object.entries(event).filter(([key])=>key in metaLabels).map(([key,value])=><div key={key}><dt>{metaLabels[key]}</dt><dd>{typeof value==='boolean'?(value?'是':'否'):String(value)}</dd></div>)}</dl>{event.stack&&<pre>{event.stack}</pre>}</article>)}
  </section>}
 </Modal>;
}
