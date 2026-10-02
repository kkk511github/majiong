/** Allowlisted app diagnostics: never serialize game state, tokens or arbitrary logs. */
export const DIAGNOSTIC_EVENT_CODES=['app-start','network','table-loading','table-ready','table-error','window-error','promise-error','react-error','resource-error','command-sent','command-ack','command-error','command-timeout'] as const;
export type DiagnosticEventCode=typeof DIAGNOSTIC_EVENT_CODES[number];
export const DIAGNOSTIC_MAX_EVENTS=256;
export interface DiagnosticEventMeta {
 requestId?:string;revision?:number;elapsedMs?:number;
 connectionId?:string;phase?:string;operation?:string;reason?:string;closeReason?:string;
 online?:boolean;visible?:boolean;wasClean?:boolean;
 socketState?:number;closeCode?:number;attempt?:number;delayMs?:number;
 rttMs?:number;smoothedRttMs?:number;lastReceivedAgoMs?:number;bufferedBytes?:number;
 status?:number;sequence?:number;round?:number;serverTimeMs?:number;
}
export interface DiagnosticEvent extends DiagnosticEventMeta {at:number;code:DiagnosticEventCode;name?:string;message?:string;stack?:string;tableCode?:string}
export function diagnosticMeta(value:DiagnosticEventMeta):DiagnosticEventMeta {
 const extra:Record<string,string|number|boolean>={};
 if(typeof value.closeReason==='string')extra.closeReason=diagnosticText(value.closeReason,80);
 for(const key of ['connectionId','phase','operation','reason'] as const)
  if(typeof value[key]==='string'&&/^[a-zA-Z0-9_./:-]{1,64}$/.test(value[key]!))extra[key]=value[key]!;
 for(const key of ['online','visible','wasClean'] as const)if(typeof value[key]==='boolean')extra[key]=value[key]!;
 for(const key of ['socketState','closeCode','attempt','delayMs','rttMs','smoothedRttMs','lastReceivedAgoMs','bufferedBytes','status','sequence','round','serverTimeMs'] as const)
  if(typeof value[key]==='number'&&Number.isFinite(value[key])&&value[key]!>=0&&value[key]!<=Number.MAX_SAFE_INTEGER)extra[key]=Math.round(value[key]!);
 return {...extra,...(typeof value.requestId==='string'&&/^[a-zA-Z0-9-]{1,64}$/.test(value.requestId)?{requestId:value.requestId}:{}),
  ...(Number.isSafeInteger(value.revision)&&value.revision!>=0?{revision:value.revision}:{}),
  ...(typeof value.elapsedMs==='number'&&Number.isFinite(value.elapsedMs)&&value.elapsedMs>=0&&value.elapsedMs<=3600000?{elapsedMs:Math.round(value.elapsedMs)}:{})};
}
export interface ClientDiagnosticReport {
 version:1|2;at:number;platform:'android'|'ios';
 coverage?:{from:number;to:number;dropped:number;retentionHours:24};
 environment:Record<string,string|number|boolean>;
 table?:{code?:string;round?:number;phase?:string};
 events:DiagnosticEvent[];
}
export type AndroidDiagnosticReport = ClientDiagnosticReport;
export function diagnosticText(input:unknown,max=180):string {
 if(typeof input!=='string')return '';
 return input.slice(0,4000)
  .replace(/(?:Bearer\s+)[\w.+/=-]+/gi,'Bearer [redacted]')
  .replace(/(?:token|password|passwd|secret|authorization|cookie)["']?\s*[=:]\s*["']?[^\s,"';}]+/gi,'[credential redacted]')
  .replace(/(?:https?|wss?):\/\/[^\s)"']+/g,url=>{try{const u=new URL(url);return u.hostname==='localhost'||u.hostname==='127.0.0.1'?u.pathname:'[url]';}catch{return '[url]';}})
  .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g,'[email]')
  .replace(/\b1[3-9]\d{9}\b/g,'[phone]')
  .replace(/\b[\w+/=-]{28,}\b/g,'[opaque]')
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').slice(0,max);
}
export function sanitizeDiagnosticReport(value:unknown,now=Date.now()):AndroidDiagnosticReport {
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid report');
 const v=value as Record<string,unknown>;
 if((v.version!==1&&v.version!==2)||!['android','ios'].includes(String(v.platform))||!Array.isArray(v.events)||v.events.length>(v.version===2?DIAGNOSTIC_MAX_EVENTS:40))throw Error('Invalid report');
 const limit=v.version===2?DIAGNOSTIC_MAX_EVENTS:32;
 const timestamp=(v:unknown)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=now-86400000&&v<=now+300000?v:now;
 const environment:AndroidDiagnosticReport['environment']={};
 const raw=v.environment&&typeof v.environment==='object'?v.environment as Record<string,unknown>:{};
 for(const key of ['appVersion','build','android','ios','manufacturer','model','webViewPackage','webViewVersion','stage'])if(typeof raw[key]==='string')environment[key]=diagnosticText(raw[key],100);
 if(typeof raw.api==='number'&&Number.isInteger(raw.api)&&raw.api>=24&&raw.api<=100)environment.api=raw.api;
 for(const key of ['roundRect','webgl','webgl2'])if(typeof raw[key]==='boolean')environment[key]=raw[key];
 const events=v.events.filter((e):e is Record<string,unknown>=>!!e&&typeof e==='object'&&!Array.isArray(e)).filter(e=>DIAGNOSTIC_EVENT_CODES.includes(e.code as DiagnosticEventCode)).slice(-limit).map(e=>({at:timestamp(e.at),code:e.code as DiagnosticEventCode,...(typeof e.tableCode==='string'&&/^\d{6}$/.test(e.tableCode)?{tableCode:e.tableCode}:{}),...(typeof e.name==='string'?{name:diagnosticText(e.name,60)}:{}),...(typeof e.message==='string'?{message:diagnosticText(e.message)}:{}),...(typeof e.stack==='string'?{stack:diagnosticText(e.stack,500)}:{})}));
 // Match metadata by the same accepted event sequence (not by raw array index).
 const accepted=v.events.filter((e):e is Record<string,unknown>=>!!e&&typeof e==='object'&&!Array.isArray(e)).filter(e=>DIAGNOSTIC_EVENT_CODES.includes(e.code as DiagnosticEventCode)).slice(-limit);
 const report:ClientDiagnosticReport={version:v.version===2?2:1,at:timestamp(v.at),platform:v.platform as 'ios'|'android',environment,events:events.map((event,index)=>({...event,...diagnosticMeta(accepted[index] as DiagnosticEventMeta)}))};
 if(report.version===2){
  const coverage=v.coverage as Record<string,unknown>|undefined;
  report.coverage={from:report.events[0]?.at??report.at,to:report.events[report.events.length-1]?.at??report.at,dropped:typeof coverage?.dropped==='number'&&Number.isSafeInteger(coverage.dropped)&&coverage.dropped>=0?coverage.dropped:0,retentionHours:24};
 }
 if(v.table&&typeof v.table==='object'){
  const t=v.table as Record<string,unknown>,table:NonNullable<AndroidDiagnosticReport['table']>={};
  if(typeof t.code==='string'&&/^\d{6}$/.test(t.code))table.code=t.code;
  if(typeof t.round==='number'&&Number.isInteger(t.round)&&t.round>=0&&t.round<=32)table.round=t.round;
  if(['waiting','playing','claiming','ended','finished'].includes(String(t.phase)))table.phase=String(t.phase);
  report.table=table;
 }
 return report;
}
/** Healthy heartbeats are not failures; browsers cannot explain the cause of code 1006. */
export function diagnosticFailure(e:DiagnosticEvent):boolean {
 return ['table-error','window-error','promise-error','react-error','command-timeout','command-error'].includes(e.code)||
  (e.code==='network'&&['socket-error','socket-close','heartbeat-timeout','connect-timeout','sync-timeout','tables-timeout','send-failed','http-failed','message-invalid'].includes(e.message??''));
}
