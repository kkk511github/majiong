import {createServer,request as httpRequest} from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {createHash,randomUUID} from 'node:crypto';
import {WebSocketServer,WebSocket} from 'ws';
import {tableSummary} from '../shared/table-settings';
import type {Game} from '../shared/types';

/** Stable optional front door. Authentication and all commands are still
 * validated by the destination service; routing never trusts a client seat. */
export function makeRuntimeGateway(options:{database:string;port?:number;host?:string}){
 const db=new DatabaseSync(options.database,{timeout:5000});
 if(!db.prepare("SELECT 1 FROM sqlite_master WHERE name='runtime_config'").get()){db.close();throw Error('Initialize rollout-aware workers before starting the gateway');}
 db.exec('PRAGMA busy_timeout=0');
 type Client={socket:WebSocket;id:string;role:string;token:string;hello:string;nonce:string;backend?:WebSocket;node?:string;generation:number;tail:Promise<void>;queued:number;tables:boolean;signature:string};
 const people=new Map<string,Client>();let lobbySignature='';
 const active=()=>String(db.prepare('SELECT active FROM runtime_config WHERE id=1').get()!.active);
 function identity(token:string){
  if(!/^[a-f0-9]{64}$/.test(token))return undefined;
  return db.prepare(`SELECT a.id,a.role FROM sessions s JOIN accounts a ON a.id=s.id
   WHERE s.token_hash=? AND s.last_seen>? AND a.must_change=0
   AND NOT EXISTS(SELECT 1 FROM account_suspensions x WHERE x.account_id=a.id AND x.suspended=1)`)
   .get(createHash('sha256').update(token).digest('hex'),Date.now()-30*86400000);
 }
 function owner(id:string){return db.prepare('SELECT node FROM room_routes WHERE EXISTS(SELECT 1 FROM json_each(members) WHERE value=?) LIMIT 1').get(id)?.node as string|undefined;}
 function endpoint(id:string){const row=db.prepare('SELECT endpoint,lease_until FROM runtime_nodes WHERE id=?').get(id);if(!row||Number(row.lease_until)<=Date.now())throw Error('该牌桌所属版本暂不可用，请稍后重连');return String(row.endpoint);}
 function send(c:Client,data:string){if(c.socket.readyState!==WebSocket.OPEN)return;if(c.socket.bufferedAmount+Buffer.byteLength(data)>1024*1024){c.socket.close(1013,'Reconnect to synchronize');return;}c.socket.send(data);}
 function tables(c:Client,force=false){try{
  if(!c.tables)return;const user=identity(c.token);if(!user){c.socket.close(4003,'Authentication required');return;}
  const rows=db.prepare("SELECT summary FROM room_routes WHERE phase<>'closed'").all().map(r=>JSON.parse(String(r.summary)) as Game);
  const targets=new Map(db.prepare('SELECT group_id,target FROM runtime_pool_targets').all().map(r=>[String(r.group_id),Number(r.target)]));
  for(const g of rows)if(g.table&&targets.has(g.table.groupId)){g.table.poolTarget=targets.get(g.table.groupId);if(g.table.poolTarget===0)g.table.settings.autoRenew=false;}
  const list=rows.filter(g=>g.table&&!g.table.closed&&(user.role==='admin'||g.table.settings.visibility==='public'||g.table.creatorId===c.id))
   .sort((a,b)=>Number(b.table!.creatorId===c.id)-Number(a.table!.creatorId===c.id)||a.table!.number-b.table!.number||a.table!.createdAt-b.table!.createdAt)
   .map(g=>tableSummary(g,c.id,id=>{const a=db.prepare('SELECT digest FROM account_avatars WHERE account_id=?').get(id);return a?`/api/avatars/${id}/${a.digest}.jpg`:undefined;}));
  const signature=JSON.stringify(list);if(force||signature!==c.signature){send(c,JSON.stringify({type:'tables',tables:list,serverNow:Date.now()}));c.signature=signature;}
 }catch(error){console.error('Runtime lobby refresh failed',error);send(c,JSON.stringify({type:'error',message:'牌桌列表暂不可用，请稍后重试'}));}}
 const api=createServer((req,res)=>{
  let actor:string|undefined;
  try{
   if(!req.url?.startsWith('/'))throw Error('Invalid path');
   const token=req.headers.authorization?.replace(/^Bearer /,'')??'',user=identity(token);actor=user?String(user.id):undefined;
   const member=/^\/api\/control\/members\/([a-zA-Z0-9_-]{1,100})(?:\/|$)/.exec(req.url)?.[1];
   const personal=/^\/api\/(?:auth\/|voice|diagnostics)/.test(req.url);
   const control=req.url.startsWith('/api/control/');
   const node=control?active():(member&&owner(member))||(personal&&actor&&owner(actor))||active();
   const target=new URL(endpoint(node));
   const upstream=httpRequest({hostname:target.hostname,port:target.port,path:req.url,method:req.method,headers:{...req.headers,connection:'close'}},response=>{
    res.writeHead(response.statusCode??502,response.headers);response.pipe(res);
    if((response.statusCode??500)<400){
     lobbySignature='';
     if(req.url?.startsWith('/api/auth/logout')){if(actor)people.get(actor)?.socket.close(4003,'Signed out');}
     if(req.method!=='GET'&&req.url?.startsWith('/api/control/announcements'))for(const c of people.values())send(c,JSON.stringify({type:'announcementsChanged'}));
    }
   });
   upstream.setTimeout(15000,()=>upstream.destroy());
   upstream.on('error',()=>{if(!res.headersSent){res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'服务暂不可用，请稍后重试'}));}else res.destroy();});
   req.on('aborted',()=>upstream.destroy());req.pipe(upstream);
  }catch{res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'服务暂不可用，请稍后重试'}));}
 });
 const wss=new WebSocketServer({server:api,path:'/ws',maxPayload:49152,perMessageDeflate:false});
 async function connect(c:Client,node:string){
  if(c.node===node&&c.backend?.readyState===WebSocket.OPEN)return;
  const url=new URL(endpoint(node));url.protocol='ws:';url.pathname='/ws';
  const generation=++c.generation;c.backend?.close();c.node=node;
  const backend=new WebSocket(url);c.backend=backend;
  await new Promise<void>((resolve,reject)=>{
   let authenticated=false;const timer=setTimeout(()=>{backend.close();reject(Error('牌桌连接超时'));},5000);
   backend.on('open',()=>backend.send(c.hello));
   backend.on('message',raw=>{
    if(c.generation!==generation||c.socket.readyState!==WebSocket.OPEN)return;
    let message:any;try{message=JSON.parse(String(raw));}catch{return;}
    if(message.type==='tables'){tables(c,true);return;}
    if(message.type==='state')c.tables=false;
    if(message.type==='left'){c.tables=true;c.signature='';}
    if(message.type==='session'){authenticated=true;clearTimeout(timer);resolve();}
    send(c,String(raw));
    if(message.type==='left')tables(c,true);
   });
   backend.on('error',()=>{clearTimeout(timer);if(!authenticated)reject(Error('牌桌连接失败'));});
   backend.on('close',()=>{clearTimeout(timer);if(!authenticated)reject(Error('牌桌拒绝连接'));if(c.generation===generation&&c.socket.readyState===WebSocket.OPEN)c.socket.close(1012,'Reconnect to owning runtime');});
  });
 }
 async function controlCommand(c:Client,node:string,raw:string,requestId:unknown){
  if(typeof requestId!=='string'||!/^[a-zA-Z0-9-]{1,64}$/.test(requestId))throw Error('管理操作缺少请求编号');
  const url=new URL(endpoint(node));url.protocol='ws:';url.pathname='/ws';
  await new Promise<void>((resolve,reject)=>{
   const backend=new WebSocket(url);let sent=false,finished=false;
   const done=(error?:Error)=>{if(finished)return;finished=true;clearTimeout(timer);backend.close();error?reject(error):resolve();};
   const timer=setTimeout(()=>done(Error('管理操作确认超时，请刷新核对结果，不要重复提交')),6000);
   backend.on('open',()=>backend.send(c.hello));
   backend.on('message',bytes=>{let response:any;try{response=JSON.parse(String(bytes));}catch{return;}
    if(response.type==='session'&&!sent){sent=true;backend.send(raw);return;}
    if(response.type==='error'&&!sent){send(c,String(bytes));done();return;}
    if(sent&&(['ack','error'].includes(response.type)&&response.requestId===requestId||response.type==='tablesCreated')){
     send(c,String(bytes));if(response.type!=='tablesCreated'){lobbySignature='';done();}
    }
   });
   backend.on('error',()=>done(Error('管理连接暂不可用')));backend.on('close',()=>{if(!finished)done(Error('管理连接已关闭，请核对操作结果'));});
  });
 }
 wss.on('connection',socket=>{
  let c:Client|undefined,rateAt=Date.now(),rate=0,alive=true;
  const login=setTimeout(()=>{if(!c)socket.close(1008,'Login required');},10000);
  const ping=setInterval(()=>{if(!alive)socket.terminate();else{alive=false;socket.ping();}},30000);
  socket.on('pong',()=>{alive=true;});socket.on('error',()=>{});
  socket.on('message',raw=>{
   try{
    if(Date.now()-rateAt>=1000){rateAt=Date.now();rate=0;}if(++rate>30)throw Error('操作太快');
    const message=JSON.parse(String(raw));if(!message||typeof message.type!=='string')throw Error('消息格式不正确');
    if(!c){
     if(message.type!=='hello')throw Error('请先登录');
     const user=typeof message.token==='string'?identity(message.token):undefined;if(!user){socket.send(JSON.stringify({type:'error',code:'AUTH_REQUIRED',message:'请重新登录'}));socket.close(4003);return;}
     const id=String(user.id),previous=people.get(id);
     const candidate:Client={socket,id,role:String(user.role),token:message.token,hello:String(raw),nonce:randomUUID(),generation:0,tail:Promise.resolve(),queued:0,tables:!owner(id),signature:''};
     db.prepare('INSERT OR REPLACE INTO runtime_presence VALUES(?,?,?)').run(candidate.id,candidate.nonce,Date.now()+45000);
     c=candidate;people.set(id,c);clearTimeout(login);
     // A failed presence write must not log out an otherwise healthy socket.
     previous?.socket.close(4001,'Session replaced');
     const client=c;c.tail=connect(client,owner(id)??active()).then(()=>tables(client,true)).catch(()=>socket.close(1012,'Reconnect to synchronize'));return;
    }
    if(message.type==='hello')throw Error('已经登录');
    const client=c;if(++client.queued>32){socket.close(1013,'Too many pending requests');return;}
    client.tail=client.tail.then(async()=>{
     if(socket.readyState!==WebSocket.OPEN||people.get(client.id)!==client)return;
     const user=identity(client.token);if(!user){socket.close(4003,'Authentication required');return;}
     const existing=owner(client.id);
     // Membership pins routing before any requested destination is considered.
     let node=existing??active();
     if(message.type==='join'&&!existing&&typeof message.code==='string')node=String(db.prepare('SELECT node FROM room_routes WHERE code=?').get(message.code)?.node??active());
     if(message.type==='closeTable'){
      const route=db.prepare('SELECT node FROM room_routes WHERE code=?').get(message.code);
      if(route&&route.node!==node){await controlCommand(client,String(route.node),String(raw),message.requestId);return;}
     }
     if(message.type==='createTables'&&existing)throw Error('请先离开当前牌桌');
     if(message.type==='createExperienceTable'&&typeof message.sourceCode==='string'){
      const route=db.prepare('SELECT node FROM room_routes WHERE code=?').get(message.sourceCode);
      if(route&&route.node!==node){await controlCommand(client,String(route.node),String(raw),message.requestId);return;}
     }
     if(message.type==='tables'){client.tables=true;tables(client,true);return;}
     await connect(client,node);client.backend!.send(String(raw));
    }).catch(error=>send(client,JSON.stringify({type:'error',message:error instanceof Error&&/[\u4e00-\u9fff]/.test(error.message)?error.message:'服务暂时忙碌，请稍后重试',...(typeof message.requestId==='string'?{requestId:message.requestId}:{})}))).finally(()=>{client.queued--;});
   }catch{socket.send(JSON.stringify({type:'error',message:'消息格式不正确或操作太快'}));}
  });
  socket.on('close',()=>{clearTimeout(login);clearInterval(ping);if(c){c.generation++;c.backend?.close();if(people.get(c.id)===c)people.delete(c.id);try{db.prepare('DELETE FROM runtime_presence WHERE account_id=? AND connection_id=?').run(c.id,c.nonce);}catch(error){console.error('Runtime presence cleanup deferred to expiry',error);}}});
 });
 const audit=setInterval(()=>{
  try{
  for(const c of people.values())if(c.socket.readyState===WebSocket.OPEN){
   const user=identity(c.token);if(!user){c.socket.close(4003,'Authentication required');continue;}
   if(c.role!==user.role){c.role=String(user.role);tables(c,true);}
   db.prepare('UPDATE runtime_presence SET expires_at=? WHERE account_id=? AND connection_id=?').run(Date.now()+45000,c.id,c.nonce);
   const desired=owner(c.id)??active();
   if(c.node!==desired)c.tail=c.tail.then(()=>connect(c,desired)).catch(()=>c.socket.close(1012,'Reconnect to synchronize'));
  }
  const signature=JSON.stringify([db.prepare('SELECT game_id,node,phase,summary FROM room_routes ORDER BY game_id').all(),db.prepare('SELECT group_id,target FROM runtime_pool_targets ORDER BY group_id').all()]);
  if(signature!==lobbySignature){lobbySignature=signature;for(const c of people.values())tables(c);}
  }catch(error){console.error('Runtime routing audit delayed',error);}
 },1000);audit.unref();
 return{api,listen:()=>new Promise<number>((resolve,reject)=>{api.once('error',reject);api.listen(options.port??8786,options.host??'127.0.0.1',()=>{api.off('error',reject);resolve((api.address() as {port:number}).port);});}),
  async close(){clearInterval(audit);for(const socket of wss.clients)socket.close(1012,'Gateway maintenance');const force=setTimeout(()=>{for(const socket of wss.clients)socket.terminate();},1000);force.unref();await new Promise<void>(resolve=>wss.close(()=>resolve()));clearTimeout(force);await new Promise<void>(resolve=>api.close(()=>resolve()));db.close();}};
}
