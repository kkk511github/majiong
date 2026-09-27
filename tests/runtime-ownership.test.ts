import {it,expect,vi} from 'vitest';
import {DatabaseSync} from 'node:sqlite';
import {createRuntimeOwnership,activateRuntime,retireRuntime,abortRuntimeBootstrap} from '../server/runtime-ownership';
import {createGame} from '../shared/engine';
function database(){const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE rooms(id TEXT PRIMARY KEY,state TEXT,updated_at INTEGER)');return db;}
it('only waiting tables migrate; playing, claiming and between-round tables stay pinned',async()=>{
 const db=database(),old=createRuntimeOwnership(db,{id:'old',release:'r1',endpoint:'http://127.0.0.1:12345',bootstrap:true});
 const next=createRuntimeOwnership(db,{id:'new',release:'r2',endpoint:'http://127.0.0.1:12346'});
 const games=['waiting','playing','claiming','ended'].map((phase,i)=>{const g=createGame(String(123450+i),'test-'+i);g.phase=phase as typeof g.phase;old.save(g);return g;});
 const fetch=vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(JSON.stringify({runtime:{id:'new',release:'r2',protocol:1}})));
 try{await activateRuntime(db,'new');expect(next.owns(games[0].id)).toBe(true);
 for(const g of games.slice(1))expect(old.owns(g.id)).toBe(true);
 expect(()=>old.assertOwner(games[0].id)).toThrow('another runtime');expect(()=>retireRuntime(db,'old')).toThrow('active match');
 for(const g of games.slice(1)){g.phase='finished';old.save(g);}retireRuntime(db,'old');
 expect(()=>old.fence()).toThrow('lease lost');expect(next.owned()).toHaveLength(4);
 }finally{fetch.mockRestore();db.close();}
});
it('a second writer cannot start on a live lease or overwrite a live table using a new release',()=>{
 const db=database();let now=Date.now();
 const options={id:'old',release:'r1',endpoint:'http://127.0.0.1:12345',bootstrap:true};
 const old=createRuntimeOwnership(db,options,()=>now),g=createGame('123456','test');old.save(g);
 expect(()=>createRuntimeOwnership(db,options,()=>now)).toThrow('live owner');
 now+=31000;expect(()=>createRuntimeOwnership(db,{...options,release:'r2'},()=>now)).toThrow('owns tables');
 const restored=createRuntimeOwnership(db,options,()=>now);expect(restored.owns(g.id)).toBe(true);expect(()=>old.assertOwner(g.id)).toThrow('lease lost');db.close();
});
it('activation refuses a restarted/replaced candidate after the health response',async()=>{
 const db=database(),old=createRuntimeOwnership(db,{id:'old',release:'r1',endpoint:'http://127.0.0.1:12345',bootstrap:true});
 createRuntimeOwnership(db,{id:'new',release:'r2',endpoint:'http://127.0.0.1:12346'});
 const mocked=vi.spyOn(globalThis,'fetch').mockImplementation(async()=>{db.prepare("UPDATE runtime_nodes SET boot_id='restarted' WHERE id='new'").run();return new Response(JSON.stringify({runtime:{id:'new',release:'r2',protocol:1}}));});
 try{await expect(activateRuntime(db,'new')).rejects.toThrow('changed during health');expect(old.active()).toBe(true);expect(old.admitting()).toBe(false);}finally{mocked.mockRestore();db.close();}
});
it('bootstrap rollback preserves unrelated data and refuses live owners, active tables and opened admission',()=>{
 const db=database(),old=createRuntimeOwnership(db,{id:'old',release:'r1',endpoint:'http://127.0.0.1:12345',bootstrap:true});
 db.exec("CREATE TABLE historical_ledger(amount INTEGER); INSERT INTO historical_ledger VALUES(1234)");
 expect(()=>abortRuntimeBootstrap(db)).toThrow('Stop all');
 const g=createGame('654321','bootstrap-test');g.phase='ended';old.save(g);db.prepare('INSERT INTO rooms VALUES(?,?,?)').run(g.id,JSON.stringify(g),1);old.close();
 expect(()=>abortRuntimeBootstrap(db)).toThrow('active matches');
 // Only an idle bootstrap can be abandoned; leave the original room intact.
 db.exec("DROP TRIGGER runtime_fence_update");g.phase='waiting';db.prepare('UPDATE rooms SET state=?').run(JSON.stringify(g));
 db.exec('UPDATE runtime_config SET accepting=1');expect(()=>abortRuntimeBootstrap(db)).toThrow('admission');
 db.exec('UPDATE runtime_config SET accepting=0');expect(abortRuntimeBootstrap(db).databaseRestored).toBe(false);
 expect(db.prepare('SELECT amount FROM historical_ledger').get()?.amount).toBe(1234);
 expect(db.prepare('SELECT COUNT(*) n FROM rooms').get()?.n).toBe(1);
 expect(()=>db.prepare('UPDATE rooms SET updated_at=2').run()).not.toThrow();db.close();
});
