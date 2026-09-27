import {randomUUID} from 'node:crypto';
import type {DatabaseSync} from 'node:sqlite';
import type {Game} from '../shared/types';
export type RuntimeOptions={id:string;release:string;endpoint:string;bootstrap?:boolean};
const LEASE=30000;
export function runtimeSchema(db:DatabaseSync){db.exec(`
 CREATE TABLE IF NOT EXISTS runtime_nodes(id TEXT PRIMARY KEY,release TEXT NOT NULL,endpoint TEXT NOT NULL,boot_id TEXT NOT NULL,lease_until INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS runtime_config(id INTEGER PRIMARY KEY CHECK(id=1),active TEXT NOT NULL,accepting INTEGER NOT NULL DEFAULT 1);
 CREATE TABLE IF NOT EXISTS room_routes(game_id TEXT PRIMARY KEY,code TEXT UNIQUE NOT NULL,node TEXT NOT NULL,phase TEXT NOT NULL,members TEXT NOT NULL,summary TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS room_routes_node ON room_routes(node);
 CREATE TABLE IF NOT EXISTS runtime_pool_targets(group_id TEXT PRIMARY KEY,target INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS runtime_presence(account_id TEXT PRIMARY KEY,connection_id TEXT NOT NULL,expires_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS runtime_invitations(id TEXT PRIMARY KEY,payload TEXT NOT NULL);
`);if(!db.prepare('PRAGMA table_info(runtime_config)').all().some(r=>r.name==='accepting'))db.exec('ALTER TABLE runtime_config ADD COLUMN accepting INTEGER NOT NULL DEFAULT 1');}
function summary(g:Game){return {id:g.id,code:g.code,phase:g.phase,round:g.round,rules:g.rules,table:g.table,initialScore:g.initialScore,settlementBase:g.settlementBase,scoreDivisor:g.scoreDivisor,
 players:g.players.map(p=>p?{id:p.id,name:p.name,bot:p.bot,ready:p.ready,online:p.online}:null)};}
