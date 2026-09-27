import { makeServer } from "./service";
import {verifyDeploymentManifest} from '../scripts/deployment-manifest.mjs';
if(process.env.NODE_ENV==='production'&&process.env.MAHJONG_RUNTIME_ID)verifyDeploymentManifest(process.cwd(),process.env.MAHJONG_RUNTIME_RELEASE??'');
const service = makeServer({
  port: Number(process.env.PORT ?? 8787),
  database: process.env.DATABASE_PATH,
  host:process.env.HOST,
  ...(process.env.MAHJONG_RUNTIME_ID?{runtime:{id:process.env.MAHJONG_RUNTIME_ID,release:process.env.MAHJONG_RUNTIME_RELEASE??'',endpoint:process.env.MAHJONG_RUNTIME_ENDPOINT??'',bootstrap:process.env.MAHJONG_RUNTIME_BOOTSTRAP==='1'}}:{}),
});
service
  .listen()
  .then((port) => console.log(`金陵麻将对局服务：http://127.0.0.1:${port}`));
let closing=false;
function stop(code:number){if(closing)return;closing=true;void service.close().then(()=>process.exit(code),()=>process.exit(1));}
for (const signal of ["SIGINT", "SIGTERM"] as const)process.once(signal,()=>stop(0));
if(process.env.MAHJONG_RUNTIME_ID)setInterval(()=>{if(service.runtimeFenced())stop(1);},1000).unref();
