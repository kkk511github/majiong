import {it,expect} from 'vitest';
import {DatabaseSync} from 'node:sqlite';
import {createClientDiagnostics,type DiagnosticConnection} from '../server/client-diagnostics';
import {diagnosticText,sanitizeDiagnosticReport} from '../shared/client-diagnostics';
import {roundedRectPath} from '../cocos-table/assets/scripts/canvas-compat';
const report=(at:number)=>({version:1,at,platform:'android',environment:{appVersion:'0.8.1',webViewVersion:'83.0.4103.120',roundRect:false,token:'sensitive'},table:{code:'845400',round:1,phase:'playing',hand:[1,2,3]},events:[{at,code:'table-error',name:'TypeError',message:'roundRect is not a function',stack:'at https://localhost/cocos-table/index.js?token=secret:1'}]});
function fixture(){const db=new DatabaseSync(':memory:');db.exec("CREATE TABLE accounts(id TEXT PRIMARY KEY);INSERT INTO accounts VALUES('a'),('b')");let now=1_000_000,state:DiagnosticConnection='offline';const sent:string[]=[];const manager=createClientDiagnostics(db,{now:()=>now,connection:()=>state,send:(_,id)=>sent.push(id)});return{db,manager,sent,setState:(s:DiagnosticConnection)=>state=s,tick:(n:number)=>now+=n,now:()=>now};}
it('queues offline requests, delivers on supported login and prevents cross-account/expired uploads',()=>{
 const f=fixture(),id=f.manager.request('admin','a');expect(f.sent).toEqual([]);expect(f.manager.request('admin2','a')).toBe(id);
 f.setState('ready');f.manager.offer('a');expect(f.sent).toEqual([id]);
 expect(()=>f.manager.receive('b',id,report(f.now()))).toThrow();
 f.manager.receive('a',id,report(f.now()));f.manager.receive('a',id,report(f.now()));
 const rows=f.manager.list('a').requests;expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({actorId:'admin',status:'received'});
 expect(JSON.stringify(rows)).not.toContain('sensitive');expect(rows[0].report.table.hand).toBeUndefined();
 expect(()=>f.manager.request('admin','a')).toThrow(/频繁/);f.tick(60001);const second=f.manager.request('admin','a');f.tick(86400001);
 expect(()=>f.manager.receive('a',second,report(f.now()))).toThrow();expect(f.manager.list('a').requests[0].status).toBe('expired');
 f.tick(7*86400000);expect(f.manager.list('a').requests).toEqual([]);f.db.close();
});
it('marks legacy connections unsupported and caps automatic reports and payload size',()=>{
 const f=fixture();f.setState('unsupported');f.manager.request('admin','a');expect(f.manager.list('a').requests[0].status).toBe('unsupported');expect(f.sent).toEqual([]);
 f.tick(600001);f.manager.receive('a','auto',report(f.now()));f.manager.receive('a','auto',report(f.now()));expect(f.manager.list('a').requests).toHaveLength(2);
 expect(()=>f.manager.receive('a','auto',{...report(f.now()),padding:'x'.repeat(40000)})).toThrow(/large/);
 f.db.exec("DELETE FROM accounts WHERE id='a'");expect(f.manager.list('a').requests).toEqual([]);f.db.close();
});
it('retains only allowlisted diagnostics and redacts credentials, URLs, contact data and opaque strings',()=>{
 const now=Date.now(),clean=sanitizeDiagnosticReport({...report(now),password:'secret',events:[{at:now,code:'window-error',message:'password="dontlog" token="abc" Bearer bearersecret user@mail.test 13812345678 https://outside.example/?private=true',stack:'a'.repeat(80)}]},now);
 const encoded=JSON.stringify(clean);for(const value of ['dontlog','bearersecret','user@mail.test','13812345678','outside.example','private=true','sensitive'])expect(encoded).not.toContain(value);
 expect(diagnosticText('{"token":"abc"}')).not.toContain('abc');expect(sanitizeDiagnosticReport({...report(now),platform:'ios',environment:{ios:'15.3',deviceId:'secret'}},now)).toMatchObject({platform:'ios',environment:{ios:'15.3'}});
 expect(()=>sanitizeDiagnosticReport({...report(now),platform:'web'},now)).toThrow();
 expect(()=>sanitizeDiagnosticReport({...report(now),events:Array(41).fill({})},now)).toThrow();
});
it('manual uploads are idempotent, separately limited and cannot attach to another account',()=>{
 const f=fixture(),id='00000000-0000-4000-8000-000000000001';
 const payload={...report(f.now()),platform:'ios',events:[]};
 f.manager.submit('a',id,payload);f.manager.submit('a',id,payload);
 expect(f.manager.list('a').requests).toHaveLength(1);expect(f.manager.list('a').requests[0]).toMatchObject({source:'user',status:'received',report:{platform:'ios'}});
 expect(()=>f.manager.submit('b',id,payload)).toThrow();
 expect(()=>f.manager.submit('a','00000000-0000-4000-8000-000000000002',payload)).toThrow(/一分钟/);
 f.tick(60001);f.manager.submit('a','00000000-0000-4000-8000-000000000002',payload);expect(f.manager.list('a').requests).toHaveLength(2);f.db.close();
});
it('uses native rounded rectangles when present and old canvas paths otherwise',()=>{
 const calls:unknown[][]=[];const ctx=Object.fromEntries(['moveTo','lineTo','arcTo','closePath'].map(k=>[k,(...args:unknown[])=>calls.push([k,...args])]));
 roundedRectPath(ctx,12,12,232,328,14);expect(calls.filter(c=>c[0]==='arcTo')).toHaveLength(4);expect(calls[calls.length-1]).toEqual(['closePath']);
 calls.length=0;roundedRectPath({...ctx,roundRect:(...args:unknown[])=>calls.push(['native',...args])},12,12,232,328,14);expect(calls).toEqual([['native',12,12,232,328,14]]);
});