export function createRuntimeOwnership(db:DatabaseSync,options:RuntimeOptions,now=Date.now){
 if(!/^[a-zA-Z0-9_-]{1,64}$/.test(options.id)||!options.release||options.release.length>100)throw Error('Invalid runtime identity');
 const url=new URL(options.endpoint);if(url.protocol!=='http:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error('Runtime endpoint must be a private HTTP origin');
 runtimeSchema(db);const boot=randomUUID();
 db.exec('BEGIN IMMEDIATE');
 try{
  const old=db.prepare('SELECT * FROM runtime_nodes WHERE id=?').get(options.id);
  if(old&&Number(old.lease_until)>now())throw Error('Runtime already has a live owner');
  if(old&&old.release!==options.release&&db.prepare('SELECT 1 FROM room_routes WHERE node=? LIMIT 1').get(options.id))throw Error('Cannot replace a runtime while it owns tables');
  db.prepare('INSERT OR REPLACE INTO runtime_nodes VALUES(?,?,?,?,?)').run(options.id,options.release,url.origin,boot,now()+LEASE);
  if(!db.prepare('SELECT 1 FROM runtime_config').get()){
   if(!options.bootstrap)throw Error('Rollout bootstrap must be explicitly initialized in a maintenance window');
   db.prepare('INSERT INTO runtime_config(id,active,accepting) VALUES(1,?,0)').run(options.id);
  }
  for(const row of db.prepare('SELECT id,state FROM rooms WHERE id NOT IN (SELECT game_id FROM room_routes)').all()){
   if(!options.bootstrap)throw Error('Unowned legacy table: bootstrap is required');
   const g=JSON.parse(String(row.state)) as Game;
   db.prepare('INSERT INTO room_routes VALUES(?,?,?,?,?,?)').run(g.id,g.code,options.id,g.phase,JSON.stringify(g.players.filter(Boolean).map(p=>p!.id)),JSON.stringify(summary(g)));
  }
  db.exec('COMMIT');
 }catch(error){db.exec('ROLLBACK');throw error;}
 const active=()=>String(db.prepare('SELECT active FROM runtime_config WHERE id=1').get()!.active);
 function fence(){const r=db.prepare('SELECT boot_id,lease_until FROM runtime_nodes WHERE id=?').get(options.id);if(r?.boot_id!==boot||Number(r.lease_until)<=now())throw Error('Runtime lease lost; writes fenced');}
 db.function('rollout_writer_node',()=>options.id);db.function('rollout_writer_boot',()=>boot);
 for(const operation of ['INSERT','UPDATE','DELETE']){
  const ref=operation==='INSERT'?'NEW':'OLD';
  db.exec(`CREATE TRIGGER IF NOT EXISTS runtime_fence_${operation.toLowerCase()} BEFORE ${operation} ON rooms BEGIN
   SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM runtime_nodes WHERE id=rollout_writer_node() AND boot_id=rollout_writer_boot() AND lease_until>CAST(strftime('%s','now') AS INTEGER)*1000) THEN RAISE(ABORT,'runtime writer fenced') END;
   SELECT CASE WHEN EXISTS(SELECT 1 FROM room_routes WHERE game_id=${ref}.id AND phase='closed') THEN RAISE(ABORT,'closed table cannot be recreated') END;
   ${operation==='INSERT'?'':`SELECT CASE WHEN EXISTS(SELECT 1 FROM room_routes WHERE game_id=${ref}.id AND node<>rollout_writer_node()) THEN RAISE(ABORT,'table belongs to another runtime') END;`}
  END;`);
 }
 function assertOwner(id:string){fence();const row=db.prepare('SELECT node,phase FROM room_routes WHERE game_id=?').get(id);if(row?.phase==='closed')throw Error('Closed table cannot be recreated');if(row&&row.node!==options.id)throw Error('Table belongs to another runtime');}
 return {
  id:options.id,release:options.release,active:()=>active()===options.id,
  admitting:()=>db.prepare('SELECT accepting FROM runtime_config WHERE id=1').get()?.accepting===1,
  online(){return db.prepare('SELECT account_id FROM runtime_presence WHERE expires_at>?').all(now()).map(r=>String(r.account_id));},
  invitations:{load:()=>db.prepare('SELECT payload FROM runtime_invitations').all().map(r=>JSON.parse(String(r.payload))),save:(entry:{id:string})=>{fence();db.prepare('INSERT OR REPLACE INTO runtime_invitations VALUES(?,?)').run(entry.id,JSON.stringify(entry));},remove:(id:string)=>{fence();db.prepare('DELETE FROM runtime_invitations WHERE id=?').run(id);}},
  poolTarget(group:string){const r=db.prepare('SELECT target FROM runtime_pool_targets WHERE group_id=?').get(group);return r?Number(r.target):undefined;},
  setPoolTarget(group:string,target:number){fence();db.prepare('INSERT OR REPLACE INTO runtime_pool_targets VALUES(?,?)').run(group,target);},
  lobbyGames(){const targets=new Map(db.prepare('SELECT group_id,target FROM runtime_pool_targets').all().map(r=>[String(r.group_id),Number(r.target)]));return db.prepare("SELECT summary FROM room_routes WHERE phase<>'closed'").all().map(r=>{const g=JSON.parse(String(r.summary)) as Game;if(g.table&&targets.has(g.table.groupId)){g.table.poolTarget=targets.get(g.table.groupId);if(g.table.poolTarget===0)g.table.settings.autoRenew=false;}return g;});},
  fence,assertOwner,
  heartbeat(){fence();db.prepare('UPDATE runtime_nodes SET lease_until=? WHERE id=? AND boot_id=?').run(now()+LEASE,options.id,boot);},
  owns(id:string){return db.prepare('SELECT node FROM room_routes WHERE game_id=?').get(id)?.node===options.id;},
  save(g:Game){fence();const previous=db.prepare('SELECT node,phase FROM room_routes WHERE game_id=?').get(g.id);
   if(previous?.phase==='closed')throw Error('Closed table cannot be recreated');
   if(previous&&previous.node!==options.id)throw Error('Table belongs to another runtime');
   const owner=previous?options.id:active();
   db.prepare('INSERT INTO room_routes VALUES(?,?,?,?,?,?) ON CONFLICT(game_id) DO UPDATE SET phase=excluded.phase,members=excluded.members,summary=excluded.summary').run(g.id,g.code,owner,g.phase,JSON.stringify(g.players.filter(Boolean).map(p=>p!.id)),JSON.stringify(summary(g)));
  },
  remove(id:string){assertOwner(id);db.prepare("UPDATE room_routes SET phase='closed',members='[]' WHERE game_id=?").run(id);},
  owned(){return db.prepare("SELECT game_id,code FROM room_routes WHERE node=? AND phase<>'closed'").all(options.id).map(r=>({id:String(r.game_id),code:String(r.code)}));},
  close(){db.prepare('UPDATE runtime_nodes SET lease_until=0 WHERE id=? AND boot_id=?').run(options.id,boot);},
 };
}
export function retireRuntime(db:DatabaseSync,id:string){
 db.exec('BEGIN IMMEDIATE');try{
  const active=String(db.prepare('SELECT active FROM runtime_config WHERE id=1').get()?.active??'');
  if(!active||active===id)throw Error('Cannot retire the active runtime');
  if(db.prepare("SELECT 1 FROM room_routes WHERE node=? AND phase IN ('playing','claiming','ended') LIMIT 1").get(id))throw Error('Runtime still owns an active match');
  if(Number(db.prepare('SELECT lease_until FROM runtime_nodes WHERE id=?').get(active)?.lease_until??0)<=Date.now())throw Error('Active runtime is unavailable');
  db.prepare("UPDATE room_routes SET node=? WHERE node=? AND phase IN ('waiting','finished')").run(active,id);
  db.prepare('UPDATE runtime_nodes SET lease_until=0 WHERE id=?').run(id);db.exec('COMMIT');return{retired:id};
 }catch(error){db.exec('ROLLBACK');throw error;}
}
/** Only unstarted tables move. Playing/claiming/ended keep their old engine. */
export async function activateRuntime(db:DatabaseSync,id:string){
 const row=db.prepare('SELECT endpoint,lease_until,release,boot_id FROM runtime_nodes WHERE id=?').get(id);
 if(!row||Number(row.lease_until)<=Date.now())throw Error('Candidate runtime is not live');
 const response=await fetch(String(row.endpoint)+'/api/health',{signal:AbortSignal.timeout(5000)}),health=await response.json() as {runtime?:{id:string;protocol:number;release:string}};
 if(!response.ok||health.runtime?.id!==id||health.runtime.protocol!==1||health.runtime.release!==row.release)throw Error('Candidate health/protocol mismatch');
 db.exec('BEGIN IMMEDIATE');try{
  const checked=db.prepare('SELECT endpoint,lease_until,release,boot_id FROM runtime_nodes WHERE id=?').get(id);
  if(!checked||Number(checked.lease_until)<=Date.now())throw Error('Candidate lease expired');
  if(checked.boot_id!==row.boot_id||checked.release!==row.release||checked.endpoint!==row.endpoint)throw Error('Candidate changed during health check');
  db.prepare('UPDATE runtime_config SET active=?,accepting=1 WHERE id=1').run(id);
  const moved=db.prepare("UPDATE room_routes SET node=? WHERE phase='waiting'").run(id).changes;
  db.exec('COMMIT');return{active:id,movedWaiting:Number(moved)};
 }catch(error){db.exec('ROLLBACK');throw error;}
}
/** Before the FIRST admission only. Operators must stop every runtime first.
 * Remove coordination metadata, never replace the database or touch ledgers. */
export function abortRuntimeBootstrap(db:DatabaseSync){
 db.exec('BEGIN IMMEDIATE');try{
  if(db.prepare('SELECT accepting FROM runtime_config WHERE id=1').get()?.accepting!==0)throw Error('Cannot abort after admission has opened');
  if(db.prepare('SELECT 1 FROM runtime_nodes WHERE lease_until>? LIMIT 1').get(Date.now()))throw Error('Stop all runtime owners before aborting bootstrap');
  if(db.prepare("SELECT 1 FROM rooms WHERE json_extract(state,'$.phase') IN ('playing','claiming','ended') LIMIT 1").get())throw Error('Cannot abort with active matches');
  for(const operation of ['insert','update','delete'])db.exec(`DROP TRIGGER IF EXISTS runtime_fence_${operation}`);
  for(const table of ['runtime_invitations','runtime_presence','runtime_pool_targets','room_routes','runtime_nodes','runtime_config'])db.exec(`DROP TABLE ${table}`);
  db.exec('COMMIT');return{aborted:true,databaseRestored:false};
 }catch(error){db.exec('ROLLBACK');throw error;}
}
