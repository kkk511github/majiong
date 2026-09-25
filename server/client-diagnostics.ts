import {randomUUID} from 'node:crypto';
import type {DatabaseSync} from 'node:sqlite';
import {sanitizeDiagnosticReport} from '../shared/client-diagnostics';
import {AuthError} from './accounts';
export type DiagnosticConnection='ready'|'offline'|'unsupported';
type Dependencies={connection:(id:string)=>DiagnosticConnection;send:(account:string,id:string,expiresAt:number)=>void;now?:()=>number};
const DAY=86400000;
export function createClientDiagnostics(db:DatabaseSync,deps:Dependencies){
 db.exec(`CREATE TABLE IF NOT EXISTS client_diagnostic_requests(id TEXT PRIMARY KEY,account_id TEXT NOT NULL,actor_id TEXT,created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,status TEXT NOT NULL,payload TEXT);
 CREATE INDEX IF NOT EXISTS diagnostic_account_time ON client_diagnostic_requests(account_id,created_at);
 CREATE TRIGGER IF NOT EXISTS diagnostic_delete_account AFTER DELETE ON accounts BEGIN DELETE FROM client_diagnostic_requests WHERE account_id=old.id; END;`);
 if(!db.prepare('PRAGMA table_info(client_diagnostic_requests)').all().some(c=>c.name==='source')){
  db.exec("ALTER TABLE client_diagnostic_requests ADD COLUMN source TEXT NOT NULL DEFAULT 'automatic'; UPDATE client_diagnostic_requests SET source='admin' WHERE actor_id IS NOT NULL;");
 }
 const now=deps.now??Date.now;
 function prune(){db.prepare('DELETE FROM client_diagnostic_requests WHERE created_at<?').run(now()-7*DAY);db.prepare("UPDATE client_diagnostic_requests SET status='expired' WHERE status='pending' AND expires_at<=?").run(now());}
 function offer(account:string){
  prune();const row=db.prepare("SELECT id,expires_at FROM client_diagnostic_requests WHERE account_id=? AND status='pending' ORDER BY created_at DESC LIMIT 1").get(account);if(!row)return;
  const state=deps.connection(account);
  if(state==='ready')deps.send(account,String(row.id),Number(row.expires_at));
  else if(state==='unsupported')db.prepare("UPDATE client_diagnostic_requests SET status='unsupported' WHERE id=?").run(row.id);
 }
 function request(actor:string,account:string){
  prune();const pending=db.prepare("SELECT id FROM client_diagnostic_requests WHERE account_id=? AND status='pending'").get(account);
  if(pending){offer(account);return String(pending.id);}
  if(db.prepare('SELECT id FROM client_diagnostic_requests WHERE account_id=? AND created_at>? LIMIT 1').get(account,now()-60000))throw Error('采集太频繁，请一分钟后重试');
  if(Number(db.prepare('SELECT COUNT(*) AS n FROM client_diagnostic_requests').get()!.n)>=2000)throw Error('诊断记录已达上限，请稍后再试');
  const id=randomUUID();db.prepare("INSERT INTO client_diagnostic_requests(id,account_id,actor_id,created_at,expires_at,status,payload,source) VALUES(?,?,?,?,?,?,NULL,'admin')").run(id,account,actor,now(),now()+DAY,'pending');offer(account);return id;
 }
 function receive(account:string,id:string,value:unknown){
  prune();const serialized=JSON.stringify(value);if(!serialized||Buffer.byteLength(serialized)>32768)throw Error('Report too large');
  const report=sanitizeDiagnosticReport(value,now());
  if(id==='auto'){
   if(!report.events.some(e=>['table-error','window-error','promise-error','react-error'].includes(e.code)))throw Error('No failure');
   if(db.prepare('SELECT id FROM client_diagnostic_requests WHERE account_id=? AND created_at>? LIMIT 1').get(account,now()-600000))return;
   if(Number(db.prepare('SELECT COUNT(*) AS n FROM client_diagnostic_requests').get()!.n)>=2000)return;
   db.prepare("INSERT INTO client_diagnostic_requests(id,account_id,actor_id,created_at,expires_at,status,payload,source) VALUES(?,?,?,?,?,?,?,'automatic')").run(randomUUID(),account,null,now(),now()+DAY,'received',JSON.stringify(report));return;
  }
  const row=db.prepare('SELECT status,expires_at FROM client_diagnostic_requests WHERE id=? AND account_id=?').get(id,account);
  if(row?.status==='received')return;
  if(!row||row.status!=='pending'||Number(row.expires_at)<=now())throw Error('Invalid request');
  db.prepare("UPDATE client_diagnostic_requests SET status='received',payload=? WHERE id=? AND account_id=?").run(JSON.stringify(report),id,account);
 }
 function submit(account:string,id:string,value:unknown){
  prune();if(!/^[a-f0-9-]{36}$/i.test(id))throw new AuthError('上传编号不正确');
  const previous=db.prepare('SELECT account_id,source FROM client_diagnostic_requests WHERE id=?').get(id);
  if(previous){if(previous.account_id!==account||previous.source!=='user')throw new AuthError('上传编号不可用',409);return{id,received:true};}
  if(db.prepare("SELECT 1 FROM client_diagnostic_requests WHERE account_id=? AND source='user' AND created_at>? LIMIT 1").get(account,now()-60000))throw new AuthError('日志已上传，请一分钟后再试',429);
  if(Number(db.prepare('SELECT COUNT(*) AS n FROM client_diagnostic_requests').get()!.n)>=2000)throw new AuthError('诊断记录已达上限，请稍后再试',503);
  let report;try{if(Buffer.byteLength(JSON.stringify(value)??'')>32768)throw Error();report=sanitizeDiagnosticReport(value,now());}catch{throw new AuthError('日志格式不正确或内容过长');}
  db.prepare("INSERT INTO client_diagnostic_requests(id,account_id,actor_id,created_at,expires_at,status,payload,source) VALUES(?,?,NULL,?,?,?,?,'user')").run(id,account,now(),now()+DAY,'received',JSON.stringify(report));
  return{id,received:true};
 }
 function list(account:string){prune();return {connection:deps.connection(account),retentionDays:7,requests:db.prepare('SELECT id,actor_id,created_at,expires_at,status,payload,source FROM client_diagnostic_requests WHERE account_id=? ORDER BY created_at DESC,rowid DESC LIMIT 20').all(account).map(row=>({id:String(row.id),source:String(row.source),actorId:row.actor_id,createdAt:Number(row.created_at),expiresAt:Number(row.expires_at),status:String(row.status),report:row.payload?JSON.parse(String(row.payload)):null}))};}
 return {request,receive,offer,list,submit};
}
