import {afterEach,it,expect} from 'vitest';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {WebSocket} from 'ws';
import {makeServer} from '../server/service';
import {seedTestAdmin,registerTestPort,peerCredential} from './account-fixtures';
const cleanups:(()=>Promise<void>)[]=[];
afterEach(async()=>{for(const close of cleanups.splice(0))await close();});
async function fixture(){
 const dir=mkdtempSync(join(tmpdir(),'mahjong-diagnostics-')),database=join(dir,'test.sqlite');await seedTestAdmin(database);
 const server=makeServer({database,port:0,host:'127.0.0.1',tickMs:25}),port=await server.listen();registerTestPort(port);
 const admin=await peerCredential(port,'诊断管理员'),member=await peerCredential(port,'诊断玩家'),sockets:WebSocket[]=[];
 cleanups.push(async()=>{sockets.forEach(s=>s.close());await server.close();rmSync(dir,{recursive:true,force:true});});
 async function connect(supported=true,platform='android'){
  const socket=new WebSocket(`ws://127.0.0.1:${port}/ws`);sockets.push(socket);const messages:any[]=[];socket.on('message',r=>messages.push(JSON.parse(String(r))));await new Promise<void>(r=>socket.once('open',r));
  const send=(msg:unknown)=>socket.send(JSON.stringify(msg));
  async function read(type:string){const until=Date.now()+4000;while(Date.now()<until){const index=messages.findIndex(m=>m.type===type);if(index>=0)return messages.splice(index,1)[0];await new Promise(r=>setTimeout(r,10));}throw Error('Missing '+type);}
  send({type:'hello',token:member,name:'诊断玩家',clientVersion:'0.8.1',capabilities:platform==='ios'?{clientDiagnostics:supported}:{androidDiagnostics:supported}});const session=await read('session');return{socket,send,read,messages,id:session.id};
 }
 async function call(id:string,post=false,token=admin){const r=await fetch(`http://127.0.0.1:${port}/api/control/members/${id}/diagnostics`,{method:post?'POST':'GET',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(post?{body:'{}'}:{})});return{status:r.status,data:await r.json()};}
 async function upload(body:unknown,token=member){const r=await fetch(`http://127.0.0.1:${port}/api/diagnostics`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(body)});return{status:r.status,data:await r.json()};}
 return{connect,call,member,upload};
}
it.each(['android','ios'])('admin pulls %s logs over the live channel; metadata is sanitized and game pings continue',async(platform)=>{
 const f=await fixture(),peer=await f.connect(true,platform);
 expect((await f.call(peer.id,false,'')).status).toBe(401);expect((await f.call(peer.id,false,f.member)).status).toBe(403);
 const requested=await f.call(peer.id,true);expect(requested.status).toBe(200);const command=await peer.read('diagnosticRequest');
 expect(requested.data.requests[0].actorId).toBeTruthy();
 const report={version:1,at:Date.now(),platform,environment:{appVersion:'0.8.1',webViewVersion:'83',token:'hidden'},table:{code:'123456',hand:[1,2]},events:Array.from({length:32},()=>({at:Date.now(),code:'table-error',message:'roundRect missing',stack:'at local.js:1\n'.repeat(35)}))};
 expect(JSON.stringify(report).length).toBeGreaterThan(8192);
 peer.send({type:'diagnosticUpload',diagnosticId:command.id,report});expect((await peer.read('diagnosticAck')).accepted).toBe(true);
 const received=(await f.call(peer.id)).data.requests[0];expect(received.status).toBe('received');expect(received.report.environment.token).toBeUndefined();expect(received.report.table.hand).toBeUndefined();
 peer.send({type:'diagnosticUpload',diagnosticId:command.id,report:{...report,events:[],padding:'x'.repeat(34000)}});
 expect((await peer.read('diagnosticAck')).accepted).toBe(false);
 peer.send({type:'ping',sentAt:123});expect((await peer.read('pong')).sentAt).toBe(123);expect(peer.messages.some(m=>m.type==='error')).toBe(false);
});
it.each(['ios','android'])('%s user can upload without a game socket; server binds ownership and retries are idempotent',async platform=>{
 const f=await fixture(),peer=await f.connect(true,platform);peer.socket.close();
 const body={id:'00000000-0000-4000-8000-000000000001',accountId:'another-member',report:{version:1,at:Date.now(),platform,environment:{ios:'15.3',password:'hidden'},events:[]}};
 expect((await f.upload(body,'')).status).toBe(401);
 expect((await f.upload(body)).status).toBe(200);expect((await f.upload(body)).status).toBe(200);
 const records=(await f.call(peer.id)).data.requests;expect(records).toHaveLength(1);expect(records[0]).toMatchObject({source:'user',report:{platform}});expect(records[0].report.environment.password).toBeUndefined();
 expect((await f.upload({...body,id:'00000000-0000-4000-8000-000000000002'})).status).toBe(429);
});
it('old clients are marked unsupported while offline requests are delivered on the next supported login',async()=>{
 const f=await fixture(),old=await f.connect(false);
 expect((await f.call(old.id,true)).data.requests[0].status).toBe('unsupported');
 expect(old.messages.some(m=>m.type==='diagnosticRequest')).toBe(false);
 const other=await fixture(),first=await other.connect();first.socket.close();await new Promise(r=>setTimeout(r,80));
 expect((await other.call(first.id,true)).data.requests[0].status).toBe('pending');
 const again=await other.connect();expect((await again.read('diagnosticRequest')).id).toBeTruthy();
});
