import {Capacitor,registerPlugin} from '@capacitor/core';
import {DIAGNOSTIC_MAX_EVENTS,diagnosticFailure,diagnosticText,diagnosticMeta,sanitizeDiagnosticReport,type DiagnosticEvent,type DiagnosticEventCode,type DiagnosticEventMeta} from '../shared/client-diagnostics';
const native=registerPlugin<{getInfo():Promise<Record<string,string|number|boolean>>}>('AppDiagnostics');
const KEY='jinling:android-diagnostics-v1';
const enabled=()=>['android','ios'].includes(Capacitor.getPlatform())&&Capacitor.isPluginAvailable('AppDiagnostics');
let account='',events:DiagnosticEvent[]=[],autoUploadedAt=0;
let environment:Record<string,string|number|boolean>={},table:{code?:string;round?:number;phase?:string}|undefined;
let sender:((id:string,report:unknown)=>boolean)|undefined,allowed=false,busy=false;
let pendingAutoAt=0,autoTimer:ReturnType<typeof setTimeout>|undefined;
let protocol:1|2=1,dropped=0,sequence=0,lastAutoAttempt=0;
let saveTimer:ReturnType<typeof setTimeout>|undefined;
const queued=new Map<string,number>();
let info:Promise<Record<string,string|number|boolean>>|undefined;
function bindAccount(id:string){
 if(account&&account!==id){events=[];dropped=0;sequence=0;lastAutoAttempt=0;autoUploadedAt=0;table=undefined;environment={};queued.clear();pendingAutoAt=0;clearTimeout(autoTimer);}
 account=id;save();
}
async function collect(version:1|2=protocol){
 if(!enabled())throw Error('请在新版 iOS 或安卓 App 中上传日志');
 info??=new Promise<Record<string,string|number|boolean>>(resolve=>{const timeout=setTimeout(()=>resolve({}),3000);native.getInfo().then(value=>{clearTimeout(timeout);resolve(value);},()=>{clearTimeout(timeout);resolve({});});}).catch(()=>({}));
 const metadata=await info;
 const recent=events.filter(e=>e.at>=Date.now()-86400000);
 const selected=version===2?recent:recent.slice(-32);
 const report=sanitizeDiagnosticReport({version,at:Date.now(),platform:Capacitor.getPlatform(),environment:{...metadata,...environment,roundRect:typeof CanvasRenderingContext2D.prototype.roundRect==='function'},table,events:selected,coverage:{dropped:dropped+events.length-selected.length}});
 // Budget each event once; repeatedly serializing a 256-event ring can stall
 // older WebViews. Reserve space for updated coverage numbers and separators.
 const encoder=new TextEncoder();let bytes=encoder.encode(JSON.stringify({...report,events:[]})).length+128,start=report.events.length;
 while(start>0){const size=encoder.encode(JSON.stringify(report.events[start-1])).length+1;if(bytes+size>24576)break;bytes+=size;start--;}
 if(start){report.events=report.events.slice(start);if(report.coverage)report.coverage.dropped+=start;}
 if(report.coverage){report.coverage.from=report.events[0]?.at??report.at;report.coverage.to=report.events[report.events.length-1]?.at??report.at;}
 return report;
}
function flush(){clearTimeout(saveTimer);saveTimer=undefined;try{localStorage.setItem(KEY,JSON.stringify({account,events,autoUploadedAt,dropped,sequence}));}catch{/* Never block gameplay for diagnostics. */}}
function save(){if(!saveTimer)saveTimer=setTimeout(flush,500);}
function record(code:DiagnosticEventCode,error?:unknown,meta:DiagnosticEventMeta={}){
 if(!enabled())return;
 const e=error instanceof Error?error:typeof error==='string'?{name:code==='network'?'Network':code==='command-sent'||code==='command-ack'?'Command':'Error',message:error,stack:''}:undefined;
 const recent=events.filter(e=>e.at>Date.now()-86400000);
 const event:DiagnosticEvent={at:Date.now(),code,...diagnosticMeta({...meta,sequence:++sequence,round:meta.round??table?.round}),...(table?.code&&/^\d{6}$/.test(table.code)?{tableCode:table.code}:{}),...(e?{name:diagnosticText(e.name,60),message:diagnosticText(e.message),...(e.stack?{stack:diagnosticText(e.stack,500)}:{})}:{})};
 dropped+=events.length-recent.length+Math.max(0,recent.length+1-DIAGNOSTIC_MAX_EVENTS);
 events=[...recent,event].slice(-DIAGNOSTIC_MAX_EVENTS);save();
 if(diagnosticFailure(event)||error==='connection-ready'||error==='heartbeat-received')void upload('auto');
}
async function upload(id:string){
 if(!enabled()||!allowed||!sender||!account||busy)return;
 if(id!=='auto'){const expires=queued.get(id);queued.delete(id);if(!expires||expires<=Date.now())return;}
 const failures=events.filter(e=>protocol===2?diagnosticFailure(e):['table-error','window-error','promise-error','react-error'].includes(e.code)),failure=failures[failures.length-1];
 if(id==='auto'&&(pendingAutoAt||!failure||failure.at<=autoUploadedAt||(lastAutoAttempt>0&&Date.now()-lastAutoAttempt<600000)))return;
 busy=true;const owner=account,send=sender;
 try{
  const report=await collect();if(owner!==account||send!==sender||!allowed)return;
  if(send(id,report)&&id==='auto'){lastAutoAttempt=Date.now();pendingAutoAt=failure!.at;autoTimer=setTimeout(()=>{pendingAutoAt=0;},10000);}
 }catch{/* No error banner or recursive logging. */}finally{busy=false;const next=Array.from(queued.keys())[0];if(next&&allowed)setTimeout(()=>void upload(next),0);}
}
export const appDiagnostics={
 enabled,record,
 async manualReport(id:string,version:1|2=2){if(!enabled())throw Error('请在新版 iOS 或安卓 App 中上传日志');if(!id)throw Error('请先登录后上传日志');bindAccount(id);const report=await collect(version);if(account!==id)throw Error('登录已变化，请重新上传日志');return report;},
 install(){
  if(!enabled())return ()=>{};
  try{const raw=localStorage.getItem(KEY);if(raw&&raw.length<512000){const saved=JSON.parse(raw);const recent=Array.isArray(saved.events)?saved.events.filter((e:{at?:unknown})=>typeof e?.at==='number'&&e.at>=Date.now()-86400000&&e.at<=Date.now()+300000).slice(-DIAGNOSTIC_MAX_EVENTS):[];const clean=sanitizeDiagnosticReport({version:2,at:Date.now(),platform:Capacitor.getPlatform(),environment:{},events:recent});account=typeof saved.account==='string'?saved.account:'';events=clean.events;autoUploadedAt=Number.isSafeInteger(saved.autoUploadedAt)?saved.autoUploadedAt:0;dropped=Number.isSafeInteger(saved.dropped)&&saved.dropped>=0?saved.dropped:0;sequence=Math.max(0,...events.map(e=>e.sequence??0));}}catch{}
  record('app-start');
  const onError=(e:ErrorEvent)=>{if(e.target&&e.target!==window){const t=e.target as HTMLImageElement;record('resource-error',`${t.tagName??'asset'} ${t.src??''}`);}else record('window-error',e.error||e.message);},onRejection=(e:PromiseRejectionEvent)=>record('promise-error',e.reason);
  window.addEventListener('error',onError,true);window.addEventListener('unhandledrejection',onRejection);
  const hidden=()=>{if(document.visibilityState==='hidden')flush();};
  window.addEventListener('pagehide',flush);window.addEventListener('visibilitychange',hidden);
  return ()=>{window.removeEventListener('error',onError,true);window.removeEventListener('unhandledrejection',onRejection);window.removeEventListener('pagehide',flush);window.removeEventListener('visibilitychange',hidden);flush();};
 },
 session(id:string,supported:boolean,send:(id:string,report:unknown)=>boolean,version?:number){
  if(!enabled())return;
  bindAccount(id);protocol=version===2?2:1;allowed=supported;sender=send;if(supported)void upload('auto');
 },
 ack(id:string,accepted:boolean){if(id==='auto'){if(accepted)autoUploadedAt=pendingAutoAt;pendingAutoAt=0;clearTimeout(autoTimer);save();}},
 disconnect(){allowed=false;sender=undefined;pendingAutoAt=0;clearTimeout(autoTimer);queued.clear();},
 logout(){account='';events=[];dropped=0;sequence=0;protocol=1;lastAutoAttempt=0;autoUploadedAt=0;table=undefined;environment={};sender=undefined;allowed=false;pendingAutoAt=0;clearTimeout(autoTimer);clearTimeout(saveTimer);saveTimer=undefined;queued.clear();if(enabled())try{localStorage.removeItem(KEY);}catch{}},
 context(value:{code?:string;round?:number;phase?:string}){if(enabled())table={code:value.code,round:value.round,phase:value.phase};},
 tableError(value:{stage?:unknown;name?:unknown;message?:unknown;stack?:unknown}){
  if(!enabled())return;const error=new Error(diagnosticText(value.message)||'Table initialization failed');error.name=diagnosticText(value.name,60)||'TableError';error.stack=diagnosticText(value.stack,500);environment.stage=diagnosticText(value.stage,40);record('table-error',error);
 },
 request(id:string,expiresAt:number){if(typeof id==='string'&&/^[a-f0-9-]{36}$/.test(id)&&expiresAt>Date.now()){queued.set(id,expiresAt);void upload(id);}},
};
