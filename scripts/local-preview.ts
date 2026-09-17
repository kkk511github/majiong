/** Isolated, loopback-only UI preview. Never uses the production database. */
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { spawn } from 'node:child_process';
import { makeServer } from '../server/service';
import { provisionAdministrator } from '../server/accounts';
import { createRecords } from '../server/records';
import { replayedRound } from '../tests/fixtures/replayed-round';

mkdirSync(resolve('../../work'),{recursive:true});
const database=resolve('../../work/local-optimization-preview.sqlite');
const server=makeServer({database,port:8790,host:'127.0.0.1'});
const db=new DatabaseSync(database);
if (!db.prepare("SELECT 1 FROM accounts WHERE username=?").get("preview-admin")) await provisionAdministrator(db,{username:'preview-admin',password:'Preview-2026-local',mustChangePassword:false});
const records=createRecords(db);
for(let i=0;i<3;i++) {
  const g=replayedRound(43+i);
  g.id=`local-preview-${i}`;g.code=String(582619+i);g.phase='finished';
  g.history.forEach((r,j)=>{r.id=`local-preview-${i}-${j}`;r.at=Date.now()-i*3600000;r.matchFinished=true;r.totalRounds=1;});
  records.capture(g);
}
db.close();
await server.listen();
const vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5180'],{
  stdio:'inherit',env:{...process.env,VITE_API_TARGET:'http://127.0.0.1:8790',VITE_GAME_SERVER_URL:''},
});
console.log('本地预览 http://127.0.0.1:5180 · 账号 preview-admin · 密码 Preview-2026-local · 仅含演示战绩');
for(const signal of ['SIGINT','SIGTERM'] as const) process.once(signal,()=>{
  vite.kill(signal);void server.close().then(()=>process.exit(0));
});
