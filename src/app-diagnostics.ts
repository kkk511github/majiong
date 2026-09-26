import {Capacitor,registerPlugin} from '@capacitor/core';
import {diagnosticText,sanitizeDiagnosticReport,type DiagnosticEvent,type DiagnosticEventCode} from '../shared/client-diagnostics';
const native=registerPlugin<{getInfo():Promise<Record<string,string|number|boolean>>}>('AppDiagnostics');
const KEY='jinling:android-diagnostics-v1';
const enabled=()=>['android','ios'].includes(Capacitor.getPlatform())&&Capacitor.isPluginAvailable('AppDiagnostics');
let account='',events:DiagnosticEvent[]=[],autoUploadedAt=0;
let environment:Record<string,string|number|boolean>={},table:{code?:string;round?:number;phase?:string}|undefined;
let sender:((id:string,report:unknown)=>boolean)|undefined,allowed=false,busy=false;
let pendingAutoAt=0,autoTimer:ReturnType<typeof setTimeout>|undefined;
const queued=new Map<string,number>();
let info:Promise<Record<string,string|number|boolean>>|undefined;
function bindAccount(id:string){
 if(account&&account!==id){events=[];autoUploadedAt=0;table=undefined;environment={};queued.clear();pendingAutoAt=0;clearTimeout(autoTimer);}
 account=id;save();
}
async function collect(){
 if(!enabled())throw Error('请在新版 iOS 或安卓 App 中上传日志');
 info??=new Promise<Record<string,string|number|boolean>>(resolve=>{const timeout=setTimeout(()=>resolve({}),3000);native.getInfo().then(value=>{clearTimeout(timeout);resolve(value);},()=>{clearTimeout(timeout);resolve({});});}).catch(()=>({}));
 const metadata=await info;
 const report=sanitizeDiagnosticReport({version:1,at:Date.now(),platform:Capacitor.getPlatform(),environment:{...metadata,...environment,roundRect:typeof CanvasRenderingContext2D.prototype.roundRect==='function'},table,events});
 while(new TextEncoder().encode(JSON.stringify(report)).length>24576&&report.events.length>1)report.events.shift();
 return report;
}
function save(){try{localStorage.setItem(KEY,JSON.stringify({account,events,autoUploadedAt}));}catch{/* Never block gameplay for diagnostics. */}}
function record(code:DiagnosticEventCode,error?:unknown){
 if(!enabled())return;
 const e=error instanceof Error?error:typeof error==='string'?{name:code==='network'?'Network':'Error',message:error,stack:''}:undefined;
 events=[...events.filter(e=>e.at>Date.now()-86400000),{at:Date.now(),code,...(table?.code&&/^\d{6}$/.test(table.code)?{tableCode:table.code}:{}),...(e?{name:diagnosticText(e.name,60),message:diagnosticText(e.message),stack:diagnosticText(e.stack,500)}:{})}].slice(-32);save();
 if(['table-error','window-error','promise-error','react-error'].includes(code))void upload('auto');
}
async function upload(id:string){
 if(!enabled()||!allowed||!sender||!account||busy)return;
 if(id!=='auto'){const expires=queued.get(id);queued.delete(id);if(!expires||expires<=Date.now())return;}
 const failures=events.filter(e=>['table-error','window-error','promise-error','react-error'].includes(e.code)),failure=failures[failures.length-1];
 if(id==='auto'&&(pendingAutoAt||!failure||failure.at<=autoUploadedAt))return;
 busy=true;const owner=account,send=sender;
 try{
  const report=await collect();if(owner!==account||send!==sender||!allowed)return;
  if(send(id,report)&&id==='auto'){pendingAutoAt=failure!.at;autoTimer=setTimeout(()=>{pendingAutoAt=0;},10000);}
 }catch{/* No error banner or recursive logging. */}finally{busy=false;const next=Array.from(queued.keys())[0];if(next&&allowed)setTimeout(()=>void upload(next),0);}
}
export const appDiagnostics={
 enabled,record,
 async manualReport(id:string){if(!enabled())throw Error('请在新版 iOS 或安卓 App 中上传日志');if(!id)throw Error('请先登录后上传日志');bindAccount(id);const report=await collect();if(account!==id)throw Error('登录已变化，请重新上传日志');return report;},
 install(){
  if(!enabled())return ()=>{};
  try{const raw=localStorage.getItem(KEY);if(raw&&raw.length<32768){const saved=JSON.parse(raw);const recent=Array.isArray(saved.events)?saved.events.filter((e:{at?:unknown})=>typeof e?.at==='number'&&e.at>=Date.now()-86400000&&e.at<=Date.now()+300000).slice(-32):[];const clean=sanitizeDiagnosticReport({version:1,at:Date.now(),platform:Capacitor.getPlatform(),environment:{},events:recent});account=typeof saved.account==='string'?saved.account:'';events=clean.events;autoUploadedAt=Number.isSafeInteger(saved.autoUploadedAt)?saved.autoUploadedAt:0;}}catch{}
  record('app-start');
  const onError=(e:ErrorEvent)=>{if(e.target&&e.target!==window){const t=e.target as HTMLImageElement;record('resource-error',`${t.tagName??'asset'} ${t.src??''}`);}else record('window-error',e.error||e.message);},onRejection=(e:PromiseRejectionEvent)=>record('promise-error',e.reason);
  window.addEventListener('error',onError,true);window.addEventListener('unhandledrejection',onRejection);
  return ()=>{window.removeEventListener('error',onError,true);window.removeEventListener('unhandledrejection',onRejection);};
 },
 session(id:string,supported:boolean,send:(id:string,report:unknown)=>boolean){
  if(!enabled())return;
  bindAccount(id);allowed=supported;sender=send;if(supported)void upload('auto');
 },
 ack(id:string,accepted:boolean){if(id==='auto'){if(accepted)autoUploadedAt=pendingAutoAt;pendingAutoAt=0;clearTimeout(autoTimer);save();}},
 disconnect(){allowed=false;sender=undefined;pendingAutoAt=0;clearTimeout(autoTimer);queued.clear();},
 logout(){account='';events=[];autoUploadedAt=0;table=undefined;environment={};sender=undefined;allowed=false;pendingAutoAt=0;clearTimeout(autoTimer);queued.clear();if(enabled())try{localStorage.removeItem(KEY);}catch{}},
 context(value:{code?:string;round?:number;phase?:string}){if(enabled())table={code:value.code,round:value.round,phase:value.phase};},
 tableError(value:{stage?:unknown;name?:unknown;message?:unknown;stack?:unknown}){
  if(!enabled())return;const error=new Error(diagnosticText(value.message)||'Table initialization failed');error.name=diagnosticText(value.name,60)||'TableError';error.stack=diagnosticText(value.stack,500);environment.stage=diagnosticText(value.stage,40);record('table-error',error);
 },
 request(id:string,expiresAt:number){if(typeof id==='string'&&/^[a-f0-9-]{36}$/.test(id)&&expiresAt>Date.now()){queued.set(id,expiresAt);void upload(id);}},
};
