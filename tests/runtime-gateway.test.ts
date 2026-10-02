import {it,expect} from 'vitest';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:net';
import {createServer as createHttpServer} from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {WebSocket} from 'ws';
import {makeServer} from '../server/service';
import {makeRuntimeGateway} from '../server/runtime-gateway';
import {activateRuntime,retireRuntime} from '../server/runtime-ownership';
import {seedTestAdmin,registerTestPort,peerCredential,controlCredential} from './account-fixtures';
import {debitGame} from './fixtures/debit-game';
import {createGame} from '../shared/engine';
import {normalizeTableSettings} from '../shared/table-settings';
import {fillExperienceBots} from '../server/experience-table';
async function port(){const s=createServer();await new Promise<void>(r=>s.listen(0,'127.0.0.1',r));const p=(s.address() as {port:number}).port;await new Promise<void>(r=>s.close(()=>r()));return p;}
async function until<T>(fn:()=>T,predicate:(value:T)=>boolean){const end=Date.now()+6000;while(Date.now()<end){const v=fn();if(predicate(v))return v;await new Promise(r=>setTimeout(r,15));}throw Error('Timed out waiting for runtime state');}
async function peer(port:number,token:string){const ws=new WebSocket(`ws://127.0.0.1:${port}/ws`),messages:any[]=[];let latest:any,closed=false;
 ws.on('message',data=>{const m=JSON.parse(String(data));messages.push(m);if(m.type==='state')latest=m.state;});ws.on('close',()=>{closed=true;});
 await new Promise<void>(r=>ws.on('open',r));ws.send(JSON.stringify({type:'hello',token,clientVersion:'0.8.4',capabilities:{openingComplete:true}}));
 await until(()=>messages.find(m=>m.type==='session'),Boolean);
 return{ws,messages,latest:()=>latest,closed:()=>closed,send:(m:unknown)=>ws.send(JSON.stringify(m))};}
