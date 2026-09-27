import {it,expect} from 'vitest';
import {spawn,type ChildProcess} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {createServer} from 'node:net';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {WebSocket} from 'ws';
import {makeServer} from '../server/service';
import {activateRuntime,retireRuntime} from '../server/runtime-ownership';
import {seedTestAdmin,registerTestPort,peerCredential} from './account-fixtures';
import {debitGame} from './fixtures/debit-game';
import {createGame} from '../shared/engine';
import {normalizeTableSettings} from '../shared/table-settings';
import {fillExperienceBots} from '../server/experience-table';

const delay=(ms:number)=>new Promise(r=>setTimeout(r,ms));
async function until<T>(get:()=>T|Promise<T>,ok:(v:T)=>boolean,timeout=8000){const end=Date.now()+timeout;while(Date.now()<end){const value=await get();if(ok(value))return value;await delay(30);}throw Error('Runtime process rehearsal timeout');}
async function port(){const server=createServer();await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const value=(server.address() as {port:number}).port;await new Promise<void>(r=>server.close(()=>r()));return value;}

it('separate engine processes survive crash/reconnect, pin both versions during admission rollback, and never duplicate a financial action',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'runtime-process-')),file=join(dir,'game.sqlite');
 const children:ChildProcess[]=[],sockets:WebSocket[]=[];let db:DatabaseSync|undefined;let output='';
 function start(entry:string,env:Record<string,string>){const child=spawn(process.execPath,['--import','tsx',resolve(entry)],{cwd:process.cwd(),env:{...process.env,NODE_ENV:'test',DATABASE_PATH:file,HOST:'127.0.0.1',...env},stdio:['ignore','pipe','pipe']});children.push(child);for(const stream of [child.stdout,child.stderr])stream?.on('data',b=>{output=(output+String(b)).slice(-24000);});return child;}
 async function stop(child:ChildProcess,signal:NodeJS.Signals='SIGTERM'){if(child.exitCode!==null||child.signalCode!==null)return;const exited=new Promise<void>(r=>child.once('exit',()=>r()));child.kill(signal);await exited;}
 async function health(p:number){try{const response=await fetch(`http://127.0.0.1:${p}/api/health`,{signal:AbortSignal.timeout(1000)});return response.ok?await response.json():undefined;}catch{return undefined;}}
 async function connect(p:number,token:string){const socket=new WebSocket(`ws://127.0.0.1:${p}/ws`),messages:any[]=[];let state:any,closed=false;
  sockets.push(socket);socket.on('message',b=>{const m=JSON.parse(String(b));messages.push(m);if(m.type==='state')state=m.state;});socket.on('close',()=>{closed=true;});socket.on('error',()=>{});
  await new Promise<void>((r,j)=>{socket.once('open',r);socket.once('error',j);});socket.send(JSON.stringify({type:'hello',token,clientVersion:'0.8.5',capabilities:{openingComplete:true}}));await until(()=>messages.some(m=>m.type==='session'),Boolean);
  return{socket,messages,state:()=>state,closed:()=>closed,send:(m:unknown)=>socket.send(JSON.stringify(m))};
 }
 try{
  await seedTestAdmin(file);const seed=makeServer({database:file,port:0,host:'127.0.0.1'});const seedPort=await seed.listen();registerTestPort(seedPort);
  const adminToken=await peerCredential(seedPort,'演练管理员'),newToken=await peerCredential(seedPort,'演练会员');await seed.close();
  db=new DatabaseSync(file,{timeout:5000});
  const id=String(db.prepare('SELECT id FROM sessions WHERE token_hash=?').get(createHash('sha256').update(adminToken).digest('hex'))!.id);
  const g=debitGame();g.id='process-old';g.code='712341';g.players[0]!.id=id;g.rules.turnSeconds=600;
  g.table={creatorId:id,groupId:'process-old-group',number:1,createdAt:1,settings:normalizeTableSettings({openingAnimation:false,autoRenew:false,offlineStart:true})};
  const waiting=createGame('712342','process-new');waiting.id='process-new';waiting.rules.turnSeconds=600;waiting.initialScore=90;
  waiting.table={creatorId:id,groupId:'process-new-group',number:2,createdAt:2,settings:normalizeTableSettings({readyMode:'auto',openingAnimation:false,autoRenew:false,offlineStart:true}),experience:{sourceCode:g.code}};fillExperienceBots(waiting);
  for(const game of [g,waiting])db.prepare('INSERT INTO rooms VALUES(?,?,?)').run(game.id,JSON.stringify(game),Date.now());
  const a=await port(),b=await port(),front=await port();
  const oldEnv={PORT:String(a),MAHJONG_RUNTIME_ID:'process-old',MAHJONG_RUNTIME_RELEASE:'process-r1',MAHJONG_RUNTIME_ENDPOINT:`http://127.0.0.1:${a}`,MAHJONG_RUNTIME_BOOTSTRAP:'1'};
  let old=start('server/index.ts',oldEnv);await until(()=>health(a),Boolean);
  const newer=start('server/index.ts',{PORT:String(b),MAHJONG_RUNTIME_ID:'process-new',MAHJONG_RUNTIME_RELEASE:'process-r2',MAHJONG_RUNTIME_ENDPOINT:`http://127.0.0.1:${b}`});await until(()=>health(b),Boolean);
  const gateway=start('server/runtime-gateway-main.ts',{PORT:String(front)});await until(()=>health(front),Boolean);
  const p=await connect(front,adminToken);await until(p.state,v=>v?.id===g.id);
  const command={type:'action',requestId:'process-kong-once',revision:p.state().revision,action:{type:'selfKong',tile:0}};
  p.send(command);await until(()=>p.messages.find(m=>m.type==='ack'&&m.requestId===command.requestId),Boolean);
  const before=JSON.parse(String(db.prepare('SELECT state FROM rooms WHERE id=?').get(g.id)!.state));
  expect(before.roundTransfers.length).toBeGreaterThan(0);
  const finance=JSON.stringify({transfers:before.roundTransfers,scores:before.players.map((p:any)=>p.score)});
  await activateRuntime(db,'process-new');expect(p.closed()).toBe(false);expect(()=>retireRuntime(db!,'process-old')).toThrow('active match');
  const fresh=await connect(front,newToken);fresh.send({type:'join',code:waiting.code,requestId:'process-new-join'});await until(fresh.state,v=>v?.id===waiting.id&&v.phase==='playing');
  // Roll back NEW admission, not ownership of an already-started candidate table.
  await activateRuntime(db,'process-old');expect(db.prepare('SELECT node FROM room_routes WHERE game_id=?').get(waiting.id)!.node).toBe('process-new');
  expect(()=>retireRuntime(db!,'process-new')).toThrow('active match');
  fresh.send({type:'ping',sentAt:100});await until(()=>fresh.messages.some(m=>m.type==='pong'&&m.sentAt===100),Boolean);
  // A hard engine crash must not send the old table to the other engine.
  await stop(old,'SIGKILL');await until(p.closed,Boolean);
  const failed=start('server/index.ts',oldEnv);await until(()=>failed.exitCode,v=>v!==null);expect(failed.exitCode).not.toBe(0);
  expect(db.prepare('SELECT node FROM room_routes WHERE game_id=?').get(g.id)!.node).toBe('process-old');
  // The candidate stays connected and responding while the old lease expires.
  fresh.send({type:'ping',sentAt:101});await until(()=>fresh.messages.some(m=>m.type==='pong'&&m.sentAt===101),Boolean);expect(fresh.closed()).toBe(false);
  const remaining=Math.max(0,Number(db.prepare("SELECT lease_until FROM runtime_nodes WHERE id='process-old'").get()!.lease_until)-Date.now()+100);await delay(remaining);
  old=start('server/index.ts',oldEnv);await until(()=>health(a),Boolean);
  const back=await connect(front,adminToken);await until(back.state,v=>v?.id===g.id);back.send(command);
  await until(()=>back.messages.some(m=>['ack','error'].includes(m.type)&&m.requestId===command.requestId),Boolean);
  const after=JSON.parse(String(db.prepare('SELECT state FROM rooms WHERE id=?').get(g.id)!.state));
  expect(JSON.stringify({transfers:after.roundTransfers,scores:after.players.map((p:any)=>p.score)})).toBe(finance);
  // Cross-version admin command is authenticated and leaves the active connection alone.
  back.send({type:'closeTable',code:waiting.code,requestId:'process-close-new'});await until(()=>back.messages.some(m=>m.type==='ack'&&m.requestId==='process-close-new'),Boolean);
  retireRuntime(db,'process-new');await stop(newer);expect(back.closed()).toBe(false);
  db.prepare('DELETE FROM sessions WHERE id=?').run(id);await until(back.closed,Boolean);
  expect(db.prepare('PRAGMA integrity_check').get()?.integrity_check).toBe('ok');await stop(gateway);await stop(old);
 }catch(error){throw Error(`${String(error)}\n${output}`);}finally{for(const socket of sockets)socket.terminate();for(const child of children)await stop(child);db?.close();rmSync(dir,{recursive:true,force:true});}
},70000);
