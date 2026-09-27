// Explicitly restricted to the offline Docker lab. Never mount a production
// volume at this path. This fixture creates only synthetic accounts and games.
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,writeFileSync} from 'node:fs';
import {randomBytes,createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {WebSocket} from 'ws';
import {provisionAdministrator} from '../../server/accounts';
import {activateRuntime,retireRuntime} from '../../server/runtime-ownership';
import {debitGame} from './debit-game';
import {createGame} from '../../shared/engine';
import {normalizeTableSettings} from '../../shared/table-settings';
import {fillExperienceBots} from '../../server/experience-table';
if(process.env.ROLLOUT_LAB!=='1'||process.env.DATABASE_PATH!=='/lab/mahjong.sqlite')throw Error('Offline lab only');
const db=new DatabaseSync('/lab/mahjong.sqlite',{timeout:5000}),stage=process.argv[2];
const path='/lab/fixture.json';
const write=(p:string,x:unknown)=>writeFileSync(p,JSON.stringify(x),{mode:0o600});
const saved=()=>JSON.parse(readFileSync(path,'utf8'));
const fingerprint=()=>{const g=JSON.parse(String(db.prepare("SELECT state FROM rooms WHERE id='lab-old'").get()!.state));return{transfers:g.roundTransfers,scores:g.players.map((p:any)=>p.score)};};
async function until(fn:()=>any){const end=Date.now()+8000;while(Date.now()<end){const v=fn();if(v)return v;await new Promise(r=>setTimeout(r,30));}throw Error('Lab timeout');}
async function peer(token:string){const ws=new WebSocket('ws://front:8787/ws'),messages:any[]=[];let state:any;
 ws.on('message',raw=>{const m=JSON.parse(String(raw));messages.push(m);if(m.type==='state')state=m.state;});
 await new Promise<void>((r,j)=>{ws.once('open',r);ws.once('error',j);});ws.send(JSON.stringify({type:'hello',token,clientVersion:'0.8.5',capabilities:{openingComplete:true}}));await until(()=>messages.find(m=>m.type==='session'));
 return{ws,messages,state:()=>state,send:(m:unknown)=>ws.send(JSON.stringify(m))};
}
const opened:WebSocket[]=[];
try{
 if(stage==='seed'){
  // This is the ISOLATED backup, never live rooms or real accounts.
  db.exec('DELETE FROM rooms');
  const ids:string[]=[],tokens:string[]=[];
  for(const name of ['rollout-lab-old','rollout-lab-new']){
   const id=await provisionAdministrator(db,{username:name,password:randomBytes(20).toString('hex'),name:'隔离演练',mustChangePassword:false}),token=randomBytes(32).toString('hex');ids.push(id);tokens.push(token);
   db.prepare('INSERT INTO team_memberships VALUES(?,?,?,?,?)').run(id,String(db.prepare('SELECT id FROM teams LIMIT 1').get()!.id),0,id,Date.now());
   db.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(createHash('sha256').update(token).digest('hex'),id,'隔离演练',Date.now());
  }
  const g=debitGame();g.id='lab-old';g.code='987651';g.players[0]!.id=ids[0];g.rules.turnSeconds=600;g.table={creatorId:ids[0],groupId:'lab-old-group',number:1,createdAt:1,settings:normalizeTableSettings({openingAnimation:false,autoRenew:false,offlineStart:true})};
  const fresh=createGame('987652','lab-new');fresh.id='lab-new';fresh.rules.turnSeconds=600;fresh.initialScore=90;fresh.table={creatorId:ids[0],groupId:'lab-new-group',number:2,createdAt:2,settings:normalizeTableSettings({readyMode:'auto',openingAnimation:false,autoRenew:false,offlineStart:true}),experience:{sourceCode:g.code}};fillExperienceBots(fresh);
  for(const game of [g,fresh])db.prepare('INSERT INTO rooms VALUES(?,?,?)').run(game.id,JSON.stringify(game),Date.now());
  write(path,{ids,tokens});
 }else if(stage==='old-play'){
  const p=await peer(saved().tokens[0]);opened.push(p.ws);await until(()=>p.state()?.id==='lab-old');
  const command={type:'action',requestId:'lab-kong-once',revision:p.state().revision,action:{type:'selfKong',tile:0}};p.send(command);await until(()=>p.messages.find(m=>m.type==='ack'&&m.requestId===command.requestId));
  assert.ok(fingerprint().transfers.length);write('/lab/finance.json',{finance:fingerprint(),command});
 }else if(stage==='switch'){
  await activateRuntime(db,'lab-green');assert.throws(()=>retireRuntime(db,'lab-blue'),/active match/);
  const old=await peer(saved().tokens[0]);opened.push(old.ws);await until(()=>old.state()?.id==='lab-old');
  const next=await peer(saved().tokens[1]);opened.push(next.ws);next.send({type:'join',code:'987652',requestId:'lab-new-join'});await until(()=>next.state()?.phase==='playing');
  assert.equal(db.prepare("SELECT node FROM room_routes WHERE game_id='lab-old'").get()!.node,'lab-blue');
  assert.equal(db.prepare("SELECT node FROM room_routes WHERE game_id='lab-new'").get()!.node,'lab-green');
 }else if(stage==='recover'){
  const p=await peer(saved().tokens[0]);opened.push(p.ws);await until(()=>p.state()?.id==='lab-old');
  const before=JSON.parse(readFileSync('/lab/finance.json','utf8'));p.send(before.command);await until(()=>p.messages.find(m=>['ack','error'].includes(m.type)&&m.requestId===before.command.requestId));assert.deepEqual(fingerprint(),before.finance);
  await activateRuntime(db,'lab-blue');assert.equal(db.prepare("SELECT node FROM room_routes WHERE game_id='lab-new'").get()!.node,'lab-green');assert.throws(()=>retireRuntime(db,'lab-green'),/active match/);
  p.send({type:'closeTable',code:'987652',requestId:'lab-close-green'});await until(()=>p.messages.find(m=>m.type==='ack'&&m.requestId==='lab-close-green'));retireRuntime(db,'lab-green');
 }else if(stage==='verify'){
  const p=await peer(saved().tokens[0]);opened.push(p.ws);await until(()=>p.state()?.id==='lab-old');p.send({type:'ping',sentAt:999});await until(()=>p.messages.find(m=>m.type==='pong'&&m.sentAt===999));assert.equal(db.prepare('PRAGMA integrity_check').get()!.integrity_check,'ok');
 }else throw Error('Unknown lab stage');
 console.log(JSON.stringify({stage,ok:true,syntheticAccountsOnly:true}));
}finally{for(const ws of opened)ws.close();db.close();}