it('two actual workers retain old play/reconnect, route a newly started table to the candidate, and refuse early retirement',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'mahjong-rollout-')),file=join(dir,'test.sqlite');
 const workers:ReturnType<typeof makeServer>[]=[],sockets:WebSocket[]=[];let gateway:ReturnType<typeof makeRuntimeGateway>|undefined;let db:DatabaseSync|undefined;
 try{
  await seedTestAdmin(file);const seed=makeServer({database:file,port:0,host:'127.0.0.1'});workers.push(seed);const seedPort=await seed.listen();registerTestPort(seedPort);
  const oldToken=await peerCredential(seedPort,'老桌测试员'),newToken=await peerCredential(seedPort,'新桌测试员');
  const controlToken=await controlCredential(seedPort);
  await seed.close();workers.splice(workers.indexOf(seed),1);db=new DatabaseSync(file);
  const oldId=String(db.prepare('SELECT id FROM sessions WHERE token_hash=?').get(createHash('sha256').update(oldToken).digest('hex'))!.id);
  const oldGame=debitGame();oldGame.id='old-match';oldGame.code='123451';oldGame.players[0]!.id=oldId;oldGame.rules.turnSeconds=300;
  oldGame.players.slice(1).forEach(p=>{p!.bot=true;});oldGame.table={creatorId:oldId,groupId:'old-group',number:1,createdAt:1,settings:normalizeTableSettings({openingAnimation:false,autoRenew:false,offlineStart:true})};
  const waiting=createGame('123452','fixture');waiting.id='new-match';waiting.initialScore=90;waiting.rules.turnSeconds=300;waiting.table={creatorId:oldId,groupId:'new-group',number:2,createdAt:2,settings:normalizeTableSettings({readyMode:'auto',openingAnimation:false,autoRenew:false,offlineStart:true}),experience:{sourceCode:oldGame.code}};fillExperienceBots(waiting);
  const save=db.prepare('INSERT INTO rooms VALUES(?,?,?)');for(const g of [oldGame,waiting])save.run(g.id,JSON.stringify(g),Date.now());
  const a=await port(),b=await port();const old=makeServer({database:file,host:'127.0.0.1',port:a,tickMs:25,runtime:{id:'old',release:'old-test-build',endpoint:`http://127.0.0.1:${a}`,bootstrap:true}});workers.push(old);await old.listen();
  const next=makeServer({database:file,host:'127.0.0.1',port:b,tickMs:25,runtime:{id:'new',release:'new-test-build',endpoint:`http://127.0.0.1:${b}`}});workers.push(next);await next.listen();
  gateway=makeRuntimeGateway({database:file,port:0});const gatewayPort=await gateway.listen();
  const auditUrl=`http://127.0.0.1:${gatewayPort}/api/control/reconciliation?from=0&to=100`;
  expect((await fetch(auditUrl)).status).toBe(401);
  expect((await fetch(auditUrl,{headers:{Authorization:`Bearer ${newToken}`}})).status).toBe(401);
  expect((await fetch(auditUrl,{headers:{Authorization:`Bearer ${oldToken}`}})).status).toBe(401);
  expect((await fetch(auditUrl,{headers:{Authorization:`Bearer ${controlToken}`}})).status).toBe(200);
  const p=await peer(gatewayPort,oldToken);sockets.push(p.ws);await until(p.latest,v=>v?.id==='old-match');
  // An unfenced legacy/maintenance connection cannot write live room state.
  expect(()=>db!.prepare('UPDATE rooms SET updated_at=updated_at+1 WHERE id=?').run('old-match')).toThrow(/function|fenced/);
  await activateRuntime(db,'new');expect(()=>retireRuntime(db!,'old')).toThrow('active match');
  const legacy=createHttpServer((_request,response)=>{response.writeHead(401);response.end('{"error":"Legacy control session"}');});
  await new Promise<void>(resolve=>legacy.listen(0,'127.0.0.1',resolve));
  const legacyPort=(legacy.address() as {port:number}).port;
  db.prepare('UPDATE runtime_nodes SET endpoint=? WHERE id=?').run(`http://127.0.0.1:${legacyPort}`,'old');
  try{
   const memberUrl=`http://127.0.0.1:${gatewayPort}/api/control/members/${oldId}/audit`;
   expect((await fetch(memberUrl,{headers:{Authorization:`Bearer ${controlToken}`}})).status).toBe(200);
   const logoutUrl=`http://127.0.0.1:${gatewayPort}/api/control/auth/logout`;
   expect((await fetch(logoutUrl,{method:'POST',headers:{Authorization:`Bearer ${oldToken}`}})).status).toBe(200);
   p.send({type:'ping',sentAt:42});
   await until(()=>p.messages.find(message=>message.type==='pong'&&message.sentAt===42),Boolean);
   expect(p.closed()).toBe(false);
  }finally{
   db.prepare('UPDATE runtime_nodes SET endpoint=? WHERE id=?').run(`http://127.0.0.1:${a}`,'old');
   await new Promise<void>(resolve=>legacy.close(()=>resolve()));
  }
  p.send({type:'action',requestId:'old-discard',revision:p.latest().revision,action:{type:'discard',tile:96}});
  await until(()=>p.messages.find(m=>m.type==='ack'&&m.requestId==='old-discard'),Boolean);
  expect(p.closed()).toBe(false);expect(old.games.has(oldGame.code)).toBe(true);expect(next.games.has(oldGame.code)).toBe(false);
  const fresh=await peer(gatewayPort,newToken);sockets.push(fresh.ws);fresh.send({type:'join',code:waiting.code,requestId:'join-new'});
  await until(fresh.latest,v=>v?.id==='new-match'&&v.phase!=='waiting');expect(next.games.has(waiting.code)).toBe(true);
  p.ws.close();await until(p.closed,Boolean);const reconnect=await peer(gatewayPort,oldToken);sockets.push(reconnect.ws);await until(reconnect.latest,v=>v?.id==='old-match');
  expect(db.prepare('SELECT node FROM room_routes WHERE game_id=?').get('old-match')!.node).toBe('old');
  reconnect.send({type:'closeTable',code:oldGame.code,requestId:'close-old'});await until(()=>reconnect.messages.find(m=>m.type==='ack'&&m.requestId==='close-old'),Boolean);
  retireRuntime(db,'old');await old.close();workers.splice(workers.indexOf(old),1);
  expect(fresh.closed()).toBe(false);fresh.send({type:'ping',sync:true,sentAt:1});await until(()=>fresh.messages.find(m=>m.type==='pong'&&m.sentAt===1),Boolean);
 }finally{for(const ws of sockets)ws.close();if(gateway)await gateway.close();for(const worker of workers)await worker.close();db?.close();rmSync(dir,{recursive:true,force:true});}
},30000);
