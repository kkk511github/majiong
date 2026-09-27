import {DatabaseSync} from 'node:sqlite';
import {activateRuntime,retireRuntime,abortRuntimeBootstrap} from '../server/runtime-ownership';
const [command,id]=process.argv.slice(2);
if(!process.env.DATABASE_PATH)throw Error('DATABASE_PATH required');
if(!['status','activate','retire','abort-bootstrap'].includes(command))throw Error('Usage: DATABASE_PATH=... tsx scripts/runtime-rollout.ts status | activate <id> | retire <id> | abort-bootstrap');
const db=new DatabaseSync(process.env.DATABASE_PATH,{readOnly:command==='status',timeout:5000});
try{
 if(command==='status')console.log(JSON.stringify({active:db.prepare('SELECT active,accepting FROM runtime_config WHERE id=1').get(),nodes:db.prepare('SELECT id,release,endpoint,lease_until FROM runtime_nodes').all(),tables:db.prepare('SELECT node,phase,COUNT(*) AS tables FROM room_routes GROUP BY node,phase').all()},null,2));
 else if(command==='abort-bootstrap')console.log(JSON.stringify(abortRuntimeBootstrap(db)));
 else if(!id||!/^[a-zA-Z0-9_-]{1,64}$/.test(id))throw Error('Runtime id required');
 else console.log(JSON.stringify(command==='activate'?await activateRuntime(db,id):retireRuntime(db,id)));
}finally{db.close();}
