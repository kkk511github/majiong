/** Allowlisted app diagnostics: never serialize game state, tokens or arbitrary logs. */
export const DIAGNOSTIC_EVENT_CODES=['app-start','network','table-loading','table-ready','table-error','window-error','promise-error','react-error','resource-error'] as const;
export type DiagnosticEventCode=typeof DIAGNOSTIC_EVENT_CODES[number];
export interface DiagnosticEvent {at:number;code:DiagnosticEventCode;name?:string;message?:string;stack?:string;tableCode?:string}
export interface ClientDiagnosticReport {
 version:1;at:number;platform:'android'|'ios';
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
  .replace(/https?:\/\/[^\s)"']+/g,url=>{try{const u=new URL(url);return u.hostname==='localhost'||u.hostname==='127.0.0.1'?u.pathname:'[url]';}catch{return '[url]';}})
  .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g,'[email]')
  .replace(/\b1[3-9]\d{9}\b/g,'[phone]')
  .replace(/\b[\w+/=-]{28,}\b/g,'[opaque]')
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').slice(0,max);
}
export function sanitizeDiagnosticReport(value:unknown,now=Date.now()):AndroidDiagnosticReport {
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid report');
 const v=value as Record<string,unknown>;
 if(v.version!==1||!['android','ios'].includes(String(v.platform))||!Array.isArray(v.events)||v.events.length>40)throw Error('Invalid report');
 const timestamp=(v:unknown)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=now-86400000&&v<=now+300000?v:now;
 const environment:AndroidDiagnosticReport['environment']={};
 const raw=v.environment&&typeof v.environment==='object'?v.environment as Record<string,unknown>:{};
 for(const key of ['appVersion','build','android','ios','manufacturer','model','webViewPackage','webViewVersion','stage'])if(typeof raw[key]==='string')environment[key]=diagnosticText(raw[key],100);
 if(typeof raw.api==='number'&&Number.isInteger(raw.api)&&raw.api>=24&&raw.api<=100)environment.api=raw.api;
 for(const key of ['roundRect','webgl','webgl2'])if(typeof raw[key]==='boolean')environment[key]=raw[key];
 const events=v.events.filter((e):e is Record<string,unknown>=>!!e&&typeof e==='object'&&!Array.isArray(e)).filter(e=>DIAGNOSTIC_EVENT_CODES.includes(e.code as DiagnosticEventCode)).slice(-32).map(e=>({at:timestamp(e.at),code:e.code as DiagnosticEventCode,...(typeof e.tableCode==='string'&&/^\d{6}$/.test(e.tableCode)?{tableCode:e.tableCode}:{}),...(typeof e.name==='string'?{name:diagnosticText(e.name,60)}:{}),...(typeof e.message==='string'?{message:diagnosticText(e.message)}:{}),...(typeof e.stack==='string'?{stack:diagnosticText(e.stack,500)}:{})}));
 const report:ClientDiagnosticReport={version:1,at:timestamp(v.at),platform:v.platform as 'ios'|'android',environment,events};
 if(v.table&&typeof v.table==='object'){
  const t=v.table as Record<string,unknown>,table:NonNullable<AndroidDiagnosticReport['table']>={};
  if(typeof t.code==='string'&&/^\d{6}$/.test(t.code))table.code=t.code;
  if(typeof t.round==='number'&&Number.isInteger(t.round)&&t.round>=0&&t.round<=32)table.round=t.round;
  if(['waiting','playing','claiming','ended','finished'].includes(String(t.phase)))table.phase=String(t.phase);
  report.table=table;
 }
 return report;
}
